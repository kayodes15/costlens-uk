"""Refresh every CostLens dataset and atomically publish a validated generation."""

import ctypes
import fcntl
import hashlib
import json
import math
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from . import sources

UK = ZoneInfo("Europe/London")
OGL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Definition:
    name: str
    publisher: str
    source_url: str
    attribution: str
    geography: str
    measure: str
    limit: int
    minimum_rows: int
    limitations: str


ONS = "Office for National Statistics"
BOE = "Bank of England"
HMLR = "HM Land Registry and UK HPI partners"
DEFINITIONS = {
    "cpih": Definition("CPIH", ONS, sources.ONS + "/economy/inflationandpriceindices/timeseries/l522/mm23",
                       "ONS, CPIH (L522), Crown copyright", "United Kingdom", "Monthly all-items CPIH index (2015=100)",
                       65, 400, "National index, not personal inflation."),
    "cpi": Definition("CPI", ONS, sources.ONS + "/economy/inflationandpriceindices/timeseries/d7bt/mm23",
                      "ONS, CPI (D7BT), Crown copyright", "United Kingdom", "Monthly all-items CPI index (2015=100)",
                      65, 400, "National index, not personal inflation."),
    "cpih-annual-rate": Definition("CPIH annual rate", ONS, sources.ONS + "/economy/inflationandpriceindices/timeseries/l55o/mm23",
                                   "ONS, CPIH annual rate (L55O), Crown copyright", "United Kingdom",
                                   "Published all-items CPIH 12-month percentage change", 65, 400,
                                   "The published headline rate can differ from ratios of displayed rounded indices."),
    "cpi-annual-rate": Definition("CPI annual rate", ONS, sources.ONS + "/economy/inflationandpriceindices/timeseries/d7g7/mm23",
                                  "ONS, CPI annual rate (D7G7), Crown copyright", "United Kingdom",
                                  "Published all-items CPI 12-month percentage change", 65, 400,
                                  "The published headline rate can differ from ratios of displayed rounded indices."),
    "bank-rate": Definition("Official Bank Rate", BOE, sources.BANK_RATE, "Bank of England, official Bank Rate",
                            "United Kingdom", "Policy rate percent on effective change dates",
                            65, 75, "A policy rate, not a mortgage rate. Staleness is checked against the refresh, since the rate may be unchanged."),
    "quoted-mortgage-rate": Definition("Quoted mortgage rate", BOE, sources.QUOTED,
                                       "Bank of England, quoted household interest rates (IUMBV34)", "United Kingdom",
                                       "Monthly quoted two-year fixed sterling household mortgage rate at 75% LTV, percent",
                                       65, 70, "A statistical benchmark, not an individual offer."),
    "house-prices": Definition("UK House Price Index", HMLR, sources.HPI,
                               "UK HPI: HM Land Registry, Registers of Scotland, LPS/NISRA and ONS, Crown copyright",
                               "UK nations and local authorities or Northern Ireland districts",
                               "Latest standardised average residential price (GBP)", 90, 330,
                               "Provisional estimates may be revised. Northern Ireland is quarterly."),
    "private-rents": Definition("Price Index of Private Rents", ONS, sources.PIPR,
                                "ONS, Price Index of Private Rents, Crown copyright",
                                "UK and nations, England and Wales local authorities, Scotland and NI BRMAs",
                                "Latest published average monthly private rent (GBP) by bedroom count", 70, 1_600,
                                "Scotland historically relied mainly on advertised new lets. NI measures advertised new lets with a two-month lag. Missing bedroom estimates are null."),
    "earnings": Definition("ASHE Table 8.7a", ONS, sources.ASHE,
                           "ONS, Annual Survey of Hours and Earnings, Crown copyright",
                           "UK and UK nations, residence-based local authorities in Great Britain",
                           "Median annual gross pay (GBP) of full-time employee jobs", 420, 300,
                           "Latest provisional edition. Suppressed or unavailable estimates are null."),
    "ni-earnings": Definition("NISRA ASHE Table 8 (NI).7a", "Northern Ireland Statistics and Research Agency", sources.NI_ASHE,
                              "Source: NISRA : Website: www.nisra.gov.uk, Crown copyright",
                              "Northern Ireland local government districts, by residence",
                              "Median annual gross pay (GBP) of full-time employee jobs", 420, 11,
                              "Provisional estimates may be revised. Suppressed or unavailable estimates are null."),
    "locations": Definition("Housing prices in your area geography", ONS, sources.HOUSING,
                            "ONS, Housing prices in your area, Crown copyright", "UK local authorities and districts",
                            "Published local authority codes and names", 70, 340, "Coverage follows the ONS housing tool. Town aliases are excluded."),
    "brma-mapping": Definition("Council to BRMA mapping", ONS, sources.HOUSING,
                               "ONS, Housing prices in your area, Crown copyright",
                               "Scotland local authorities and Northern Ireland local government districts",
                               "ONS published BRMA matches and significant NI overlaps", 70, 43,
                               "A best match is a broader rental geography. NI published overlaps exclude marginal matches of fewer than 1% of postcodes."),
}
PERIOD = re.compile(r"[1-9]\d{3}(?:-(?:0[1-9]|1[0-2])(?:-\d{2})?|-Q[1-4])?")


def validate_rows(rows, keys, minimum=1):
    if len(rows) < minimum:
        raise ValueError(f"Missing observations: {len(rows)} rows, expected at least {minimum}")
    seen = set()
    for row in rows:
        code = row["areaCode"]
        if not sources.AREA_CODE.fullmatch(code):
            raise ValueError(f"Unexpected geography code: {code}")
        key = tuple(row[name] for name in keys)
        if key in seen:
            raise ValueError(f"Duplicate observation: {key}")
        seen.add(key)
        if "value" in row:
            value = row["value"]
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value)):
                raise ValueError(f"Invalid observation value: {key}")
        if "period" in row:
            period = row["period"]
            if not PERIOD.fullmatch(period):
                raise ValueError(f"Invalid observation period: {period}")
            if len(period) == 10:
                date.fromisoformat(period)


def latest(rows, keys):
    groups = {}
    for row in rows:
        key = tuple(row[name] for name in keys)
        if key not in groups or row["period"] > groups[key]["period"]:
            groups[key] = row
    return list(groups.values())


def encode(data):
    return (json.dumps(data, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def prepare(fetch, stage, previous):
    stamp = datetime.now(UK)
    places, first_page = sources.geography(fetch)
    validate_rows(places, ("areaCode",), DEFINITIONS["locations"].minimum_rows)
    councils = {row["areaCode"] for row in places}
    with ThreadPoolExecutor(max_workers=7) as pool:
        observed = {
            "cpih": pool.submit(sources.inflation, fetch, "CPIH"),
            "cpi": pool.submit(sources.inflation, fetch, "CPI"),
            "cpih-annual-rate": pool.submit(sources.inflation, fetch, "CPIH", annual_rate=True),
            "cpi-annual-rate": pool.submit(sources.inflation, fetch, "CPI", annual_rate=True),
            "bank-rate": pool.submit(sources.bank_rates, fetch),
            "quoted-mortgage-rate": pool.submit(sources.quoted_rates, fetch),
            "house-prices": pool.submit(sources.hpi, fetch, councils),
            "private-rents": pool.submit(sources.rents, fetch, councils),
            "earnings": pool.submit(sources.ashe, fetch, councils),
            "ni-earnings": pool.submit(sources.ni_ashe, fetch, councils),
        }
        downloads = {key: future.result() for key, future in observed.items()}

    rent_date, rent_url, rent_rows, scottish = downloads["private-rents"]
    map_date, mapping = sources.brma_matches(fetch, places, first_page, scottish)
    if map_date != rent_date:
        raise ValueError("PIPR workbook and ONS local rent release dates differ")
    if {row["areaCode"] for row in mapping} != {code for code in councils if code.startswith(("S12", "N09"))}:
        raise ValueError("BRMA mapping does not cover the Scottish and NI council list")

    rent_keys = ("areaCode", "bedrooms", "period")
    validate_rows(rent_rows, rent_keys)
    valid_rent_areas = councils | sources.NATION_CODES | {"K02000001"} | set(scottish.values())
    valid_rent_areas |= set(sources.NI_BRMA_CODES.values())
    if any(row["areaCode"] not in valid_rent_areas for row in rent_rows):
        raise ValueError("PIPR contains an unrecognised rent area")
    # The ONS workbook contains explicit blanks for the NI lag months.
    ni_periods = [row["period"] for row in rent_rows if row["areaCode"].startswith("N") and
                  row["bedrooms"] == "all" and row["value"] is not None]
    if not ni_periods:
        raise ValueError("PIPR does not include observed Northern Ireland rents")
    ni_latest = max(ni_periods)
    rent_rows = [row for row in rent_rows if not row["areaCode"].startswith("N") or row["period"] <= ni_latest]
    validate_rows(rent_rows, rent_keys)
    rent_snapshot = latest(rent_rows, ("areaCode", "bedrooms"))
    rent_codes = {row["areaCode"] for row in rent_snapshot if row["bedrooms"] == "all"}
    if any(area["code"] not in rent_codes for row in mapping for area in row["areas"]):
        raise ValueError("A mapped BRMA is missing its headline rent row")

    expected_rents = {code for code in councils if code.startswith(("E", "W"))}
    if expected_rents - rent_codes:
        raise ValueError("PIPR is missing a headline rent row for a covered England or Wales council")

    hp_date, hp_url, hp_rows = downloads["house-prices"]
    validate_rows(hp_rows, ("areaCode", "period"))
    downloads["house-prices"] = hp_date, hp_url, latest(hp_rows, ("areaCode",))
    downloads["private-rents"] = rent_date, rent_url, rent_snapshot
    downloads["locations"] = map_date, sources.HOUSING, places
    downloads["brma-mapping"] = map_date, sources.HOUSING, mapping
    return write_generation(stage, downloads, previous, stamp)


def write_generation(stage, datasets, previous, stamp):
    entries = {}
    for key, (published, download_url, rows) in datasets.items():
        definition = DEFINITIONS[key]
        sample = rows[0] if rows else {}
        keys = tuple(field for field in ("areaCode", "period", "bedrooms") if field in sample)
        validate_rows(rows, keys or ("areaCode",), definition.minimum_rows)
        if rows and "value" in sample and not any(row["value"] is not None for row in rows):
            raise ValueError(f"{key}: all observations missing")
        old = previous.get(key)
        if old and (len(rows) < old["rowCount"] * 0.85 or published.isoformat() < old["publicationDate"]):
            raise ValueError(f"{key}: release regressed or row count dropped by more than 15%")
        if published > stamp.date():
            raise ValueError(f"{key}: publication date is in the future")
        rows.sort(key=lambda row: tuple(row[field] for field in keys))
        for row in rows:
            if "value" in row and row["value"] is None:
                row["missingReason"] = "The publisher suppressed or did not provide this observation."
        # Keep one row per line for reviewable changes to generated snapshots.
        payload = b"[\n" + b",\n".join(encode(row).rstrip(b"\n") for row in rows) + b"\n]\n"
        (stage / f"{key}.json").write_bytes(payload)
        periods = [row["period"] for row in rows if row.get("value") is not None]
        entries[key] = {
            "name": definition.name, "sourceOrganisation": definition.publisher, "sourceUrl": definition.source_url,
            "downloadUrl": download_url, "licence": OGL, "attribution": definition.attribution,
            "geography": definition.geography, "statisticalDefinition": definition.measure,
            "referencePeriod": max(periods) if periods else published.isoformat(),
            "publicationDate": published.isoformat(), "retrievedAt": stamp.isoformat(),
            "lastSuccessfulValidation": datetime.now(UK).isoformat(),
            "version": hashlib.sha256(payload).hexdigest(), "knownLimitations": definition.limitations,
            "file": f"{key}.json", "rowCount": len(rows), "staleAfterDays": definition.limit,
            "stalenessBasis": "retrievedAt" if key == "bank-rate" else "publicationDate",
            "staleAtRefresh": key != "bank-rate" and (stamp.date() - published).days > definition.limit,
        }
        if key == "house-prices":
            entries[key]["referencePeriod"] = max(
                row["period"] for row in rows if not row["areaCode"].startswith("N") and row["value"] is not None
            )
            entries[key]["northernIrelandReferencePeriod"] = max(
                row["period"] for row in rows if row["areaCode"].startswith("N") and row["value"] is not None
            )
        if key == "private-rents":
            entries[key]["supplementarySourceUrl"] = sources.HOUSING
            entries[key]["northernIrelandReferencePeriod"] = max(
                row["period"] for row in rows if row["areaCode"].startswith("N") and row["value"] is not None
            )
    if set(entries) != set(DEFINITIONS):
        raise ValueError("Incomplete data manifest")
    (stage / "manifest.json").write_bytes(encode({"schemaVersion": 1, "datasets": entries}))
    return entries


def swap(stage, destination):
    if not destination.exists():
        os.rename(stage, destination)
        return
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin":
        result = libc.renamex_np(os.fsencode(stage), os.fsencode(destination), 2)  # RENAME_SWAP
    elif sys.platform.startswith("linux"):
        result = libc.renameat2(-100, os.fsencode(stage), -100, os.fsencode(destination), 2)  # RENAME_EXCHANGE
    else:
        raise OSError("Atomic directory exchange is unavailable on this platform")
    if result != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(destination))


def refresh(destination, fetch=sources.download, prepare_generation=prepare):
    destination.parent.mkdir(parents=True, exist_ok=True)
    lock_path = destination.parent.parent / ".costlens-data.lock"
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if destination.is_symlink() or destination.exists() and not destination.is_dir():
            raise ValueError("The data destination must be a directory")
        previous = {}
        if destination.exists():
            previous = json.loads((destination / "manifest.json").read_bytes())["datasets"]
        with TemporaryDirectory(prefix=".costlens-stage-", dir=destination.parent) as temp:
            stage = Path(temp) / "data"
            stage.mkdir()
            entries = prepare_generation(fetch, stage, previous)
            swap(stage, destination)
    return entries


def main():
    try:
        entries = refresh(ROOT / "public" / "data")
    except Exception as error:
        print(f"Data refresh failed: {error}", file=sys.stderr)
        return 1
    for key, entry in sorted(entries.items()):
        print(f"{key}: {entry['rowCount']} rows (reference {entry['referencePeriod']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
