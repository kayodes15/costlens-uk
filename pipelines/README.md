# Refresh official datasets

Run this command from the repository root.

```sh
./pipelines/refresh-data
```

The command needs Python 3.10+, curl with normal HTTPS certificate trust, and network access to the publishers. It creates or reuses the ignored project virtual environment, installs the pinned workbook reader and prints counts and reference periods only after publishing the complete validated generation. Test locally with `.venv/bin/python -m unittest discover -s tests/pipeline -v`.

The refresh reads the latest listed editions and checks required fields, statistical definitions, identifiers, dates, unique keys, value ranges and minimum row counts. A decline of more than 15% relative to the last good version or an older publication date requires inspection. Review any publisher format change and update the adapter and tests before retrying. Retry a temporary connection error using the same command after checking publisher availability.

Output files in `public/data` include monthly CPI and CPIH index and published annual-rate histories, the effective Bank Rate history and monthly quoted mortgage observations. HPI, PIPR and ASHE are snapshots at the latest published local periods. HPI keeps the Northern Ireland values as quarterly observations. The earnings measure is the ASHE median gross annual pay of full-time employee jobs, by residence. Northern Ireland districts use NISRA Table 8 (NI).7a and have separate source metadata. Suppressed or unavailable observations are null, with a reason where a source row exists.

PIPR is the main rent source. The Scottish council mapping uses the ONS housing tool’s displayed BRMA. For Northern Ireland, workbook rows with no area code join by published BRMA name to the ONS tool’s area identifiers. The mapping retains the ONS best match and published significant overlaps. Look up the BRMA code in private rents and display its name and reference month. A council may overlap several BRMAs. The best match is suitable for an area-level estimate. Users need manual entry when the observed rent is unavailable or the match is unsuitable. The implementation uses the published aggregate tables. It does not ingest postcode records, boundary geometry, the standalone LPS workbook or the NIHE/Ulster University report.

The manifest records attribution, licensing, source and download locations, definitions, coverage, publication and validation timestamps, reference periods, content hashes and staleness policy. Compare today's date with the indicated timestamp and `staleAfterDays` when showing the data. Bank Rate uses the last refresh because a policy rate can stay unchanged for several meetings. Preserve the GB and Northern Ireland reference periods independently.

A failed refresh exits non-zero and produces a diagnostic on stderr. It leaves the prior generation untouched. The command holds an exclusive lock while building the new files next to the destination, then atomically exchanges directories on the same filesystem. If an incorrect but valid generation is committed, revert its data refresh commit to restore the previous snapshot. For regular refreshes, run the same command after publication and commit the generated files together.
