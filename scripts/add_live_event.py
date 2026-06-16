#!/usr/bin/env python3
"""Add temporary live events with guided terminal menus.

Install the menu helper once:
  pip install questionary

Run:
  python scripts/add_live_event.py

The script writes data/match-events-live.json only. Official final imports from
update_finished_matches.py remain the source of truth and clear live entries.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

VENDOR_DIR = Path(__file__).resolve().parent / "_vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

try:
    import questionary
    from questionary import Choice
except ImportError:
    print("La librairie Python 'questionary' est nécessaire.")
    print("Installe-la une seule fois avec : pip install questionary")
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MATCHES_PATH = DATA_DIR / "matches.json"
LIVE_EVENTS_PATH = DATA_DIR / "match-events-live.json"
PLAYERS_PATH = DATA_DIR / "players.json"
COUNTRIES_PATH = DATA_DIR / "countries.json"


def read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def country_name(country_by_id: dict, country_id: str | None) -> str:
    return country_by_id.get(country_id, {}).get("name") or country_id or "-"


def match_label(match: dict, country_by_id: dict) -> str:
    home = country_name(country_by_id, match.get("homeCountryId")) or match.get("homePlaceholder")
    away = country_name(country_by_id, match.get("awayCountryId")) or match.get("awayPlaceholder")
    score = match.get("score") or {}
    if score.get("home") is not None and score.get("away") is not None:
        score_text = f" {score['home']}-{score['away']}"
    else:
        score_text = ""
    status = "OFFICIEL" if match.get("status") == "finished" else "LIVE"
    return f"M{match['number']} · {home} - {away}{score_text} · {status}"


def player_label(player: dict) -> str:
    position = player.get("position") or "-"
    return f"{position} · {player.get('name', '-')}"


def players_for_country(players_by_country: dict, country_id: str) -> list[dict]:
    order = {"GB": 0, "DF": 1, "MIL": 2, "ATT": 3}
    return sorted(
        players_by_country.get(country_id, []),
        key=lambda player: (order.get(player.get("position"), 99), player.get("name", "")),
    )


def choose_player(prompt: str, players: list[dict], allow_none: bool = False) -> int | None:
    choices = []
    if allow_none:
        choices.append(Choice("Aucun", value=None))
    choices.extend(Choice(player_label(player), value=int(player["id"])) for player in players)
    return questionary.select(prompt, choices=choices, use_shortcuts=True).ask()


def base_live_entry(match: dict, official_event: dict | None, live_event: dict | None) -> dict:
    score = (live_event or {}).get("score") or match.get("score") or {}
    home_score = score.get("home")
    away_score = score.get("away")
    entry = {
        "matchNumber": int(match["number"]),
        "score": {
            "home": int(home_score) if home_score is not None else 0,
            "away": int(away_score) if away_score is not None else 0,
        },
        "lineups": (live_event or {}).get("lineups")
        or (official_event or {}).get("lineups")
        or {
            "home": {"starters": [], "substitutes": []},
            "away": {"starters": [], "substitutes": []},
        },
        "goals": list((live_event or {}).get("goals") or []),
        "cleanSheets": (live_event or {}).get("cleanSheets")
        or (official_event or {}).get("cleanSheets")
        or {"homePlayerIds": [], "awayPlayerIds": []},
        "penaltiesSaved": list((live_event or {}).get("penaltiesSaved") or []),
        "updatedAt": now_iso(),
    }
    return entry


def ask_int(prompt: str, default: int | None = None) -> int:
    while True:
        answer = questionary.text(prompt, default="" if default is None else str(default)).ask()
        try:
            return int(answer)
        except (TypeError, ValueError):
            print("Entre un nombre valide.")


def upsert_live_event(live_events: list[dict], entry: dict) -> None:
    for index, existing in enumerate(live_events):
        if int(existing.get("matchNumber")) == int(entry["matchNumber"]):
            live_events[index] = entry
            return
    live_events.append(entry)


def main() -> int:
    matches = read_json(MATCHES_PATH, [])
    official_events = read_json(DATA_DIR / "match-events.json", [])
    live_events = read_json(LIVE_EVENTS_PATH, [])
    countries = read_json(COUNTRIES_PATH, [])
    squads = read_json(PLAYERS_PATH, [])

    country_by_id = {country["id"]: country for country in countries}
    players_by_country = {
        squad["countryId"]: squad.get("players", [])
        for squad in squads
    }
    official_by_match = {
        int(entry["matchNumber"]): entry for entry in official_events
    }
    live_by_match = {
        int(entry["matchNumber"]): entry for entry in live_events
    }

    match_choices = [
        Choice(match_label(match, country_by_id), value=match)
        for match in sorted(matches, key=lambda item: (item.get("kickoff", ""), item["number"]))
    ]
    match = questionary.select("Quel match veux-tu modifier en live ?", choices=match_choices).ask()
    if not match:
        return 1
    if match.get("status") == "finished":
        proceed = questionary.confirm(
            "Ce match est déjà officiel. Créer une entrée live quand même ?",
            default=False,
        ).ask()
        if not proceed:
            return 0

    entry = base_live_entry(
        match,
        official_by_match.get(int(match["number"])),
        live_by_match.get(int(match["number"])),
    )

    action = questionary.select(
        "Que veux-tu ajouter ?",
        choices=[
            Choice("But", value="goal"),
            Choice("Penalty marqué", value="penalty_goal"),
            Choice("Penalty arrêté", value="penalty_saved"),
            Choice("Correction du score", value="score"),
            Choice("Annuler le dernier but", value="undo_goal"),
            Choice("Effacer le live de ce match", value="clear"),
        ],
    ).ask()

    if action == "clear":
        live_events = [
            item for item in live_events
            if int(item.get("matchNumber")) != int(match["number"])
        ]
        write_json(LIVE_EVENTS_PATH, live_events)
        print(f"Live supprimé pour M{match['number']}.")
        return 0

    if action in {"goal", "penalty_goal"}:
        side = questionary.select(
            "Quelle équipe marque ?",
            choices=[
                Choice(country_name(country_by_id, match["homeCountryId"]), value="home"),
                Choice(country_name(country_by_id, match["awayCountryId"]), value="away"),
            ],
        ).ask()
        country_id = match["homeCountryId"] if side == "home" else match["awayCountryId"]
        players = players_for_country(players_by_country, country_id)
        scorer_id = choose_player("Buteur ?", players)
        assist_id = choose_player("Assist ?", players, allow_none=True)
        minute = ask_int("Minute ?", 1)
        added_time = questionary.text("Temps additionnel ? Laisse vide si aucun.").ask()
        entry["goals"].append(
            {
                "countryId": country_id,
                "scorerId": scorer_id,
                "assistId": assist_id,
                "minute": minute,
                "addedTime": int(added_time) if added_time else None,
                "isPenalty": action == "penalty_goal",
                "isOwnGoal": False,
            }
        )
        entry["score"][side] += 1

    elif action == "penalty_saved":
        side = questionary.select(
            "Quel gardien arrête le penalty ?",
            choices=[
                Choice(country_name(country_by_id, match["homeCountryId"]), value="home"),
                Choice(country_name(country_by_id, match["awayCountryId"]), value="away"),
            ],
        ).ask()
        country_id = match["homeCountryId"] if side == "home" else match["awayCountryId"]
        goalkeepers = [
            player for player in players_for_country(players_by_country, country_id)
            if player.get("position") == "GB"
        ]
        goalkeeper_id = choose_player("Gardien ?", goalkeepers or players_for_country(players_by_country, country_id))
        minute = ask_int("Minute ?", 1)
        entry["penaltiesSaved"].append(
            {
                "countryId": country_id,
                "goalkeeperId": goalkeeper_id,
                "minute": minute,
                "addedTime": None,
            }
        )

    elif action == "score":
        entry["score"]["home"] = ask_int(
            f"Score {country_name(country_by_id, match['homeCountryId'])} ?",
            entry["score"]["home"],
        )
        entry["score"]["away"] = ask_int(
            f"Score {country_name(country_by_id, match['awayCountryId'])} ?",
            entry["score"]["away"],
        )

    elif action == "undo_goal":
        if entry["goals"]:
            removed = entry["goals"].pop()
            if removed.get("countryId") == match["homeCountryId"]:
                entry["score"]["home"] = max(0, entry["score"]["home"] - 1)
            elif removed.get("countryId") == match["awayCountryId"]:
                entry["score"]["away"] = max(0, entry["score"]["away"] - 1)
            print("Dernier but retiré.")
        else:
            print("Aucun but live à retirer.")

    entry["updatedAt"] = now_iso()
    upsert_live_event(live_events, entry)
    write_json(LIVE_EVENTS_PATH, live_events)
    print(
        f"Live mis à jour : M{match['number']} "
        f"{entry['score']['home']}-{entry['score']['away']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
