#!/usr/bin/env python3
"""Update finished World Cup match JSON files from Transfermarkt.

The script attempts matches whose kickoff time has passed, then only updates
them when Transfermarkt already shows a final score.
It updates:
  - data/matches.json
  - data/match-events.json
  - data/players.json
  - data/match-events-live.json (clears matches imported officially)

Usage:
  python scripts/update_finished_matches.py
  python scripts/update_finished_matches.py --dry-run
  python scripts/update_finished_matches.py --match 1
"""

from __future__ import annotations

import argparse
import copy
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / "match-pages"

MATCHES_PATH = DATA_DIR / "matches.json"
MATCH_EVENTS_PATH = DATA_DIR / "match-events.json"
PLAYERS_PATH = DATA_DIR / "players.json"
LIVE_EVENTS_PATH = DATA_DIR / "match-events-live.json"

from bbc_match_events import apply_bbc_assists_to_event, preserve_existing_assists

ROUND_NAMES = ["J1", "J2", "J3", "R32", "R16", "QF", "SF", "F"]
STAT_NAMES = [
    "matchesPlayed",
    "penalties",
    "goals",
    "assists",
    "cleanSheets",
    "penaltiesSaved",
]
GOAL_POINTS = {"GB": 9, "DF": 7, "MIL": 5, "ATT": 3}
CLEAN_SHEET_POINTS = {"GB": 5, "DF": 2, "MIL": 0, "ATT": 0}
GROUP_ROUND_TWO_START = datetime.fromisoformat("2026-06-18T16:00:00+00:00")
GROUP_ROUND_TWO_END = datetime.fromisoformat("2026-06-24T02:00:00+00:00")


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def decode_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def section_between(source: str, start_text: str, end_text: str | None = None) -> str:
    start = source.find(start_text)
    if start == -1:
        return ""
    end = source.find(end_text, start) if end_text else -1
    return source[start:] if end == -1 else source[start:end]


def fetch_match_page(match: dict, refresh_cache: bool) -> str | None:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = CACHE_DIR / f"match-{match['number']}.html"

    if cache_path.exists() and not refresh_cache:
        return cache_path.read_text(encoding="utf-8", errors="ignore")

    url = match.get("transfermarkt")
    if not url:
        return None

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


def extract_player_ids(source: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for match in re.finditer(r'href="/[^"]+/profil/spieler/(\d+)">([^<]+)</a>', source):
        player_id = int(match.group(1))
        if player_id not in seen:
            seen.add(player_id)
            ids.append(player_id)
    return ids


def extract_used_substitutes(source: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for row in re.findall(r"<tr[\s\S]*?</tr>", source):
        if "icon-einwechslung-formation" not in row:
            continue
        found = re.search(r'href="/[^"]+/profil/spieler/(\d+)">([^<]+)</a>', row)
        if not found:
            continue
        player_id = int(found.group(1))
        if player_id not in seen:
            seen.add(player_id)
            ids.append(player_id)
    return ids


def parse_lineups(source: str) -> dict:
    section = section_between(source, "Line-Ups", "Goals")
    starts = [match.start() for match in re.finditer(r"Starting Line-up:", section)]
    if len(starts) < 2:
        return {
            "home": {"starters": [], "substitutes": []},
            "away": {"starters": [], "substitutes": []},
        }

    lineups = {}
    for index, side in enumerate(["home", "away"]):
        chunk = section[starts[index] : starts[index + 1] if index + 1 < len(starts) else None]
        bench_start = chunk.find('<table class="ersatzbank">')
        pitch = chunk if bench_start == -1 else chunk[:bench_start]
        bench = "" if bench_start == -1 else chunk[bench_start:]
        lineups[side] = {
            "starters": extract_player_ids(pitch),
            "substitutes": extract_used_substitutes(bench),
        }
    return lineups


def parse_minute(source: str) -> tuple[int | None, int | None]:
    style = re.search(r"background-position:\s*(-?\d+)px\s*(-?\d+)px", source)
    if not style:
        return None, None
    x = abs(int(style.group(1)))
    y = abs(int(style.group(2)))
    minute = int(x / 36 + (y / 36) * 10 + 1)
    added = re.search(r">\s*\+(\d+)\s*<", source)
    return minute, int(added.group(1)) if added else None


def parse_goals(source: str, match_data: dict) -> list[dict]:
    section = section_between(source, 'id="sb-tore"', "Substitutions")
    actions = re.findall(r'<li class="sb-aktion-(heim|gast)">[\s\S]*?</li>', section)
    full_actions = re.findall(r'<li class="sb-aktion-(?:heim|gast)">[\s\S]*?</li>', section)
    goals = []

    for side_marker, action in zip(actions, full_actions):
        side = "home" if side_marker == "heim" else "away"
        ids = [int(value) for value in re.findall(r"leistungsdatendetails/spieler/(\d+)", action)]
        text = decode_text(action)
        minute, added_time = parse_minute(action)
        goals.append(
            {
                "countryId": match_data["homeCountryId"] if side == "home" else match_data["awayCountryId"],
                "scorerId": ids[0] if ids else None,
                "assistId": None,
                "minute": minute,
                "addedTime": added_time,
                "isPenalty": bool(re.search(r",\s*Penalty,", text, re.I)),
                "isOwnGoal": bool(re.search(r"Own-goal", text, re.I)),
            }
        )
    return goals


def parse_score(source: str) -> tuple[int, int] | None:
    score = re.search(r'<div class="sb-endstand">\s*(\d+):(\d+)', source)
    if not score:
        return None
    return int(score.group(1)), int(score.group(2))


def clean_sheet_ids(ids: list[int], player_by_id: dict[int, dict]) -> list[int]:
    clean_ids = []
    seen: set[int] = set()
    for player_id in ids:
        player = player_by_id.get(int(player_id))
        if player and player.get("position") in {"GB", "DF"} and player_id not in seen:
            seen.add(player_id)
            clean_ids.append(player_id)
    return clean_ids


def parse_match_page(source: str, match_data: dict, player_by_id: dict[int, dict]) -> dict | None:
    score = parse_score(source)
    if not score:
        return None

    home_score, away_score = score
    lineups = parse_lineups(source)
    goals = parse_goals(source, match_data)
    home_participants = lineups["home"]["starters"] + lineups["home"]["substitutes"]
    away_participants = lineups["away"]["starters"] + lineups["away"]["substitutes"]

    return {
        "score": {"home": home_score, "away": away_score},
        "lineups": lineups,
        "goals": goals,
        "cleanSheets": {
            "homePlayerIds": clean_sheet_ids(home_participants, player_by_id) if away_score == 0 else [],
            "awayPlayerIds": clean_sheet_ids(away_participants, player_by_id) if home_score == 0 else [],
        },
        "penaltiesSaved": [],
    }


def round_key(match_data: dict) -> str | None:
    if match_data.get("stage") == "group":
        kickoff = parse_iso(match_data["kickoff"])
        if kickoff < GROUP_ROUND_TWO_START:
            return "J1"
        if kickoff <= GROUP_ROUND_TWO_END:
            return "J2"
        return "J3"
    return {
        "r32": "R32",
        "r16": "R16",
        "qf": "QF",
        "sf": "SF",
        "third": "F",
        "final": "F",
    }.get(match_data.get("stage"))


def empty_round() -> dict:
    return {
        "matchesPlayed": None,
        "penalties": None,
        "goals": None,
        "assists": None,
        "cleanSheets": None,
        "penaltiesSaved": None,
        "points": None,
    }


def increment(player: dict | None, round_name: str | None, stat_name: str, amount: int = 1) -> None:
    if not player or not round_name:
        return
    stats = player["rounds"][round_name]
    stats[stat_name] = (stats[stat_name] or 0) + amount


def register_appearance(player: dict | None, round_name: str | None) -> None:
    if not player or not round_name:
        return
    stats = player["rounds"][round_name]
    for stat_name in STAT_NAMES:
        if stats[stat_name] is None:
            stats[stat_name] = 0
    stats["matchesPlayed"] += 1


def calculate_round_points(player: dict, round_stats: dict) -> int | None:
    if not any(round_stats[stat_name] is not None for stat_name in STAT_NAMES):
        return None
    position = player.get("position")
    return (
        (round_stats["goals"] or 0) * GOAL_POINTS.get(position, 0)
        + (round_stats["penalties"] or 0) * 3
        + (round_stats["assists"] or 0)
        + (round_stats["cleanSheets"] or 0) * CLEAN_SHEET_POINTS.get(position, 0)
        + ((round_stats["penaltiesSaved"] or 0) * 2 if position == "GB" else 0)
    )


def recalculate_players(players: list, matches: list, events: list) -> None:
    player_by_id: dict[int, dict] = {}
    for squad in players:
        for player in squad.get("players", []):
            player["rounds"] = {name: empty_round() for name in ROUND_NAMES}
            player_by_id[int(player["id"])] = player

    match_by_number = {int(match["number"]): match for match in matches}
    for event in events:
        match_data = match_by_number.get(int(event["matchNumber"]))
        if not match_data or match_data.get("status") != "finished":
            continue
        round_name = round_key(match_data)
        participants = (
            event.get("lineups", {}).get("home", {}).get("starters", [])
            + event.get("lineups", {}).get("home", {}).get("substitutes", [])
            + event.get("lineups", {}).get("away", {}).get("starters", [])
            + event.get("lineups", {}).get("away", {}).get("substitutes", [])
        )
        for player_id in set(participants):
            register_appearance(player_by_id.get(int(player_id)), round_name)

        for goal in event.get("goals", []):
            if goal.get("isOwnGoal"):
                continue
            scorer = player_by_id.get(int(goal["scorerId"])) if goal.get("scorerId") else None
            increment(scorer, round_name, "penalties" if goal.get("isPenalty") else "goals")
            if goal.get("assistId"):
                increment(player_by_id.get(int(goal["assistId"])), round_name, "assists")

        clean_ids = (
            event.get("cleanSheets", {}).get("homePlayerIds", [])
            + event.get("cleanSheets", {}).get("awayPlayerIds", [])
        )
        for player_id in clean_ids:
            increment(player_by_id.get(int(player_id)), round_name, "cleanSheets")

        for penalty in event.get("penaltiesSaved", []):
            if penalty.get("goalkeeperId"):
                increment(player_by_id.get(int(penalty["goalkeeperId"])), round_name, "penaltiesSaved")

    for squad in players:
        for player in squad.get("players", []):
            for name in ROUND_NAMES:
                player["rounds"][name]["points"] = calculate_round_points(player, player["rounds"][name])
            player["totals"] = {}
            for stat_name in STAT_NAMES + ["points"]:
                values = [
                    player["rounds"][name][stat_name]
                    for name in ROUND_NAMES
                    if player["rounds"][name][stat_name] is not None
                ]
                player["totals"][stat_name] = sum(values) if values else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing files.")
    parser.add_argument("--refresh-cache", action="store_true", help="Fetch pages even if cached HTML exists.")
    parser.add_argument("--match", type=int, action="append", help="Only update a specific match number. Can be repeated.")
    parser.add_argument("--force", action="store_true", help="Re-import matches already imported from Transfermarkt.")
    parser.add_argument("--hours-after-kickoff", type=float, default=0, help="Optional safety delay after kickoff before importing.")
    parser.add_argument("--now", help="Override current UTC time, for tests. Example: 2026-06-16T12:00:00Z")
    args = parser.parse_args()

    now = parse_iso(args.now) if args.now else datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=args.hours_after_kickoff)
    wanted_matches = set(args.match or [])
    imported_at = now.isoformat().replace("+00:00", "Z")

    matches = read_json(MATCHES_PATH)
    match_events = read_json(MATCH_EVENTS_PATH)
    players = read_json(PLAYERS_PATH)
    live_events = read_json(LIVE_EVENTS_PATH) if LIVE_EVENTS_PATH.exists() else []
    original_matches = copy.deepcopy(matches)
    original_events = copy.deepcopy(match_events)
    original_players = copy.deepcopy(players)
    original_live_events = copy.deepcopy(live_events)

    player_by_id = {
        int(player["id"]): player
        for squad in players
        for player in squad.get("players", [])
    }
    event_by_match = {int(event["matchNumber"]): event for event in match_events}

    updated: list[str] = []
    skipped: list[str] = []
    warnings: list[str] = []

    for match_data in matches:
        number = int(match_data["number"])
        if wanted_matches and number not in wanted_matches:
            continue
        kickoff = parse_iso(match_data["kickoff"])
        if not wanted_matches and kickoff > cutoff:
            skipped.append(f"M{number} not kicked off yet")
            continue
        if match_data.get("transfermarktImported") and not args.force:
            skipped.append(f"M{number} already imported from Transfermarkt")
            continue

        try:
            source = fetch_match_page(match_data, args.refresh_cache)
            parsed = parse_match_page(source or "", match_data, player_by_id) if source else None
        except Exception as error:
            warnings.append(f"M{number}: fetch/parse failed ({error})")
            continue

        if not parsed:
            skipped.append(f"M{number} no final score found")
            continue

        home_score = parsed["score"]["home"]
        away_score = parsed["score"]["away"]
        match_data["score"]["home"] = home_score
        match_data["score"]["away"] = away_score
        match_data["score"]["penaltiesHome"] = None
        match_data["score"]["penaltiesAway"] = None
        match_data["status"] = "finished"
        match_data["winnerCountryId"] = (
            None
            if home_score == away_score
            else match_data["homeCountryId"]
            if home_score > away_score
            else match_data["awayCountryId"]
        )
        match_data["wentToExtraTime"] = False
        match_data["wentToPenalties"] = False
        match_data["updatedAt"] = imported_at

        event = event_by_match.get(number)
        if not event:
            event = {"matchNumber": number}
            match_events.append(event)
            event_by_match[number] = event

        preserve_existing_assists(parsed["goals"], event.get("goals", []))
        event["lineups"] = parsed["lineups"]
        event["goals"] = parsed["goals"]
        event["cleanSheets"] = parsed["cleanSheets"]
        event["penaltiesSaved"] = parsed["penaltiesSaved"]

        if match_data.get("bbc") and (not match_data.get("bbcAssistsImported") or args.force):
            ok, bbc_warnings = apply_bbc_assists_to_event(match_data, event, players, args.refresh_cache)
            if ok:
                match_data["bbcAssistsImported"] = True
            else:
                warnings.extend(bbc_warnings)

        event["updatedAt"] = imported_at
        match_data["transfermarktImported"] = True

        if len(parsed["lineups"]["home"]["starters"]) != 11 or len(parsed["lineups"]["away"]["starters"]) != 11:
            warnings.append(
                f"M{number}: starters {len(parsed['lineups']['home']['starters'])}-"
                f"{len(parsed['lineups']['away']['starters'])}"
            )
        for goal in parsed["goals"]:
            for player_id in [goal.get("scorerId"), goal.get("assistId")]:
                if player_id and int(player_id) not in player_by_id:
                    warnings.append(f"M{number}: unknown player {player_id}")

        live_events = [
            entry
            for entry in live_events
            if int(entry.get("matchNumber", -1)) != number
        ]

        updated.append(
            f"M{number} {match_data['homeCountryId']}-{match_data['awayCountryId']} {home_score}-{away_score}"
        )

    recalculate_players(players, matches, match_events)

    if args.dry_run:
        matches = original_matches
        match_events = original_events
        players = original_players
        live_events = original_live_events
    else:
        write_json(MATCHES_PATH, matches)
        write_json(MATCH_EVENTS_PATH, match_events)
        write_json(PLAYERS_PATH, players)
        if LIVE_EVENTS_PATH.exists():
            write_json(LIVE_EVENTS_PATH, live_events)

    print(f"{'Would update' if args.dry_run else 'Updated'} {len(updated)} match(es).")
    for line in updated:
        print(f"- {line}")
    if skipped:
        print("Skipped:")
        for line in skipped:
            print(f"- {line}")
    if warnings:
        print("Warnings:")
        for line in warnings:
            print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
