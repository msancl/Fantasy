#!/usr/bin/env python3
"""Update BBC live goals/assists and final BBC assists.

Live matches are written to data/match-events-live.json only. This script never
marks a match as finished. Final official assists are written only when the
match is already finished in data/matches.json.
"""

from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone

from bbc_match_events import (
    LIVE_EVENTS_PATH,
    MATCH_EVENTS_PATH,
    MATCHES_PATH,
    PLAYERS_PATH,
    apply_bbc_assists_to_event,
    fetch_bbc_page,
    parse_bbc_match,
    read_json,
    resolve_bbc_lineups,
    write_json,
)
from update_finished_matches import recalculate_players


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing files.")
    parser.add_argument("--refresh-cache", action="store_true", help="Fetch BBC pages even when cached.")
    parser.add_argument("--force", action="store_true", help="Recheck matches already marked as BBC imported.")
    parser.add_argument("--match", type=int, action="append", help="Only update a match number. Can be repeated.")
    args = parser.parse_args()

    matches = read_json(MATCHES_PATH, [])
    players = read_json(PLAYERS_PATH, [])
    events = read_json(MATCH_EVENTS_PATH, [])
    live_events = read_json(LIVE_EVENTS_PATH, [])
    original = (copy.deepcopy(matches), copy.deepcopy(players), copy.deepcopy(events), copy.deepcopy(live_events))

    event_by_match = {int(event.get("matchNumber")): event for event in events if event.get("matchNumber") is not None}
    live_by_match = {int(event.get("matchNumber")): event for event in live_events if event.get("matchNumber") is not None}
    wanted = set(args.match or [])
    updated_live: list[str] = []
    updated_final: list[str] = []
    skipped: list[str] = []
    warnings: list[str] = []
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    for match_data in matches:
        number = int(match_data["number"])
        if wanted and number not in wanted:
            continue
        if not match_data.get("bbc"):
            skipped.append(f"M{number}: no BBC link")
            continue

        if match_data.get("status") == "finished":
            event = event_by_match.get(number)
            if not event:
                skipped.append(f"M{number}: no official event yet")
                continue
            needs_bbc_lineups = (
                not match_data.get("transfermarktImported")
                and not (
                    event.get("lineupSource") == "bbc"
                    and event.get("lineups", {}).get("home", {}).get("starters")
                    and event.get("lineups", {}).get("away", {}).get("starters")
                )
            )
            if match_data.get("bbcAssistsImported") and not args.force and not needs_bbc_lineups:
                skipped.append(f"M{number}: BBC assists already imported")
                continue
            if not match_data.get("bbcAssistsImported") or args.force:
                ok, issues = apply_bbc_assists_to_event(match_data, event, players, args.refresh_cache)
                if ok:
                    match_data["bbcAssistsImported"] = True
                    event["updatedAt"] = now
                    updated_final.append(f"M{number}: official assists updated")
                else:
                    warnings.extend(issues)
            if not match_data.get("transfermarktImported"):
                try:
                    source = fetch_bbc_page(match_data, args.refresh_cache)
                    parsed = parse_bbc_match(match_data, players, source or "") if source else None
                    if parsed and parsed.get("isFinished"):
                        bbc_lineups, lineup_warnings = resolve_bbc_lineups(
                            match_data,
                            players,
                            parsed.get("lineups", {}),
                        )
                        warnings.extend(lineup_warnings)
                        if bbc_lineups["home"]["starters"] and bbc_lineups["away"]["starters"]:
                            event["lineups"] = bbc_lineups
                            event["lineupSource"] = "bbc"
                            event["updatedAt"] = now
                            updated_final.append(f"M{number}: BBC lineups updated")
                except Exception as error:
                    warnings.append(f"M{number}: BBC lineup update failed ({error})")
            continue

        try:
            source = fetch_bbc_page(match_data, True)
            parsed = parse_bbc_match(match_data, players, source or "") if source else None
            if (
                parsed
                and not args.refresh_cache
                and not parsed.get("goals")
                and parsed.get("score", {}).get("home") is None
                and parsed.get("score", {}).get("away") is None
            ):
                fresh_source = fetch_bbc_page(match_data, True)
                fresh_parsed = parse_bbc_match(match_data, players, fresh_source or "") if fresh_source else None
                if fresh_parsed:
                    parsed = fresh_parsed
        except Exception as error:
            warnings.append(f"M{number}: BBC fetch/parse failed ({error})")
            continue
        if not parsed:
            skipped.append(f"M{number}: empty BBC data")
            continue
        for issue in parsed.get("unresolved", []):
            warnings.append(
                f"M{number}: {issue['event']} unresolved: {issue.get('name')} "
                f"({issue.get('reason')}, shirt {issue.get('shirtNumber')})"
            )

        existing = live_by_match.get(number) or event_by_match.get(number) or {}
        live_lineups = {
            "home": {"starters": [], "substitutes": []},
            "away": {"starters": [], "substitutes": []},
        }
        lineup_source = None
        if parsed.get("isFinished"):
            live_lineups, lineup_warnings = resolve_bbc_lineups(
                match_data,
                players,
                parsed.get("lineups", {}),
            )
            warnings.extend(lineup_warnings)
            if live_lineups["home"]["starters"] and live_lineups["away"]["starters"]:
                lineup_source = "bbc"
            else:
                live_lineups = existing.get("lineups", live_lineups)
                lineup_source = existing.get("lineupSource")

        live_event = {
            "matchNumber": number,
            "score": parsed.get("score"),
            "lineups": live_lineups,
            "goals": parsed.get("goals", []),
            "cleanSheets": existing.get("cleanSheets", {"homePlayerIds": [], "awayPlayerIds": []}),
            "penaltiesSaved": existing.get("penaltiesSaved", []),
            "source": "bbc-live",
            "lineupSource": lineup_source,
            "updatedAt": now,
        }
        live_by_match[number] = live_event
        updated_live.append(f"M{number}: live goals/assists updated")

    live_events = [entry for _, entry in sorted(live_by_match.items())]
    recalculate_players(players, matches, events)

    if args.dry_run:
        matches, players, events, live_events = original
    else:
        write_json(MATCHES_PATH, matches)
        write_json(MATCH_EVENTS_PATH, events)
        write_json(PLAYERS_PATH, players)
        write_json(LIVE_EVENTS_PATH, live_events)

    print(f"{'Would update' if args.dry_run else 'Updated'} {len(updated_live)} live match(es), {len(updated_final)} finished match(es).")
    for line in updated_live + updated_final:
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
