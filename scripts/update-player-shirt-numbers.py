#!/usr/bin/env python3
"""Fill players.json with real national-team shirt numbers from Transfermarkt."""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / "country-pages"
COUNTRIES_PATH = DATA_DIR / "countries.json"
PLAYERS_PATH = DATA_DIR / "players.json"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.translate(
        str.maketrans(
            {
                "ø": "o",
                "Ø": "O",
                "đ": "d",
                "Đ": "D",
                "ð": "d",
                "Ð": "D",
                "þ": "th",
                "Þ": "TH",
                "ł": "l",
                "Ł": "L",
                "ß": "ss",
            }
        )
    )
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.upper()
    value = value.replace("'", "").replace("’", "").replace("-", " ")
    value = re.sub(r"[^A-Z0-9 ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def names_match(local_name: str, transfermarkt_name: str) -> bool:
    local = normalize_name(local_name)
    remote = normalize_name(transfermarkt_name)
    if not local or not remote:
        return False
    if local == remote:
        return True
    # Allow manual disambiguation suffixes/prefixes like EDERSON MORAES vs Ederson.
    local_parts = set(local.split())
    remote_parts = set(remote.split())
    return bool(
        local_parts
        and remote_parts
        and (remote_parts.issubset(local_parts) or local_parts.issubset(remote_parts))
    )


def fetch_country_page(country: dict, refresh_cache: bool) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = CACHE_DIR / f"{country['id']}.html"
    if cache_path.exists() and not refresh_cache:
        return cache_path.read_text(encoding="utf-8", errors="ignore")

    url = country.get("transfermarkt")
    if not url:
        return ""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read().decode("utf-8", errors="ignore")
    cache_path.write_text(body, encoding="utf-8")
    return body


def extract_shirt_numbers(source: str) -> dict[int, dict]:
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", source, flags=re.DOTALL | re.IGNORECASE)
    players: dict[int, dict] = {}
    for row in rows:
        number_match = re.search(
            r'<td[^>]*class="[^"]*rueckennummer[^"]*"[^>]*>.*?<div[^>]*class=?["\']?rn_nummer["\']?[^>]*>([^<]*)</div>',
            row,
            flags=re.DOTALL | re.IGNORECASE,
        )
        player_match = re.search(
            r'href="/[^"]+/profil/spieler/(\d+)"[^>]*>\s*([^<]+?)\s*(?:<|</a>)',
            row,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if not number_match or not player_match:
            continue

        raw_number = html.unescape(number_match.group(1)).strip()
        shirt_number = int(raw_number) if raw_number.isdigit() else None
        player_id = int(player_match.group(1))
        name = re.sub(r"\s+", " ", html.unescape(player_match.group(2))).strip()
        players[player_id] = {"shirtNumber": shirt_number, "transfermarktName": name}
    return players


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    countries = read_json(COUNTRIES_PATH)
    player_groups = read_json(PLAYERS_PATH)
    countries_by_id = {country["id"]: country for country in countries}

    transfermarkt_players: dict[str, dict[int, dict]] = {}
    missing_countries: list[str] = []
    for country in countries:
        source = fetch_country_page(country, args.refresh_cache)
        extracted = extract_shirt_numbers(source)
        transfermarkt_players[country["id"]] = extracted
        if not extracted:
            missing_countries.append(country["id"])

    unresolved: list[dict] = []
    name_warnings: list[dict] = []
    updated = 0

    for group in player_groups:
        country_id = group.get("countryId")
        country = countries_by_id.get(country_id, {})
        remote_by_id = transfermarkt_players.get(country_id, {})
        for player in group.get("players", []):
            player_id = player.get("id")
            remote = remote_by_id.get(player_id)
            if not remote or remote.get("shirtNumber") is None:
                player["shirtNumber"] = None
                unresolved.append(
                    {
                        "countryId": country_id,
                        "country": country.get("name", country_id),
                        "playerId": player_id,
                        "player": player.get("name"),
                        "reason": "no Transfermarkt shirt number for this id",
                    }
                )
                continue

            if not names_match(player.get("name"), remote.get("transfermarktName")):
                player["shirtNumber"] = None
                name_warnings.append(
                    {
                        "countryId": country_id,
                        "country": country.get("name", country_id),
                        "playerId": player_id,
                        "player": player.get("name"),
                        "transfermarktName": remote.get("transfermarktName"),
                    }
                )
                continue

            player["shirtNumber"] = remote["shirtNumber"]
            updated += 1

    if not args.dry_run:
        write_json(PLAYERS_PATH, player_groups)

    report = {
        "updatedPlayers": updated,
        "missingCountries": missing_countries,
        "unresolvedPlayers": unresolved,
        "nameWarnings": name_warnings,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
