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
            if match_data.get("bbcAssistsImported") and not args.force:
                skipped.append(f"M{number}: BBC assists already imported")
                continue
            event = event_by_match.get(number)
            if not event:
                skipped.append(f"M{number}: no official event yet")
                continue
            ok, issues = apply_bbc_assists_to_event(match_data, event, players, args.refresh_cache)
            if ok:
                match_data["bbcAssistsImported"] = True
                event["updatedAt"] = now
                updated_final.append(f"M{number}: official assists updated")
            else:
                warnings.extend(issues)
            continue

        try:
            source = fetch_bbc_page(match_data, args.refresh_cache)
            parsed = parse_bbc_match(match_data, players, source or "") if source else None
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
        live_event = {
            "matchNumber": number,
            "score": parsed.get("score"),
            "lineups": existing.get("lineups", {"home": {"starters": [], "substitutes": []}, "away": {"starters": [], "substitutes": []}}),
            "goals": parsed.get("goals", []),
            "cleanSheets": existing.get("cleanSheets", {"homePlayerIds": [], "awayPlayerIds": []}),
            "penaltiesSaved": existing.get("penaltiesSaved", []),
            "source": "bbc-live",
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
