"""Publisher adapters for the CostLens UK data refresh."""

import csv
import io
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date, datetime
from html import unescape
from urllib.parse import urljoin, urlsplit
from zipfile import ZipFile

from openpyxl import load_workbook

ONS = "https://www.ons.gov.uk"
GOV = "https://www.gov.uk"
BANK = "https://www.bankofengland.co.uk"
HOUSING = ONS + "/visualisations/housingpriceslocal/"
PIPR = ONS + "/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics"
ASHE = ONS + "/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/placeofresidencebylocalauthorityashetable8"
NI_ASHE = "https://www.nisra.gov.uk/publications/ni-geographies-place-work-and-place-residence"
HPI = GOV + "/government/collections/uk-house-price-index-reports"
BANK_RATE = BANK + "/boeapps/database/Bank-Rate.asp"
QUOTED = BANK + "/boeapps/database/fromshowcolumns.asp?C=EOT&C=EOW&C=EP0&C=EP3&Filter=N&SearchText=IUMBV34%2C+IUMBV37%2C+IUMBV42%2C+IUMBV45&SearchTextFields=TC&ShadowPage=1&ShowData.x=121&ShowData.y=32&TotalNumResults=4&Travel=NIx&XNotes2=Y"
SIZE_LIMIT = 80_000_000
NATIONS = {"E": "England", "W": "Wales", "S": "Scotland", "N": "Northern Ireland"}
NATION_CODES = {"E92000001", "W92000004", "S92000003", "N92000002"}
AREA_CODE = re.compile(r"[EKNSW]\d{8}|NBRMA[1-8]")
COUNCIL_CODE = re.compile(r"E(?:06|07|08|09)\d{6}|W06\d{6}|S12\d{6}|N09\d{6}")
RENT_HEADERS = {
    "Rental price": "all", "Rental price one bed": "1", "Rental price two bed": "2",
    "Rental price three bed": "3", "Rental price four or more bed": "4+",
}
# ONS local housing chart IDs for PIPR rows with no area code.
NI_BRMA_CODES = {
    "Belfast": "NBRMA1", "Lough Neagh Upper": "NBRMA2", "Lough Neagh Lower": "NBRMA3",
    "North Northern Ireland": "NBRMA4", "North West Northern Ireland": "NBRMA5",
    "South Northern Ireland": "NBRMA6", "South East Northern Ireland": "NBRMA7",
    "South West Northern Ireland": "NBRMA8",
}
MISSING = {None, "", "[x]", "[z]", "x", "..", "-", "#"}


def download(url):
    """Use macOS curl's normal certificate trust and bounded HTTPS transfers."""
    if urlsplit(url).scheme != "https":
        raise ValueError(f"Expected an HTTPS source: {url}")
    try:
        process = subprocess.run(
            ["curl", "--fail", "--silent", "--show-error", "--location", "--proto", "=https",
             "--proto-redir", "=https", "--connect-timeout", "15", "--max-time", "70",
             "--retry", "1", "--retry-max-time", "80",
             "--max-filesize", str(SIZE_LIMIT), url],
            capture_output=True, check=True, timeout=155,
        )
    except (subprocess.SubprocessError, OSError) as error:
        detail = getattr(error, "stderr", b"") or b""
        raise ValueError(f"Download failed for {url}: {detail.decode(errors='replace').strip() or error}") from error
    if not process.stdout or len(process.stdout) > SIZE_LIMIT:
        raise ValueError(f"Invalid download size: {url}")
    return process.stdout


def text(payload):
    return payload.decode("utf-8-sig")


def find(pattern, content, label):
    match = re.search(pattern, content)
    if not match:
        raise ValueError(f"Source schema changed: {label}")
    return match.group(1)


def link(page_url, page, pattern):
    target = urljoin(page_url, unescape(find(pattern, page, page_url)))
    if urlsplit(target).hostname not in {"www.ons.gov.uk", "www.gov.uk", "publicdata.landregistry.gov.uk", "www.nisra.gov.uk"}:
        raise ValueError(f"Unexpected publisher download host: {target}")
    return target


def publication_date(page):
    return date.fromisoformat(find(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', page, "publication date"))


def csv_rows(payload, required):
    reader = csv.DictReader(io.StringIO(text(payload), newline=""))
    if not reader.fieldnames or not required.issubset(reader.fieldnames) or len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError(f"Source CSV schema changed: expected {sorted(required)}")
    for row in reader:
        if None in row or None in row.values():
            raise ValueError("CSV row does not match the header")
        yield row


def number(raw, minimum, maximum):
    if raw in MISSING:
        return None
    if isinstance(raw, bool):
        raise ValueError(f"Unexpected boolean value: {raw}")
    value = float(raw)
    if not minimum <= value <= maximum:
        raise ValueError(f"Value outside supported range: {raw}")
    return value


def checked_archive(payload):
    archive = ZipFile(io.BytesIO(payload))
    if sum(item.file_size for item in archive.infolist()) > 400_000_000:
        archive.close()
        raise ValueError("Workbook archive exceeds expanded size limit")
    return archive


@contextmanager
def workbook(payload):
    with checked_archive(payload):
        book = load_workbook(io.BytesIO(payload), read_only=True, data_only=True)
        try:
            yield book
        finally:
            book.close()


def inflation(fetch, series, *, annual_rate=False):
    code = {
        ("CPIH", False): "L522", ("CPI", False): "D7BT",
        ("CPIH", True): "L55O", ("CPI", True): "D7G7",
    }[series, annual_rate]
    measure = "ANNUAL RATE" if annual_rate else "INDEX"
    unit = "%" if annual_rate else "Index, base year = 100"
    bounds = (-100, 100) if annual_rate else (0.01, 10_000)
    path = f"/economy/inflationandpriceindices/timeseries/{code.lower()}/mm23"
    url = ONS + "/generator?format=csv&uri=" + path
    rows = list(csv.reader(io.StringIO(text(fetch(url)))))
    meta = dict(row for row in rows[:8] if len(row) == 2)
    if (meta.get("CDID") != code or meta.get("Source dataset ID") != "MM23" or
            meta.get("Unit") != unit or
            not meta.get("Title", "").startswith(f"{series} {measure} 00: ALL ITEMS 2015=100")):
        raise ValueError(f"Inflation series definition changed: {series}")
    published = datetime.strptime(meta["Release date"], "%d-%m-%Y").date()
    observations = []
    for row in rows[8:]:
        if len(row) != 2:
            raise ValueError(f"Unexpected {series} CSV row")
        period, raw = row
        if re.fullmatch(r"\d{4}( Q[1-4])?", period):
            continue
        month = datetime.strptime(period, "%Y %b").strftime("%Y-%m")
        observations.append({"areaCode": "K02000001", "period": month, "value": number(raw, *bounds)})
    return published, url, observations


def bank_rates(fetch):
    page = text(fetch(BANK_RATE))
    rows = []
    for day, raw in re.findall(
        r"<td[^>]*>\s*(\d{1,2} [A-Z][a-z]{2} \d{2})\s*</td>\s*<td[^>]*>\s*([\d.]+)\s*</td>",
        page,
    ):
        effective = datetime.strptime(day, "%d %b %y").date()
        rows.append({"areaCode": "K02000001", "period": effective.isoformat(), "value": number(raw, 0, 30)})
    if not rows or "Official Bank Rate" not in page:
        raise ValueError("Bank Rate history table changed")
    return max(date.fromisoformat(row["period"]) for row in rows), BANK_RATE, rows


def quoted_rates(fetch):
    url = BANK + ("/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2020"
                  "&Dateto=now&SeriesCodes=IUMBV34&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    page = text(fetch(QUOTED))
    if "75% LTV" not in page or "IUMBV34" not in page:
        raise ValueError("Quoted mortgage rate definition changed")
    published = datetime.strptime(find(r"Published:\s*(\d{1,2} [A-Z][a-z]{2} \d{4})", page, "quoted rate publication"), "%d %b %Y").date()
    rows = [
        {"areaCode": "K02000001", "period": datetime.strptime(row["DATE"], "%d %b %Y").strftime("%Y-%m"),
         "value": number(row["IUMBV34"], 0, 30)}
        for row in csv_rows(fetch(url), {"DATE", "IUMBV34"})
    ]
    return published, url, rows


def geography(fetch):
    page = text(fetch(HOUSING + "N09000003/"))
    places = embedded(page, "/data/places.csv")
    rows = []
    for row in csv_rows(places.encode(), {"areacd", "areanm", "parentcd"}):
        code = row["areacd"]
        if not COUNCIL_CODE.fullmatch(code) or not AREA_CODE.fullmatch(row["parentcd"]) or not row["areanm"].strip():
            raise ValueError(f"Unexpected housing geography: {row}")
        rows.append({
            "areaCode": code, "name": row["areanm"], "nation": NATIONS[code[0]], "parentCode": row["parentcd"],
        })
    return rows, page


def embedded(page, path):
    payload = json.loads(find(r'data-url="' + re.escape(path) + r'"[^>]*>(.*?)</script>', page, path))
    if payload["status"] != 200 or not isinstance(payload["body"], str):
        raise ValueError(f"Unexpected ONS embedded data response: {path}")
    return payload["body"]


def hpi(fetch, council_codes):
    page = text(fetch(HPI))
    release_url = link(HPI, page, r'href="([^"]*/uk-house-price-index-data-downloads-[a-z]+-\d{4})"')
    release = text(fetch(release_url))
    url = link(release_url, release, r'href="([^"]*UK-HPI-full-file-\d{4}-\d{2}\.csv[^"]*)"')
    published = publication_date(release)
    rows = []
    for row in csv_rows(fetch(url), {"Date", "RegionName", "AreaCode", "AveragePrice"}):
        code = row["AreaCode"]
        if not AREA_CODE.fullmatch(code):
            raise ValueError(f"Unknown HPI code format: {code}")
        period = datetime.strptime(row["Date"], "%d/%m/%Y").date()
        if period.day != 1 or period >= published:
            raise ValueError(f"Invalid HPI observation date: {period}")
        if code not in council_codes | NATION_CODES | {"K02000001"}:
            continue
        # The HMLR file repeats NI quarterly data on each month in the quarter.
        if code.startswith("N"):
            if period.month % 3:
                continue
            key = f"{period.year}-Q{period.month // 3}"
        else:
            key = period.strftime("%Y-%m")
        rows.append({"areaCode": code, "period": key, "value": number(row["AveragePrice"], 1, 100_000_000)})
    return published, url, rows


def rents(fetch, council_codes):
    page = text(fetch(PIPR))
    url = link(PIPR, page, r'href="([^"]*priceindexofprivaterentsukmonthlypricestatistics/[^"]+\.xlsx)"')
    published = publication_date(page)
    rows, brma = [], {}
    with workbook(fetch(url)) as book:
        cover = book["Cover sheet"]["A1"].value
        if not isinstance(cover, str) or not cover.startswith("Price Index of Private Rents (PIPR)"):
            raise ValueError("PIPR statistical definition changed")
        cells = book["Table 1"].iter_rows(min_row=3, values_only=True)
        headers = next(cells)
        if tuple(headers[:4]) != ("Time period", "Area code", "Area name", "Region or country name"):
            raise ValueError("PIPR area columns changed")
        cols = {bedrooms: headers.index(header) for header, bedrooms in RENT_HEADERS.items()}
        for row in cells:
            month, code, name = row[:3]
            if all(cell is None for cell in row):
                continue
            if not isinstance(month, datetime) or month.day != 1 or month.date() >= published:
                raise ValueError(f"Invalid PIPR observation date: {month}")
            if code == "[z]" and row[3] == "Northern Ireland" and isinstance(name, str) and name.endswith(" BRMA"):
                name = name.removesuffix(" BRMA")
                code = NI_BRMA_CODES[name]
            if not isinstance(code, str) or not AREA_CODE.fullmatch(code) or not isinstance(name, str) or not name:
                raise ValueError(f"Invalid PIPR geography: {code}, {name}")
            if code.startswith("S33"):
                if name in brma and brma[name] != code:
                    raise ValueError(f"Conflicting Scottish BRMA name: {name}")
                brma[name] = code
            elif code not in council_codes | NATION_CODES | {"K02000001"} and not code.startswith("NBRMA"):
                continue
            if code.startswith(("S12", "N09")):
                continue
            for bedrooms, col in cols.items():
                rows.append({"areaCode": code, "name": name, "period": month.strftime("%Y-%m"),
                             "bedrooms": bedrooms, "value": number(row[col], 1, 100_000)})
    return published, url, rows, brma


def ashe(fetch, council_codes):
    page = text(fetch(ASHE))
    url = link(ASHE, page, r'href="([^"]*ashetable8(?![^"]*revised)[^"]*provisional\.zip)"')
    published = publication_date(page)
    rows = []
    with checked_archive(fetch(url)) as archive:
        names = [item for item in archive.namelist() if re.search(r"Table 8\.7a +Annual pay - Gross \d{4}\.xlsx$", item)]
        if len(names) != 1:
            raise ValueError("ASHE annual gross pay workbook changed")
        with workbook(archive.read(names[0])) as book:
            cells = book["Full-Time"].iter_rows(max_col=6, values_only=True)
            title = next(cells)[0]
            year = find(r"Annual pay - Gross \(£\) - For full-time employee jobs.*United Kingdom (\d{4})", title, "ASHE measure")
            for _ in range(3):
                next(cells)
            if next(cells)[:4] != ("Description", "Code", "(thousand)", "Median"):
                raise ValueError("ASHE median columns changed")
            for name, code, _, median, *_ in cells:
                if code is None:
                    continue
                code = code.strip().lstrip("'")
                if not AREA_CODE.fullmatch(code):
                    raise ValueError(f"Unexpected ASHE geography: {code}")
                if code in council_codes | NATION_CODES | {"K02000001"}:
                    rows.append({"areaCode": code, "period": year, "value": number(median, 1, 10_000_000)})
    return published, url, rows


def ni_ashe(fetch, council_codes):
    page = text(fetch(NI_ASHE))
    url = link(NI_ASHE, page, r'href="([^"]*/ASHE-([0-9]{4})-home-lgd\.zip)"')
    year = find(r"ASHE-([0-9]{4})-home-lgd", url, "NISRA ASHE edition")
    published = date.fromisoformat(find(r'<time datetime="(\d{4}-\d{2}-\d{2})T', page, "NISRA ASHE publication date"))
    if published.year != int(year):
        raise ValueError("NISRA ASHE publication and workbook editions differ")
    with checked_archive(fetch(url)) as archive:
        names = [name for name in archive.namelist() if name.endswith(f"Annual pay - Gross {year}.xlsx")]
        if len(names) != 1:
            raise ValueError("NISRA ASHE annual gross pay workbook changed")

        # The publisher uses CSS-style hex colours in an otherwise readable XLSX.
        normalised = io.BytesIO()
        with checked_archive(archive.read(names[0])) as original, ZipFile(normalised, "w") as fixed:
            for item in original.infolist():
                payload = original.read(item)
                if item.filename == "xl/styles.xml":
                    payload = re.sub(rb'rgb="#([0-9a-fA-F]{6})"', rb'rgb="FF\1"', payload)
                fixed.writestr(item, payload)

    rows = []
    with workbook(normalised.getvalue()) as book:
        sheet = book["Table8.7a Full-Time"]
        # The sheet's declared range omits the observations.
        sheet.reset_dimensions()
        cells = sheet.iter_rows(max_col=4, values_only=True)
        title = next(cells)[0]
        measure = f"Annual pay - Gross (£) - For full-time employee jobs in Northern Ireland, {year}"
        if not isinstance(title, str) or measure not in title:
            raise ValueError("NISRA ASHE measure changed")
        if not any(row[:2] == ("Description", "Code") and row[3] == "Median" for row in cells):
            raise ValueError("NISRA ASHE median columns changed")
        for _, code, _, median in cells:
            if code in (None, "[z]"):
                continue
            if code not in council_codes or not code.startswith("N09"):
                raise ValueError(f"Unexpected NISRA ASHE district: {code}")
            value = None if median in ("[d]", "[u]") else number(median, 1, 10_000_000)
            rows.append({"areaCode": code, "period": year, "value": value})
    if {row["areaCode"] for row in rows} != {code for code in council_codes if code.startswith("N09")}:
        raise ValueError("NISRA ASHE does not cover the Northern Ireland district list")
    return published, url, rows


def housing_sections(page, code):
    data = json.loads(embedded(page, f"/data/json/{code}.json"))
    return data["sections"]


def brma_matches(fetch, places, first_page, scottish_brmas):
    """Use ONS best matches, retaining all published NI overlap options."""
    def get(place):
        code = place["areaCode"]
        url = HOUSING + code + "/"
        page = first_page if code == "N09000003" else text(fetch(url))
        sections = housing_sections(page, code)
        published = date.fromisoformat(next(item["lastUpdated"] for item in sections if item.get("type") == "Meta"))
        if code.startswith("S"):
            chart = next(item for item in sections if item.get("id") == "chart-rents_scot_static")
            name = chart["selected"]
            match = {"code": scottish_brmas[name], "name": name}
            return published, {"areaCode": code, "bestMatch": match, "areas": [match], "source": url}

        chart = next(item for item in sections if item.get("type") == "NIMap")
        description = next(item["content"] for item in sections if item.get("id") == "ni_rent_price")
        description = unescape(description)
        names_to_codes = {item["areanm"]: item["areacd"] for item in chart["data"]}
        if names_to_codes != NI_BRMA_CODES or len(chart["data"]) != len(NI_BRMA_CODES):
            raise ValueError("Northern Ireland BRMA identifiers changed")
        areas = {code: {"code": code, "name": name} for name, code in names_to_codes.items()}
        best = areas[chart["selected"]]
        overlaps = [area for area in areas.values() if re.search(
            rf"(?<!\w){re.escape(area['name'])}(?!\w)",
            description.split("rental area", 1)[-1],
        )]
        if best not in overlaps:
            raise ValueError(f"ONS best match absent from overlaps: {code}")
        return published, {"areaCode": code, "bestMatch": best, "areas": overlaps, "source": url}

    targets = [place for place in places if place["areaCode"].startswith(("S12", "N09"))]
    mappings, editions = [], set()
    with ThreadPoolExecutor(max_workers=3) as pool:
        for published, mapping in pool.map(get, targets):
            mappings.append(mapping)
            editions.add(published)
    if len(editions) != 1:
        raise ValueError("ONS housing visualisations are at different release dates")
    return editions.pop(), mappings
