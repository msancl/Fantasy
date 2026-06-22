#!/usr/bin/env python3
"""Add one or more fantasy transfers through guided terminal menus."""

from __future__ import annotations

import json
import sys
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

VENDOR_DIR = Path(__file__).resolve().parent / "_vendor"
if VENDOR_DIR.exists():
    sys.path.insert(0, str(VENDOR_DIR))

try:
    import questionary
    from questionary import Choice
except ImportError:
    print("La librairie Python 'questionary' est necessaire.")
    print("Installe-la une seule fois avec : pip install questionary")
    raise SystemExit(1)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SETTINGS_PATH = DATA_DIR / "settings.json"
PLAYERS_PATH = DATA_DIR / "players.json"
TEAMS_PATH = DATA_DIR / "fantasy-teams.json"
ROSTERS_PATH = DATA_DIR / "fantasy-team-rosters.json"
TRANSFERS_PATH = DATA_DIR / "transfers.json"


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


def parse_transfer_date(value: str, season_year: int, timezone_name: str) -> str | None:
    normalized = (value or "").strip().lower().replace(" ", "")
    for fmt in ("%d/%m%Hh%M", "%d/%m/%Y%Hh%M"):
        try:
            parsed = datetime.strptime(normalized, fmt)
            if fmt == "%d/%m%Hh%M":
                parsed = parsed.replace(year=season_year)
            local = parsed.replace(tzinfo=ZoneInfo(timezone_name))
            return local.astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def player_name(player: dict | None) -> str:
    return player.get("name", "JOUEUR INCONNU") if player else "JOUEUR INCONNU"


def country_name(country_by_id: dict[str, dict], country_id: str | None) -> str:
    return country_by_id.get(country_id or "", {}).get("name") or country_id or "-"


def flatten_players(player_data: list[dict]) -> dict[int, dict]:
    players: dict[int, dict] = {}
    for squad in player_data:
        for player in squad.get("players", []):
            players[int(player["id"])] = player
    return players


def player_label(player: dict, country_by_id: dict[str, dict], selected_count: int = 0) -> str:
    country = country_name(country_by_id, player.get("countryId"))
    status = player.get("availability", {}).get("status", "available")
    return f"{player.get('position', '-')} · {player.get('name', '-')} · {country} · {status} {selected_count}/2"


def team_label(team: dict) -> str:
    return team.get("name") or team.get("id") or "-"


def round_choices(settings: dict) -> list[Choice]:
    choices = []
    for item in settings.get("rounds", []):
        if item.get("visible") is False:
            continue
        label = item.get("fullLabel") or item.get("label") or item.get("id")
        choices.append(Choice(f"{item.get('label', item.get('id'))} · {label}", value=item.get("id")))
    return choices


def round_order(settings: dict) -> dict[str, int]:
    return {
        item["id"]: index
        for index, item in enumerate(
            sorted(settings.get("rounds", []), key=lambda round_item: round_item.get("order", 999)),
        )
    }


def previous_round(round_id: str, settings: dict) -> str | None:
    ordered = [choice.value for choice in round_choices(settings)]
    if round_id not in ordered:
        return None
    index = ordered.index(round_id)
    return ordered[index - 1] if index > 0 else None


def is_slot_active(slot: dict, order: dict[str, int], round_id: str | None = None) -> bool:
    if not slot.get("playerId"):
        return False
    if round_id is None:
        return slot.get("leftRound") is None
    current = order.get(round_id, 999)
    joined = order.get(slot.get("joinedRound"), 0)
    left = order.get(slot.get("leftRound"), 999)
    return joined <= current <= left


def active_slots(roster: dict, order: dict[str, int], round_id: str | None = None) -> list[dict]:
    return [slot for slot in roster.get("slots", []) if is_slot_active(slot, order, round_id)]


def selected_counts(rosters: list[dict]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for roster in rosters:
        for slot in roster.get("slots", []):
            if slot.get("playerId") and slot.get("leftRound") is None:
                player_id = int(slot["playerId"])
                counts[player_id] = counts.get(player_id, 0) + 1
    return counts


def get_position_order(settings: dict, position: str | None) -> int:
    return settings.get("rosterRules", {}).get("positions", {}).get(position or "", {}).get("order", 999)


def sort_roster_slots(roster: dict, players_by_id: dict[int, dict], settings: dict) -> None:
    def key(slot: dict):
        if slot.get("slotType") == "substitute" and not slot.get("playerId"):
            return (2, 999, slot.get("slotId", ""))
        player = players_by_id.get(int(slot["playerId"])) if slot.get("playerId") else None
        position = player.get("position") if player else slot.get("position")
        inactive = 1 if slot.get("leftRound") else 0
        return (
            inactive,
            get_position_order(settings, position),
            player_name(player),
            slot.get("slotId", ""),
        )

    roster["slots"] = sorted(roster.get("slots", []), key=key)


def validate_final_roster(
    roster: dict,
    all_rosters: list[dict],
    players_by_id: dict[int, dict],
    country_by_id: dict[str, dict],
    settings: dict,
    outgoing_ids: set[int],
    incoming_ids: set[int],
) -> list[str]:
    errors: list[str] = []
    active = [slot for slot in roster.get("slots", []) if slot.get("playerId") and slot.get("leftRound") is None]
    rules = settings.get("rosterRules", {})
    positions = rules.get("positions", {})
    max_selections = int(settings.get("competition", {}).get("maxSelectionsPerPlayer", 2))

    starters = [slot for slot in active if slot.get("slotType") == "starter"]
    expected_starters = int(rules.get("starters", 11))
    if len(starters) != expected_starters:
        errors.append(f"L'effectif actif doit contenir {expected_starters} titulaires, pas {len(starters)}.")

    position_counts: dict[str, int] = {}
    for slot in starters:
        player = players_by_id.get(int(slot["playerId"]))
        position = player.get("position") if player else slot.get("position")
        position_counts[position] = position_counts.get(position, 0) + 1

    for position, rule in positions.items():
        if position == "REM":
            continue
        count = position_counts.get(position, 0)
        minimum = int(rule.get("min", 0))
        maximum = int(rule.get("max", 999))
        if count < minimum or count > maximum:
            errors.append(f"Condition poste fausse: {position} doit etre entre {minimum} et {maximum}, resultat {count}.")

    max_country_players = int(rules.get("maxPlayersPerCountry", 2))
    country_counts: dict[str, int] = {}
    for slot in starters:
        player = players_by_id.get(int(slot["playerId"]))
        country_id = player.get("countryId") if player else None
        if not country_id:
            continue
        country_counts[country_id] = country_counts.get(country_id, 0) + 1

    for country_id, count in sorted(country_counts.items()):
        if count > max_country_players:
            errors.append(
                f"Condition pays fausse: maximum {max_country_players} joueurs de "
                f"{country_name(country_by_id, country_id)}, resultat {count}."
            )

    ids = [int(slot["playerId"]) for slot in active]
    duplicates = sorted({player_id for player_id in ids if ids.count(player_id) > 1})
    for player_id in duplicates:
        errors.append(f"Joueur en double dans l'equipe: {player_name(players_by_id.get(player_id))}.")

    counts = selected_counts(all_rosters)
    for player_id in sorted(incoming_ids):
        count = counts.get(player_id, 0)
        if count > max_selections:
            errors.append(
                f"Disponibilite fausse: {player_name(players_by_id.get(player_id))} est selectionne {count}/{max_selections}."
            )

    if not settings.get("transfers", {}).get("allowReturningPlayer", False):
        historical_ids = {
            int(slot["playerId"])
            for slot in roster.get("slots", [])
            if slot.get("playerId")
            and int(slot["playerId"]) not in outgoing_ids
            and not (
                int(slot["playerId"]) in incoming_ids
                and slot.get("replacesPlayerId") in outgoing_ids
            )
        }
        for player_id in incoming_ids:
            if player_id in historical_ids and player_id not in outgoing_ids:
                errors.append(f"Retour interdit: {player_name(players_by_id.get(player_id))} a deja appartenu a cette equipe.")

    return errors


def update_player_availability(players: list[dict], rosters: list[dict], max_selections: int) -> None:
    counts = selected_counts(rosters)
    total_teams = len(rosters) or 1
    for squad in players:
        for player in squad.get("players", []):
            player_id = int(player["id"])
            count = counts.get(player_id, 0)
            availability = player.setdefault("availability", {})
            availability["selectedBy"] = count
            availability["maximumSelections"] = max_selections
            availability["selectionPercentage"] = round((count / total_teams) * 100, 2)
            availability["status"] = "available" if count < max_selections else "unavailable"


def ask_transfer_count(max_count: int) -> int | None:
    choices = [Choice(str(value), value=value) for value in range(1, max_count + 1)]
    return questionary.select("Combien de transferts veux-tu faire en une fois ?", choices=choices).ask()


def choose_team(teams: list[dict]) -> dict | None:
    choices = [
        Choice(team_label(team), value=team)
        for team in sorted(teams, key=lambda item: team_label(item))
        if team.get("status") != "inactive"
    ]
    return questionary.select("Quelle equipe fantasy ?", choices=choices, use_shortcuts=True).ask()


def choose_outgoing(roster: dict, players_by_id: dict[int, dict], order: dict[str, int]) -> dict | None:
    choices = []
    for slot in active_slots(roster, order):
        player = players_by_id.get(int(slot["playerId"]))
        if not player:
            continue
        choices.append(Choice(f"{player.get('position')} · {player_name(player)}", value=slot))
    return questionary.select("Joueur sortant ?", choices=choices, use_shortcuts=True).ask()


def choose_incoming(
    players_by_id: dict[int, dict],
    country_by_id: dict[str, dict],
    counts: dict[int, int],
) -> dict | None:
    search = (questionary.text("Recherche joueur entrant (laisse vide pour tout afficher)").ask() or "").strip().upper()
    players = sorted(
        players_by_id.values(),
        key=lambda player: (player.get("position", ""), player.get("name", "")),
    )
    if search:
        players = [player for player in players if search in player.get("name", "").upper()]
    choices = [
        Choice(player_label(player, country_by_id, counts.get(int(player["id"]), 0)), value=player)
        for player in players[:250]
    ]
    if not choices:
        print("Aucun joueur trouve.")
        return choose_incoming(players_by_id, country_by_id, counts)
    return questionary.select("Joueur entrant ?", choices=choices, use_shortcuts=True).ask()


def next_transfer_slot_id(roster: dict) -> str:
    existing = {slot.get("slotId") for slot in roster.get("slots", [])}
    index = 1
    while f"transfer-{index:02d}" in existing:
        index += 1
    return f"transfer-{index:02d}"


def transfer_number(transfers: list[dict], team_id: str) -> int:
    return sum(1 for item in transfers if item.get("fantasyTeamId") == team_id) + 1


def non_free_transfer_count(transfers: list[dict], team_id: str) -> int:
    return sum(
        1
        for item in transfers
        if item.get("fantasyTeamId") == team_id and not item.get("isFreeTransfer")
    )


def choose_action() -> str | None:
    return questionary.select(
        "Que veux-tu faire ?",
        choices=[
            Choice("Ajouter un ou plusieurs transferts", value="add"),
            Choice("Annuler un transfert", value="undo"),
        ],
    ).ask()


def transfer_label(
    transfer: dict,
    teams_by_id: dict[str, dict],
    players_by_id: dict[int, dict],
) -> str:
    team = team_label(teams_by_id.get(transfer.get("fantasyTeamId"), {}))
    player_in = player_name(players_by_id.get(int(transfer.get("playerInId", 0) or 0)))
    player_out = player_name(players_by_id.get(int(transfer.get("playerOutId", 0) or 0)))
    round_id = transfer.get("effectiveRound") or "-"
    number = transfer.get("teamTransferNumber") or "-"
    free_label = "gratuit" if transfer.get("isFreeTransfer") else "payant"
    return f"{team} · {number}e · {round_id} · {player_in} ⇄ {player_out} · {free_label}"


def choose_transfer_to_undo(
    transfers: list[dict],
    teams_by_id: dict[str, dict],
    players_by_id: dict[int, dict],
) -> dict | None:
    if not transfers:
        print("Aucun transfert a annuler.")
        return None

    choices = [
        Choice(transfer_label(transfer, teams_by_id, players_by_id), value=transfer)
        for transfer in sorted(
            transfers,
            key=lambda item: (item.get("date") or "", item.get("teamTransferNumber") or 0),
            reverse=True,
        )
    ]
    return questionary.select("Quel transfert veux-tu annuler ?", choices=choices, use_shortcuts=True).ask()


def renumber_team_transfers(transfers: list[dict], team_id: str) -> None:
    team_transfers = sorted(
        [item for item in transfers if item.get("fantasyTeamId") == team_id],
        key=lambda item: (item.get("date") or "", item.get("teamTransferNumber") or 0),
    )
    for index, transfer in enumerate(team_transfers, start=1):
        transfer["teamTransferNumber"] = index
        transfer["id"] = f"{team_id}-{index:02d}"


def undo_transfer(
    settings: dict,
    teams: list[dict],
    rosters: list[dict],
    transfers: list[dict],
    players: list[dict],
    players_by_id: dict[int, dict],
) -> int:
    teams_by_id = {team["id"]: team for team in teams}
    max_selections = int(settings.get("competition", {}).get("maxSelectionsPerPlayer", 2))
    transfer = choose_transfer_to_undo(transfers, teams_by_id, players_by_id)
    if not transfer:
        return 1

    team_id = transfer.get("fantasyTeamId")
    roster = next((item for item in rosters if item.get("teamId") == team_id), None)
    if not roster:
        print(f"Annulation bloquee: aucun roster trouve pour {team_id}.")
        return 1

    player_in_id = int(transfer.get("playerInId") or 0)
    player_out_id = int(transfer.get("playerOutId") or 0)
    effective_round = transfer.get("effectiveRound")
    left_round = previous_round(effective_round, settings) if effective_round else None

    incoming_slot = next(
        (
            slot
            for slot in roster.get("slots", [])
            if int(slot.get("playerId") or 0) == player_in_id
            and int(slot.get("replacesPlayerId") or 0) == player_out_id
            and slot.get("joinedRound") == effective_round
        ),
        None,
    )
    outgoing_slot = next(
        (
            slot
            for slot in roster.get("slots", [])
            if int(slot.get("playerId") or 0) == player_out_id
            and int(slot.get("replacedByPlayerId") or 0) == player_in_id
            and slot.get("leftRound") == left_round
        ),
        None,
    )

    if not incoming_slot:
        print("Annulation bloquee: le slot du joueur entrant est introuvable.")
        return 1
    if incoming_slot.get("leftRound") is not None or incoming_slot.get("replacedByPlayerId"):
        print("Annulation bloquee: ce joueur entrant a deja ete implique dans un transfert ulterieur.")
        return 1
    if not outgoing_slot:
        print("Annulation bloquee: le slot du joueur sortant est introuvable.")
        return 1

    print("\nResume de l'annulation:")
    print(f"Equipe: {team_label(teams_by_id.get(team_id, {}))}")
    print(f"Annuler: {player_name(players_by_id.get(player_in_id))} ⇄ {player_name(players_by_id.get(player_out_id))}")
    confirm = questionary.confirm("Confirmer l'annulation et ecrire les JSON ?", default=False).ask()
    if not confirm:
        print("Annule. Aucun fichier modifie.")
        return 0

    outgoing_slot["leftRound"] = None
    outgoing_slot["replacedByPlayerId"] = None
    roster["slots"] = [slot for slot in roster.get("slots", []) if slot is not incoming_slot]
    transfers[:] = [item for item in transfers if item is not transfer]
    renumber_team_transfers(transfers, team_id)
    sort_roster_slots(roster, players_by_id, settings)
    update_player_availability(players, rosters, max_selections)

    write_json(ROSTERS_PATH, rosters)
    write_json(TRANSFERS_PATH, transfers)
    write_json(PLAYERS_PATH, players)
    print("\nTransfert annule.")
    print("Fichiers modifies:")
    print("- data/fantasy-team-rosters.json")
    print("- data/transfers.json")
    print("- data/players.json")
    return 0


def main() -> int:
    settings = read_json(SETTINGS_PATH, {})
    countries = read_json(DATA_DIR / "countries.json", [])
    players = read_json(PLAYERS_PATH, [])
    teams = read_json(TEAMS_PATH, [])
    rosters = read_json(ROSTERS_PATH, [])
    transfers = read_json(TRANSFERS_PATH, [])

    if not isinstance(transfers, list):
        print("ERREUR: data/transfers.json doit etre une liste.")
        return 1

    players_by_id = flatten_players(players)
    country_by_id = {country["id"]: country for country in countries}
    order = round_order(settings)
    max_per_team = int(settings.get("transfers", {}).get("maxTransfersPerTeam", 3))
    max_selections = int(settings.get("competition", {}).get("maxSelectionsPerPlayer", 2))
    timezone_name = settings.get("site", {}).get("timezone", "Europe/Brussels")
    season_year = int(settings.get("competition", {}).get("season", "2026"))

    action = choose_action()
    if action == "undo":
        return undo_transfer(settings, teams, rosters, transfers, players, players_by_id)
    if action != "add":
        return 1

    team = choose_team(teams)
    if not team:
        return 1
    team_id = team["id"]
    roster = next((item for item in rosters if item.get("teamId") == team_id), None)
    if not roster:
        print(f"ERREUR: aucun roster trouve pour {team_label(team)}.")
        return 1

    remaining_paid = max_per_team - non_free_transfer_count(transfers, team_id)
    if remaining_paid <= 0:
        print(f"Transfert impossible: {team_label(team)} a deja utilise ses {max_per_team} transferts payants.")
        return 1

    count = ask_transfer_count(max_per_team)
    if not count:
        return 1

    date_text = questionary.text("Date du transfert (JJ/MM HHhMM)", default=datetime.now().strftime("%d/%m %Hh%M")).ask()
    date_iso = parse_transfer_date(date_text, season_year, timezone_name)
    if not date_iso:
        print("Date invalide. Format attendu: JJ/MM HHhMM, exemple 22/06 21h14.")
        return 1

    effective_round = questionary.select("Transfert actif a partir de quelle journee ?", choices=round_choices(settings)).ask()
    if not effective_round:
        return 1
    left_round = previous_round(effective_round, settings)
    if left_round is None:
        print("Transfert bloque: impossible de faire un transfert actif des J1 via ce script. Fais plutot une correction de roster.")
        return 1

    working_rosters = deepcopy(rosters)
    working_roster = next(item for item in working_rosters if item.get("teamId") == team_id)
    new_transfers = deepcopy(transfers)
    outgoing_ids: set[int] = set()
    incoming_ids: set[int] = set()
    summary: list[str] = []

    for index in range(1, count + 1):
        print(f"\nTransfert {index}/{count}")
        counts = selected_counts(working_rosters)
        outgoing_slot = choose_outgoing(working_roster, players_by_id, order)
        if not outgoing_slot:
            return 1
        incoming_player = choose_incoming(players_by_id, country_by_id, counts)
        if not incoming_player:
            return 1

        outgoing_id = int(outgoing_slot["playerId"])
        incoming_id = int(incoming_player["id"])
        outgoing_player = players_by_id.get(outgoing_id)
        incoming_position = incoming_player.get("position")
        is_free = questionary.confirm("Transfert gratuit ?", default=settings.get("transfers", {}).get("defaultIsFreeTransfer", False)).ask()

        if not is_free and non_free_transfer_count(new_transfers, team_id) >= max_per_team:
            print(f"Transfert bloque: {team_label(team)} depasse la limite de {max_per_team} transferts payants.")
            return 1

        outgoing_slot["leftRound"] = left_round
        outgoing_slot["replacedByPlayerId"] = incoming_id

        new_slot = {
            "slotId": next_transfer_slot_id(working_roster),
            "slotType": "starter",
            "playerId": incoming_id,
            "position": incoming_position,
            "joinedRound": effective_round,
            "leftRound": None,
            "replacedByPlayerId": None,
            "replacesPlayerId": outgoing_id,
            "note": None,
        }
        working_roster.setdefault("slots", []).append(new_slot)

        number = transfer_number(new_transfers, team_id)
        new_transfers.append(
            {
                "id": f"{team_id}-{number:02d}",
                "date": date_iso,
                "fantasyTeamId": team_id,
                "teamTransferNumber": number,
                "playerInId": incoming_id,
                "playerOutId": outgoing_id,
                "effectiveRound": effective_round,
                "isFreeTransfer": bool(is_free),
            }
        )

        outgoing_ids.add(outgoing_id)
        incoming_ids.add(incoming_id)
        summary.append(
            f"{player_name(incoming_player)} entre a la place de {player_name(outgoing_player)} ({effective_round})"
        )

    sort_roster_slots(working_roster, players_by_id, settings)
    errors = validate_final_roster(
        working_roster,
        working_rosters,
        players_by_id,
        country_by_id,
        settings,
        outgoing_ids,
        incoming_ids,
    )
    if errors:
        print("\nTRANSFERT(S) BLOQUE(S). Conditions fausses:")
        for error in errors:
            print(f"- {error}")
        print("\nAucun fichier n'a ete modifie.")
        return 1

    print("\nResume:")
    print(f"Equipe: {team_label(team)}")
    print(f"Date: {date_text}")
    for line in summary:
        print(f"- {line}")

    confirm = questionary.confirm("Confirmer et ecrire les JSON ?", default=False).ask()
    if not confirm:
        print("Annule. Aucun fichier modifie.")
        return 0

    update_player_availability(players, working_rosters, max_selections)
    write_json(ROSTERS_PATH, working_rosters)
    write_json(TRANSFERS_PATH, new_transfers)
    write_json(PLAYERS_PATH, players)
    print("\nTransfert(s) enregistre(s).")
    print("Fichiers modifies:")
    print("- data/fantasy-team-rosters.json")
    print("- data/transfers.json")
    print("- data/players.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
