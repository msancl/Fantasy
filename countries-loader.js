(async () => {
  try {
    const response = await fetch(`data/countries.json?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const countries = await response.json();
    if (!Array.isArray(countries) || !countries.length) {
      throw new Error("Le fichier countries.json est vide ou invalide.");
    }

    window.countryData = countries;

    const appScript = document.createElement("script");
    appScript.src = "app.js?v=84";
    appScript.defer = true;
    document.head.append(appScript);
  } catch (error) {
    console.error("Impossible de charger les pays.", error);
    document.body.dataset.countryLoadError = "true";
  }
})();
