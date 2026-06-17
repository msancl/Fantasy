#!/usr/bin/env python3
"""Run the full fantasy data update locally, then commit/push JSON changes.

Usage from the Fantasy folder:
  py run.py

Useful options:
  py run.py --bbc
  py run.py --transfermarkt
  py run.py --dry-run
  py run.py --refresh-cache
  py run.py --no-push
  py run.py --match 1 --match 2

Without --bbc or --transfermarkt, both update scripts are run.
The script stops before commit/push if an update script returns an error.
By default it commits only the data JSON files that are updated by the scripts.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_PATHS = [
    "data/matches.json",
    "data/match-events.json",
    "data/match-events-live.json",
    "data/players.json",
    "data/transfers.json",
]

GROUP_STAGE = "group"
BBC_START_BEFORE = timedelta(minutes=15)
BBC_GROUP_END_AFTER = timedelta(minutes=120)
BBC_KNOCKOUT_END_AFTER = timedelta(minutes=180)
TRANSFERMARKT_START_AFTER = timedelta(minutes=105)
TRANSFERMARKT_GROUP_END_AFTER = timedelta(minutes=180)
TRANSFERMARKT_KNOCKOUT_END_AFTER = timedelta(minutes=240)
RECHECK_START_AFTER = timedelta(hours=24)
RECHECK_END_AFTER = timedelta(hours=24, minutes=30)


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess:
    print(f"\n> {' '.join(command)}", flush=True)
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return subprocess.run(command, cwd=ROOT, env=env, check=check)


def has_changes(paths: list[str]) -> bool:
    result = subprocess.run(["git", "status", "--porcelain", "--", *paths], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Impossible de lire git status.")
    return bool(result.stdout.strip())


def show_changes(paths: list[str]) -> None:
    result = subprocess.run(["git", "status", "--short", "--", *paths], cwd=ROOT, text=True, capture_output=True)
    if result.stdout.strip():
        print("\nChangements prets a commit :")
        print(result.stdout.strip())


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_group_match(match: dict) -> bool:
    return match.get("stage") == GROUP_STAGE


def in_window(now: datetime, start: datetime, end: datetime) -> bool:
    return start <= now <= end


def auto_cloud_match_windows(now: datetime) -> tuple[list[int], list[int], list[int]]:
    matches_path = ROOT / "data" / "matches.json"
    with matches_path.open("r", encoding="utf-8") as file:
        matches = json.load(file)

    bbc_matches: list[int] = []
    transfermarkt_matches: list[int] = []
    recheck_matches: list[int] = []

    for match in matches:
        number = int(match["number"])
        kickoff = parse_iso(match["kickoff"])
        group_match = is_group_match(match)

        bbc_end = kickoff + (BBC_GROUP_END_AFTER if group_match else BBC_KNOCKOUT_END_AFTER)
        if match.get("bbc") and in_window(now, kickoff - BBC_START_BEFORE, bbc_end):
            bbc_matches.append(number)

        tm_end = kickoff + (TRANSFERMARKT_GROUP_END_AFTER if group_match else TRANSFERMARKT_KNOCKOUT_END_AFTER)
        if match.get("transfermarkt") and in_window(now, kickoff + TRANSFERMARKT_START_AFTER, tm_end):
            transfermarkt_matches.append(number)

        if in_window(now, kickoff + RECHECK_START_AFTER, kickoff + RECHECK_END_AFTER):
            recheck_matches.append(number)

    return bbc_matches, transfermarkt_matches, recheck_matches


def extend_match_args(command: list[str], match_numbers: list[int]) -> list[str]:
    for number in match_numbers:
        command.extend(["--match", str(number)])
    return command


def run_auto_cloud(python: str, dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc)
    bbc_matches, transfermarkt_matches, recheck_matches = auto_cloud_match_windows(now)

    print(f"Auto-cloud UTC: {now.isoformat().replace('+00:00', 'Z')}")
    print(f"BBC live window matches: {bbc_matches or 'none'}")
    print(f"Transfermarkt final window matches: {transfermarkt_matches or 'none'}")
    print(f"24h recheck matches: {recheck_matches or 'none'}")

    commands: list[list[str]] = []
    if bbc_matches:
        command = [python, "scripts/update_bbc_live_events.py", "--refresh-cache"]
        if dry_run:
            command.append("--dry-run")
        commands.append(extend_match_args(command, bbc_matches))

    if transfermarkt_matches:
        command = [python, "scripts/update_finished_matches.py", "--refresh-cache"]
        if dry_run:
            command.append("--dry-run")
        commands.append(extend_match_args(command, transfermarkt_matches))

    if recheck_matches:
        bbc_recheck = [python, "scripts/update_bbc_live_events.py", "--refresh-cache", "--force"]
        tm_recheck = [python, "scripts/update_finished_matches.py", "--refresh-cache", "--force"]
        if dry_run:
            bbc_recheck.append("--dry-run")
            tm_recheck.append("--dry-run")
        commands.append(extend_match_args(bbc_recheck, recheck_matches))
        commands.append(extend_match_args(tm_recheck, recheck_matches))

    if not commands:
        print("No match is currently inside an update window.")
        return 0

    try:
        for command in commands:
            run(command)
    except subprocess.CalledProcessError as error:
        print("\nERREUR : un script de mise a jour a echoue.")
        print("Aucun commit/push ne doit etre lance.")
        return error.returncode or 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Update fantasy JSON data and push to GitHub.")
    parser.add_argument("--dry-run", action="store_true", help="Run update scripts in dry-run mode and do not commit/push.")
    parser.add_argument("--refresh-cache", action="store_true", help="Force BBC/Transfermarkt pages to be downloaded again.")
    parser.add_argument("--force", action="store_true", help="Force scripts to re-import matches they normally skip.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--bbc", action="store_true", help="Run only the BBC live/final-assists update.")
    mode.add_argument("--transfermarkt", action="store_true", help="Run only the Transfermarkt final update.")
    mode.add_argument("--auto-cloud", action="store_true", help="Run only matches inside automatic cloud update windows, without committing.")
    parser.add_argument("--no-push", action="store_true", help="Commit locally but do not push.")
    parser.add_argument("--include-all", action="store_true", help="Commit every repo change, not only data JSON files.")
    parser.add_argument("--match", type=int, action="append", help="Only update one match number. Can be repeated.")
    args = parser.parse_args()

    python = sys.executable
    if args.auto_cloud:
        return run_auto_cloud(python, args.dry_run)

    common_args: list[str] = []
    if args.dry_run:
        common_args.append("--dry-run")
    if args.refresh_cache:
        common_args.append("--refresh-cache")
    if args.force:
        common_args.append("--force")
    for number in args.match or []:
        common_args.extend(["--match", str(number)])

    update_commands = []
    if args.bbc:
        update_commands.append([python, "scripts/update_bbc_live_events.py", *common_args])
    elif args.transfermarkt:
        update_commands.append([python, "scripts/update_finished_matches.py", *common_args])
    else:
        update_commands.extend([
            [python, "scripts/update_bbc_live_events.py", *common_args],
            [python, "scripts/update_finished_matches.py", *common_args],
        ])

    try:
        for command in update_commands:
            run(command)
    except subprocess.CalledProcessError as error:
        print("\nERREUR : un script de mise a jour a echoue.")
        print("Aucun commit/push n'a ete lance.")
        return error.returncode or 1

    if args.dry_run:
        print("\nDry-run termine : aucun fichier n'a ete modifie, aucun commit/push.")
        return 0

    commit_paths = ["."] if args.include_all else DATA_PATHS
    try:
        if not has_changes(commit_paths):
            print("\nAucun changement JSON a commit. Tout est deja a jour.")
            return 0
    except RuntimeError as error:
        print(f"\nERREUR git status : {error}")
        return 1

    show_changes(commit_paths)
    try:
        run(["git", "add", *commit_paths])
        message = "Update fantasy data " + datetime.now().strftime("%Y-%m-%d %H:%M")
        run(["git", "commit", "-m", message])
        if args.no_push:
            print("\nCommit cree localement. Push ignore a cause de --no-push.")
            return 0
        run(["git", "push"])
    except subprocess.CalledProcessError as error:
        print("\nERREUR : commit ou push impossible.")
        print("Les fichiers sont peut-etre modifies localement, mais tout n'a pas ete envoye sur GitHub.")
        return error.returncode or 1

    print("\nMise a jour terminee : scripts OK, commit OK, push OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
