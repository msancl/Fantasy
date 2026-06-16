const pages = [
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

const countries = Array.isArray(window.countryData) ? window.countryData : [];
const countryById = new Map(countries.map((country) => [country.id, country]));
const playerData = Array.isArray(window.playerData) ? window.playerData : [];
const worldCupSquads = Object.fromEntries(
  playerData.map((squad) => [squad.countryId, squad.players || []]),
);
const matchData = Array.isArray(window.matchData) ? window.matchData : [];
const matchEventsData = Array.isArray(window.matchEventsData)
  ? window.matchEventsData
  : [];
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
const fantasyRosterByTeamId = new Map(
  fantasyTeamRostersData.map((roster) => [roster.teamId, roster]),
);
const nationalRoundKeys = ["J1", "J2", "J3", "R32", "R16", "QF", "SF", "F"];
const fantasyRoundKeys = ["J1", "J2", "J3", "R32", "R16", "QF", "SF", "F"];

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

function getCountryCodeFromAsset(source) {
  return source?.match(/assets\/(?:flags|shirts)\/([A-Z]{3})\.[a-z]+(?:\?.*)?$/i)?.[1];
}

function replaceCountryLabel(label, countryName) {
  if (!label) {
    return;
  }

  const suffix = label.textContent.includes(" ·")
    ? label.textContent.slice(label.textContent.indexOf(" ·"))
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
  const page = window.location.hash.replace("#", "") || "accueil";
  return pages.includes(page) ? page : "accueil";
}

const defaultPageDivisions = {
  equipes: "world-cup",
  classements: "standings-world-cup",
  coupes: "tumulus-cup",
  joueurs: "players-world-cup",
};
let pageStateResetReady = false;
let pendingTeamSlug = null;

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
      daysButton.textContent = "Voir journées";
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

  resetPageState(currentPage);

  document.querySelectorAll("[data-page]").forEach((section) => {
    section.hidden = section.dataset.page !== currentPage;
  });

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
  return fantasyRosterByTeamId.get(teamId) || { slots: [] };
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
  return worldCupTeams
    .map((team) => ({
      team,
      roundScores: getFantasyTeamRoundScores(team[1]),
      totals: getFantasyTeamTotals(team[1]),
    }))
    .sort(
      (a, b) =>
        b.totals.points - a.totals.points ||
        a.team[0].localeCompare(b.team[0], "fr"),
    );
}

function createWorldCupStandings() {
  const standings = document.querySelector(".standings-body");
  if (!standings || standings.children.length) {
    return;
  }

  const roundLabels = ["J1", "J2", "J3", "1/16", "1/8", "1/4", "1/2", "F"];
  const fantasyRows = getFantasyTeamRows();
  const bestRoundScores = roundLabels.map((_, roundIndex) =>
    Math.max(
      ...fantasyRows
        .map(({ roundScores }) => roundScores[roundIndex])
        .filter((score) => score !== null),
    ),
  );

  fantasyRows
    .forEach(({ team, totals, roundScores }, index) => {
      const [name, slug, primary, primaryRgb, secondary, secondaryRgb] = team;
      const entry = document.createElement("div");
      const row = document.createElement("div");

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
        <strong class="standings-rank">${index + 1}</strong>
        <span class="standings-team-name">
          <i aria-hidden="true"></i>
          <b>${name}</b>
        </span>
        ${roundCells}
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

createWorldCupStandings();

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

function createFantasyPlayerRow(slot, slotIndex) {
  const player = getSlotPlayer(slot);
  const position = player?.position || slot?.position || "REM";
  const isEmpty = !player;
  const countryCode = player?.countryId || "FRA";
  const totals = player?.totals || {};
  const totalGoals =
    totals.goals == null &&
    totals.penalties == null
      ? null
      : (totals.goals ?? 0) + (totals.penalties ?? 0);
  const totalPoints = totals.points ?? 0;
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
        ? slot.note || `Remplacant ${slotIndex + 1}`
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
    <article class="player-card ${positionClass(position)}" data-player-id="${player.id}">
      <img
        src="${getCountryAsset(countryCode, "shirt")}"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div class="player-main">
        <strong>${player.name}</strong>
        <small>${getCountryName(countryCode)}</small>
      </div>
      <div class="player-position">${position}</div>
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
              Voir journÃ©es
            </button>
            <div class="day-range-nav" aria-label="PÃ©riodes de journÃ©es"></div>
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
            <div title="Matchs jouÃ©s" aria-label="Matchs jouÃ©s">MJ</div>
            <div title="Buts, pÃ©naltys inclus" aria-label="Buts, pÃ©naltys inclus">G</div>
            <div title="Assists" aria-label="Assists">A</div>
            <div class="clean-sheet-heading" title="Clean Sheets" aria-label="Clean Sheets">CS</div>
            <div title="Points" aria-label="Points">PTS</div>
            ${["J1", "J2", "J3", "1/16", "1/8", "1/4", "1/2", "F"]
              .map((label, dayIndex) => `<div class="day-cell" data-day="${dayIndex + 1}">${label}</div>`)
              .join("")}
          </div>
          ${playerRows}
        </div>
      </section>
    </div>
  `;

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
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
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
}

createWorldCupTeams();

function addTeamDetailsIndicators() {
  document.querySelectorAll(".team-card-actions").forEach((actions) => {
    if (actions.querySelector(".team-details-indicator")) {
      return;
    }

    const indicator = document.createElement("span");
    indicator.className = "team-details-indicator";
    indicator.setAttribute("aria-hidden", "true");
    actions.append(indicator);
  });
}

addTeamDetailsIndicators();

const legacyNationalTeams = [
  ["ALG", "Algérie"], ["GER", "Allemagne"], ["ENG", "Angleterre"],
  ["ARG", "Argentine"], ["AUS", "Australie"], ["AUT", "Autriche"],
  ["BEL", "Belgique"], ["BOS", "Bosnie-Herzégovine"], ["BRA", "Brésil"],
  ["CAN", "Canada"], ["COL", "Colombie"], ["KOR", "Corée du Sud"],
  ["CIV", "Côte d’Ivoire"], ["CRO", "Croatie"], ["CUW", "Curaçao"],
  ["ECU", "Équateur"], ["EGY", "Égypte"], ["ESP", "Espagne"],
  ["USA", "États-Unis"], ["FRA", "France"], ["GHA", "Ghana"],
  ["HAI", "Haïti"], ["IRN", "Iran"], ["IRQ", "Irak"],
  ["JPN", "Japon"], ["JOR", "Jordanie"], ["MAR", "Maroc"],
  ["MEX", "Mexique"], ["NOR", "Norvège"], ["NZL", "Nouvelle-Zélande"],
  ["UZB", "Ouzbékistan"], ["PAN", "Panama"], ["PAR", "Paraguay"],
  ["NED", "Pays-Bas"], ["POR", "Portugal"], ["QAT", "Qatar"],
  ["COD", "RD Congo"], ["CZE", "République tchèque"], ["RSA", "Afrique du Sud"],
  ["SCO", "Écosse"], ["SEN", "Sénégal"], ["SWE", "Suède"],
  ["SWI", "Suisse"], ["TUN", "Tunisie"], ["TUR", "Turquie"], ["URU", "Uruguay"],
  ["CPV", "Cap-Vert"], ["KSA", "Arabie saoudite"],
]
  .map(([code, name]) => [code === "MAR" ? "MOR" : code, name])
  .sort((a, b) => a[1].localeCompare(b[1], "fr"));

const nationalTeams = countries
  .map(({ id, name }) => [id, name])
  .sort((a, b) => a[1].localeCompare(b[1], "fr"));

const groupRoundTwoStart = Date.parse("2026-06-18T16:00:00Z");
const groupRoundTwoEnd = Date.parse("2026-06-24T02:00:00Z");

function getGroupRoundLabel(fixture) {
  const kickoff = Date.parse(fixture.d);
  if (kickoff < groupRoundTwoStart) {
    return "Journée 1";
  }
  if (kickoff <= groupRoundTwoEnd) {
    return "Journée 2";
  }
  return "Journée 3";
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
      const day = new Intl.DateTimeFormat("fr-BE", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        timeZone: "Europe/Brussels",
      })
        .format(date)
        .replace(".", "");
      const time = new Intl.DateTimeFormat("fr-BE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Brussels",
      }).format(date);
      const homeName = getTeamName(fixture.h, fixture.hp);
      const awayName = getTeamName(fixture.a, fixture.ap);
      const homeFlag = fixture.h
        ? `<img src="${getCountryAsset(fixture.h, "flag")}" alt="" loading="lazy" />`
        : `<span class="home-fixture-placeholder" aria-hidden="true"></span>`;
      const awayFlag = fixture.a
        ? `<img src="${getCountryAsset(fixture.a, "flag")}" alt="" loading="lazy" />`
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

  if (now < firstMatch) {
    status.textContent = "La compétition approche";
    round.textContent = "Avant-tournoi";
  } else if (now > lastMatch) {
    status.textContent = "Compétition terminée";
    round.textContent = "Finale";
  } else {
    const nextFixture = sortedFixtures.find((fixture) => new Date(fixture.d) >= now);
    const roundLabels = {
      r32: "1/16",
      r16: "1/8",
      qf: "1/4",
      sf: "1/2",
      third: "3e place",
      final: "Finale",
    };
    status.textContent = "Compétition en cours";
    round.textContent =
      nextFixture?.s === "group"
        ? getGroupRoundLabel(nextFixture)
        : roundLabels[nextFixture?.s] || "Coupe du Monde";
  }

  const duration = lastMatch - firstMatch;
  const elapsed = Math.min(Math.max(now - firstMatch, 0), duration);
  progress.style.width = `${duration > 0 ? (elapsed / duration) * 100 : 0}%`;
}

initializeHomeDashboard();

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
  const stageLabels = {
    group: "Phase de groupes",
    r32: "Seizièmes de finale",
    r16: "Huitièmes de finale",
    qf: "Quarts de finale",
    sf: "Demi-finales",
    third: "Match pour la 3e place",
    final: "Finale",
  };
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateKey = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Brussels",
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
        assists: "—",
        cleanSheets: "GB et défenseurs",
        hasCleanSheet: true,
        penaltySaves: "—",
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
    const player = playerById.get(id);
    return player
      ? { id: player.id, name: player.name, position: player.position }
      : { id, name: `JOUEUR ${id}`, position: "-" };
  };

  const formatMinute = (event) =>
    `${event.minute}${event.addedTime ? `+${event.addedTime}` : ""}'`;

  const buildTeamMatchResult = (match, eventEntry, side) => {
    const countryId =
      side === "home" ? match.homeCountryId : match.awayCountryId;
    const cleanSheetIds = new Set(
      eventEntry?.cleanSheets?.[
        side === "home" ? "homePlayerIds" : "awayPlayerIds"
      ] || [],
    );
    const goals = (eventEntry?.goals || []).filter(
      (goal) => goal.countryId === countryId,
    );
    const assists = goals
      .filter((goal) => goal.assistId)
      .map((goal) => playerDetails(goal.assistId).name);
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
              return `${playerDetails(goal.scorerId).name} ${formatMinute(goal)}${suffix}`;
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

  const matchResults = Object.fromEntries(
    matchData.map((match) => {
      const eventEntry = eventsByMatchNumber.get(match.number);
      return [
        match.number,
        {
          home: buildTeamMatchResult(match, eventEntry, "home"),
          away: buildTeamMatchResult(match, eventEntry, "away"),
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
        <img src="${getCountryAsset(code, "flag")}" alt="" loading="lazy" />
        <strong>${teamNames.get(code) || code}</strong>
      </span>
    `;
  };

  const getPlayerPosition = (code, playerName) => {
    if (!code || typeof worldCupSquads === "undefined") {
      return "—";
    }

    const normalizedName = playerName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const player = (worldCupSquads[code] || []).find(
      (item) =>
        item.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() === normalizedName,
    );

    return player?.position || "—";
  };

  const placeholderLineup = [
    { name: "FIRSTNAME LASTNAME", position: "GB" },
    { name: "FIRSTNAME LASTNAME", position: "DF" },
    { name: "FIRSTNAME LASTNAME", position: "DF" },
    { name: "FIRSTNAME LASTNAME", position: "DF" },
    { name: "FIRSTNAME LASTNAME", position: "DF" },
    { name: "FIRSTNAME LASTNAME", position: "MIL" },
    { name: "FIRSTNAME LASTNAME", position: "MIL" },
    { name: "FIRSTNAME LASTNAME", position: "MIL" },
    { name: "FIRSTNAME LASTNAME", position: "ATT" },
    { name: "FIRSTNAME LASTNAME", position: "ATT" },
    { name: "FIRSTNAME LASTNAME", position: "ATT" },
  ];
  const placeholderSubstitutes = [
    { name: "FIRSTNAME LASTNAME", position: "DF" },
    { name: "FIRSTNAME LASTNAME", position: "MIL" },
    { name: "FIRSTNAME LASTNAME", position: "ATT" },
  ];
  const normalizeLineupPlayer = (code, player) =>
    typeof player === "string"
      ? { name: player, position: getPlayerPosition(code, player) }
      : player;

  const lineupMarkup = (code, events = {}) => {
    const lineup = (events.lineup?.length ? events.lineup : placeholderLineup).map(
      (player) => normalizeLineupPlayer(code, player),
    );
    const substitutes = (
      events.substitutes?.length ? events.substitutes : placeholderSubstitutes
    ).map((player) => normalizeLineupPlayer(code, player));
    const playerRows = lineup
      .map(
        (player) => `
          <li class="${
            events.cleanSheetPlayerIds?.has(player.id)
              ? "has-clean-sheet"
              : ""
          }">
            <span>${player.position}</span>
            <img src="${getCountryAsset(code, "shirt")}" alt="" loading="lazy" />
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
            <img src="${getCountryAsset(code, "shirt")}" alt="" loading="lazy" />
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
          <span>${events.scorers || "—"}</span>
        </div>
        <div>
          <b>Assists</b>
          <span>${events.assists || "—"}</span>
        </div>
      </div>
      ${lineupMarkup(code, events)}
      <footer class="fixture-penalty-saves">
        <b>Penalties arrêtés</b>
        <span>${events.penaltySaves || "—"}</span>
      </footer>
    </section>
  `;

  const fixtureMatchesFilter = (fixture, filter) => {
    if (filter.startsWith("group-")) {
      if (fixture.s !== "group") {
        return false;
      }

      const kickoff = Date.parse(fixture.d);
      if (filter === "group-1") {
        return kickoff < groupRoundTwoStart;
      }
      if (filter === "group-2") {
        return kickoff >= groupRoundTwoStart && kickoff <= groupRoundTwoEnd;
      }
      return kickoff > groupRoundTwoEnd;
    }

    if (filter === "finals") {
      return fixture.s === "third" || fixture.s === "final";
    }

    return fixture.s === filter;
  };

  const renderFixtures = (filter = "group-1") => {
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
                      ? matchContext
                      : `M${fixture.n} · ${matchContext}`;
                  return `
                    <article class="fixture-match" data-fixture="${fixture.n}">
                      <div
                        class="fixture-match-row"
                        role="button"
                        tabindex="0"
                        aria-expanded="false"
                        aria-controls="fixture-details-${fixture.n}"
                        aria-label="Ouvrir les détails du match"
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
                              <b>${result?.home.score ?? "-"}</b>
                              <i>–</i>
                              <b>${result?.away.score ?? "-"}</b>
                            </span>
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
                          ${matchDetailsMarkup(
                          fixture.h,
                          fixture.hp,
                          result?.home,
                          )}
                          ${matchDetailsMarkup(
                          fixture.a,
                          fixture.ap,
                          result?.away,
                          )}
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
      `${isOpen ? "Fermer" : "Ouvrir"} les détails du match`,
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
  renderFixtures();
}

initializeWorldCupFixtures();

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
        daysButton.textContent = "Voir journées";
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
            loading="lazy"
            decoding="async"
          />
          <div class="player-main">
            <strong>${player.name}</strong>
            <small>${name}</small>
          </div>
          <div class="player-availability-cell">
            <span class="player-availability player-availability-${availability.key}">
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
            Voir journées
          </button>
          <div class="national-day-selector" aria-label="Journées">
            ${["J1", "J2", "J3", "1/16", "1/8", "1/4", "1/2", "F"]
              .map(
                (label, dayIndex) => `
                  <button
                    class="national-day-button"
                    type="button"
                    data-day="${dayIndex + 1}"
                    aria-pressed="false"
                  >
                    ${label}
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
          <div title="Matchs joués" aria-label="Matchs joués">MJ</div>
          <div title="Buts, pénaltys inclus" aria-label="Buts, pénaltys inclus">G</div>
          <div title="Assists" aria-label="Assists">A</div>
          <div class="clean-sheet-heading" title="Clean Sheets" aria-label="Clean Sheets">CS</div>
          <div title="Pénaltys arrêtés" aria-label="Pénaltys arrêtés">P.ARR</div>
          <div title="Points" aria-label="Points">Pts</div>
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

createNationalTeamSections();

function getPlayerAvailability(player) {
  const availability = player.availability || {};
  const limit = Number(availability.maximumSelections ?? 2);
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
    label: isAvailable ? "Disponible" : "Indisponible",
    selectedBy,
    limit,
  };
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
  const players = Object.entries(worldCupSquads).flatMap(([code, squad]) =>
    squad.map((player) => ({
      ...player,
      code,
      country: countryNames.get(code) || code,
      points: Number(player.totals?.points ?? 0),
      pointsDisplay: formatPlayerStat(player.totals?.points),
      selection: Number(player.availability?.selectionPercentage ?? 0),
      ...getPlayerAvailability(player),
    })),
  );

  Array.from(countryNames.entries())
    .filter(([code]) => worldCupSquads[code]?.length)
    .sort((first, second) => first[1].localeCompare(second[1], "fr"))
    .forEach(([code, name]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      countryFilter.append(option);
    });

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase("fr");
    const selectedPosition = positionFilter.value;
    const selectedCountry = countryFilter.value;
    const selectedAvailability = availabilityFilter.value;
    const selectedSort = sort.value;
    const filtered = players
      .filter(
        (player) =>
          (!query ||
            player.name.toLocaleLowerCase("fr").includes(query) ||
            player.country.toLocaleLowerCase("fr").includes(query)) &&
          (!selectedPosition || player.position === selectedPosition) &&
          (!selectedCountry || player.code === selectedCountry) &&
          (!selectedAvailability || player.key === selectedAvailability),
      )
      .sort((first, second) => {
        if (selectedSort === "selection-desc") {
          return (
            second.selection - first.selection ||
            second.points - first.points ||
            first.name.localeCompare(second.name, "fr")
          );
        }
        if (selectedSort === "name-asc") {
          return first.name.localeCompare(second.name, "fr");
        }
        return second.points - first.points || first.name.localeCompare(second.name, "fr");
      });

    results.innerHTML = filtered
      .map(
        (player) => `
          <article class="transfer-ranking-row">
            <b class="transfer-position transfer-position-${player.position.toLowerCase()}">${player.position}</b>
            <img src="${getCountryAsset(player.code, "shirt")}" alt="" loading="lazy" decoding="async" />
            <span class="transfer-player">
              <strong>${player.name}</strong>
              <small>${player.country}</small>
            </span>
            <span class="player-availability-cell">
              <span class="player-availability player-availability-${player.key}">
                ${player.label} ${player.selectedBy}/${player.limit}
              </span>
            </span>
            <strong class="transfer-points">${player.pointsDisplay}</strong>
          </article>
        `,
      )
      .join("");
    if (!filtered.length) {
      results.innerHTML = '<p class="transfer-search-empty">Aucun joueur trouvé</p>';
    }
  };

  [search, positionFilter, countryFilter, availabilityFilter, sort].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", render);
  });
  render();
}

initializeTransferPlayerSearch();

function formatTransferDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "-", datetime: "" };
  }

  return {
    label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")} · ${String(date.getHours()).padStart(2, "0")}h${String(date.getMinutes()).padStart(2, "0")}`,
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
      <img src="${getCountryAsset(player.countryId, "shirt")}" alt="" loading="lazy" decoding="async">
      <span>
        <b>${player.name}</b>
        <small>${getCountryName(player.countryId)}</small>
      </span>
    </span>
  `;
}

function initializeTransferHistory() {
  const list = document.querySelector(".transfer-history-list");
  const emptyState = document.querySelector(".transfer-history .transfer-empty-state");
  if (!list) {
    return;
  }

  list.replaceChildren();
  const sortedTransfers = transferData
    .slice()
    .sort((first, second) => new Date(second.date) - new Date(first.date));

  list.hidden = !sortedTransfers.length;
  if (emptyState) {
    emptyState.hidden = Boolean(sortedTransfers.length);
  }

  sortedTransfers.forEach((transfer) => {
    const row = document.createElement("div");
    const date = formatTransferDate(transfer.date);
    row.className = `transfer-history-row${transfer.isFreeTransfer ? " is-free-transfer" : ""}`;
    row.innerHTML = `
      <time datetime="${date.datetime}">${date.label}</time>
      ${createTransferTeamMarkup(transfer.fantasyTeamId)}
      <span class="transfer-number">${transferOrdinal(transfer.teamTransferNumber)}</span>
      ${createTransferPlayerMarkup(transfer.playerInId)}
      <i class="transfer-swap" aria-hidden="true">⇄</i>
      ${createTransferPlayerMarkup(transfer.playerOutId)}
    `;
    list.append(row);
  });
}

initializeTransferHistory();

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
    ["MJ", "Matchs joués"],
    ["Pen", "Pénaltys"],
    ["G", "Buts"],
    ["A", "Assists"],
    ["CS", "Clean Sheets"],
    ["P.ARR", "Pénaltys arrêtés"],
    ["Pts", "Points"],
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
      showNationalDayDetails(board, 1);
    } else {
      clearNationalDayDetails(board);
    }

    daysToggle.setAttribute("aria-expanded", String(isOpen));
    daysToggle.textContent = isOpen ? "Masquer journées" : "Voir journées";
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
  document.querySelectorAll(".squad-board").forEach((board) => {
    const header = board.querySelector(".player-table-head");

    if (header && !header.querySelector(".player-price-heading")) {
      const priceHeading = document.createElement("div");
      const matchesHeading = Array.from(header.children).find(
        (cell) => cell.textContent.trim() === "MJ",
      );

      priceHeading.className = "player-price-heading";
      priceHeading.textContent = "£";
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
        price.textContent = "3";
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
    button.textContent = isOpen ? "Masquer" : "Détails";
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

const dayRanges = [
  { label: "J1-8", start: 1, end: 8 },
  { label: "J9-16", start: 9, end: 16 },
  { label: "J17-24", start: 17, end: 24 },
  { label: "J25-32", start: 25, end: 32 },
  { label: "J33-38", start: 33, end: 38 },
];

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
  const knockoutRounds = {
    4: { short: "1/16", full: "Seizièmes de finale" },
    5: { short: "1/8", full: "Huitièmes de finale" },
    6: { short: "1/4", full: "Quarts de finale" },
    7: { short: "1/2", full: "Demi-finales" },
    8: { short: "F", full: "Finale" },
  };

  document
    .querySelectorAll(
      '[data-division-panel="world-cup"] .player-table-head .day-cell',
    )
    .forEach((cell) => {
      const round = knockoutRounds[Number(cell.dataset.day)];

      if (!round) {
        return;
      }

      cell.textContent = round.short;
      cell.title = round.full;
      cell.setAttribute("aria-label", round.full);
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

    for (let slotNumber = 1; slotNumber <= 3; slotNumber += 1) {
      const slot = document.createElement("article");
      slot.className = "player-card pos-rem substitute-slot";
      slot.innerHTML = `
        <div class="player-position">REM</div>
        <div class="substitute-slot-marker" aria-hidden="true">+</div>
        <div class="player-main">
          <strong>Place disponible</strong>
          <small>Remplaçant ${slotNumber}</small>
        </div>
        <div class="player-stat player-price">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat player-clean-sheets">-</div>
        <div class="player-stat player-points">-</div>
      `;

      for (let day = 1; day <= 38; day += 1) {
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

  setActiveDayRange(lineupBlock, dayRanges[0].start, dayRanges[0].end);
});

function resetDayRange(lineupBlock) {
  if (!lineupBlock) {
    return;
  }

  setActiveDayRange(lineupBlock, dayRanges[0].start, dayRanges[0].end);
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
    daysButton.textContent = "Voir journées";
  }
}

function initializeTeamCardControls(teamCard) {
  teamCard.querySelectorAll(".day-range-button").forEach((button) => {
    button.addEventListener("click", () => {
      const lineupBlock = button.closest(".team-lineup-block");
      setActiveDayRange(
        lineupBlock,
        Number(button.dataset.start),
        Number(button.dataset.end),
      );
    });
  });

  teamCard.querySelectorAll(".days-toggle").forEach((button) => {
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

      button.setAttribute("aria-expanded", String(isOpen));
      button.textContent = isOpen ? "Masquer journées" : "Voir journées";
    });
  });
}

document.querySelectorAll(".team-details-toggle").forEach((summary) => {
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
});

document.querySelectorAll(".team-details-toggle-disabled").forEach((button) => {
  button.addEventListener("click", () => {
    const teamCard = button.closest(".team-card");
    const isOpen = teamCard.classList.toggle("is-open");

    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen ? "Masquer" : "Détails";
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

    if (squadBoard.classList.contains("national-squad-board")) {
      squadBoard.scrollLeft = 0;

      if (isOpen) {
        showNationalDayDetails(squadBoard, 1);
      } else {
        clearNationalDayDetails(squadBoard);
      }
    }

    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen ? "Masquer journées" : "Voir journées";
  });
});

pageStateResetReady = true;
showPage();
