#!/usr/bin/env python3
"""BBC live/final goal and assist helpers for the fantasy site.

BBC is used only for goals/assists in live mode, and as the trusted source for
assists after Transfermarkt has imported the final match data.
"""

from __future__ import annotations

import argparse
import copy
import html
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BBC_CACHE_DIR = ROOT / "bbc-match-pages"

MATCHES_PATH = DATA_DIR / "matches.json"
MATCH_EVENTS_PATH = DATA_DIR / "match-events.json"
PLAYERS_PATH = DATA_DIR / "players.json"
LIVE_EVENTS_PATH = DATA_DIR / "match-events-live.json"

BBC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9,fr;q=0.8",
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


def normalize_name(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("shirt") or value.get("short") or value.get("display") or " ".join(
            str(value.get(part, "")) for part in ["first", "last"]
        )
    text = html.unescape(str(value or ""))
    text = text.replace("?", "'").replace("`", "'")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_initial_data(source: str) -> dict:
    match = re.search(r"window\.__INITIAL_DATA__=\"([\s\S]*?)\";</script>", source)
    if not match:
        return {}
    try:
        return json.loads(json.loads('"' + match.group(1) + '"'))
    except json.JSONDecodeError:
        return {}


def find_container(initial: dict, name: str) -> dict | None:
    for value in (initial.get("data") or {}).values():
        if isinstance(value, dict) and value.get("name") == name:
            return value
    return None


def fetch_bbc_page(match_data: dict, refresh_cache: bool = False) -> str | None:
    url = match_data.get("bbc")
    if not url:
        return None
    BBC_CACHE_DIR.mkdir(exist_ok=True)
    cache_path = BBC_CACHE_DIR / f"match-{match_data['number']}.html"
    if cache_path.exists() and not refresh_cache:
        return cache_path.read_text(encoding="utf-8", errors="ignore")

    request = urllib.request.Request(url, headers=BBC_HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        source = response.read().decode("utf-8", errors="ignore")
    cache_path.write_text(source, encoding="utf-8")
    return source


def player_display_name(raw: Any) -> str:
    if isinstance(raw, dict):
        return raw.get("shirt") or raw.get("short") or " ".join(
            part for part in [str(raw.get("first", "")).strip(), str(raw.get("last", "")).strip()] if part
        )
    return str(raw or "")


def collect_lineup_players(team_data: dict | None, include_substitutes: bool = False) -> list[dict]:
    collected: dict[str, dict] = {}

    def add_player(item: dict) -> None:
        shirt = item.get("shirtNumber")
        name = item.get("name") or item.get("displayName")
        urn = item.get("urn")
        if shirt is None or not (name or urn):
            return
        display = player_display_name(name)
        aliases = {normalize_name(display), normalize_name(item.get("displayName"))}
        if isinstance(item.get("name"), dict):
            aliases.update(
                normalize_name(item["name"].get(key))
                for key in ["short", "shirt", "first", "last"]
            )
            aliases.add(normalize_name(" ".join(
                str(item["name"].get(key, "")).strip()
                for key in ["first", "last"]
                if str(item["name"].get(key, "")).strip()
            )))
        aliases = {alias for alias in aliases if alias}
        key = urn or f"{shirt}:{normalize_name(display)}"
        collected[key] = {
            "urn": urn,
            "shirtNumber": int(shirt),
            "name": display,
            "normalizedName": normalize_name(display),
            "aliases": sorted(aliases),
        }

    player_groups = ((team_data or {}).get("players") or {})
    for player in player_groups.get("starters", []) or []:
        if isinstance(player, dict):
            add_player(player)

    if include_substitutes:
        for player in player_groups.get("substitutes", []) or []:
            if isinstance(player, dict):
                add_player(player)

    return list(collected.values())


def build_local_player_indexes(players: list) -> dict:
    by_country_shirt: dict[tuple[str, int], int] = {}
    for squad in players:
        country_id = squad.get("countryId") or squad.get("id")
        for player in squad.get("players", []):
            shirt = player.get("shirtNumber")
            player_id = player.get("id")
            if country_id and shirt is not None and player_id is not None:
                try:
                    by_country_shirt[(str(country_id), int(shirt))] = int(player_id)
                except (TypeError, ValueError):
                    continue
    return {"by_country_shirt": by_country_shirt}


def resolve_bbc_lineups(match_data: dict, players: list, lineups: dict) -> tuple[dict, list[str]]:
    indexes = build_local_player_indexes(players)
    resolved = {
        "home": {"starters": [], "substitutes": []},
        "away": {"starters": [], "substitutes": []},
    }
    warnings: list[str] = []

    for side in ["home", "away"]:
        country_id = match_data["homeCountryId"] if side == "home" else match_data["awayCountryId"]
        side_ids: list[int] = []
        for player in lineups.get(side, []):
            shirt = player.get("shirtNumber")
            try:
                player_id = indexes["by_country_shirt"].get((country_id, int(shirt)))
            except (TypeError, ValueError):
                player_id = None
            if player_id:
                side_ids.append(player_id)
            else:
                warnings.append(
                    f"M{match_data['number']}: BBC lineup unresolved: "
                    f"{player.get('name')} ({country_id}, shirt {shirt})"
                )

        if len(side_ids) == 11:
            resolved[side]["starters"] = side_ids
        elif side_ids:
            warnings.append(
                f"M{match_data['number']}: BBC lineup ignored for {side}, "
                f"{len(side_ids)} player(s) resolved instead of 11"
            )

    return resolved, warnings


def parse_minute_label(label: str | None) -> tuple[int | None, int | None]:
    match = re.search(r"(\d+)\s*'?(?:\s*\+\s*(\d+))?", label or "")
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2)) if match.group(2) else None


def parse_all_minute_labels(value: str) -> list[tuple[int | None, int | None]]:
    text = html.unescape(str(value or ""))
    bracket = re.search(r"\(([^)]*)\)", text)
    raw = bracket.group(1) if bracket else text
    labels = re.findall(r"\d+\s*'?(?:\s*\+\s*\d+)?", raw)
    return [parse_minute_label(label) for label in labels] or [parse_minute_label(raw)]


def text_action_entries(value: str) -> tuple[str, list[tuple[int | None, int | None]]]:
    text = html.unescape(str(value or "")).strip()
    name = re.sub(r"\s*\([^)]*\)\s*$", "", text).strip()
    return name, parse_all_minute_labels(text)


def bbc_short_name_matches(event_name: str, lineup_name: str) -> bool:
    """Match BBC text like "L. Messi" to a lineup name only as a fallback.

    Exact name matching is preferred. This fallback is deliberately narrow so a
    full name such as "Hwang In-Beom" cannot accidentally match "Lee Han-Beom".
    The final local identification still uses country + shirt number.
    """
    event = normalize_name(event_name)
    lineup = normalize_name(lineup_name)
    if not event or not lineup:
        return False
    event_parts = event.split()
    lineup_parts = lineup.split()
    if not event_parts or not lineup_parts:
        return False
    if len(event_parts) == 1:
        return event_parts[0] == lineup_parts[-1]
    if len(event_parts[0]) == 1:
        return event_parts[-1] == lineup_parts[-1]
    return False


def find_bbc_lineup_player(ref: dict, side_players: list[dict]) -> tuple[dict | None, str | None]:
    urn = ref.get("playerUrn")
    raw_name = ref.get("playerName") or ref.get("name") or ""
    if urn:
        candidate = next((player for player in side_players if player.get("urn") == urn), None)
        if candidate:
            return candidate, None

    normalized = normalize_name(raw_name)
    if normalized:
        exact = [player for player in side_players if normalized in set(player.get("aliases", [player.get("normalizedName")]))]
        if len(exact) == 1:
            return exact[0], None
        if len(exact) > 1:
            return None, "bbc_lineup_name_ambiguous"

        fallback = [player for player in side_players if bbc_short_name_matches(raw_name, player.get("name", ""))]
        if len(fallback) == 1:
            return fallback[0], None
        if len(fallback) > 1:
            return None, "bbc_lineup_name_ambiguous"

    return None, "bbc_player_not_found_in_lineup"


def resolve_bbc_player(ref: dict, side: str, country_id: str, lineups: dict, indexes: dict) -> tuple[int | None, dict | None]:
    side_players = lineups.get(side, [])
    raw_name = ref.get("playerName") or ref.get("name") or ""
    candidate, issue = find_bbc_lineup_player(ref, side_players)

    if not candidate:
        return None, {"reason": issue, "countryId": country_id, "name": raw_name, "urn": ref.get("playerUrn")}

    shirt = candidate.get("shirtNumber")
    player_id = indexes["by_country_shirt"].get((country_id, int(shirt)))
    if not player_id:
        return None, {
            "reason": "shirt_number_not_found_in_players_json",
            "countryId": country_id,
            "name": candidate.get("name") or raw_name,
            "shirtNumber": shirt,
            "urn": ref.get("playerUrn"),
        }
    return player_id, None


def score_from_sport(sport: dict) -> dict:
    def side_score(side: str) -> int | None:
        value = (sport.get(side) or {}).get("score")
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    return {"home": side_score("home"), "away": side_score("away")}


def collect_bbc_goals(sport: dict, match_data: dict, lineups: dict, indexes: dict) -> tuple[list[dict], list[dict]]:
    goals: list[dict] = []
    assists: list[dict] = []
    unresolved: list[dict] = []
    side_country = {"home": match_data["homeCountryId"], "away": match_data["awayCountryId"]}

    for side in ["home", "away"]:
        for group in (sport.get(side) or {}).get("actions", []):
            if str(group.get("actionType", "")).lower() != "goal":
                continue
            for action in group.get("actions", []):
                minute, added = parse_minute_label((action.get("timeLabel") or {}).get("value"))
                action_label = str(action.get("typeLabel", {}).get("value", "")).lower()
                is_own_goal = "own" in action_label
                lookup_side = "away" if side == "home" and is_own_goal else "home" if side == "away" and is_own_goal else side
                scorer_id, issue = resolve_bbc_player(group, lookup_side, side_country[lookup_side], lineups, indexes)
                if issue:
                    issue["event"] = "goal"
                    issue["minute"] = minute
                    unresolved.append(issue)
                goals.append(
                    {
                        "countryId": side_country[side],
                        "scorerId": scorer_id,
                        "assistId": None,
                        "minute": minute,
                        "addedTime": added,
                        "isPenalty": "pen" in action_label,
                        "isOwnGoal": is_own_goal,
                        "_side": side,
                    }
                )

    for group in sport.get("groupedActions", []) or []:
        group_name = (group.get("groupName") or {}).get("fullName") or (group.get("groupName") or {}).get("shortName") or ""
        if "assist" not in group_name.lower():
            continue
        for side, key in [("home", "homeTeamActions"), ("away", "awayTeamActions")]:
            for raw in group.get(key, []) or []:
                if isinstance(raw, dict):
                    name = raw.get("playerName") or raw.get("name") or ""
                    minute_values = [parse_minute_label((raw.get("timeLabel") or {}).get("value"))]
                    ref = raw
                else:
                    name, minute_values = text_action_entries(str(raw))
                    ref = {"playerName": name}
                assist_id, issue = resolve_bbc_player(ref, side, side_country[side], lineups, indexes)
                for minute, added in minute_values:
                    if issue:
                        issue = dict(issue)
                        issue["event"] = "assist"
                        issue["minute"] = minute
                        unresolved.append(issue)
                    assists.append(
                        {
                            "countryId": side_country[side],
                            "assistId": assist_id,
                            "minute": minute,
                            "addedTime": added,
                            "_side": side,
                        }
                    )

    assist_buckets: dict[tuple[str, int | None, int | None], list[dict]] = {}
    for assist in assists:
        key = (assist["_side"], assist.get("minute"), assist.get("addedTime"))
        assist_buckets.setdefault(key, []).append(assist)

    for goal in goals:
        key = (goal["_side"], goal.get("minute"), goal.get("addedTime"))
        bucket = assist_buckets.get(key) or []
        if bucket:
            goal["assistId"] = bucket.pop(0).get("assistId")
        goal.pop("_side", None)

    return goals, unresolved


def parse_bbc_match(match_data: dict, players: list, source: str) -> dict:
    initial = parse_initial_data(source)
    live = find_container(initial, "live-header") or {}
    lineup_container = find_container(initial, "match-lineups") or {}
    sport = (live.get("data") or {}).get("sportDataEvent") or {}
    lineup_data = lineup_container.get("data") or {}
    lineups = {
        "home": collect_lineup_players(lineup_data.get("homeTeam")),
        "away": collect_lineup_players(lineup_data.get("awayTeam")),
    }
    lookup_lineups = {
        "home": collect_lineup_players(lineup_data.get("homeTeam"), include_substitutes=True),
        "away": collect_lineup_players(lineup_data.get("awayTeam"), include_substitutes=True),
    }
    indexes = build_local_player_indexes(players)
    goals, unresolved = collect_bbc_goals(sport, match_data, lookup_lineups, indexes)
    status = sport.get("status") or ""
    period = (sport.get("periodLabel") or {}).get("accessible") or (sport.get("periodLabel") or {}).get("value") or ""
    is_finished = status == "PostEvent" or "full time" in str(period).lower()
    return {
        "status": status,
        "period": period,
        "isFinished": is_finished,
        "score": score_from_sport(sport),
        "lineups": lineups,
        "goals": goals,
        "unresolved": unresolved,
    }


def goal_match_key(goal: dict, include_assist: bool = False) -> tuple:
    key = (
        goal.get("countryId"),
        goal.get("scorerId"),
        goal.get("minute"),
        goal.get("addedTime"),
        bool(goal.get("isPenalty")),
        bool(goal.get("isOwnGoal")),
    )
    if include_assist:
        return key + (goal.get("assistId"),)
    return key


def goals_are_same(official: dict, bbc: dict, minute_tolerance: int = 1) -> bool:
    if official.get("countryId") != bbc.get("countryId"):
        return False
    if official.get("scorerId") != bbc.get("scorerId"):
        return False
    if bool(official.get("isPenalty")) != bool(bbc.get("isPenalty")):
        return False
    if bool(official.get("isOwnGoal")) != bool(bbc.get("isOwnGoal")):
        return False
    official_minute = official.get("minute")
    bbc_minute = bbc.get("minute")
    if official_minute is None or bbc_minute is None:
        return official_minute == bbc_minute
    if abs(int(official_minute) - int(bbc_minute)) > minute_tolerance:
        return False
    official_added = official.get("addedTime")
    bbc_added = bbc.get("addedTime")
    if official_added is not None and bbc_added is not None:
        return int(official_added) == int(bbc_added)
    return True


def preserve_existing_assists(new_goals: list[dict], old_goals: list[dict]) -> None:
    buckets: dict[tuple, list[Any]] = {}
    for goal in old_goals or []:
        if goal.get("assistId"):
            buckets.setdefault(goal_match_key(goal), []).append(goal.get("assistId"))
    for goal in new_goals:
        bucket = buckets.get(goal_match_key(goal))
        if bucket and not goal.get("assistId"):
            goal["assistId"] = bucket.pop(0)


def apply_bbc_assists_to_event(match_data: dict, event: dict, players: list, refresh_cache: bool = False) -> tuple[bool, list[str]]:
    source = fetch_bbc_page(match_data, refresh_cache)
    if not source:
        return False, [f"M{match_data['number']}: no BBC link"]
    parsed = parse_bbc_match(match_data, players, source)
    warnings = [
        f"M{match_data['number']}: {issue['event']} unresolved: {issue.get('name')} "
        f"({issue.get('reason')}, shirt {issue.get('shirtNumber')})"
        for issue in parsed.get("unresolved", [])
    ]
    if warnings:
        return False, warnings

    remaining_bbc_goals = list(parsed.get("goals", []))
    unmatched: list[dict] = []
    for goal in event.get("goals", []):
        exact_index = next(
            (index for index, bbc_goal in enumerate(remaining_bbc_goals) if goal_match_key(goal) == goal_match_key(bbc_goal)),
            None,
        )
        if exact_index is None:
            exact_index = next(
                (index for index, bbc_goal in enumerate(remaining_bbc_goals) if goals_are_same(goal, bbc_goal)),
                None,
            )
        if exact_index is None:
            unmatched.append(goal)
            continue
        bbc_goal = remaining_bbc_goals.pop(exact_index)
        goal["assistId"] = bbc_goal.get("assistId")

    if unmatched:
        return False, [
            f"M{match_data['number']}: BBC/official goal mismatch for scorer {goal.get('scorerId')} at {goal.get('minute')}'"
            for goal in unmatched
        ]
    return True, []
