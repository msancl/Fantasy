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
RECHECK_SCHEDULE = {
    "24h": timedelta(hours=24),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
}


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


def recheck_due_labels(match: dict, now: datetime) -> list[str]:
    kickoff = parse_iso(match["kickoff"])
    if match.get("status") != "finished":
        return []
    completed = match.get("rechecks") or {}
    due = []
    for label, delay in RECHECK_SCHEDULE.items():
        if kickoff + delay <= now and not completed.get(label):
            due.append(label)
    return due


def is_bbc_candidate(match: dict, now: datetime, recheck_due: bool) -> bool:
    if not match.get("bbc"):
        return False
    kickoff = parse_iso(match["kickoff"])
    if match.get("status") == "finished":
        return recheck_due or not match.get("bbcAssistsImported")
    return kickoff - BBC_START_BEFORE <= now


def is_transfermarkt_candidate(match: dict, now: datetime, recheck_due: bool) -> bool:
    if not match.get("transfermarkt"):
        return False
    kickoff = parse_iso(match["kickoff"])
    if recheck_due:
        return True
    if not match.get("transfermarktImported"):
        return kickoff + TRANSFERMARKT_START_AFTER <= now
    return False


def auto_cloud_match_windows(now: datetime) -> tuple[list[int], list[int], dict[int, list[str]]]:
    matches_path = ROOT / "data" / "matches.json"
    with matches_path.open("r", encoding="utf-8") as file:
        matches = json.load(file)

    bbc_matches: list[int] = []
    transfermarkt_matches: list[int] = []
    recheck_matches: dict[int, list[str]] = {}

    for match in matches:
        number = int(match["number"])
        due_labels = recheck_due_labels(match, now)
        if due_labels:
            recheck_matches[number] = due_labels

        if is_bbc_candidate(match, now, bool(due_labels)):
            bbc_matches.append(number)

        if is_transfermarkt_candidate(match, now, bool(due_labels)):
            transfermarkt_matches.append(number)

    return bbc_matches, transfermarkt_matches, recheck_matches


def extend_match_args(command: list[str], match_numbers: list[int]) -> list[str]:
    for number in match_numbers:
        command.extend(["--match", str(number)])
    return command


def mark_rechecks_done(match_numbers: dict[int, list[str]], now: datetime) -> None:
    if not match_numbers:
        return
    matches_path = ROOT / "data" / "matches.json"
    with matches_path.open("r", encoding="utf-8") as file:
        matches = json.load(file)
    stamp = now.isoformat().replace("+00:00", "Z")
    for match in matches:
        number = int(match["number"])
        labels = match_numbers.get(number)
        if not labels:
            continue
        match.setdefault("rechecks", {})
        for label in labels:
            match["rechecks"][label] = stamp
    with matches_path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(matches, file, ensure_ascii=False, indent=2)
        file.write("\n")


def run_auto_cloud(python: str, dry_run: bool = False, bbc_only: bool = False) -> int:
    now = datetime.now(timezone.utc)
    print(f"Auto-cloud UTC: {now.isoformat().replace('+00:00', 'Z')}")
    print("BBC discovery: enabled")

    discovery = [python, "scripts/discover_bbc_links.py", "--refresh-cache"]
    if dry_run:
        discovery.append("--dry-run")
    try:
        run(discovery)
    except subprocess.CalledProcessError as error:
        print("\nERREUR : la decouverte des liens BBC a echoue.")
        print("Aucun autre script ne doit etre lance.")
        return error.returncode or 1

    bbc_matches, transfermarkt_matches, recheck_matches = auto_cloud_match_windows(now)
    if bbc_only:
        transfermarkt_matches = []

    print(f"BBC live window matches: {bbc_matches or 'none'}")
    print(f"Transfermarkt final window matches: {transfermarkt_matches or 'none'}")
    print(
        "Recheck due matches: "
        + (
            ", ".join(f"M{number}({','.join(labels)})" for number, labels in sorted(recheck_matches.items()))
            if recheck_matches
            else "none"
        )
    )

    commands: list[list[str]] = []
    if bbc_matches:
        command = [python, "scripts/update_bbc_live_events.py", "--refresh-cache"]
        if recheck_matches:
            command.append("--force")
        if dry_run:
            command.append("--dry-run")
        commands.append(extend_match_args(command, bbc_matches))

    if transfermarkt_matches:
        command = [python, "scripts/update_finished_matches.py", "--refresh-cache"]
        if recheck_matches:
            command.append("--force")
        if dry_run:
            command.append("--dry-run")
        commands.append(extend_match_args(command, transfermarkt_matches))

    try:
        for command in commands:
            run(command)
        if recheck_matches and not dry_run:
            mark_rechecks_done(recheck_matches, now)
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
    parser.add_argument("--bbc-only", action="store_true", help="With --auto-cloud, skip Transfermarkt and run only BBC updates.")
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
        return run_auto_cloud(python, args.dry_run, args.bbc_only)

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
        discovery_args = ["--refresh-cache"] if args.refresh_cache else []
        if args.dry_run:
            discovery_args.append("--dry-run")
        update_commands.append([python, "scripts/discover_bbc_links.py", *discovery_args])
        update_commands.append([python, "scripts/update_bbc_live_events.py", *common_args])
    elif args.transfermarkt:
        update_commands.append([python, "scripts/update_finished_matches.py", *common_args])
    else:
        discovery_args = ["--refresh-cache"] if args.refresh_cache else []
        if args.dry_run:
            discovery_args.append("--dry-run")
        update_commands.extend([
            [python, "scripts/discover_bbc_links.py", *discovery_args],
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
