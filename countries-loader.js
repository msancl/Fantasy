(async () => {
  const defaultSettings = {
    site: {
      cacheVersion: 98,
    },
    scoring: {
      goal: { GB: 9, DF: 7, MIL: 5, ATT: 3 },
      cleanSheet: { GB: 5, DF: 2, MIL: 0, ATT: 0 },
      penaltyGoal: 3,
      assist: 1,
      penaltySaved: 2,
    },
    rounds: [
      { id: "J1", type: "group", startsAt: "2026-06-11T19:00:00Z", endsAt: "2026-06-18T15:59:59Z" },
      { id: "J2", type: "group", startsAt: "2026-06-18T16:00:00Z", endsAt: "2026-06-24T02:00:00Z" },
      { id: "J3", type: "group", startsAt: "2026-06-24T02:00:01Z", endsAt: "2026-06-27T23:59:59Z" },
      { id: "R32", type: "knockout" },
      { id: "R16", type: "knockout" },
      { id: "QF", type: "knockout" },
      { id: "SF", type: "knockout" },
      { id: "F", type: "final" },
    ],
  };
  let settings = defaultSettings;
  const getRounds = () =>
    Array.isArray(settings.rounds) && settings.rounds.length
      ? settings.rounds
      : defaultSettings.rounds;
  const getRoundNames = () => getRounds().map((round) => round.id);
  const stageRoundMap = {
    r32: "R32",
    r16: "R16",
    qf: "QF",
    sf: "SF",
    third: "F",
    final: "F",
  };
  const getScoring = () => settings.scoring || defaultSettings.scoring;
  const statNames = [
    "matchesPlayed",
    "penalties",
    "goals",
    "assists",
    "cleanSheets",
    "penaltiesSaved",
  ];

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
      const round = getRounds()
        .filter((item) => item.type === "group" && item.startsAt && item.endsAt)
        .find((item) => {
          const start = Date.parse(item.startsAt);
          const end = Date.parse(item.endsAt);
          return kickoff >= start && kickoff <= end;
        });
      return round?.id || "J3";
    }

    return stageRoundMap[match.stage];
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
    const scoring = getScoring();

    return (
      (round.goals ?? 0) * (scoring.goal?.[player.position] ?? 0) +
      (round.penalties ?? 0) * (scoring.penaltyGoal ?? 0) +
      (round.assists ?? 0) * (scoring.assist ?? 0) +
      (round.cleanSheets ?? 0) * (scoring.cleanSheet?.[player.position] ?? 0) +
      (player.position === "GB"
        ? (round.penaltiesSaved ?? 0) * (scoring.penaltySaved ?? 0)
        : 0)
    );
  };

  const mergeLiveMatchData = (matches, matchEvents, liveEvents) => {
    const eventsByMatch = new Map(
      matchEvents.map((entry) => [Number(entry.matchNumber), entry]),
    );
    const effectiveMatches = matches.map((match) => ({ ...match, score: { ...(match.score || {}) } }));
    const effectiveEvents = matchEvents.map((entry) => ({ ...entry }));
    const eventIndexByMatch = new Map(
      effectiveEvents.map((entry, index) => [Number(entry.matchNumber), index]),
    );

    liveEvents.forEach((liveEntry) => {
      const matchNumber = Number(liveEntry.matchNumber);
      const match = effectiveMatches.find((item) => Number(item.number) === matchNumber);
      if (!match || match.status === "finished") {
        return;
      }

      match.status = "live";
      if (liveEntry.score) {
        match.score = {
          ...(match.score || {}),
          home: liveEntry.score.home,
          away: liveEntry.score.away,
        };
      }

      const official = eventsByMatch.get(matchNumber) || {};
      const merged = {
        ...official,
        ...liveEntry,
        matchNumber,
        lineups: liveEntry.lineups || official.lineups || {
          home: { starters: [], substitutes: [] },
          away: { starters: [], substitutes: [] },
        },
        goals: liveEntry.goals || official.goals || [],
        cleanSheets: liveEntry.cleanSheets || official.cleanSheets || {
          homePlayerIds: [],
          awayPlayerIds: [],
        },
        penaltiesSaved: liveEntry.penaltiesSaved || official.penaltiesSaved || [],
      };

      if (eventIndexByMatch.has(matchNumber)) {
        effectiveEvents[eventIndexByMatch.get(matchNumber)] = merged;
      } else {
        eventIndexByMatch.set(matchNumber, effectiveEvents.length);
        effectiveEvents.push(merged);
      }
    });

    return { matches: effectiveMatches, matchEvents: effectiveEvents };
  };

  const applyMatchEventsToPlayers = (players, matches, matchEvents) => {
    const playerById = new Map();
    const roundNames = getRoundNames();
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
      if (!match || !round || !["finished", "live"].includes(match.status)) return;

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

  const applyRosterAvailabilityToPlayers = (players, fantasyTeams, fantasyTeamRosters) => {
    const playerById = new Map();
    players.forEach((squad) => {
      squad.players?.forEach((player) => {
        playerById.set(String(player.id), player);
      });
    });

    const activeTeamIds = new Set(
      fantasyTeams
        .filter((team) => team.status !== "inactive")
        .map((team) => team.id),
    );
    const activeTeamCount = activeTeamIds.size || fantasyTeams.length || 1;
    const maxSelections = Number(settings.competition?.maxSelectionsPerPlayer ?? 2);
    const selectedByPlayerId = new Map();

    fantasyTeamRosters
      .filter((roster) => !activeTeamIds.size || activeTeamIds.has(roster.teamId))
      .forEach((roster) => {
        const playerIdsInTeam = new Set(
          (roster.slots || [])
            .filter((slot) => slot.playerId && slot.leftRound === null)
            .map((slot) => String(slot.playerId)),
        );
        playerIdsInTeam.forEach((playerId) => {
          selectedByPlayerId.set(playerId, (selectedByPlayerId.get(playerId) || 0) + 1);
        });
      });

    playerById.forEach((player, playerId) => {
      const selectedBy = selectedByPlayerId.get(playerId) || 0;
      const limit = Number(player.availability?.maximumSelections ?? maxSelections);
      player.availability = {
        ...(player.availability || {}),
        status: selectedBy >= limit ? "unavailable" : "available",
        selectedBy,
        maximumSelections: limit,
        selectionPercentage: activeTeamCount
          ? Math.round((selectedBy / activeTeamCount) * 1000) / 10
          : 0,
      };
    });
  };

  try {
    const cacheKey = Date.now();
    const settingsResponse = await fetch(`data/settings.json?v=${cacheKey}`, {
      cache: "no-store",
    });
    if (!settingsResponse.ok) {
      throw new Error(`settings:${settingsResponse.status}`);
    }
    settings = await settingsResponse.json();

    const responses = await Promise.all(
      [
        "countries",
        "players",
        "matches",
        "match-events",
        "match-events-live",
        "fantasy-teams",
        "fantasy-team-rosters",
        "transfers",
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
      liveMatchEvents,
      fantasyTeams,
      fantasyTeamRosters,
      transfers,
    ] = await Promise.all(
      responses.map((response) => response.json()),
    );
    if (
      ![
        countries,
        players,
        matches,
        matchEvents,
        liveMatchEvents,
        fantasyTeams,
        fantasyTeamRosters,
        transfers,
      ].every(Array.isArray)
    ) {
      throw new Error("Un des fichiers JSON est invalide.");
    }

    const effective = mergeLiveMatchData(matches, matchEvents, liveMatchEvents);
    applyMatchEventsToPlayers(players, effective.matches, effective.matchEvents);
    applyRosterAvailabilityToPlayers(players, fantasyTeams, fantasyTeamRosters);

    window.settingsData = settings;
    window.countryData = countries;
    window.playerData = players;
    window.matchData = effective.matches;
    window.matchEventsData = effective.matchEvents;
    window.matchEventsLiveData = liveMatchEvents;
    window.fantasyTeamsData = fantasyTeams;
    window.fantasyTeamRostersData = fantasyTeamRosters;
    window.transferData = transfers;
    window.worldCupFixtures = effective.matches.map((match) => ({
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
    appScript.src = `app.js?v=${settings.site?.cacheVersion || 93}`;
    appScript.defer = true;
    document.head.append(appScript);
  } catch (error) {
    console.error("Impossible de charger les données du site.", error);
    document.body.dataset.countryLoadError = "true";
  }
})();
