#!/usr/bin/env python3
"""Discover BBC live match links and newly resolved knockout teams.

BBC often publishes live pages shortly before a match day. This script scans
the BBC World Cup scores/fixtures pages, matches events against data/matches.json
strictly by date/team/placeholder, then fills missing BBC links.
"""

from __future__ import annotations

import argparse
import copy
import html
import json
import re
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / "bbc-pages"

MATCHES_PATH = DATA_DIR / "matches.json"
COUNTRIES_PATH = DATA_DIR / "countries.json"

BBC_BASE_URL = "https://www.bbc.com/sport/football/world-cup/scores-fixtures"
BBC_URLS = [
    BBC_BASE_URL,
    f"{BBC_BASE_URL}/2026-06?filter=fixtures",
    f"{BBC_BASE_URL}/2026-06?filter=results",
    f"{BBC_BASE_URL}/2026-07?filter=fixtures",
    f"{BBC_BASE_URL}/2026-07?filter=results",
]

BBC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8",
}

BBC_TEAM_ALIASES = {
    "ALGERIA": "ALG",
    "ARGENTINA": "ARG",
    "AUSTRALIA": "AUS",
    "AUSTRIA": "AUT",
    "BELGIUM": "BEL",
    "BOSNIA HERZEGOVINA": "BOS",
    "BOSNIA AND HERZEGOVINA": "BOS",
    "BOSNIA-HERZEGOVINA": "BOS",
    "BRAZIL": "BRA",
    "CANADA": "CAN",
    "CAPE VERDE": "CPV",
    "COLOMBIA": "COL",
    "CONGO DR": "COD",
    "DR CONGO": "COD",
    "CROATIA": "CRO",
    "CURACAO": "CUR",
    "CZECH REPUBLIC": "CZE",
    "ECUADOR": "ECU",
    "EGYPT": "EGY",
    "ENGLAND": "ENG",
    "FRANCE": "FRA",
    "GERMANY": "GER",
    "GHANA": "GHA",
    "HAITI": "HAI",
    "IRAN": "IRN",
    "IRAQ": "IRQ",
    "IVORY COAST": "CIV",
    "JAPAN": "JPN",
    "JORDAN": "JOR",
    "MEXICO": "MEX",
    "MOROCCO": "MOR",
    "NETHERLANDS": "NED",
    "NEW ZEALAND": "NZL",
    "NORWAY": "NOR",
    "PANAMA": "PAN",
    "PARAGUAY": "PAR",
    "PORTUGAL": "POR",
    "QATAR": "QAT",
    "SAUDI ARABIA": "KSA",
    "SCOTLAND": "SCO",
    "SENEGAL": "SEN",
    "SOUTH AFRICA": "RSA",
    "SOUTH KOREA": "KOR",
    "SPAIN": "ESP",
    "SWEDEN": "SWE",
    "SWITZERLAND": "SWI",
    "TUNISIA": "TUN",
    "TURKEY": "TUR",
    "UNITED STATES": "USA",
    "USA": "USA",
    "URUGUAY": "URU",
    "UZBEKISTAN": "UZB",
}


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return copy.deepcopy(fallback)
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def normalize(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_initial_data(source: str) -> dict:
    match = re.search(r"window\.__INITIAL_DATA__=\"([\s\S]*?)\";</script>", source)
    if not match:
        return {}
    try:
        return json.loads(json.loads('"' + match.group(1) + '"'))
    except json.JSONDecodeError:
        return {}


def fetch_url(url: str, refresh_cache: bool) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_name = re.sub(r"[^A-Za-z0-9]+", "-", url.replace(BBC_BASE_URL, "bbc")).strip("-")
    cache_path = CACHE_DIR / f"{cache_name}.html"
    if cache_path.exists() and not refresh_cache:
        return cache_path.read_text(encoding="utf-8", errors="ignore")

    request = urllib.request.Request(url, headers=BBC_HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        source = response.read().decode("utf-8", errors="ignore")
    cache_path.write_text(source, encoding="utf-8")
    return source


def bbc_events_from_source(source: str) -> list[dict]:
    initial = parse_initial_data(source)
    events: list[dict] = []
    for container in (initial.get("data") or {}).values():
        if not isinstance(container, dict) or container.get("name") != "sport-data-scores-fixtures":
            continue
        for group in (container.get("data") or {}).get("eventGroups", []):
            for secondary in group.get("secondaryGroups", []):
                for event in secondary.get("events", []):
                    events.append(event)
    return events


def build_country_aliases(countries: list[dict]) -> dict[str, str]:
    aliases = dict(BBC_TEAM_ALIASES)
    for country in countries:
        country_id = country.get("id")
        if country_id:
            aliases[normalize(country_id)] = country_id
            aliases[normalize(country.get("name"))] = country_id
    return aliases


def placeholder_from_bbc_name(name: str) -> str | None:
    value = normalize(name)
    group_position = re.match(r"^(1ST|2ND|3RD) GROUP ([A-L](?: [A-L])*)$", value)
    if group_position:
        prefix = {"1ST": "1", "2ND": "2", "3RD": "3"}[group_position.group(1)]
        return prefix + group_position.group(2).replace(" ", "")
    winner_match = re.match(r"^WINNER MATCH (\d+)$", value)
    if winner_match:
        return f"W{winner_match.group(1)}"
    loser_semi = re.match(r"^LOSER SEMI FINAL (\d+)$", value)
    if loser_semi:
        return f"RU10{loser_semi.group(1)}"
    return None


def country_or_placeholder(team: dict, aliases: dict[str, str]) -> tuple[str | None, str | None]:
    name = team.get("fullName") or team.get("shortName") or ""
    country_id = aliases.get(normalize(name))
    if country_id:
        return country_id, None
    return None, placeholder_from_bbc_name(name)


def bbc_event_record(event: dict, aliases: dict[str, str]) -> dict | None:
    kickoff = event.get("startDateTime") or event.get("date", {}).get("iso")
    link = event.get("onwardJourneyLink")
    if not kickoff:
        return None
    home_id, home_placeholder = country_or_placeholder(event.get("home") or {}, aliases)
    away_id, away_placeholder = country_or_placeholder(event.get("away") or {}, aliases)
    return {
        "kickoff": kickoff,
        "homeCountryId": home_id,
        "awayCountryId": away_id,
        "homePlaceholder": home_placeholder,
        "awayPlaceholder": away_placeholder,
        "bbc": f"https://www.bbc.com{link}" if link and link.startswith("/") else link,
    }


def dedupe_records(records: list[dict]) -> list[dict]:
    deduped: dict[tuple, dict] = {}
    for record in records:
        key = (
            record.get("kickoff"),
            record.get("homeCountryId"),
            record.get("awayCountryId"),
            record.get("homePlaceholder"),
            record.get("awayPlaceholder"),
        )
        existing = deduped.get(key)
        if not existing or (not existing.get("bbc") and record.get("bbc")):
            deduped[key] = record
    return list(deduped.values())


def same_side(local_id: str | None, local_placeholder: str | None, bbc_id: str | None, bbc_placeholder: str | None) -> bool:
    if local_id and bbc_id:
        return local_id == bbc_id
    if local_placeholder and bbc_placeholder:
        return normalize(local_placeholder) == normalize(bbc_placeholder)
    if not local_id and not local_placeholder and (bbc_id or bbc_placeholder):
        return True
    return False


def match_score(local: dict, bbc: dict) -> int:
    try:
        local_kickoff = parse_iso(local["kickoff"])
        bbc_kickoff = parse_iso(bbc["kickoff"])
    except Exception:
        return 0
    if abs((local_kickoff - bbc_kickoff).total_seconds()) > 75 * 60:
        return 0

    direct = same_side(local.get("homeCountryId"), local.get("homePlaceholder"), bbc.get("homeCountryId"), bbc.get("homePlaceholder")) and same_side(
        local.get("awayCountryId"), local.get("awayPlaceholder"), bbc.get("awayCountryId"), bbc.get("awayPlaceholder")
    )
    if direct:
        return 3 if local.get("homeCountryId") and local.get("awayCountryId") else 2
    return 0


def same_kickoff(local: dict, bbc: dict) -> bool:
    try:
        local_kickoff = parse_iso(local["kickoff"])
        bbc_kickoff = parse_iso(bbc["kickoff"])
    except Exception:
        return False
    return abs((local_kickoff - bbc_kickoff).total_seconds()) <= 75 * 60


def unresolved_local_teams(local: dict) -> bool:
    return not local.get("homeCountryId") or not local.get("awayCountryId")


def apply_bbc_record(local: dict, bbc: dict) -> list[str]:
    changes: list[str] = []
    if bbc.get("bbc") and local.get("bbc") != bbc["bbc"]:
        local["bbc"] = bbc["bbc"]
        changes.append("bbc")

    for side in ["home", "away"]:
        country_key = f"{side}CountryId"
        placeholder_key = f"{side}Placeholder"
        if not local.get(country_key) and bbc.get(country_key):
            local[country_key] = bbc[country_key]
            local[placeholder_key] = None
            changes.append(country_key)
    return changes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refresh-cache", action="store_true")
    args = parser.parse_args()

    matches = read_json(MATCHES_PATH, [])
    countries = read_json(COUNTRIES_PATH, [])
    original = copy.deepcopy(matches)
    aliases = build_country_aliases(countries)

    bbc_records: list[dict] = []
    warnings: list[str] = []
    for url in BBC_URLS:
        try:
            source = fetch_url(url, args.refresh_cache)
            for event in bbc_events_from_source(source):
                record = bbc_event_record(event, aliases)
                if record:
                    bbc_records.append(record)
        except Exception as error:
            warnings.append(f"{url}: fetch/parse failed ({error})")
    bbc_records = dedupe_records(bbc_records)

    changed: list[str] = []
    for local in matches:
        candidates = [(match_score(local, record), record) for record in bbc_records]
        candidates = [(score, record) for score, record in candidates if score > 0]
        if not candidates and unresolved_local_teams(local):
            kickoff_candidates = [
                record
                for record in bbc_records
                if same_kickoff(local, record)
                and record.get("homeCountryId")
                and record.get("awayCountryId")
            ]
            candidates = [(1, record) for record in kickoff_candidates]
        if not candidates:
            continue
        candidates.sort(key=lambda item: item[0], reverse=True)
        best_score = candidates[0][0]
        best = [record for score, record in candidates if score == best_score]
        if len(best) != 1:
            warnings.append(f"M{local.get('number')}: BBC discovery ambiguous ({len(best)} candidates)")
            continue
        changes = apply_bbc_record(local, best[0])
        if changes:
            changed.append(f"M{local.get('number')}: {', '.join(changes)}")

    if args.dry_run:
        matches = original
    else:
        write_json(MATCHES_PATH, matches)

    print(f"{'Would discover' if args.dry_run else 'Discovered'} {len(changed)} BBC/link/team update(s).")
    for line in changed:
        print(f"- {line}")
    if warnings:
        print("Warnings:")
        for line in warnings:
            print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
