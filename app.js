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
