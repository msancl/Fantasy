const fs = require("fs");
const path = require("path");

const dataDirectory =
  process.argv[2] || path.resolve(__dirname, "..", "data");
const playersPath = path.join(dataDirectory, "players.json");
const matchesPath = path.join(dataDirectory, "matches.json");
const matchEventsPath = path.join(dataDirectory, "match-events.json");

const roundNames = ["J1", "J2", "J3", "R32", "R16", "QF", "SF", "F"];
const statNames = [
  "matchesPlayed",
  "penalties",
  "goals",
  "assists",
  "cleanSheets",
  "penaltiesSaved",
];
const goalPoints = { GB: 9, DF: 7, MIL: 5, ATT: 3 };
const cleanSheetPoints = { GB: 5, DF: 2, MIL: 0, ATT: 0 };
const groupRoundTwoStart = Date.parse("2026-06-18T16:00:00Z");
const groupRoundTwoEnd = Date.parse("2026-06-24T02:00:00Z");

function emptyRound() {
  return {
    matchesPlayed: null,
    penalties: null,
    goals: null,
    assists: null,
    cleanSheets: null,
    penaltiesSaved: null,
    points: null,
  };
}

function roundKey(match) {
  if (match.stage === "group") {
    const kickoff = Date.parse(match.kickoff);
    if (kickoff < groupRoundTwoStart) return "J1";
    if (kickoff <= groupRoundTwoEnd) return "J2";
    return "J3";
  }

  return {
    r32: "R32",
    r16: "R16",
    qf: "QF",
    sf: "SF",
    third: "F",
    final: "F",
  }[match.stage];
}

function increment(player, round, statName, amount = 1) {
  if (!player || !round) return;
  const stats = player.rounds[round];
  stats[statName] = (stats[statName] ?? 0) + amount;
}

function registerAppearance(player, round) {
  if (!player || !round) return;
  const stats = player.rounds[round];
  statNames.forEach((statName) => {
    if (stats[statName] === null) stats[statName] = 0;
  });
  stats.matchesPlayed += 1;
}

function calculateRoundPoints(player, round) {
  const hasData = statNames.some((statName) => round[statName] !== null);
  if (!hasData) return null;

  return (
    (round.goals ?? 0) * goalPoints[player.position] +
    (round.penalties ?? 0) * 3 +
    (round.assists ?? 0) +
    (round.cleanSheets ?? 0) * cleanSheetPoints[player.position] +
    (player.position === "GB" ? (round.penaltiesSaved ?? 0) * 2 : 0)
  );
}

const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));
const matches = JSON.parse(fs.readFileSync(matchesPath, "utf8"));
const matchEvents = JSON.parse(fs.readFileSync(matchEventsPath, "utf8"));
const playerById = new Map();

players.forEach((squad) => {
  squad.players.forEach((player) => {
    player.rounds = Object.fromEntries(
      roundNames.map((name) => [name, emptyRound()]),
    );
    playerById.set(player.id, player);
  });
});

const matchByNumber = new Map(matches.map((match) => [match.number, match]));

matchEvents.forEach((eventEntry) => {
  const match = matchByNumber.get(eventEntry.matchNumber);
  const round = match && roundKey(match);
  if (!match || !round || match.status !== "finished") return;

  const participants = [
    ...(eventEntry.lineups?.home?.starters || []),
    ...(eventEntry.lineups?.home?.substitutes || []),
    ...(eventEntry.lineups?.away?.starters || []),
    ...(eventEntry.lineups?.away?.substitutes || []),
  ];
  new Set(participants).forEach((id) =>
    registerAppearance(playerById.get(id), round),
  );

  (eventEntry.goals || []).forEach((goal) => {
    if (goal.minute == null || goal.isOwnGoal) return;
    increment(
      playerById.get(goal.scorerId),
      round,
      goal.isPenalty ? "penalties" : "goals",
    );
    if (goal.assistId) {
      increment(playerById.get(goal.assistId), round, "assists");
    }
  });

  [
    ...(eventEntry.cleanSheets?.homePlayerIds || []),
    ...(eventEntry.cleanSheets?.awayPlayerIds || []),
  ].forEach((id) => increment(playerById.get(id), round, "cleanSheets"));

  (eventEntry.penaltiesSaved || []).forEach((event) =>
    increment(playerById.get(event.goalkeeperId), round, "penaltiesSaved"),
  );
});

players.forEach((squad) => {
  squad.players.forEach((player) => {
    roundNames.forEach((name) => {
      player.rounds[name].points = calculateRoundPoints(
        player,
        player.rounds[name],
      );
    });

    player.totals = Object.fromEntries(
      [...statNames, "points"].map((statName) => {
        const values = roundNames
          .map((name) => player.rounds[name][statName])
          .filter((value) => value !== null);
        return [
          statName,
          values.length ? values.reduce((sum, value) => sum + value, 0) : null,
        ];
      }),
    );
  });
});

fs.writeFileSync(playersPath, `${JSON.stringify(players, null, 2)}\n`);
console.log(
  `Synchronized ${playerById.size} players from ${matchEvents.length} match-event entries.`,
);
