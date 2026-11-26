import json
import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from pipelines import refresh, sources


class ValidationTests(unittest.TestCase):
    def test_missing_csv_column(self):
        with self.assertRaisesRegex(ValueError, "schema changed"):
            list(sources.csv_rows(b"DATE,WRONG\n2026-01,4\n", {"DATE", "IUDBEDR"}))

    def test_changed_inflation_measure(self):
        changed = b"Title,Annual CPI change\nCDID,D7BT\nSource dataset ID,MM23\n"
        with self.assertRaisesRegex(ValueError, "definition changed"):
            sources.inflation(lambda _: changed, "CPI")

    def test_published_annual_rates_accept_deflation_and_validate_measure(self):
        for series, code in (("CPIH", "L55O"), ("CPI", "D7G7")):
            payload = (
                f"Title,{series} ANNUAL RATE 00: ALL ITEMS 2015=100\nCDID,{code}\n"
                "Source dataset ID,MM23\nPreUnit,\nUnit,%\nRelease date,18-11-2026\n"
                "Next release,16 December 2026\nImportant notes,\n2026 SEP,-0.1\n"
            ).encode()
            with self.subTest(series=series):
                _, url, rows = sources.inflation(lambda _: payload, series, annual_rate=True)
                self.assertIn(f"/{code.lower()}/mm23", url)
                self.assertEqual(rows, [{"areaCode": "K02000001", "period": "2026-09", "value": -0.1}])
                with self.assertRaisesRegex(ValueError, "definition changed"):
                    sources.inflation(lambda _: payload, series)

    def test_ragged_csv_row(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            list(sources.csv_rows(b"DATE,IUDBEDR\n01 Jan 2026\n", {"DATE", "IUDBEDR"}))

    def test_duplicate(self):
        row = {"areaCode": "K02000001", "period": "2026-10", "value": 3}
        with self.assertRaisesRegex(ValueError, "Duplicate observation"):
            refresh.validate_rows([row, row], ("areaCode", "period"))

    def test_bad_dates(self):
        for day in ("2026-02-30", "2026-00", "2026-Q5", "2026-Q1-01"):
            with self.subTest(day=day), self.assertRaises(ValueError):
                refresh.validate_rows([{"areaCode": "K02000001", "period": day}], ("areaCode", "period"))

    def test_missing_value_and_numeric_range(self):
        self.assertIsNone(sources.number("[x]", 1, 50))
        self.assertEqual(sources.number(0, 0, 50), 0)
        for bad in (-1, "NaN", float("inf"), True, 51):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                sources.number(bad, 0, 50)

    def test_unknown_geography(self):
        with self.assertRaisesRegex(ValueError, "Unexpected geography code"):
            refresh.validate_rows([{"areaCode": "fake"}], ("areaCode",))

    def test_volume_and_release_regression(self):
        row = {"areaCode": "K02000001", "period": "2026-10", "value": 100}
        stamp = datetime(2026, 11, 26, tzinfo=refresh.UK)
        dataset = {"cpi": (stamp.date(), sources.ONS, [row])}
        definition = refresh.DEFINITIONS["cpi"]
        with TemporaryDirectory() as temp, patch.dict(
            refresh.DEFINITIONS, {"cpi": refresh.Definition(**{**vars(definition), "minimum_rows": 1})},
        ):
            for old in ({"rowCount": 10, "publicationDate": "2026-11-26"},
                        {"rowCount": 1, "publicationDate": "2026-11-27"}):
                with self.assertRaisesRegex(ValueError, "regressed or row count dropped"):
                    refresh.write_generation(Path(temp), dataset, {"cpi": old}, stamp)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.destination = Path(temp.name) / "public" / "data"
        self.destination.mkdir(parents=True)
        (self.destination / "manifest.json").write_text('{"datasets":{"fixture":{}}}')
        (self.destination / "fixture.json").write_text("last good")

    def generation(self):
        return {file.name: file.read_bytes() for file in self.destination.iterdir()}

    def test_download_failed_after_staging_keeps_last_good(self):
        def network_failure(_):
            raise OSError("publisher offline")

        def prepare(fetch, stage, _previous):
            (stage / "fixture.json").write_text("partial")
            fetch("https://www.ons.gov.uk")

        before = self.generation()
        with self.assertRaisesRegex(OSError, "publisher offline"):
            refresh.refresh(self.destination, fetch=network_failure, prepare_generation=prepare)
        self.assertEqual(self.generation(), before)
        self.assertEqual(list(self.destination.parent.iterdir()), [self.destination])

    def test_missing_input_file_keeps_last_good(self):
        before = self.generation()
        with self.assertRaises(FileNotFoundError):
            refresh.refresh(self.destination, fetch=lambda _: (self.destination / "missing.csv").read_bytes())
        self.assertEqual(self.generation(), before)

    def test_commits_complete_generation(self):
        def prepare(_fetch, stage, previous):
            self.assertIn("fixture", previous)
            (stage / "manifest.json").write_text('{"datasets":{"next":{}}}')
            (stage / "next.json").write_text("next")
            return {"next": {}}

        self.assertEqual(refresh.refresh(self.destination, prepare_generation=prepare), {"next": {}})
        self.assertEqual(set(self.generation()), {"manifest.json", "next.json"})
        self.assertEqual(json.loads((self.destination / "manifest.json").read_bytes()), {"datasets": {"next": {}}})

    def test_cli_reports_failure(self):
        with patch.object(refresh, "refresh", side_effect=ValueError("publisher unavailable")), patch("sys.stderr"):
            self.assertEqual(refresh.main(), 1)


if __name__ == "__main__":
    unittest.main()
