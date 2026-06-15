(async () => {
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

  const emptyRound = () => ({
    matchesPlayed: null,
    penalties: null,
    goals: null,
    assists: null,
    cleanSheets: null,
    penaltiesSaved: null,
    points: null,
  });

  const getRoundKey = (match) => {
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
  };

  const increment = (player, round, statName, amount = 1) => {
    if (!player || !round) return;
    const stats = player.rounds[round];
    stats[statName] = (stats[statName] ?? 0) + amount;
  };

  const registerAppearance = (player, round) => {
    if (!player || !round) return;
    const stats = player.rounds[round];
    statNames.forEach((statName) => {
      if (stats[statName] === null) stats[statName] = 0;
    });
    stats.matchesPlayed += 1;
  };

  const calculateRoundPoints = (player, round) => {
    if (!statNames.some((statName) => round[statName] !== null)) {
      return null;
    }

    return (
      (round.goals ?? 0) * goalPoints[player.position] +
      (round.penalties ?? 0) * 3 +
      (round.assists ?? 0) +
      (round.cleanSheets ?? 0) * cleanSheetPoints[player.position] +
      (player.position === "GB" ? (round.penaltiesSaved ?? 0) * 2 : 0)
    );
  };

  const applyMatchEventsToPlayers = (players, matches, matchEvents) => {
    const playerById = new Map();
    players.forEach((squad) => {
      squad.players?.forEach((player) => {
        player.rounds = Object.fromEntries(
          roundNames.map((name) => [name, emptyRound()]),
        );
        playerById.set(player.id, player);
      });
    });

    const matchByNumber = new Map(
      matches.map((match) => [match.number, match]),
    );

    matchEvents.forEach((entry) => {
      const match = matchByNumber.get(entry.matchNumber);
      const round = match && getRoundKey(match);
      if (!match || !round || match.status !== "finished") return;

      const participants = [
        ...(entry.lineups?.home?.starters || []),
        ...(entry.lineups?.home?.substitutes || []),
        ...(entry.lineups?.away?.starters || []),
        ...(entry.lineups?.away?.substitutes || []),
      ];
      new Set(participants).forEach((id) =>
        registerAppearance(playerById.get(id), round),
      );

      (entry.goals || []).forEach((goal) => {
        if (goal.isOwnGoal) return;
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
        ...(entry.cleanSheets?.homePlayerIds || []),
        ...(entry.cleanSheets?.awayPlayerIds || []),
      ].forEach((id) => increment(playerById.get(id), round, "cleanSheets"));

      (entry.penaltiesSaved || []).forEach((event) =>
        increment(playerById.get(event.goalkeeperId), round, "penaltiesSaved"),
      );
    });

    players.forEach((squad) => {
      squad.players?.forEach((player) => {
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
              values.length
                ? values.reduce((sum, value) => sum + value, 0)
                : null,
            ];
          }),
        );
      });
    });
  };

  try {
    const cacheKey = Date.now();
    const responses = await Promise.all(
      [
        "countries",
        "players",
        "matches",
        "match-events",
        "fantasy-teams",
        "fantasy-team-rosters",
      ].map((fileName) =>
        fetch(`data/${fileName}.json?v=${cacheKey}`, { cache: "no-store" }),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      throw new Error(
        responses
          .map((response, index) => `${index}:${response.status}`)
          .join(" "),
      );
    }

    const [
      countries,
      players,
      matches,
      matchEvents,
      fantasyTeams,
      fantasyTeamRosters,
    ] = await Promise.all(
      responses.map((response) => response.json()),
    );
    if (
      ![
        countries,
        players,
        matches,
        matchEvents,
        fantasyTeams,
        fantasyTeamRosters,
      ].every(Array.isArray)
    ) {
      throw new Error("Un des fichiers JSON est invalide.");
    }

    applyMatchEventsToPlayers(players, matches, matchEvents);

    window.countryData = countries;
    window.playerData = players;
    window.matchData = matches;
    window.matchEventsData = matchEvents;
    window.fantasyTeamsData = fantasyTeams;
    window.fantasyTeamRostersData = fantasyTeamRosters;
    window.worldCupFixtures = matches.map((match) => ({
      n: match.number,
      d: match.kickoff,
      s: match.stage,
      g: match.group,
      h: match.homeCountryId,
      a: match.awayCountryId,
      hp: match.homePlaceholder,
      ap: match.awayPlaceholder,
      v: match.venue,
      c: match.city,
      score: match.score,
      status: match.status,
    }));

    const appScript = document.createElement("script");
    appScript.src = "app.js?v=87";
    appScript.defer = true;
    document.head.append(appScript);
  } catch (error) {
    console.error("Impossible de charger les données du site.", error);
    document.body.dataset.countryLoadError = "true";
  }
})();
