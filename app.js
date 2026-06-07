const pages = [
  "accueil",
  "resultats",
  "equipes",
  "classements",
  "coupes",
  "joueurs",
  "transferts",
  "archives",
  "reglement",
];

function getCurrentPage() {
  const page = window.location.hash.replace("#", "") || "accueil";
  return pages.includes(page) ? page : "accueil";
}

function showPage() {
  const currentPage = getCurrentPage();

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
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    window.setTimeout(showPage, 0);
  });
});

window.addEventListener("hashchange", showPage);
showPage();

const worldCupTeams = [
  ["Alex United", "alex-united", "#d62839", "214, 40, 57", "#ffffff", "255, 255, 255", "#ffffff"],
  ["Aquarela do Brasil", "aquarela", "#168447", "22, 132, 71", "#f4d03f", "244, 208, 63", "#ffffff"],
  ["Black Chihuahua United", "black-chihuahua", "#f97316", "249, 115, 22", "#090909", "9, 9, 9", "#ffffff"],
  ["FC Brusseleir", "brusseleir", "#cf2634", "207, 38, 52", "#8b919a", "139, 145, 154", "#ffffff"],
  ["IFK Yvonedgar", "ifk-yvonedgar", "#8f2430", "143, 36, 48", "#f1c94a", "241, 201, 74", "#ffffff"],
  ["Lethal Weapon Athletic", "lethal-weapon", "#f97316", "249, 115, 22", "#20c9c3", "32, 201, 195", "#081012"],
  ["Montreal Celtic Revival", "montreal-celtic", "#c62735", "198, 39, 53", "#6f3f2b", "111, 63, 43", "#ffffff"],
  ["Nikhau FC", "nikhau", "#004d98", "0, 77, 152", "#7a1632", "122, 22, 50", "#ffffff"],
  ["Portloe Wanderers", "portloe", "#1769e0", "23, 105, 224", "#080b12", "8, 11, 18", "#ffffff"],
  ["San Mateo", "san-mateo", "#050505", "5, 5, 5", "#cbd5e1", "203, 213, 225", "#ffffff"],
  ["Schtumpik Rovers", "schtumpik", "#050505", "5, 5, 5", "#f4f4f5", "244, 244, 245", "#ffffff"],
  ["Universal Players", "universal", "#7dd3fc", "125, 211, 252", "#f5cf3d", "245, 207, 61", "#071018"],
];

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

function createWorldCupTeams() {
  const source = document.querySelector(".team-san-mateo");
  if (!source || document.querySelector(".team-aquarela")) {
    return;
  }

  let lastCard = source;

  worldCupTeams.forEach((team, index) => {
    const [name, slug, primary, primaryRgb, secondary, secondaryRgb, ink] = team;
    const teamCard = index === 0 ? source : source.cloneNode(true);
    const teamName = teamCard.querySelector(".team-name");
    const rank = teamCard.querySelector(".team-rank");
    const totals = teamCard.querySelector(".team-totals");
    const rankLabel = index === 0 ? "1er" : `${index + 1}e`;

    teamCard.className = `team-card team-branded team-${slug}`;
    teamCard.style.setProperty("--team-primary", primary);
    teamCard.style.setProperty("--team-primary-rgb", primaryRgb);
    teamCard.style.setProperty("--team-secondary", secondary);
    teamCard.style.setProperty("--team-secondary-rgb", secondaryRgb);
    teamCard.style.setProperty("--team-ink", ink);

    if (teamName) {
      teamName.textContent = formatTeamName(name);
      teamName.dataset.monogram = getTeamMonogram(name);
    }

    if (rank) {
      rank.setAttribute("aria-label", "Position et points au classement");
      rank.querySelector("strong").textContent = `${rankLabel} · 484 points`;
    }

    if (totals) {
      totals.setAttribute("aria-label", `Totaux de ${name}`);
    }

    teamCard.querySelectorAll("[aria-expanded]").forEach((element) => {
      element.setAttribute("aria-expanded", "false");
    });

    if (index > 0) {
      lastCard.insertAdjacentElement("afterend", teamCard);
      lastCard = teamCard;
    }
  });
}

createWorldCupTeams();

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

        stats[3]?.classList.add("player-points");

        price.className = "player-stat player-price";
        price.textContent = "3";
        row.insertBefore(price, firstStat);
      });
  });
}

addPlayerPrices();

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
    if (!header || header.querySelectorAll(".day-cell").length >= 38) {
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

function appendSubstituteSlots() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    if (board.querySelector(".substitute-slot")) {
      return;
    }

    for (let slotNumber = 1; slotNumber <= 2; slotNumber += 1) {
      const slot = document.createElement("article");
      slot.className = "player-card pos-rem substitute-slot";
      slot.innerHTML = `
        <div class="player-position">REM</div>
        <div class="substitute-slot-marker" aria-hidden="true">+</div>
        <div class="player-main">
          <strong>Place disponible</strong>
          <small>Remplaçant ${slotNumber + 1}</small>
        </div>
        <div class="player-stat player-price">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
        <div class="player-stat">-</div>
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
    if (board.querySelector(".team-total-row")) {
      return;
    }

    const playerRows = Array.from(
      board.querySelectorAll(
        ".player-card:not(.player-table-head):not(.substitute-slot)",
      ),
    );

    const totals = playerRows.reduce(
      (sum, row) => {
        const stats = row.querySelectorAll(".player-stat");

        sum.price += Number(stats[0]?.textContent || 0);
        sum.matches += Number(stats[1]?.textContent || 0);
        sum.goals += Number(stats[2]?.textContent || 0);
        sum.assists += Number(stats[3]?.textContent || 0);
        sum.points += Number(stats[4]?.textContent || 0);

        return sum;
      },
      { matches: 0, goals: 0, assists: 0, points: 0, price: 0 },
    );

    const dayTotals = Array.from({ length: 38 }, (_, dayIndex) =>
      playerRows.reduce((sum, row) => {
        const cell = row.querySelector(`.day-cell[data-day="${dayIndex + 1}"]`);
        const value = Number(cell?.textContent || 0);

        return Number.isNaN(value) ? sum : sum + value;
      }, 0),
    );

    const teamName =
      board.closest(".team-card")?.querySelector(".team-name")?.textContent
        .replace(/\s+/g, " ")
        .trim() || "Équipe";
    const totalRow = document.createElement("article");
    totalRow.className = "player-card team-total-row";
    totalRow.innerHTML = `
      <div class="player-position">TOT</div>
      <div class="total-marker" aria-hidden="true"></div>
      <div class="player-main">
        <strong>Totaux</strong>
        <small>${teamName}</small>
      </div>
      <div class="player-stat player-price">${totals.price}</div>
      <div class="player-stat">${totals.matches}</div>
      <div class="player-stat">${totals.goals}</div>
      <div class="player-stat">${totals.assists}</div>
      <div class="player-stat player-points">${totals.points}</div>
    `;

    dayTotals.forEach((total, dayIndex) => {
      const cell = document.createElement("div");
      cell.className = "day-cell";
      cell.dataset.day = String(dayIndex + 1);
      cell.textContent = String(total);
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
    const isOpen = squadBoard.classList.toggle("is-days-open");

    resetDayRange(lineupBlock);
    lineupBlock.classList.toggle("is-days-open", isOpen);
    button.setAttribute("aria-expanded", String(isOpen));
    button.textContent = isOpen ? "Masquer journées" : "Voir journées";
  });
});
