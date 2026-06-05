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

function appendTeamTotalRows() {
  document.querySelectorAll(".squad-board").forEach((board) => {
    if (board.querySelector(".team-total-row")) {
      return;
    }

    const playerRows = Array.from(
      board.querySelectorAll(".player-card:not(.player-table-head)"),
    );

    const totals = playerRows.reduce(
      (sum, row) => {
        const stats = row.querySelectorAll(".player-stat");

        sum.matches += Number(stats[0]?.textContent || 0);
        sum.goals += Number(stats[1]?.textContent || 0);
        sum.assists += Number(stats[2]?.textContent || 0);
        sum.points += Number(stats[3]?.textContent || 0);

        return sum;
      },
      { matches: 0, goals: 0, assists: 0, points: 0 },
    );

    const dayTotals = Array.from({ length: 38 }, (_, dayIndex) =>
      playerRows.reduce((sum, row) => {
        const cell = row.querySelector(`.day-cell[data-day="${dayIndex + 1}"]`);
        const value = Number(cell?.textContent || 0);

        return Number.isNaN(value) ? sum : sum + value;
      }, 0),
    );

    const totalRow = document.createElement("article");
    totalRow.className = "player-card team-total-row";
    totalRow.innerHTML = `
      <div class="total-marker" aria-hidden="true"></div>
      <div class="player-main">
        <strong>Totaux</strong>
        <small>San Mateo</small>
      </div>
      <div class="player-position">TOT</div>
      <div class="player-stat">${totals.matches}</div>
      <div class="player-stat">${totals.goals}</div>
      <div class="player-stat">${totals.assists}</div>
      <div class="player-stat">${totals.points}</div>
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
