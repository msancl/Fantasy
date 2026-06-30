const settings = window.settingsData || {};
const siteSettings = settings.site || {};
const competitionSettings = settings.competition || {};
const fixtureSettings = settings.fixtures || {};
const standingsSettings = settings.standings || {};
const rosterRules = settings.rosterRules || {};
const transferSettings = settings.transfers || {};
const labelSettings = settings.labels || {};
const appLocale = siteSettings.language || "fr-BE";
const appTimeZone = siteSettings.timezone || "Europe/Brussels";
const settingPages = Array.isArray(settings.pages) ? settings.pages : [];
const settingSubsections = settings.subsections || {};
const settingRounds = Array.isArray(settings.rounds) ? settings.rounds : [];
const visiblePageSettings = settingPages.filter(
  (page) =>
    page.visible !== false &&
    !(
      page.id === "transferts" &&
      (competitionSettings.transfersEnabled === false ||
        transferSettings.enabled === false)
    ),
);
const pages = visiblePageSettings.length
  ? visiblePageSettings.map((page) => page.id)
  : [
      "accueil",
      "equipes",
      "resultats",
      "classements",
      "coupes",
      "joueurs",
      "transferts",
      "archives",
      "reglement",
    ];
const pageSettingsById = new Map(settingPages.map((page) => [page.id, page]));
const roundSettings = settingRounds
  .slice()
  .sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
const visibleRounds = roundSettings.filter((round) => round.visible !== false);
const roundSettingsById = new Map(roundSettings.map((round) => [round.id, round]));
const nationalRoundKeys = visibleRounds.length
  ? visibleRounds.map((round) => round.id)
  : ["J1", "J2", "J3", "R32", "R16", "QF", "SF", "F"];
const fantasyRoundKeys = nationalRoundKeys;
const groupRounds = roundSettings.filter((round) => round.type === "group");
const stageRoundMap = {
  r32: "R32",
  r16: "R16",
  qf: "QF",
  sf: "SF",
  third: "F",
  final: "F",
};
const fallbackStageLabels = {
  group: "Phase de groupes",
  r32: "Seizièmes de finale",
  r16: "Huitièmes de finale",
  qf: "Quarts de finale",
  sf: "Demi-finales",
  third: "Match pour la 3e place",
  final: "Finale",
};
const stageLabels = Object.fromEntries(
  Object.entries(fallbackStageLabels).map(([stage, label]) => [
    stage,
    roundSettingsById.get(stageRoundMap[stage])?.fullLabel || label,
  ]),
);
stageLabels.group = "Phase de groupes";
const statusLabels = {
  upcoming: "La compétition approche",
  "in-progress": "Compétition en cours",
  finished: "Compétition terminée",
};

function getStatLabel(key, fallback) {
  return labelSettings.stats?.[key] || fallback;
}

function getActionLabel(key, fallback) {
  return labelSettings.actions?.[key] || fallback;
}

function getEmptyStateLabel(key, fallback) {
  return labelSettings.emptyStates?.[key] || fallback;
}

function getRoundLabel(roundId, fallback = roundId) {
  return roundSettingsById.get(roundId)?.label || fallback;
}

function getRoundFullLabel(roundId, fallback = roundId) {
  return roundSettingsById.get(roundId)?.fullLabel || fallback;
}

function getRoundFilter(roundId) {
  if (roundId === "F") {
    return "F";
  }
  return roundId;
}

function getRoundIdFromFilter(filter) {
  const legacyMap = {
    "group-1": "J1",
    "group-2": "J2",
    "group-3": "J3",
    r32: "R32",
    r16: "R16",
    qf: "QF",
    sf: "SF",
    finals: "F",
  };
  return legacyMap[filter] || filter;
}

function getRoundForFixture(fixture) {
  const stage = fixture.s || fixture.stage;
  const kickoffValue = fixture.d || fixture.kickoff;

  if (stage === "group") {
    const kickoff = Date.parse(kickoffValue);
    const round = groupRounds.find((item) => {
      const start = Date.parse(item.startsAt);
      const end = Date.parse(item.endsAt);
      return kickoff >= start && kickoff <= end;
    });
    return round?.id || "J3";
  }
  return stageRoundMap[stage] || stage;
}

function getRoundByDayNumber(dayNumber) {
  return nationalRoundKeys[dayNumber - 1];
}

function getPositionRule(position) {
  return rosterRules.positions?.[position] || {};
}

function getPositionOrder(position) {
  return getPositionRule(position).order ?? 999;
}

function getPositionLabel(position) {
  return getPositionRule(position).label || position;
}

function getAvailabilityLabel(key, fallback) {
  return labelSettings.availability?.[key] || fallback;
}

function applySettingsToStaticDom() {
  document.documentElement.lang = siteSettings.language || "fr-BE";
  document.title = siteSettings.title || document.title;

  const headerTitle = document.querySelector(".site-header h1");
  const headerSubtitle = document.querySelector(".site-header p");
  if (headerTitle && siteSettings.title) {
    headerTitle.textContent = siteSettings.title;
  }
  if (headerSubtitle && siteSettings.subtitle) {
    headerSubtitle.textContent = siteSettings.subtitle;
  }

  document.querySelectorAll("[data-page]").forEach((section) => {
    const page = pageSettingsById.get(section.dataset.page);
    if (page?.label) {
      const heading = section.querySelector(":scope > h2, .home-intro h2, .fixtures-heading h2");
      if (heading) {
        heading.textContent = page.label;
      }
    }
    if (page?.visible === false) {
      section.hidden = true;
    }
  });

  document.querySelectorAll('.top-nav a[href^="#"]').forEach((link) => {
    const pageId = link.getAttribute("href").slice(1);
    const page = pageSettingsById.get(pageId);
    if (page?.label) {
      link.textContent = page.label;
    }
    link.hidden = page?.visible === false;
  });

  if (competitionSettings.transfersEnabled === false || transferSettings.enabled === false) {
    document.querySelector('.top-nav a[href="#transferts"]')?.setAttribute("hidden", "");
    const transfersSection = document.querySelector('[data-page="transferts"]');
    if (transfersSection) {
      transfersSection.hidden = true;
    }
  }

  Object.entries(settingSubsections).forEach(([pageId, subsections]) => {
    const section = document.querySelector(`[data-page="${pageId}"]`);
    if (!section || !Array.isArray(subsections)) {
      return;
    }
    subsections.forEach((subsection) => {
      section
        .querySelectorAll(
          `[data-division="${subsection.id}"], [data-division-panel="${subsection.id}"]`,
        )
        .forEach((element) => {
          if (subsection.label && element.matches("[data-division]")) {
            element.textContent = subsection.label;
          }
          if (subsection.visible === false) {
            element.hidden = true;
          }
        });
    });
  });

  const timeText = document.querySelector(".fixtures-heading p");
  if (timeText && fixtureSettings.timeLabel) {
    timeText.textContent = fixtureSettings.timeLabel;
  }

  const showAllResults = document.querySelector('.home-section-heading a[href="#resultats"]');
  if (showAllResults) {
    showAllResults.textContent = getActionLabel("showAllResults", showAllResults.textContent);
  }
  const showRanking = document.querySelector('.home-command-actions a[href="#classements"]');
  if (showRanking) {
    showRanking.textContent = getActionLabel("showRanking", showRanking.textContent);
  }
  const showPlayers = document.querySelector('.home-command-actions a[href="#joueurs"]');
  if (showPlayers) {
    showPlayers.textContent = getActionLabel("showPlayers", showPlayers.textContent);
  }
}

applySettingsToStaticDom();

const countries = Array.isArray(window.countryData) ? window.countryData : [];
const countryById = new Map(countries.map((country) => [country.id, country]));
const playerData = Array.isArray(window.playerData) ? window.playerData : [];

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function calculatePlayerTotalsFromRounds(player) {
  const totals = nationalRoundKeys.reduce(
    (sum, round) => {
      const stats = player?.rounds?.[round];
      if (!stats) {
        return sum;
      }

      const values = [
        stats.matchesPlayed,
        stats.penalties,
        stats.goals,
        stats.assists,
        stats.cleanSheets,
        stats.penaltiesSaved,
        stats.points,
      ];
      const hasNumericValue = values.some(
        (value) => value !== null && value !== undefined && Number.isFinite(Number(value)),
      );
      if (!hasNumericValue) {
        return sum;
      }

      sum.hasData = true;
      sum.matchesPlayed += numberOrZero(stats.matchesPlayed);
      sum.penalties += numberOrZero(stats.penalties);
      sum.goals += numberOrZero(stats.goals) + numberOrZero(stats.penalties);
      sum.assists += numberOrZero(stats.assists);
      sum.cleanSheets += numberOrZero(stats.cleanSheets);
      sum.penaltiesSaved += numberOrZero(stats.penaltiesSaved);
      sum.points += numberOrZero(stats.points);
      return sum;
    },
    {
      hasData: false,
      matchesPlayed: 0,
      penalties: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      penaltiesSaved: 0,
      points: 0,
    },
  );

  if (!totals.hasData) {
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

  delete totals.hasData;
  return totals;
}

playerData.forEach((squad) => {
  (squad.players || []).forEach((player) => {
    player.totals = calculatePlayerTotalsFromRounds(player);
  });
});

const worldCupSquads = Object.fromEntries(
  playerData.map((squad) => [squad.countryId, squad.players || []]),
);
const matchData = Array.isArray(window.matchData) ? window.matchData : [];
const matchEventsData = Array.isArray(window.matchEventsData)
  ? window.matchEventsData
  : [];
const currentRoundId = (() => {
  const fixtures = matchData
    .filter((match) => (match?.d || match?.kickoff) && getRoundForFixture(match))
    .slice()
    .sort(
      (first, second) =>
        Date.parse(first.d || first.kickoff) - Date.parse(second.d || second.kickoff),
    );

  if (!fixtures.length) {
    return competitionSettings.currentRoundId || nationalRoundKeys[0];
  }

  const now = Date.now();
  const liveWindowMs = 4 * 60 * 60 * 1000;
  const liveFixture = fixtures
    .filter((fixture) => {
      const kickoff = Date.parse(fixture.d || fixture.kickoff);
      return kickoff <= now && now - kickoff <= liveWindowMs;
    })
    .at(-1);

  const targetFixture =
    liveFixture ||
    fixtures.find((fixture) => Date.parse(fixture.d || fixture.kickoff) > now) ||
    fixtures.at(-1);

  return getRoundForFixture(targetFixture) || competitionSettings.currentRoundId || nationalRoundKeys[0];
})();
const currentDayNumber = Math.max(1, nationalRoundKeys.indexOf(currentRoundId) + 1);
const playerById = new Map(
  playerData.flatMap((squad) =>
    (squad.players || []).map((player) => [String(player.id), player]),
  ),
);
const fantasyTeamsData = Array.isArray(window.fantasyTeamsData)
  ? window.fantasyTeamsData
  : [];
const fantasyTeamRostersData = Array.isArray(window.fantasyTeamRostersData)
  ? window.fantasyTeamRostersData
  : [];
const transferData = Array.isArray(window.transferData) ? window.transferData : [];
const transferInByPlayerId = new Map();
const transferOutByPlayerId = new Map();
transferData.forEach((transfer) => {
  if (transfer?.playerInId !== undefined && transfer.playerInId !== null) {
    transferInByPlayerId.set(String(transfer.playerInId), transfer);
  }
  if (transfer?.playerOutId !== undefined && transfer.playerOutId !== null) {
    transferOutByPlayerId.set(String(transfer.playerOutId), transfer);
  }
});
const fantasyRosterByTeamId = new Map(
  fantasyTeamRostersData.map((roster) => [roster.teamId, roster]),
);

function formatPlayerStat(value) {
  return value === null || value === undefined ? "-" : String(value);
}

function getCountry(code) {
  return (
    countryById.get(code) || {
      id: code,
      name: code,
      flag: "",
      shirt: "",
    }
  );
}

function getCountryName(code) {
  return getCountry(code).name;
}

function getCountryAsset(code, type) {
  return getCountry(code)[type];
}

const warmedImageSources = new Set();

function runWhenIdle(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1200 });
  } else {
    window.setTimeout(callback, 80);
  }
}

function warmImageSource(source) {
  if (!source || warmedImageSources.has(source)) {
    return;
  }

  warmedImageSources.add(source);
  runWhenIdle(() => {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
  });
}

function warmPageImages(page) {
  const countryCodes = Array.isArray(window.countryData)
    ? window.countryData.map((country) => country.id).filter(Boolean)
    : Object.keys(worldCupSquads);

  if (page === "joueurs") {
    countryCodes.slice(0, 12).forEach((code) => {
      warmImageSource(getCountryAsset(code, "flag"));
      warmImageSource(getCountryAsset(code, "shirt"));
    });
  }

  if (page === "equipes" || page === "transferts") {
    Object.keys(worldCupSquads).slice(0, 16).forEach((code) => {
      warmImageSource(getCountryAsset(code, "shirt"));
    });
  }
}

function getCountryCodeFromAsset(source) {
  return source?.match(/assets\/(?:flags|shirts)\/([A-Z]{3})\.[a-z]+(?:\?.*)?$/i)?.[1];
}

function replaceCountryLabel(label, countryName) {
  if (!label) {
    return;
  }

  const suffix = label.textContent.includes(" ?")
    ? label.textContent.slice(label.textContent.indexOf(" ?"))
    : "";
  label.textContent = `${countryName}${suffix}`;
}

function hydrateCountryReferences(root = document) {
  root.querySelectorAll?.('img[src*="assets/flags/"], img[src*="assets/shirts/"]').forEach(
    (image) => {
      const code = image.dataset.countryId || getCountryCodeFromAsset(image.getAttribute("src"));
      if (!code || !countryById.has(code)) {
        return;
      }

      const country = getCountry(code);
      const type = image.getAttribute("src").includes("/flags/") ? "flag" : "shirt";
      image.dataset.countryId = code;
      if (image.getAttribute("src") !== country[type]) {
        image.setAttribute("src", country[type]);
      }
      if (image.hasAttribute("alt") && image.getAttribute("alt")) {
        image.setAttribute(
          "alt",
          type === "flag" ? `Drapeau de ${country.name}` : `Maillot de ${country.name}`,
        );
      }

      if (image.closest(".history-player")) {
        replaceCountryLabel(image.closest(".history-player").querySelector("small"), country.name);
      } else if (image.closest(".transfer-ranking-row")) {
        replaceCountryLabel(image.closest(".transfer-ranking-row").querySelector(".transfer-player small"), country.name);
      } else if (image.closest(".player-card")) {
        replaceCountryLabel(image.closest(".player-card").querySelector(".player-main small"), country.name);
      }
    },
  );
}

hydrateCountryReferences();

const countryReferenceObserver = new MutationObserver((records) => {
  records.forEach((record) => {
    record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        hydrateCountryReferences(node);
      }
    });
  });
});
countryReferenceObserver.observe(document.body, { childList: true, subtree: true });

function getCurrentPage() {
  const fallbackPage = pages.includes(siteSettings.defaultPage)
    ? siteSettings.defaultPage
    : pages[0] || "accueil";
  const page = window.location.hash.replace("#", "") || fallbackPage;
  return pages.includes(page) ? page : fallbackPage;
}

const defaultPageDivisions = Object.fromEntries(
  settingPages
    .filter((page) => page.defaultSubsection)
    .map((page) => [page.id, page.defaultSubsection]),
);
let pageStateResetReady = false;
let pendingTeamSlug = null;
const initializedHeavyPages = new Set();

function ensurePageInitialized(page) {
  if (initializedHeavyPages.has(page)) {
    return;
  }

  if (page === "equipes") {
    safeInit("equipes", createWorldCupTeams);
    initializedHeavyPages.add(page);
  }

  if (page === "joueurs") {
    safeInit("joueurs", createNationalTeamSections);
    initializedHeavyPages.add(page);
  }

  if (page === "transferts") {
    safeInit("recherche-transferts", initializeTransferPlayerSearch);
    safeInit("historique-transferts", initializeTransferHistory);
    initializedHeavyPages.add(page);
  }
}

function resetDivision(section, division) {
  if (!section || !division) {
    return;
  }

  section.querySelectorAll("[data-division]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.division === division);
  });

  section.querySelectorAll("[data-division-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.divisionPanel !== division;
  });
}

function closeTeamCards(section) {
  section?.querySelectorAll(".team-card").forEach((teamCard) => {
    teamCard.classList.remove("is-open");
    resetTeamDays(teamCard);
    teamCard.querySelectorAll("[aria-expanded]").forEach((element) => {
      element.setAttribute("aria-expanded", "false");
    });
  });
}

function closeNationalTeams(section) {
  section?.querySelectorAll(".national-team-section").forEach((country) => {
    country.classList.remove("is-open");

    const board = country.querySelector(".national-squad-board");
    const lineupBlock = country.querySelector(".team-lineup-block");
    const daysButton = country.querySelector(".days-toggle");

    lineupBlock?.classList.remove("is-days-open");
    board?.classList.remove("is-days-open");
    if (board) {
      clearNationalDayDetails(board);
      board.scrollLeft = 0;
    }
    if (daysButton) {
      daysButton.setAttribute("aria-expanded", "false");
      daysButton.textContent = getActionLabel("showDays", "Voir journées");
    }

    country.querySelectorAll("[aria-expanded]").forEach((element) => {
      element.setAttribute("aria-expanded", "false");
    });
  });
}

function resetPageState(page) {
  if (!pageStateResetReady) {
    return;
  }

  const section = document.querySelector(`[data-page="${page}"]`);
  resetDivision(section, defaultPageDivisions[page]);

  if (page === "equipes") {
    closeTeamCards(section);
  }

  if (page === "joueurs") {
    closeNationalTeams(section);
  }

  if (page === "classements") {
    section?.querySelectorAll(".standings-entry.is-open").forEach((entry) => {
      entry.classList.remove("is-open");
      entry
        .querySelector(".standings-team")
        ?.setAttribute("aria-expanded", "false");
      entry.querySelector(".standings-team-details")?.replaceChildren();
    });
  }
}

function showPage() {
  const currentPage = getCurrentPage();

  if (pageStateResetReady) {
    ensurePageInitialized(currentPage);
  }
  resetPageState(currentPage);

  document.querySelectorAll("[data-page]").forEach((section) => {
    section.hidden = section.dataset.page !== currentPage;
  });

  warmPageImages(currentPage);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const linkPage = link.getAttribute("href").replace("#", "");
    if (linkPage === currentPage) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    } else {
      link.classList.remove("is-active");
      link.removeAttribute("aria-current");
    }
  });

  if (currentPage === "equipes" && pendingTeamSlug) {
    const teamSlug = pendingTeamSlug;
    pendingTeamSlug = null;

    window.setTimeout(() => {
      const teamCard = document.querySelector(
        `#equipes .team-card.team-${teamSlug}`,
      );
      const summary = teamCard?.querySelector(".team-details-toggle");
      if (!teamCard || !summary) {
        return;
      }

      if (!teamCard.classList.contains("is-open")) {
        summary.click();
      }
      teamCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    window.setTimeout(showPage, 0);
  });
});

window.addEventListener("hashchange", showPage);
showPage();

function hexToRgbTriplet(hex) {
  const normalized = String(hex || "#ffffff").replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);

  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255,
  ].join(", ");
}

function getReadableInk(primary, secondary) {
  const rgb = hexToRgbTriplet(primary)
    .split(",")
    .map((value) => Number(value.trim()));
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;

  return brightness > 165 ? "#071018" : "#ffffff";
}

const worldCupTeams = fantasyTeamsData
  .filter((team) => team.division === "world-cup" && team.status !== "inactive")
  .map((team) => {
    const primary = team.colors?.primary || team.crest?.primary || "#111827";
    const secondary =
      team.colors?.secondary || team.crest?.secondary || "#d6dce7";

    return [
      team.name,
      team.id,
      primary,
      hexToRgbTriplet(primary),
      secondary,
      hexToRgbTriplet(secondary),
      getReadableInk(primary, secondary),
      team,
    ];
  });

function getFantasyRoster(teamId) {
  const roster = fantasyRosterByTeamId.get(teamId) || { teamId, slots: [] };
  const slots = Array.isArray(roster.slots) ? roster.slots.slice() : [];
  const benchSlots = Number(rosterRules.benchSlots ?? 3);
  const occupiedSlots = slots.filter((slot) => slot.playerId);
  const emptyBenchSlots = slots.filter(
    (slot) => slot.slotType === "substitute" && !slot.playerId,
  );
  const replacedSlots = occupiedSlots.filter(
    (slot) => slot.leftRound && slot.replacedByPlayerId,
  );
  const visibleEmptyBenchSlots = Math.max(0, benchSlots - replacedSlots.length);
  const visibleBenchSlots = emptyBenchSlots
    .slice(0, visibleEmptyBenchSlots)
    .map((slot, index) => ({
      ...slot,
      note: `${getPositionLabel("REM")} ${replacedSlots.length + index + 1}`,
    }));

  for (let index = visibleBenchSlots.length; index < visibleEmptyBenchSlots; index += 1) {
    visibleBenchSlots.push({
      slotType: "substitute",
      position: "REM",
      playerId: null,
      note: `${getPositionLabel("REM")} ${replacedSlots.length + index + 1}`,
    });
  }

  return { ...roster, slots: [...occupiedSlots, ...visibleBenchSlots] };
}

function roundIndex(round) {
  return fantasyRoundKeys.indexOf(round);
}

function isSlotActiveForRound(slot, round) {
  if (!slot?.playerId) return false;
  const current = roundIndex(round);
  const joined = slot.joinedRound ? roundIndex(slot.joinedRound) : 0;
  const left = slot.leftRound ? roundIndex(slot.leftRound) : fantasyRoundKeys.length - 1;

  return current >= joined && current <= left;
}

function getSlotPlayer(slot) {
  return slot?.playerId ? playerById.get(String(slot.playerId)) || null : null;
}

function getFantasyTeamRoundStats(teamId, round) {
  const roster = getFantasyRoster(teamId);

  return roster.slots.reduce(
    (sum, slot) => {
      if (!isSlotActiveForRound(slot, round)) return sum;
      const player = getSlotPlayer(slot);
      const stats = player?.rounds?.[round];
      if (!stats) return sum;

      sum.matchesPlayed += stats.matchesPlayed ?? 0;
      sum.goals += (stats.goals ?? 0) + (stats.penalties ?? 0);
      sum.assists += stats.assists ?? 0;
      sum.cleanSheets += stats.cleanSheets ?? 0;
      sum.points += stats.points ?? 0;
      return sum;
    },
    {
      matchesPlayed: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      points: 0,
    },
  );
}

function getFantasyTeamTotals(teamId) {
  return fantasyRoundKeys.reduce(
    (sum, round) => {
      const roundStats = getFantasyTeamRoundStats(teamId, round);
      sum.matchesPlayed += roundStats.matchesPlayed;
      sum.goals += roundStats.goals;
      sum.assists += roundStats.assists;
      sum.cleanSheets += roundStats.cleanSheets;
      sum.points += roundStats.points;
      return sum;
    },
    {
      matchesPlayed: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      points: 0,
    },
  );
}

function getFantasyTeamRoundScores(teamId) {
  return fantasyRoundKeys.map((round) => {
    const roster = getFantasyRoster(teamId);
    const hasRoundData = roster.slots.some((slot) => {
      if (!isSlotActiveForRound(slot, round)) return false;
      const player = getSlotPlayer(slot);
      return player?.rounds?.[round]?.points !== null &&
        player?.rounds?.[round]?.points !== undefined;
    });
    const score = getFantasyTeamRoundStats(teamId, round).points;
    return hasRoundData ? score : null;
  });
}

function getFantasyTeamRows() {
  const sortOrder = Array.isArray(standingsSettings.sortOrder)
    ? standingsSettings.sortOrder
    : ["points", "goals"];
  const compareStat = (a, b, statName) => {
    const first = a.totals?.[statName] ?? 0;
    const second = b.totals?.[statName] ?? 0;
    return second - first;
  };

  return worldCupTeams
    .map((team) => ({
      team,
      roundScores: getFantasyTeamRoundScores(team[1]),
      totals: getFantasyTeamTotals(team[1]),
    }))
    .sort((a, b) => {
      for (const statName of sortOrder) {
        const comparison = compareStat(a, b, statName);
        if (comparison) {
          return comparison;
        }
      }
      return a.team[0].localeCompare(b.team[0], appLocale);
    });
}

function applyStandingsHeadings() {
  const header = document.querySelector(".standings-table-head");
  if (!header) {
    return;
  }

  const cells = Array.from(header.children);
  const roundStart = 3;
  const totalPointsCell = cells[2];
  if (totalPointsCell) {
    totalPointsCell.textContent = getStatLabel("points", "PTS");
    totalPointsCell.title = "Points totaux";
  }
  fantasyRoundKeys.forEach((round, index) => {
    const cell = cells[roundStart + index];
    if (!cell) {
      return;
    }
    cell.textContent = getRoundLabel(round);
    cell.title = getRoundFullLabel(round);
    cell.hidden = standingsSettings.showRoundColumns === false;
  });

}

applyStandingsHeadings();

function safeInit(name, callback) {
  try {
    callback();
  } catch (error) {
    console.error(`Erreur pendant l'initialisation de ${name}`, error);
    document.body.dataset.lastInitError = name;
    document.body.dataset.lastInitErrorMessage = error?.message || String(error);
  }
}

function createWorldCupStandings() {
  const standings = document.querySelector(".standings-body");
  if (!standings || standings.children.length) {
    return;
  }

  const roundLabels = fantasyRoundKeys.map((round) => getRoundLabel(round));
  const fantasyRows = getFantasyTeamRows();
  const bestRoundScores = standingsSettings.bestRoundHighlightEnabled === false
    ? []
    : roundLabels.map((_, roundIndex) =>
        Math.max(
          ...fantasyRows
            .map(({ roundScores }) => roundScores[roundIndex])
            .filter((score) => score !== null),
        ),
      );

  const isSameRank = (current, previous) =>
    previous &&
    (current.totals?.points ?? 0) === (previous.totals?.points ?? 0) &&
    (current.totals?.goals ?? 0) === (previous.totals?.goals ?? 0);

  fantasyRows
    .forEach(({ team, totals, roundScores }, index) => {
      const [name, slug, primary, primaryRgb, secondary, secondaryRgb] = team;
      const entry = document.createElement("div");
      const row = document.createElement("div");
      const rank = isSameRank(fantasyRows[index], fantasyRows[index - 1])
        ? "-"
        : String(index + 1);

      entry.className = "standings-entry";
      row.className = `standings-row standings-team team-${slug}`;
      row.dataset.teamSlug = slug;
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.style.setProperty("--team-primary", primary);
      row.setAttribute("aria-label", `Voir ${name} dans la page Equipes`);
      row.style.setProperty("--team-primary-rgb", primaryRgb);
      row.style.setProperty("--team-secondary", secondary);
      row.style.setProperty("--team-secondary-rgb", secondaryRgb);
      const roundCells = roundScores
        .map((score, roundIndex) => {
          const isBest =
            standingsSettings.bestRoundHighlightEnabled !== false &&
            score !== null &&
            bestRoundScores[roundIndex] !== -Infinity &&
            score === bestRoundScores[roundIndex];
          const classes = [
            "standings-round-score",
            score === null ? "is-pending" : "",
            isBest ? "is-round-best" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const bestLabel = isBest
            ? ` title="Meilleur score de ${roundLabels[roundIndex]}"`
            : "";

          return `<span class="${classes}"${bestLabel}>${score ?? "-"}</span>`;
        })
        .join("");
      row.innerHTML = `
        <strong class="standings-rank">${rank}</strong>
        <span class="standings-team-name">
          <i aria-hidden="true"></i>
          <b>${name}</b>
        </span>
        <strong class="standings-points">${totals.points}</strong>
        ${standingsSettings.showRoundColumns === false ? "" : roundCells}
      `;

      const openTeamPage = () => {
        pendingTeamSlug = slug;
        window.location.hash = "equipes";
      };

      row.addEventListener("click", openTeamPage);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTeamPage();
        }
      });

      entry.append(row);
      standings.append(entry);
    });
}

safeInit("classements", createWorldCupStandings);

function formatTeamName(name) {
  return name.toUpperCase();
}

function getTeamMonogram(name) {
  return name
    .split(" ")
    .filter((word) => !["do", "du", "de"].includes(word.toLowerCase()))
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function rankLabel(index, points) {
  return `${index + 1}${index === 0 ? "er" : "e"} - ${points} pts`;
}

function rankingLabel(rank, points) {
  return `${rank}${rank === 1 ? "er" : "e"} - ${points} pts`;
}

function positionClass(position) {
  return {
    GB: "pos-gk",
    DF: "pos-def",
    MIL: "pos-mid",
    ATT: "pos-att",
    REM: "pos-rem",
  }[position || "REM"] || "pos-rem";
}

function getRoundCellValue(slot, player, round) {
  if (!slot?.playerId || !player || !isSlotActiveForRound(slot, round)) {
    return "-";
  }

  return formatPlayerStat(player.rounds?.[round]?.points);
}

function getSlotTotals(slot, player) {
  if (!slot?.playerId || !player) {
    return {
      matchesPlayed: null,
      goals: null,
      assists: null,
      cleanSheets: null,
      points: null,
      hasData: false,
    };
  }

  return fantasyRoundKeys.reduce(
    (sum, round) => {
      if (!isSlotActiveForRound(slot, round)) {
        return sum;
      }

      const stats = player.rounds?.[round];
      if (!stats) {
        return sum;
      }

      sum.matchesPlayed += stats.matchesPlayed ?? 0;
      sum.goals += (stats.goals ?? 0) + (stats.penalties ?? 0);
      sum.assists += stats.assists ?? 0;
      sum.cleanSheets += stats.cleanSheets ?? 0;
      sum.points += stats.points ?? 0;
      sum.hasData = true;
      return sum;
    },
    {
      matchesPlayed: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      points: 0,
      hasData: false,
    },
  );
}

function getNextFantasyRound(round) {
  const index = roundIndex(round);
  return index >= 0 ? fantasyRoundKeys[index + 1] || round : round;
}

function getSlotMovementLabel(slot, countryCode) {
  const countryName = getCountryName(countryCode);
  const playerKey = slot?.playerId !== undefined && slot?.playerId !== null
    ? String(slot.playerId)
    : null;
  const transferIn = playerKey ? transferInByPlayerId.get(playerKey) : null;
  const transferOut = playerKey ? transferOutByPlayerId.get(playerKey) : null;
  let movement = "";

  if ((slot?.replacesPlayerId || transferIn) && (slot?.joinedRound || transferIn?.effectiveRound)) {
    movement = `Entré ${getRoundLabel(slot?.joinedRound || transferIn?.effectiveRound)}`;
  } else if ((slot?.replacedByPlayerId || transferOut) && (slot?.leftRound || transferOut?.effectiveRound)) {
    const exitRound = transferOut?.effectiveRound || getNextFantasyRound(slot.leftRound);
    movement = `Sorti ${getRoundLabel(exitRound)}`;
  }

  return { countryName, movement };
}

function createMovementMarkup(slot, countryCode) {
  const { countryName, movement } = getSlotMovementLabel(slot, countryCode);
  const label = movement ? `${countryName} - ${movement}` : countryName;

  return `
    <small class="player-meta">
      <span>${label}</span>
    </small>
  `;
}

function createFantasyPlayerRow(slot, slotIndex) {
  const player = getSlotPlayer(slot);
  const hasLeftTeam = Boolean(slot?.leftRound && slot?.replacedByPlayerId);
  const position = hasLeftTeam ? "REM" : player?.position || slot?.position || "REM";
  const isEmpty = !player;
  const countryCode = player?.countryId || "FRA";
  const totals = getSlotTotals(slot, player);
  const totalGoals = totals.hasData ? totals.goals : null;
  const totalPoints = totals.hasData ? totals.points : 0;
  const movementClasses = [
    hasLeftTeam ? "is-replaced" : "",
    slot?.replacesPlayerId ? "is-substitute" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const roundCells = fantasyRoundKeys
    .map((round, index) => {
      const value = getRoundCellValue(slot, player, round);
      const inactiveClass = value === "-" ? " inactive" : "";
      return `<div class="day-cell${inactiveClass}" data-day="${index + 1}">${value}</div>`;
    })
    .join("");

  if (isEmpty) {
    const label =
      slot?.slotType === "substitute"
        ? slot.note || `Remplaçant ${slotIndex + 1}`
        : slot.note || "A definir";

    return `
      <article class="player-card ${positionClass(position)} substitute-slot">
        <div class="player-position">REM</div>
        <div class="substitute-slot-marker" aria-hidden="true">+</div>
        <div class="player-main">
          <strong>Place disponible</strong>
          <small>${label}</small>
        </div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat player-clean-sheets">-</div>
        <div class="player-stat player-points">-</div>
        ${roundCells}
      </article>
    `;
  }

  return `
    <article class="player-card ${positionClass(position)} ${movementClasses}" data-player-id="${player.id}">
      <div class="player-position">${position}</div>
      <img
        src="${getCountryAsset(countryCode, "shirt")}"
        alt=""
        width="32"
        height="32"
        loading="lazy"
        decoding="async"
      />
      <div class="player-main">
        <strong>${player.name}</strong>
        ${createMovementMarkup(slot, countryCode)}
      </div>
      <div class="player-stat">${formatPlayerStat(totals.matchesPlayed)}</div>
      <div class="player-stat">${formatPlayerStat(totalGoals)}</div>
      <div class="player-stat">${formatPlayerStat(totals.assists)}</div>
      <div class="player-stat player-clean-sheets">${formatPlayerStat(totals.cleanSheets)}</div>
      <div class="player-stat player-points">${formatPlayerStat(totalPoints)}</div>
      ${roundCells}
    </article>
  `;
}

function createFantasyTeamCard(row) {
  const [name, slug, primary, primaryRgb, secondary, secondaryRgb, ink] = row.team;
  const roster = getFantasyRoster(slug);
  const totals = row.totals;
  const rank = row.rank || 1;
  const slots = roster.slots || [];
  const playerRows = slots
    .map((slot, slotIndex) => createFantasyPlayerRow(slot, slotIndex))
    .join("");

  const article = document.createElement("article");
  article.className = `team-card team-branded team-${slug}`;
  article.style.setProperty("--team-primary", primary);
  article.style.setProperty("--team-primary-rgb", primaryRgb);
  article.style.setProperty("--team-secondary", secondary);
  article.style.setProperty("--team-secondary-rgb", secondaryRgb);
  article.style.setProperty("--team-ink", ink);
  article.innerHTML = `
    <header
      class="team-card-header team-card-summary team-details-toggle"
      role="button"
      tabindex="0"
      aria-expanded="false"
    >
      <div>
        <h4 class="team-name" data-monogram="${getTeamMonogram(name)}">${formatTeamName(name)}</h4>
      </div>
      <div class="team-card-actions">
        <div class="team-rank" aria-label="Position au classement">
          <strong>${rankingLabel(rank, totals.points)}</strong>
        </div>
        <button class="team-details-toggle-hidden" type="button" aria-expanded="false">
          Details
        </button>
      </div>
    </header>

    <div class="team-card-grid">
      <section class="team-card-block team-lineup-block">
        <div class="block-title-row">
          <div class="days-actions">
            <button class="days-toggle" type="button" aria-expanded="false">
              ${getActionLabel("showDays", "Voir journées")}
            </button>
            <div class="day-range-nav" aria-label="Périodes de journées"></div>
          </div>
        </div>
        <div
          class="squad-board"
          data-no-season-extension
          data-team-id="${slug}"
          aria-label="Composition de ${name}"
        >
          <div class="player-card player-table-head" aria-hidden="true">
            <div>Poste</div>
            <div></div>
            <div>Joueur</div>
            <div title="Matchs joués" aria-label="Matchs joués">${getStatLabel("matchesPlayed", "MJ")}</div>
            <div title="Buts, pénaltys inclus" aria-label="Buts, pénaltys inclus">${getStatLabel("goals", "G")}</div>
            <div title="Assists" aria-label="Assists">${getStatLabel("assists", "A")}</div>
            <div class="clean-sheet-heading" title="Clean Sheets" aria-label="Clean Sheets">${getStatLabel("cleanSheets", "CS")}</div>
            <div title="Points" aria-label="Points">${getStatLabel("points", "PTS")}</div>
            ${fantasyRoundKeys
              .map((round, dayIndex) => `<div class="day-cell" data-day="${dayIndex + 1}" title="${getRoundFullLabel(round)}">${getRoundLabel(round)}</div>`)
              .join("")}
          </div>
          ${playerRows}
        </div>
      </section>
    </div>
  `;

  initializeTeamCardControls(article);
  return article;
}

function createWorldCupTeams() {
  const panel = document.querySelector('[data-division-panel="world-cup"]');
  if (!panel || panel.dataset.fantasyTeamsReady === "true") {
    return;
  }

  const heading = panel.querySelector("h3");
  const rankingByTeamId = new Map(
    getFantasyTeamRows().map((row, index) => [row.team[1], index + 1]),
  );
  panel.replaceChildren();
  if (heading) panel.append(heading);
  worldCupTeams
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0], appLocale))
    .forEach((team, index) => {
      const row = {
        team,
        roundScores: getFantasyTeamRoundScores(team[1]),
        totals: getFantasyTeamTotals(team[1]),
        rank: rankingByTeamId.get(team[1]) || index + 1,
      };
      panel.append(createFantasyTeamCard(row));
    });
  panel.dataset.fantasyTeamsReady = "true";
  addTeamDetailsIndicators(panel);
  movePositionsBeforeShirts();
  addPlayerPrices();
  addCleanSheetStats();
  abbreviateTeamStatHeadings();
  applyWorldCupDayLabels();
  appendSubstituteSlots();
  appendTeamTotalRows();
}

function addTeamDetailsIndicators(root = document) {
  root.querySelectorAll(".team-card-actions").forEach((actions) => {
    if (actions.querySelector(".team-details-indicator")) {
      return;
    }

    const indicator = document.createElement("span");
    indicator.className = "team-details-indicator";
    indicator.setAttribute("aria-hidden", "true");
    actions.append(indicator);
  });
}

const legacyNationalTeams = [
  ["ALG", "Alg?rie"], ["GER", "Allemagne"], ["ENG", "Angleterre"],
  ["ARG", "Argentine"], ["AUS", "Australie"], ["AUT", "Autriche"],
  ["BEL", "Belgique"], ["BOS", "Bosnie-Herz?govine"], ["BRA", "Br?sil"],
  ["CAN", "Canada"], ["COL", "Colombie"], ["KOR", "Cor?e du Sud"],
  ["CIV", "Côte d’Ivoire"], ["CRO", "Croatie"], ["CUW", "Curaçao"],
  ["ECU", "?quateur"], ["EGY", "?gypte"], ["ESP", "Espagne"],
  ["USA", "?tats-Unis"], ["FRA", "France"], ["GHA", "Ghana"],
  ["HAI", "Ha?ti"], ["IRN", "Iran"], ["IRQ", "Irak"],
  ["JPN", "Japon"], ["JOR", "Jordanie"], ["MAR", "Maroc"],
  ["MEX", "Mexique"], ["NOR", "Norv?ge"], ["NZL", "Nouvelle-Z?lande"],
  ["UZB", "Ouzb?kistan"], ["PAN", "Panama"], ["PAR", "Paraguay"],
  ["NED", "Pays-Bas"], ["POR", "Portugal"], ["QAT", "Qatar"],
  ["COD", "RD Congo"], ["CZE", "R?publique tch?que"], ["RSA", "Afrique du Sud"],
  ["SCO", "?cosse"], ["SEN", "S?n?gal"], ["SWE", "Su?de"],
  ["SWI", "Suisse"], ["TUN", "Tunisie"], ["TUR", "Turquie"], ["URU", "Uruguay"],
  ["CPV", "Cap-Vert"], ["KSA", "Arabie saoudite"],
]
  .map(([code, name]) => [code === "MAR" ? "MOR" : code, name])
  .sort((a, b) => a[1].localeCompare(b[1], appLocale));

const nationalTeams = countries
  .map(({ id, name }) => [id, name])
  .sort((a, b) => a[1].localeCompare(b[1], appLocale));

function getGroupRoundLabel(fixture) {
  return getRoundFullLabel(getRoundForFixture(fixture), "Journee 3");
}

function initializeHomeDashboard() {
  const fixtureList = document.querySelector(".home-fixtures-list");
  if (
    !fixtureList ||
    typeof worldCupFixtures === "undefined" ||
    !worldCupFixtures.length
  ) {
    return;
  }

  const teamNames = new Map(nationalTeams);
  const now = new Date();
  const sortedFixtures = [...worldCupFixtures].sort(
    (first, second) => new Date(first.d) - new Date(second.d),
  );
  let selectedFixtures = sortedFixtures
    .filter((fixture) => new Date(fixture.d) >= now)
    .slice(0, 3);

  if (!selectedFixtures.length) {
    selectedFixtures = sortedFixtures.slice(-3);
  }

  const getTeamName = (code, placeholder) =>
    code ? teamNames.get(code) || code : placeholder || "À déterminer";

  fixtureList.innerHTML = selectedFixtures
    .map((fixture) => {
      const date = new Date(fixture.d);
      const day = new Intl.DateTimeFormat(appLocale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        timeZone: appTimeZone,
      })
        .format(date)
        .replace(".", "");
      const time = new Intl.DateTimeFormat(appLocale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: appTimeZone,
      }).format(date);
      const homeName = getTeamName(fixture.h, fixture.hp);
      const awayName = getTeamName(fixture.a, fixture.ap);
      const homeFlag = fixture.h
        ? `<img src="${getCountryAsset(fixture.h, "flag")}" alt="" width="36" height="24" loading="lazy" decoding="async" />`
        : `<span class="home-fixture-placeholder" aria-hidden="true"></span>`;
      const awayFlag = fixture.a
        ? `<img src="${getCountryAsset(fixture.a, "flag")}" alt="" width="36" height="24" loading="lazy" decoding="async" />`
        : `<span class="home-fixture-placeholder" aria-hidden="true"></span>`;
      const matchNumber =
        fixture.s === "group" ? "" : `<small>M${fixture.n}</small>`;
      const centerLabel =
        fixture.status === "finished" &&
        fixture.score?.home !== null &&
        fixture.score?.away !== null
          ? `${fixture.score.home} - ${fixture.score.away}`
          : "vs";

      return `
        <article class="home-fixture${fixture.s === "group" ? " is-group-match" : ""}">
          <div class="home-fixture-time">
            <span>${day}</span>
            <strong>${time}</strong>
          </div>
          <div class="home-fixture-teams">
            <span>${homeFlag}<b>${homeName}</b></span>
            <i>${centerLabel}</i>
            <span>${awayFlag}<b>${awayName}</b></span>
          </div>
          ${matchNumber}
        </article>
      `;
    })
    .join("");

  const firstMatch = new Date(sortedFixtures[0].d);
  const lastMatch = new Date(sortedFixtures.at(-1).d);
  const status = document.querySelector("[data-home-status]");
  const round = document.querySelector("[data-home-round]");
  const progress = document.querySelector("[data-home-progress]");

  if (competitionSettings.status) {
    status.textContent =
      statusLabels[competitionSettings.status] || competitionSettings.status;
    round.textContent = getRoundFullLabel(
      currentRoundId,
      competitionSettings.name || "Coupe du Monde",
    );
  } else if (now < firstMatch) {
    status.textContent = statusLabels.upcoming;
    round.textContent = "Avant-tournoi";
  } else if (now > lastMatch) {
    status.textContent = statusLabels.finished;
    round.textContent = getRoundFullLabel("F", "Finale");
  } else {
    const nextFixture = sortedFixtures.find((fixture) => new Date(fixture.d) >= now);
    status.textContent = statusLabels["in-progress"];
    round.textContent =
      nextFixture?.s === "group"
        ? getGroupRoundLabel(nextFixture)
        : stageLabels[nextFixture?.s] || competitionSettings.name || "Coupe du Monde";
  }

  const duration = lastMatch - firstMatch;
  const elapsed = Math.min(Math.max(now - firstMatch, 0), duration);
  progress.style.width = `${duration > 0 ? (elapsed / duration) * 100 : 0}%`;
}

safeInit("accueil", initializeHomeDashboard);

function initializeWorldCupFixtures() {
  const list = document.querySelector(".fixtures-list");
  const filters = document.querySelectorAll("[data-fixture-filter]");
  if (
    !list ||
    typeof worldCupFixtures === "undefined" ||
    !worldCupFixtures.length
  ) {
    return;
  }

  const teamNames = new Map(nationalTeams);
  const defaultFixtureFilter = getRoundFilter(
    currentRoundId || fixtureSettings.defaultFilter || nationalRoundKeys[0],
  );
  const dateLabel = new Intl.DateTimeFormat(appLocale, {
    timeZone: appTimeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateKey = new Intl.DateTimeFormat("fr-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeLabel = new Intl.DateTimeFormat(appLocale, {
    timeZone: appTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const describePlaceholder = (placeholder) => {
    if (!placeholder) {
      return "À déterminer";
    }

    const groupPlace = placeholder.match(/^([123])([A-L])$/);
    if (groupPlace) {
      const rank = { 1: "1er", 2: "2e", 3: "3e" }[groupPlace[1]];
      return `${rank} du groupe ${groupPlace[2]}`;
    }

    const bestThird = placeholder.match(/^3([A-L]+)$/);
    if (bestThird) {
      return `Meilleur 3e (${bestThird[1].split("").join("/")})`;
    }

    const winner = placeholder.match(/^W(\d+)$/);
    if (winner) {
      return `Vainqueur M${winner[1]}`;
    }

    const runnerUp = placeholder.match(/^RU(\d+)$/);
    if (runnerUp) {
      return `Perdant M${runnerUp[1]}`;
    }

    return placeholder;
  };

  const legacyMatchResults = {
    1: {
      home: {
        score: 2,
        scorers: "J. Quinones 9', R. Jimenez 67'",
        assists: "-",
        cleanSheets: "GB et d?fenseurs",
        hasCleanSheet: true,
        penaltySaves: "-",
      },
      away: {
        score: 0,
      },
    },
    2: {
      home: {
        score: 2,
        scorers: "Hwang In-beom, Oh Hyeon-gyu",
      },
      away: {
        score: 1,
        scorers: "Ladislav Krejci",
      },
    },
    3: {
      home: {
        score: 1,
        scorers: "Cyle Larin 78'",
        assists: "Promise David",
        lineup: [
          "Maxime Crepeau",
          "Alistair Johnston",
          "Luc de Fougerolles",
          "Derek Cornelius",
          "Richie Laryea",
          "Tajon Buchanan",
          "Ismael Kone",
          "Stephen Eustaquio",
          "Liam Millar",
          "Jonathan David",
          "Tani Oluwaseyi",
        ],
        substitutes: ["Cyle Larin", "Ali Ahmed", "Jonathan Osorio", "Promise David"],
      },
      away: {
        score: 1,
        scorers: "Jovo Lukic 21'",
        assists: "Vasic",
        lineup: [
          "Nikola Vasilj",
          "Amar Dedic",
          "Nikola Katic",
          "Tarik Muharemovic",
          "Sead Kolasinac",
          "Esmir Bajraktarevic",
          "Ivan Basic",
          "Benjamin Tahirovic",
          "Amar Memic",
          "Ermedin Demirovic",
          "Jovo Lukic",
        ],
        substitutes: ["Ivan Sunjic", "Kerim Alajbegovic"],
      },
    },
    4: {
      home: {
        score: 4,
        scorers: "Bobadilla c.s.c., Folarin Balogun (2), Gio Reyna",
        assists: "Christian Pulisic",
      },
      away: {
        score: 1,
        scorers: "Mauricio 73'",
      },
    },
  };

  const eventsByMatchNumber = new Map(
    matchEventsData.map((entry) => [entry.matchNumber, entry]),
  );

  const playerDetails = (id) => {
    const normalizedId = String(id);
    const player = playerById.get(normalizedId);
    return player
      ? {
          id: String(player.id),
          name: player.name,
          shortName: player.shortStrongName || player.name,
          position: player.position,
        }
      : {
          id: normalizedId,
          name: `JOUEUR ${normalizedId}`,
          shortName: `JOUEUR ${normalizedId}`,
          position: "-",
        };
  };

  const formatMinute = (event) =>
    `${event.minute}${event.addedTime ? `+${event.addedTime}` : ""}'`;

  const buildTeamMatchResult = (match, eventEntry, side) => {
    const countryId =
      side === "home" ? match.homeCountryId : match.awayCountryId;
    const cleanSheetIds = new Set(
      (eventEntry?.cleanSheets?.[
        side === "home" ? "homePlayerIds" : "awayPlayerIds"
      ] || []).map(String),
    );
    const goals = (eventEntry?.goals || []).filter(
      (goal) => goal.countryId === countryId,
    );
    const assists = goals
      .filter((goal) => goal.assistId)
      .map(
        (goal) =>
          `${playerDetails(goal.assistId).shortName} ${formatMinute(goal)}`,
      );
    const penaltySaves = (eventEntry?.penaltiesSaved || [])
      .filter((event) => event.countryId === countryId)
      .map(
        (event) =>
          `${playerDetails(event.goalkeeperId).name} ${formatMinute(event)}`,
      );

    return {
      score: match.score?.[side] ?? null,
      scorers: goals.length
        ? goals
            .map((goal) => {
              const suffix = goal.isOwnGoal
                ? " (CSC)"
                : goal.isPenalty
                  ? " (P)"
                  : "";
              return `${playerDetails(goal.scorerId).shortName} ${formatMinute(goal)}${suffix}`;
            })
            .join(", ")
        : "-",
      assists: assists.length ? assists.join(", ") : "-",
      lineup: (eventEntry?.lineups?.[side]?.starters || []).map(playerDetails),
      substitutes: (eventEntry?.lineups?.[side]?.substitutes || []).map(
        playerDetails,
      ),
      cleanSheetPlayerIds: cleanSheetIds,
      penaltySaves: penaltySaves.length ? penaltySaves.join(", ") : "-",
    };
  };

  const shootoutScore = (match) => {
    const score = match.score || {};
    if (
      !match.wentToPenalties ||
      score.penaltiesHome == null ||
      score.penaltiesAway == null
    ) {
      return null;
    }
    return { home: score.penaltiesHome, away: score.penaltiesAway };
  };

  const matchResults = Object.fromEntries(
    matchData.map((match) => {
      const eventEntry = eventsByMatchNumber.get(match.number);
      return [
        match.number,
        {
          home: buildTeamMatchResult(match, eventEntry, "home"),
          away: buildTeamMatchResult(match, eventEntry, "away"),
          shootout: shootoutScore(match),
        },
      ];
    }),
  );

  const teamIdentityMarkup = (code, placeholder) => {
    if (!code) {
      return `
        <span class="fixture-team is-placeholder">
          <i aria-hidden="true">?</i>
          <strong>${describePlaceholder(placeholder)}</strong>
        </span>
      `;
    }

    return `
      <span class="fixture-team">
        <img src="${getCountryAsset(code, "flag")}" alt="" width="36" height="24" loading="lazy" decoding="async" />
        <strong>${teamNames.get(code) || code}</strong>
      </span>
    `;
  };

  const lineupMarkup = (code, events = {}) => {
    const lineup = events.lineup || [];
    const substitutes = events.substitutes || [];
    if (!lineup.length && !substitutes.length) {
      const message =
        events.score !== null && events.score !== undefined
          ? "Les compositions seront bientôt disponibles."
          : "Les compositions seront disponibles après le match.";
      return `
        <div class="fixture-lineup is-unavailable">
          <h4>Composition</h4>
          <p>${message}</p>
        </div>
      `;
    }

    const playerRows = lineup
      .map(
        (player) => `
          <li class="${
            events.cleanSheetPlayerIds?.has(player.id)
              ? "has-clean-sheet"
              : ""
          }">
            <span>${player.position}</span>
            <img src="${getCountryAsset(code, "shirt")}" alt="" width="32" height="32" loading="lazy" decoding="async" />
            <strong>${player.name}</strong>
            ${
              events.cleanSheetPlayerIds?.has(player.id)
                ? `<em>CS</em>`
                : ""
            }
          </li>
        `,
      )
      .join("");
    const substituteRows = substitutes
      .map(
        (player) => `
          <li class="${
            events.cleanSheetPlayerIds?.has(player.id)
              ? "has-clean-sheet"
              : ""
          }">
            <span>${player.position}</span>
            <img src="${getCountryAsset(code, "shirt")}" alt="" width="32" height="32" loading="lazy" decoding="async" />
            <strong>${player.name}</strong>
            ${
              events.cleanSheetPlayerIds?.has(player.id)
                ? `<em>CS</em>`
                : ""
            }
          </li>
        `,
      )
      .join("");

    return `
      <div class="fixture-lineup">
        <h4>Composition</h4>
        <ol>${playerRows}</ol>
        <div class="fixture-substitutes">
          <h5>Remplaçants entrés</h5>
          <ul>${substituteRows}</ul>
        </div>
      </div>
    `;
  };

  const matchDetailsMarkup = (code, placeholder, events = {}) => `
    <section class="fixture-details-team">
      <header>${teamIdentityMarkup(code, placeholder)}</header>
      <div class="fixture-events-summary">
        <div>
          <b>Buteurs</b>
          <span>${events.scorers || "-"}</span>
        </div>
        <div>
          <b>Assists</b>
          <span>${events.assists || "-"}</span>
        </div>
      </div>
      ${lineupMarkup(code, events)}
      <footer class="fixture-penalty-saves">
        <b>Penalties arrêtés</b>
        <span>${events.penaltySaves || "-"}</span>
      </footer>
    </section>
  `;

  const hasFixtureDetails = (result) => {
    if (!result) {
      return false;
    }
    const sides = [result.home, result.away];
    return sides.some(
      (side) =>
        side?.score !== null ||
        side?.lineup?.length ||
        side?.substitutes?.length ||
        (side?.scorers && side.scorers !== "-") ||
        (side?.assists && side.assists !== "-") ||
        (side?.penaltySaves && side.penaltySaves !== "-"),
    );
  };

  const fixtureUnavailableMessage = (fixture) => {
    const kickoff = Date.parse(fixture.d);
    if (!Number.isNaN(kickoff) && Date.now() < kickoff) {
      return "Le match n'a pas encore commencé.";
    }
    return "Les résultats seront bientôt disponibles.";
  };

  const fixtureDetailsMarkup = (fixture, result) => {
    if (!hasFixtureDetails(result)) {
      return `
        <div class="fixture-details-unavailable">
          <p>${fixtureUnavailableMessage(fixture)}</p>
        </div>
      `;
    }

    return `
      ${matchDetailsMarkup(fixture.h, fixture.hp, result?.home)}
      ${matchDetailsMarkup(fixture.a, fixture.ap, result?.away)}
    `;
  };

  const fixtureMatchesFilter = (fixture, filter) => {
    const roundId = getRoundIdFromFilter(filter);
    if (roundSettingsById.has(roundId)) {
      if (roundId === "F") {
        const finalStages = fixtureSettings.finalsFilterIncludes || ["third", "final"];
        return finalStages.includes(fixture.s);
      }
      return getRoundForFixture(fixture) === roundId;
    }

    if (filter === "finals") {
      const finalStages = fixtureSettings.finalsFilterIncludes || ["third", "final"];
      return finalStages.includes(fixture.s);
    }

    return fixture.s === filter;
  };

  const renderFixtures = (filter = defaultFixtureFilter) => {
    const selected = worldCupFixtures
      .filter((fixture) => fixtureMatchesFilter(fixture, filter))
      .sort(
        (first, second) =>
          Date.parse(first.d) - Date.parse(second.d) || first.n - second.n,
      );
    const days = new Map();

    selected.forEach((fixture) => {
      const date = new Date(fixture.d);
      const key = dateKey.format(date);
      if (!days.has(key)) {
        days.set(key, { date, fixtures: [] });
      }
      days.get(key).fixtures.push(fixture);
    });

    list.innerHTML = Array.from(days.values())
      .map(
        ({ date, fixtures }) => `
          <section class="fixture-day">
            <header class="fixture-day-header">
              <h3>${dateLabel.format(date)}</h3>
            </header>
            <div class="fixture-day-matches">
              ${fixtures
                .map((fixture) => {
                  const result = matchResults[fixture.n];
                  const matchContext =
                    fixture.s === "group" && fixture.g
                      ? `Groupe ${fixture.g}`
                      : stageLabels[fixture.s];
                  const matchReference =
                    fixture.s === "group"
                      ? fixtureSettings.showGroupMatchNumbers
                        ? `M${fixture.n} · ${matchContext}`
                        : matchContext
                      : fixtureSettings.showKnockoutMatchNumbers === false
                        ? matchContext
                        : `M${fixture.n} · ${matchContext}`;
                  const scorePlaceholder = fixtureSettings.scorePlaceholder || "-";
                  return `
                    <article class="fixture-match" data-fixture="${fixture.n}">
                      <div
                        class="fixture-match-row"
                        role="button"
                        tabindex="0"
                        aria-expanded="false"
                        aria-controls="fixture-details-${fixture.n}"
                        aria-label="${getActionLabel("open", "Ouvrir")} les détails du match"
                      >
                        <div class="fixture-kickoff">
                          <time datetime="${fixture.d}">${timeLabel.format(
                            new Date(fixture.d),
                          )}</time>
                          <span>${matchReference}</span>
                        </div>
                        <div class="fixture-matchup">
                          ${teamIdentityMarkup(fixture.h, fixture.hp)}
                          <span class="fixture-score-center">
                            <span class="fixture-scoreline" aria-label="Score">
                              <b>${result?.home.score ?? scorePlaceholder}</b>
                              <i>-</i>
                              <b>${result?.away.score ?? scorePlaceholder}</b>
                            </span>
                            ${
                              result?.shootout
                                ? `<span class="fixture-penalty-score">TAB ${result.shootout.home}-${result.shootout.away}</span>`
                                : ""
                            }
                          </span>
                          ${teamIdentityMarkup(fixture.a, fixture.ap)}
                        </div>
                        <span class="fixture-details-toggle" aria-hidden="true"></span>
                      </div>
                      <div
                        class="fixture-details"
                        id="fixture-details-${fixture.n}"
                        aria-hidden="true"
                      >
                        <div class="fixture-details-inner">
                          ${fixtureDetailsMarkup(fixture, result)}
                        </div>
                      </div>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </section>
        `,
      )
      .join("");
  };

  filters.forEach((button) => {
    const legacyFilter = button.dataset.fixtureFilter;
    const legacyRoundId = getRoundIdFromFilter(legacyFilter);
    const round = roundSettingsById.get(legacyRoundId);
    if (round) {
      button.dataset.fixtureFilter = getRoundFilter(round.id);
      button.textContent = getRoundLabel(round.id);
      button.title = getRoundFullLabel(round.id);
      button.hidden = round.visible === false;
      button.classList.toggle(
        "is-active",
        button.dataset.fixtureFilter === defaultFixtureFilter,
      );
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.fixtureFilter === defaultFixtureFilter),
      );
    }

    button.addEventListener("click", () => {
      filters.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      renderFixtures(button.dataset.fixtureFilter);
    });
  });

  const toggleFixtureDetails = (row) => {
    if (!row) {
      return;
    }

    const match = row.closest(".fixture-match");
    const details = match?.querySelector(".fixture-details");
    if (!match || !details) {
      return;
    }

    const isOpen = match.classList.toggle("is-open");
    row.setAttribute("aria-expanded", String(isOpen));
    row.setAttribute(
      "aria-label",
      `${isOpen ? getActionLabel("close", "Fermer") : getActionLabel("open", "Ouvrir")} les détails du match`,
    );
    details.setAttribute("aria-hidden", String(!isOpen));
  };

  list.addEventListener("click", (event) => {
    toggleFixtureDetails(event.target.closest(".fixture-match-row"));
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const row = event.target.closest(".fixture-match-row");
    if (!row) {
      return;
    }

    event.preventDefault();
    toggleFixtureDetails(row);
  });

  filters.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.classList.contains("is-active")),
    );
  });
  renderFixtures(defaultFixtureFilter);
}

safeInit("resultats", initializeWorldCupFixtures);

function createNationalTeamSections() {
  const list = document.querySelector(".national-team-list");
  if (!list || list.children.length) {
    return;
  }

  nationalTeams.forEach(([code, name]) => {
    const section = document.createElement("article");

    section.className = "national-team-section has-player-table";
    section.dataset.teamCode = code;
    section.dataset.teamName = name;
    section.innerHTML = `
      <button
        class="national-team-header"
        type="button"
        aria-expanded="false"
      >
        <span class="national-team-shirt">
          <img
            src="${getCountryAsset(code, "flag")}"
            alt="Drapeau de ${name}"
            width="48"
            height="32"
            loading="lazy"
            decoding="async"
          />
        </span>
        <span class="national-team-name">${name}</span>
        <span class="national-team-indicator" aria-hidden="true"></span>
      </button>
      <div class="national-team-roster"></div>
    `;

    const toggle = section.querySelector(".national-team-header");
    toggle.addEventListener("click", () => {
      ensureNationalTeamRoster(section);

      const lineupBlock = section.querySelector(".team-lineup-block");
      const board = section.querySelector(".national-squad-board");
      const daysButton = section.querySelector(".days-toggle");

      lineupBlock?.classList.remove("is-days-open");
      board?.classList.remove("is-days-open");
      if (board) {
        clearNationalDayDetails(board);
      }
      if (daysButton) {
        daysButton.setAttribute("aria-expanded", "false");
        daysButton.textContent = getActionLabel("showDays", "Voir journées");
      }

      const isOpen = section.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    list.append(section);
  });
}

function ensureNationalTeamRoster(section) {
  if (section.dataset.rosterReady === "true") {
    return;
  }

  const code = section.dataset.teamCode;
  const name = section.dataset.teamName;
  const roster = section.querySelector(".national-team-roster");
  const positionClasses = {
    GB: "pos-gk",
    DF: "pos-def",
    MIL: "pos-mid",
    ATT: "pos-att",
  };
  const playerRows = (worldCupSquads[code] || [])
    .map(
      (player, playerIndex) => {
        const availability = getPlayerAvailability(player);
        const totals = player.totals || {};
        return `
        <article
          class="player-card ${positionClasses[player.position]}"
          data-player-index="${playerIndex}"
          data-player-id="${player.id}"
        >
          <img
            src="${getCountryAsset(code, "shirt")}"
            alt=""
            width="32"
            height="32"
            loading="lazy"
            decoding="async"
          />
          <div class="player-main">
            <strong>${player.name}</strong>
            <small>${name}</small>
          </div>
          <div class="player-availability-cell">
            <span
              class="player-availability player-availability-${availability.key}"
              title="Sélection: ${availability.selectionPercentage}%"
              data-selection="${availability.selectionPercentage}"
            >
              ${availability.label} ${availability.selectedBy}/${availability.limit}
            </span>
          </div>
          <div class="player-position">${player.position}</div>
          <div class="player-stat">${formatPlayerStat(totals.matchesPlayed)}</div>
          <div class="player-stat">${formatPlayerStat(totals.goals)}</div>
          <div class="player-stat">${formatPlayerStat(totals.assists)}</div>
          <div class="player-stat player-penalty-saves">${formatPlayerStat(totals.penaltiesSaved)}</div>
          <div class="player-stat">${formatPlayerStat(totals.points)}</div>
        </article>
      `;
      },
    )
    .join("");

  roster.innerHTML = `
    <section class="team-card-block team-lineup-block">
      <div class="block-title-row">
        <div class="days-actions">
          <button class="days-toggle" type="button" aria-expanded="false">
            ${getActionLabel("showDays", "Voir journées")}
          </button>
          <div class="national-day-selector" aria-label="Journées">
            ${nationalRoundKeys
              .map(
                (round, dayIndex) => `
                  <button
                    class="national-day-button"
                    type="button"
                    data-day="${dayIndex + 1}"
                    title="${getRoundFullLabel(round)}"
                    aria-pressed="false"
                  >
                    ${getRoundLabel(round)}
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
      <div
        class="squad-board national-squad-board"
        data-no-substitutes
        data-no-totals
        data-no-season-extension
        aria-label="Joueurs de ${name}"
      >
        <div class="player-card player-table-head">
          <div></div>
          <div>Joueur</div>
          <div class="player-availability-heading" aria-hidden="true"></div>
          <div>Poste</div>
          <div title="Matchs joués" aria-label="Matchs joués">${getStatLabel("matchesPlayed", "MJ")}</div>
          <div title="Buts, pénaltys inclus" aria-label="Buts, pénaltys inclus">${getStatLabel("goals", "G")}</div>
          <div title="Assists" aria-label="Assists">${getStatLabel("assists", "A")}</div>
          <div class="clean-sheet-heading" title="Clean Sheets" aria-label="Clean Sheets">${getStatLabel("cleanSheets", "CS")}</div>
          <div title="Pénaltys arrêtés" aria-label="Pénaltys arrêtés">${getStatLabel("penaltiesSaved", "P.ARR")}</div>
          <div title="Points" aria-label="Points">${getStatLabel("points", "PTS")}</div>
        </div>
        ${playerRows}
      </div>
    </section>
  `;

  section.dataset.rosterReady = "true";
  movePositionsBeforeShirts();
  addPlayerPrices();
  addCleanSheetStats();
  initializeNationalBoard(section.querySelector(".national-squad-board"));
}

function getPlayerAvailability(player) {
  const availability = player.availability || {};
  const limit = Number(
    availability.maximumSelections ?? competitionSettings.maxSelectionsPerPlayer ?? 2,
  );
  const selectedBy = Math.max(
    0,
    Number(availability.selectedBy ?? 0),
  );
  const isAvailable =
    availability.status === "unavailable"
      ? false
      : availability.status === "available"
        ? true
        : selectedBy < limit;

  return {
    key: isAvailable ? "available" : "unavailable",
    label: isAvailable
      ? getAvailabilityLabel("available", "Disponible")
      : getAvailabilityLabel("unavailable", "Indisponible"),
    selectedBy,
    limit,
    selectionPercentage: Number(availability.selectionPercentage ?? 0),
  };
}

let transferSearchPlayersCache = null;

function getTransferSearchPlayers() {
  if (transferSearchPlayersCache) {
    return transferSearchPlayersCache;
  }

  const countryNames = new Map(nationalTeams);
  transferSearchPlayersCache = Object.entries(worldCupSquads).flatMap(([code, squad]) =>
    squad.map((player) => {
      const points = Math.max(0, Number(player.totals?.points ?? 0));
      const availability = getPlayerAvailability(player);
      const country = countryNames.get(code) || code;

      return {
        ...player,
        code,
        country,
        normalizedName: player.name.toLocaleLowerCase(appLocale),
        normalizedCountry: country.toLocaleLowerCase(appLocale),
        points,
        pointsDisplay: String(points),
        selection: Number(player.availability?.selectionPercentage ?? 0),
        ...availability,
      };
    }),
  );

  return transferSearchPlayersCache;
}

function initializeTransferPlayerSearch() {
  const container = document.querySelector(".transfer-player-search");
  if (
    !container ||
    typeof worldCupSquads === "undefined" ||
    typeof nationalTeams === "undefined"
  ) {
    return;
  }

  const search = container.querySelector("[data-player-search]");
  const positionFilter = container.querySelector("[data-player-position]");
  const countryFilter = container.querySelector("[data-player-country]");
  const availabilityFilter = container.querySelector("[data-player-availability]");
  const sort = container.querySelector("[data-player-sort]");
  const results = container.querySelector("[data-player-results]");
  const countryNames = new Map(nationalTeams);
  const players = getTransferSearchPlayers();
  const renderBatchSize = 40;
  let filteredPlayers = [];
  let renderedCount = 0;
  let renderToken = 0;

  if (countryFilter.dataset.ready !== "true") {
    Array.from(countryNames.entries())
      .filter(([code]) => worldCupSquads[code]?.length)
      .sort((first, second) => first[1].localeCompare(second[1], appLocale))
      .forEach(([code, name]) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = name;
        countryFilter.append(option);
      });
    countryFilter.dataset.ready = "true";
  }

  const playerMarkup = (player) => `
    <article class="transfer-ranking-row">
      <b class="transfer-position transfer-position-${player.position.toLowerCase()}">${player.position}</b>
      <img src="${getCountryAsset(player.code, "shirt")}" alt="" width="32" height="32" loading="lazy" decoding="async" />
      <span class="transfer-player">
        <strong>${player.name}</strong>
        <small>${player.country}</small>
      </span>
      <span class="player-availability-cell">
        <span
          class="player-availability player-availability-${player.key}"
          title="Selection: ${player.selection}%"
          data-selection="${player.selection}"
        >
          ${player.label} ${player.selectedBy}/${player.limit}
        </span>
      </span>
      <strong class="transfer-points">${player.pointsDisplay}</strong>
    </article>
  `;

  const renderNextBatch = () => {
    if (renderedCount >= filteredPlayers.length) {
      return;
    }

    const token = renderToken;
    const nextRows = filteredPlayers
      .slice(renderedCount, renderedCount + renderBatchSize)
      .map(playerMarkup)
      .join("");
    renderedCount += renderBatchSize;

    if (token === renderToken) {
      results.insertAdjacentHTML("beforeend", nextRows);
    }
  };

  const render = () => {
    renderToken += 1;
    const query = search.value.trim().toLocaleLowerCase(appLocale);
    const selectedPosition = positionFilter.value;
    const selectedCountry = countryFilter.value;
    const selectedAvailability = availabilityFilter.value;
    const selectedSort = sort.value;

    filteredPlayers = players
      .filter(
        (player) =>
          (!query ||
            player.normalizedName.includes(query) ||
            player.normalizedCountry.includes(query)) &&
          (!selectedPosition || player.position === selectedPosition) &&
          (!selectedCountry || player.code === selectedCountry) &&
          (!selectedAvailability || player.key === selectedAvailability),
      )
      .sort((first, second) => {
        if (selectedSort === "selection-desc") {
          return (
            second.selection - first.selection ||
            second.points - first.points ||
            first.name.localeCompare(second.name, appLocale)
          );
        }
        if (selectedSort === "name-asc") {
          return first.name.localeCompare(second.name, appLocale);
        }
        return (
          second.points - first.points ||
          first.name.localeCompare(second.name, appLocale)
        );
      });

    renderedCount = 0;
    results.innerHTML = "";

    if (!filteredPlayers.length) {
      results.innerHTML = `<p class="transfer-search-empty">${getEmptyStateLabel(
        "noResults",
        "Aucun joueur trouve",
      )}</p>`;
      return;
    }

    renderNextBatch();
  };

  const scheduleRender = (() => {
    let frame = 0;
    return () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(render);
    };
  })();

  results.addEventListener("scroll", () => {
    if (results.scrollTop + results.clientHeight >= results.scrollHeight - 160) {
      renderNextBatch();
    }
  }, { passive: true });

  [search, positionFilter, countryFilter, availabilityFilter, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", scheduleRender);
  });
  render();
}

function formatTransferDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "-", datetime: "" };
  }

  const zonedParts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: appTimeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type) => zonedParts.find((item) => item.type === type)?.value || "00";

  return {
    label: `${part("day")}/${part("month")} · ${part("hour")}h${part("minute")}`,
    datetime: date.toISOString(),
  };
}

function transferOrdinal(value) {
  return `${value}${value === 1 ? "er" : "e"}`;
}

function createTransferTeamMarkup(teamId) {
  const team = fantasyTeamsData.find((item) => item.id === teamId);
  const primary = team?.colors?.primary || team?.crest?.primary || "#111827";
  const secondary = team?.colors?.secondary || team?.crest?.secondary || "#d6dce7";
  const name = team?.name || teamId;

  return `
    <span class="transfer-team" style="--club-primary:${primary};--club-secondary:${secondary}">
      <i></i>
      <strong>${name}</strong>
    </span>
  `;
}

function createTransferPlayerMarkup(playerId) {
  const player = playerById.get(String(playerId));
  if (!player) {
    return `
      <span class="history-player">
        <span><b>JOUEUR INCONNU</b><small>-</small></span>
      </span>
    `;
  }

  return `
    <span class="history-player">
      <img src="${getCountryAsset(player.countryId, "shirt")}" alt="" width="32" height="32" loading="lazy" decoding="async">
      <span>
        <b>${player.name}</b>
        <small>${getCountryName(player.countryId)}</small>
      </span>
    </span>
  `;
}

function initializeTransferHistory() {
  const list = document.querySelector(".transfer-history-list");
  const emptyStates = document.querySelectorAll(".transfer-history .transfer-empty-state");
  if (!list) {
    return;
  }

  list.replaceChildren();
  const sortedTransfers = transferData
    .slice()
    .sort((first, second) => new Date(second.date) - new Date(first.date));

  list.hidden = !sortedTransfers.length;
  emptyStates.forEach((emptyState) => {
    emptyState.hidden = Boolean(sortedTransfers.length);
    emptyState.style.display = sortedTransfers.length ? "none" : "";
    emptyState.textContent = getEmptyStateLabel(
      "noTransfers",
      emptyState.textContent,
    );
  });

  sortedTransfers.forEach((transfer) => {
    const row = document.createElement("div");
    const date = formatTransferDate(transfer.date);
    row.className = `transfer-history-row${transfer.isFreeTransfer ? " is-free-transfer" : ""}`;
    row.innerHTML = `
      <time datetime="${date.datetime}">${date.label}</time>
      ${createTransferTeamMarkup(transfer.fantasyTeamId)}
      <span class="transfer-number">${transferOrdinal(transfer.teamTransferNumber)}</span>
      <span class="transfer-round">${getRoundLabel(transfer.effectiveRound || "") || "-"}</span>
      ${createTransferPlayerMarkup(transfer.playerInId)}
      <i class="transfer-swap" aria-hidden="true">⇄</i>
      ${createTransferPlayerMarkup(transfer.playerOutId)}
    `;
    list.append(row);
  });
}

const emptyNationalDayStat = {
  matchesPlayed: null,
  penalties: null,
  goals: null,
  assists: null,
  cleanSheets: null,
  penaltiesSaved: null,
  points: null,
};

function getNationalPlayer(board, playerIndex) {
  const code = board.closest(".national-team-section")?.dataset.teamCode;
  return worldCupSquads[code]?.[playerIndex] || null;
}

function getNationalDayStat(board, dayIndex, playerIndex) {
  const player = getNationalPlayer(board, playerIndex);
  const roundKey = nationalRoundKeys[dayIndex];
  return player?.rounds?.[roundKey] || emptyNationalDayStat;
}

function setNationalGeneralStats(board) {
  board.querySelectorAll(".player-card:not(.player-table-head)").forEach((row) => {
    const stats = row.querySelectorAll(".player-stat:not(.player-price)");
    const playerIndex = Number(row.dataset.playerIndex);
    const totals = getNationalPlayer(board, playerIndex)?.totals || {};
    const values = [
      totals.matchesPlayed,
      totals.goals,
      totals.assists,
      totals.cleanSheets,
      totals.penaltiesSaved,
      totals.points,
    ];

    stats.forEach((cell, index) => {
      cell.textContent = formatPlayerStat(values[index]);
    });
    stats[stats.length - 1]?.classList.add("player-points");
  });
}

function clearNationalDayDetails(board) {
  board.classList.remove("has-selected-day");
  board.classList.remove("is-day-switching");
  board.dataset.selectedDay = "0";

  const lineupBlock = board.closest(".team-lineup-block");
  lineupBlock?.querySelectorAll(".national-day-button").forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function createNationalDayDetailCells(board) {
  if (board.querySelector(".national-day-stat")) {
    return;
  }

  const labels = [
    [getStatLabel("matchesPlayed", "MJ"), "Matchs joués"],
    [getStatLabel("penalties", "PEN"), "Pénaltys"],
    [getStatLabel("goals", "G"), "Buts"],
    [getStatLabel("assists", "A"), "Assists"],
    [getStatLabel("cleanSheets", "CS"), "Clean Sheets"],
    [getStatLabel("penaltiesSaved", "P.ARR"), "Pénaltys arrêtés"],
    [getStatLabel("points", "PTS"), "Points"],
  ];
  const header = board.querySelector(".player-table-head");
  const headerGroup = document.createElement("div");

  headerGroup.className = "national-day-stats-group national-day-heading-group";
  header.append(headerGroup);

  labels.forEach(([label, fullLabel], index) => {
    const heading = document.createElement("div");
    heading.className = "national-day-stat national-day-stat-heading";
    if (index === 0) {
      heading.classList.add("national-day-group-start");
    }
    heading.textContent = label;
    heading.title = fullLabel;
    heading.setAttribute("aria-label", fullLabel);
    headerGroup.append(heading);
  });

  board.querySelectorAll(".player-card:not(.player-table-head)").forEach((row) => {
    const group = document.createElement("div");

    group.className = "national-day-stats-group";
    row.append(group);

    labels.forEach((_, index) => {
      const cell = document.createElement("div");
      cell.className = "player-stat national-day-stat";
      if (index === 0) {
        cell.classList.add("national-day-group-start");
      }
      cell.textContent = "-";
      group.append(cell);
    });
  });
}

function showNationalDayDetails(board, selectedDay) {
  const wasOpen = board.classList.contains("has-selected-day");
  const lineupBlock = board.closest(".team-lineup-block");

  lineupBlock?.querySelectorAll(".national-day-button").forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });

  if (!selectedDay) {
    clearNationalDayDetails(board);
    return;
  }

  const selectedButton = lineupBlock?.querySelector(
    `.national-day-button[data-day="${selectedDay}"]`,
  );

  board.querySelectorAll(".player-card:not(.player-table-head)").forEach((row) => {
    const playerIndex = Number(row.dataset.playerIndex);
    const dayStats = getNationalDayStat(board, selectedDay - 1, playerIndex);
    const values = [
      dayStats.matchesPlayed,
      dayStats.penalties,
      dayStats.goals,
      dayStats.assists,
      dayStats.cleanSheets,
      dayStats.penaltiesSaved,
      dayStats.points,
    ];

    row.querySelectorAll(".national-day-stat").forEach((cell, index) => {
      cell.textContent = formatPlayerStat(values[index]);
    });
  });

  board.dataset.selectedDay = String(selectedDay);
  selectedButton?.classList.add("is-active");
  selectedButton?.setAttribute("aria-pressed", "true");

  if (!wasOpen) {
    window.requestAnimationFrame(() => {
      board.classList.add("has-selected-day");
    });
  } else {
    board.classList.remove("is-day-switching");
    void board.offsetWidth;
    board.classList.add("is-day-switching");
  }
}

function getCurrentVisibleDayNumber() {
  return Math.min(Math.max(currentDayNumber, 1), nationalRoundKeys.length || 1);
}

function scrollActiveDayButtonIntoView(lineupBlock) {
  const activeButton = lineupBlock?.querySelector(
    ".national-day-button.is-active, .day-range-button.is-active",
  );
  activeButton?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center",
  });
}

function initializeNationalBoard(board) {
  if (!board || board.dataset.controlsReady === "true") {
    return;
  }

  setNationalGeneralStats(board);

  const lineupBlock = board.closest(".team-lineup-block");
  const daysToggle = lineupBlock?.querySelector(".days-toggle");

  lineupBlock?.querySelectorAll(".national-day-button").forEach((button) => {
    button.addEventListener("click", () => {
      createNationalDayDetailCells(board);

      const day = Number(button.dataset.day);
      const selectedDay = Number(board.dataset.selectedDay);
      showNationalDayDetails(board, selectedDay === day ? 0 : day);
    });
  });

  daysToggle?.addEventListener("click", () => {
    const isOpen = !board.classList.contains("is-days-open");

    lineupBlock.classList.toggle("is-days-open", isOpen);
    board.classList.toggle("is-days-open", isOpen);
    board.scrollLeft = 0;

    if (isOpen) {
      createNationalDayDetailCells(board);
      showNationalDayDetails(board, getCurrentVisibleDayNumber());
      scrollActiveDayButtonIntoView(lineupBlock);
    } else {
      clearNationalDayDetails(board);
    }

    daysToggle.setAttribute("aria-expanded", String(isOpen));
    daysToggle.textContent = isOpen
      ? getActionLabel("hideDays", "Masquer journées")
      : getActionLabel("showDays", "Voir journées");
  });

  board.dataset.controlsReady = "true";
}

function initializeNationalDayStats() {
  document
    .querySelectorAll(".national-squad-board")
    .forEach(initializeNationalBoard);
}

function resetFantasyTeamRosters() {
  const formation = [
    ["GB", "pos-gk", "FRA"],
    ["DF", "pos-def", "BRA"],
    ["DF", "pos-def", "ARG"],
    ["DF", "pos-def", "ENG"],
    ["MIL", "pos-mid", "ESP"],
    ["MIL", "pos-mid", "POR"],
    ["MIL", "pos-mid", "GER"],
    ["MIL", "pos-mid", "NED"],
    ["ATT", "pos-att", "USA"],
    ["ATT", "pos-att", "NED"],
    ["ATT", "pos-att", "MOR"],
  ];

  document
    .querySelectorAll(
      '[data-division-panel="world-cup"] .squad-board:not(.national-squad-board)',
    )
    .forEach((board) => {
      const header = board.querySelector(".player-table-head");
      if (!header) {
        return;
      }

      board.querySelectorAll(".player-card:not(.player-table-head)").forEach((row) => {
        row.remove();
      });

      formation.forEach(([position, positionClass, shirtCode]) => {
        const row = document.createElement("article");
        row.className = `player-card ${positionClass}`;
        row.innerHTML = `
          <img
            src="${getCountryAsset(shirtCode, "shirt")}"
            alt=""
            width="32"
            height="32"
            loading="lazy"
            decoding="async"
          />
          <div class="player-main">
            <strong>FIRSTNAME LASTNAME</strong>
            <small>À définir</small>
          </div>
          <div class="player-position">${position}</div>
          <div class="player-stat">0</div>
          <div class="player-stat">0</div>
          <div class="player-stat">0</div>
          <div class="player-stat">0</div>
          ${Array.from({ length: 8 }, () => '<div class="day-cell">0</div>').join("")}
        `;
        board.append(row);
      });
    });
}

// Legacy prototype helper kept for reference; JSON rosters now render the teams.

function movePositionsBeforeShirts() {
  document.querySelectorAll(".squad-board .player-card").forEach((row) => {
    const position = row.querySelector(".player-position");

    if (position) {
      row.prepend(position);
      return;
    }

    if (row.classList.contains("player-table-head")) {
      const positionHeading = Array.from(row.children).find(
        (cell) => cell.textContent.trim() === "Poste",
      );

      if (positionHeading) {
        row.prepend(positionHeading);
      }
    }
  });
}

movePositionsBeforeShirts();

function addPlayerPrices() {
  if (competitionSettings.playerPricesEnabled === false) {
    return;
  }

  document.querySelectorAll(".squad-board").forEach((board) => {
    const header = board.querySelector(".player-table-head");

    if (header && !header.querySelector(".player-price-heading")) {
      const priceHeading = document.createElement("div");
      const matchesHeading = Array.from(header.children).find(
        (cell) => cell.textContent.trim() === "MJ",
      );

      priceHeading.className = "player-price-heading";
      priceHeading.textContent = getStatLabel("price", "£");
      header.insertBefore(priceHeading, matchesHeading);
    }

    board
      .querySelectorAll(".player-card:not(.player-table-head)")
      .forEach((row) => {
        if (row.querySelector(".player-price")) {
          return;
        }

        const price = document.createElement("div");
        const stats = row.querySelectorAll(".player-stat");
        const firstStat = stats[0];

        const points = row.querySelector(".player-points") || stats[stats.length - 1];

        points?.classList.add("player-points");

        price.className = "player-stat player-price";
        price.textContent = String(competitionSettings.defaultPlayerPrice ?? 3);
        row.insertBefore(price, firstStat);
      });
  });
}

addPlayerPrices();

function addCleanSheetStats() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    const header = board.querySelector(".player-table-head");

    if (header) {
      const matchesHeading = Array.from(header.children).find(
        (cell) => cell.textContent.trim() === "MJ",
      );
      const assistsHeading = Array.from(header.children).find(
        (cell) => cell.textContent.trim() === "Assists",
      );

      if (matchesHeading) {
        matchesHeading.title = "Matchs joués";
        matchesHeading.setAttribute("aria-label", "Matchs joués");
      }

      if (assistsHeading && !header.querySelector(".clean-sheet-heading")) {
        const cleanSheetHeading = document.createElement("div");

        cleanSheetHeading.className = "clean-sheet-heading";
        cleanSheetHeading.textContent = "CS";
        cleanSheetHeading.title = "Clean Sheets";
        cleanSheetHeading.setAttribute("aria-label", "Clean Sheets");
        assistsHeading.insertAdjacentElement("afterend", cleanSheetHeading);
      }
    }

    board
      .querySelectorAll(".player-card:not(.player-table-head)")
      .forEach((row) => {
        if (row.querySelector(".player-clean-sheets")) {
          return;
        }

        const insertionPoint = board.classList.contains("national-squad-board")
          ? row.querySelector(".player-penalty-saves")
          : row.querySelector(".player-points");
        if (!insertionPoint) {
          return;
        }

        const cleanSheets = document.createElement("div");
        cleanSheets.className = "player-stat player-clean-sheets";
        cleanSheets.textContent = "0";
        row.insertBefore(cleanSheets, insertionPoint);
      });
  });
}

addCleanSheetStats();

function abbreviateTeamStatHeadings() {
  document
    .querySelectorAll(
      '[data-division-panel="world-cup"] .squad-board:not(.national-squad-board) .player-table-head',
    )
    .forEach((header) => {
      const labels = {
        Buts: ["G", "Buts"],
        Assists: ["A", "Assists"],
        Points: ["PTS", "Points"],
      };

      Array.from(header.children).forEach((heading) => {
        const replacement = labels[heading.textContent.trim()];

        if (!replacement) {
          return;
        }

        heading.textContent = replacement[0];
        heading.title = replacement[1];
        heading.setAttribute("aria-label", replacement[1]);
      });
    });
}

abbreviateTeamStatHeadings();

document.querySelectorAll("[data-division]").forEach((button) => {
  button.addEventListener("click", () => {
    const division = button.dataset.division;
    const section = button.closest(".page-section");

    section.querySelectorAll("[data-division]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.division === division);
    });

    section.querySelectorAll("[data-division-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.divisionPanel !== division;
    });
  });
});

document.querySelectorAll(".team-details-toggle-old").forEach((button) => {
  button.addEventListener("click", () => {
    const teamCard = button.closest(".team-card");
    if (!teamCard) {
      return;
    }

    const isOpen = teamCard.classList.toggle("is-open");

    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen
      ? getActionLabel("close", "Fermer")
      : getActionLabel("open", "Ouvrir");
  });
});

const extraSeasonScores = [
  [6, 4, 5, 7, 3, 0, 8, 5, 6, 4, 7, 5, 0, 6, 5, 4, 8, 3, 7, 5, 6, 4, 0, 5, 7, 6, 4, 8, 5, 6],
  [4, 5, 0, 6, 4, 7, 3, 5, 4, 6, 0, 5, 7, 4, 3, 6, 5, 0, 4, 7, 5, 6, 3, 4, 0, 5, 6, 4, 7, 5],
  [6, 5, 4, 7, 6, 8, 5, 4, 7, 6, 9, 5, 4, 8, 6, 7, 5, 4, 6, 8, 7, 5, 9, 6, 4, 8, 7, 5, 6, 8],
  [4, 0, 5, 3, 6, 4, 5, 0, 3, 6, 4, 5, 7, 3, 0, 5, 4, 6, 3, 5, 0, 4, 6, 5, 3, 7, 4, 0, 5, 6],
  [7, 8, 6, 5, 10, 7, 6, 8, 5, 9, 7, 6, 8, 10, 5, 7, 6, 9, 8, 5, 7, 10, 6, 8, 5, 9, 7, 6, 8, 10],
  [5, 6, 8, 7, 5, 9, 6, 4, 8, 7, 5, 6, 9, 4, 7, 8, 5, 6, 4, 9, 7, 5, 8, 6, 4, 7, 9, 5, 6, 8],
  [6, 4, 7, 5, 6, 8, 4, 7, 5, 6, 4, 8, 7, 5, 6, 4, 7, 8, 5, 6, 4, 7, 5, 8, 6, 4, 7, 5, 6, 8],
  [9, 8, 11, 7, 10, 9, 8, 12, 7, 10, 9, 11, 8, 7, 12, 10, 9, 8, 11, 7, 10, 12, 8, 9, 7, 11, 10, 8, 9, 12],
  [8, 7, 10, 6, 9, 8, 7, 11, 6, 9, 8, 10, 7, 6, 11, 9, 8, 7, 10, 6, 9, 11, 7, 8, 6, 10, 9, 7, 8, 11],
  [7, 6, 9, 5, 8, 7, 6, 10, 5, 8, 7, 9, 6, 5, 10, 8, 7, 6, 9, 5, 8, 10, 6, 7, 5, 9, 8, 6, 7, 10],
  ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
];

const dayRanges = (() => {
  const totalRounds = fantasyRoundKeys.length || 8;
  const chunkSize = totalRounds <= 8 ? totalRounds : 8;

  return Array.from(
    { length: Math.ceil(totalRounds / chunkSize) },
    (_, index) => {
      const start = index * chunkSize + 1;
      const end = Math.min(start + chunkSize - 1, totalRounds);
      return {
        label: `J${start}-${end}`,
        start,
        end,
      };
    },
  );
})();

function getCurrentDayRange() {
  const day = Math.min(Math.max(currentDayNumber, 1), fantasyRoundKeys.length || 1);
  return (
    dayRanges.find((range) => day >= range.start && day <= range.end) ||
    dayRanges[0]
  );
}

function extendSeasonDays() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    const header = board.querySelector(".player-table-head");
    if (
      board.hasAttribute("data-no-season-extension") ||
      !header ||
      header.querySelectorAll(".day-cell").length >= 38
    ) {
      return;
    }

    board.querySelectorAll(".player-card").forEach((row) => {
      row.querySelectorAll(".day-cell").forEach((cell, index) => {
        cell.dataset.day = String(index + 1);
      });
    });

    for (let day = 9; day <= 38; day += 1) {
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-cell";
      dayHeader.dataset.day = String(day);
      dayHeader.textContent = `J${day}`;
      header.append(dayHeader);
    }

    board
      .querySelectorAll(".player-card:not(.player-table-head)")
      .forEach((row, rowIndex) => {
        const scores = extraSeasonScores[rowIndex] || [];

        scores.forEach((score) => {
          const cell = document.createElement("div");
          cell.className = score === "-" ? "day-cell inactive" : "day-cell";
          cell.dataset.day = String(row.querySelectorAll(".day-cell").length + 1);
          cell.textContent = score;
          row.append(cell);
        });
      });
  });
}

extendSeasonDays();

function applyWorldCupDayLabels() {
  document
    .querySelectorAll(
      '[data-division-panel="world-cup"] .player-table-head .day-cell',
    )
    .forEach((cell) => {
      const roundId = getRoundByDayNumber(Number(cell.dataset.day));

      if (!roundId) {
        return;
      }

      cell.textContent = getRoundLabel(roundId);
      cell.title = getRoundFullLabel(roundId);
      cell.setAttribute("aria-label", getRoundFullLabel(roundId));
    });
}

applyWorldCupDayLabels();
initializeNationalDayStats();

function appendSubstituteSlots() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    if (
      board.hasAttribute("data-no-substitutes") ||
      board.querySelector(".substitute-slot")
    ) {
      return;
    }

    const benchSlots = Number(rosterRules.benchSlots ?? 3);
    const existingSubstitutes = board.querySelectorAll(".pos-rem").length;
    const slotsToAdd = Math.max(0, benchSlots - existingSubstitutes);

    for (let slotNumber = 1; slotNumber <= slotsToAdd; slotNumber += 1) {
      const displayNumber = existingSubstitutes + slotNumber;
      const slot = document.createElement("article");
      slot.className = "player-card pos-rem substitute-slot";
      slot.innerHTML = `
        <div class="player-position">REM</div>
        <div class="substitute-slot-marker" aria-hidden="true">+</div>
        <div class="player-main">
          <strong>Place disponible</strong>
          <small>${getPositionLabel("REM")} ${displayNumber}</small>
        </div>
        <div class="player-stat player-price">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat player-clean-sheets">-</div>
        <div class="player-stat player-points">-</div>
      `;

      for (let day = 1; day <= fantasyRoundKeys.length; day += 1) {
        const cell = document.createElement("div");
        cell.className = "day-cell inactive";
        cell.dataset.day = String(day);
        cell.textContent = "-";
        slot.append(cell);
      }

      board.append(slot);
    }
  });
}

appendSubstituteSlots();

function appendTeamTotalRows() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    if (
      board.hasAttribute("data-no-totals") ||
      board.querySelector(".team-total-row")
    ) {
      return;
    }

    const teamId = board.dataset.teamId;
    const readNumber = (value) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    };
    const playerRows = Array.from(
      board.querySelectorAll(
        ".player-card:not(.player-table-head):not(.substitute-slot)",
      ),
    );

    const totals = teamId
      ? getFantasyTeamTotals(teamId)
      : playerRows.reduce(
          (sum, row) => {
            const stats = row.querySelectorAll(".player-stat:not(.player-price)");

            sum.matchesPlayed += readNumber(stats[0]?.textContent);
            sum.goals += readNumber(stats[1]?.textContent);
            sum.assists += readNumber(stats[2]?.textContent);
            sum.cleanSheets += readNumber(stats[3]?.textContent);
            sum.points += readNumber(stats[4]?.textContent);

            return sum;
          },
          {
            matchesPlayed: 0,
            goals: 0,
            assists: 0,
            cleanSheets: 0,
            points: 0,
          },
        );

    const dayTotals = teamId
      ? getFantasyTeamRoundScores(teamId)
      : Array.from({ length: 38 }, (_, dayIndex) =>
          playerRows.reduce((sum, row) => {
            const cell = row.querySelector(`.day-cell[data-day="${dayIndex + 1}"]`);
            return sum + readNumber(cell?.textContent);
          }, 0),
        );

    const teamName =
      board.closest(".team-card")?.querySelector(".team-name")?.textContent
        .replace(/\s+/g, " ")
        .trim() || "Équipe";
    const totalRow = document.createElement("article");
    totalRow.className = "player-card team-total-row";
    totalRow.innerHTML = `
      <div class="team-total-label">
        <strong>Totaux</strong>
      </div>
      <div class="player-stat" title="Matchs joués" aria-label="Matchs joués">${totals.matchesPlayed}</div>
      <div class="player-stat" title="Buts" aria-label="Buts">${totals.goals}</div>
      <div class="player-stat" title="Assists" aria-label="Assists">${totals.assists}</div>
      <div class="player-stat player-clean-sheets" title="Clean Sheets" aria-label="Clean Sheets">${totals.cleanSheets}</div>
      <div class="player-stat player-points" title="Points" aria-label="Points">${totals.points}</div>
    `;

    dayTotals.forEach((total, dayIndex) => {
      const cell = document.createElement("div");
      cell.className = "day-cell";
      cell.dataset.day = String(dayIndex + 1);
      cell.textContent = total === null || total === undefined ? "-" : String(total);
      totalRow.append(cell);
    });

    board.append(totalRow);
  });
}

appendTeamTotalRows();

function setActiveDayRange(lineupBlock, start, end) {
  const board = lineupBlock.querySelector(".squad-board");

  board.querySelectorAll(".day-cell").forEach((cell) => {
    const day = Number(cell.dataset.day);
    cell.classList.toggle("is-visible", day >= start && day <= end);
  });

  lineupBlock.querySelectorAll(".day-range-button").forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.start) === start && Number(button.dataset.end) === end,
    );
  });
}

document.querySelectorAll(".day-range-nav").forEach((rangeNav) => {
  const lineupBlock = rangeNav.closest(".team-lineup-block");

  dayRanges.forEach((range) => {
    const button = document.createElement("button");
    button.className = "day-range-button";
    button.type = "button";
    button.dataset.start = String(range.start);
    button.dataset.end = String(range.end);
    button.textContent = range.label;

    button.addEventListener("click", () => {
      setActiveDayRange(lineupBlock, range.start, range.end);
    });

    rangeNav.append(button);
  });

  const currentRange = getCurrentDayRange();
  setActiveDayRange(lineupBlock, currentRange.start, currentRange.end);
});

function resetDayRange(lineupBlock) {
  if (!lineupBlock) {
    return;
  }

  const currentRange = getCurrentDayRange();
  setActiveDayRange(lineupBlock, currentRange.start, currentRange.end);
}

function resetTeamDays(teamCard) {
  const lineupBlock = teamCard.querySelector(".team-lineup-block");
  const squadBoard = teamCard.querySelector(".squad-board");
  const daysButton = teamCard.querySelector(".days-toggle");

  if (lineupBlock) {
    lineupBlock.classList.remove("is-days-open");
    resetDayRange(lineupBlock);
  }

  if (squadBoard) {
    squadBoard.classList.remove("is-days-open");
  }

  if (daysButton) {
    daysButton.setAttribute("aria-expanded", "false");
    daysButton.textContent = getActionLabel("showDays", "Voir journées");
  }
}

function initializeTeamCardControls(teamCard) {
  const summary = teamCard.querySelector(".team-details-toggle");
  if (summary && summary.dataset.teamToggleReady !== "true") {
    const toggleTeam = () => {
      const card = summary.closest(".team-card");
      if (!card) {
        return;
      }

      const isOpen = card.classList.toggle("is-open");

      resetTeamDays(card);
      summary.setAttribute("aria-expanded", String(isOpen));
    };

    summary.addEventListener("click", toggleTeam);
    summary.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleTeam();
      }
    });
    summary.dataset.teamToggleReady = "true";
  }

  teamCard.querySelectorAll(".day-range-button").forEach((button) => {
    if (button.dataset.dayRangeReady === "true") {
      return;
    }
    button.addEventListener("click", () => {
      const lineupBlock = button.closest(".team-lineup-block");
      setActiveDayRange(
        lineupBlock,
        Number(button.dataset.start),
        Number(button.dataset.end),
      );
    });
    button.dataset.dayRangeReady = "true";
  });

  teamCard.querySelectorAll(".days-toggle").forEach((button) => {
    if (button.dataset.daysToggleReady === "true") {
      return;
    }
    button.addEventListener("click", () => {
      const lineupBlock = button.closest(".team-lineup-block");
      const squadBoard = lineupBlock.querySelector(".squad-board");
      const daysActions = lineupBlock.querySelector(".days-actions");
      const isOpen = squadBoard.classList.toggle("is-days-open");

      resetDayRange(lineupBlock);
      lineupBlock.classList.toggle("is-days-open", isOpen);
      if (daysActions) {
        daysActions.scrollLeft = 0;
      }
      if (isOpen) {
        scrollActiveDayButtonIntoView(lineupBlock);
      }

      button.setAttribute("aria-expanded", String(isOpen));
      button.textContent = isOpen
        ? getActionLabel("hideDays", "Masquer journées")
        : getActionLabel("showDays", "Voir journées");
    });
    button.dataset.daysToggleReady = "true";
  });
}

document.querySelectorAll(".team-details-toggle").forEach((summary) => {
  if (summary.dataset.teamToggleReady === "true") {
    return;
  }
  const toggleTeam = () => {
    const teamCard = summary.closest(".team-card");
    if (!teamCard) {
      return;
    }

    const isOpen = teamCard.classList.toggle("is-open");

    resetTeamDays(teamCard);
    summary.setAttribute("aria-expanded", String(isOpen));
  };

  summary.addEventListener("click", toggleTeam);
  summary.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleTeam();
    }
  });
  summary.dataset.teamToggleReady = "true";
});

document.querySelectorAll(".team-details-toggle-disabled").forEach((button) => {
  button.addEventListener("click", () => {
    const teamCard = button.closest(".team-card");
    const isOpen = teamCard.classList.toggle("is-open");

    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen
      ? getActionLabel("close", "Fermer")
      : getActionLabel("open", "Ouvrir");
  });
});

document.querySelectorAll(".days-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const lineupBlock = button.closest(".team-lineup-block");
    const squadBoard = lineupBlock.querySelector(".squad-board");
    const daysActions = lineupBlock.querySelector(".days-actions");
    const isOpen = squadBoard.classList.toggle("is-days-open");

    resetDayRange(lineupBlock);
    lineupBlock.classList.toggle("is-days-open", isOpen);
    if (daysActions) {
      daysActions.scrollLeft = 0;
    }
    if (isOpen) {
      scrollActiveDayButtonIntoView(lineupBlock);
    }

    if (squadBoard.classList.contains("national-squad-board")) {
      squadBoard.scrollLeft = 0;

      if (isOpen) {
        showNationalDayDetails(squadBoard, getCurrentVisibleDayNumber());
        scrollActiveDayButtonIntoView(lineupBlock);
      } else {
        clearNationalDayDetails(squadBoard);
      }
    }

    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen
      ? getActionLabel("hideDays", "Masquer journées")
      : getActionLabel("showDays", "Voir journées");
  });
});

pageStateResetReady = true;
showPage();
