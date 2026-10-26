function matches(listing, search = {}) {
  const text =
    `${listing.title} ${listing.location} ${listing.reference}`.toLocaleLowerCase(
      "pt-PT",
    );
  return (
    (!search.query || text.includes(search.query.toLocaleLowerCase("pt-PT"))) &&
    (!search.source || listing.source === search.source) &&
    (search.maxPriceCents == null ||
      (listing.priceCents !== null &&
        listing.priceCents <= search.maxPriceCents)) &&
    (search.minArea == null ||
      (listing.area !== null && listing.area >= search.minArea))
  );
}
function evaluate(before, after, config, seen = []) {
  const known = new Set(seen);
  const alerts = [];
  for (const x of after) {
    const old = before.get(x.key);
    const reasons = [];
    if (config.newEnabled !== false && !old) reasons.push("new");
    if (
      config.dropEnabled !== false &&
      old?.priceCents != null &&
      x.priceCents != null &&
      x.priceCents < old.priceCents
    )
      reasons.push("drop");
    if (
      config.thresholdEnabled &&
      x.priceCents != null &&
      x.priceCents <= config.thresholdCents &&
      (!old || old.priceCents == null || old.priceCents > config.thresholdCents)
    )
      reasons.push("threshold");
    for (const search of config.searches || [])
      if (
        search.enabled &&
        matches(x, search) &&
        (!old || !matches(old, search))
      )
        reasons.push(`search:${search.id}`);
    for (const reason of reasons) {
      const id = `${reason}:${x.key}:${x.lastSeen}:${x.priceCents}`;
      if (!known.has(id)) {
        known.add(id);
        alerts.push({
          id,
          key: x.key,
          title: x.title,
          reason,
          date: x.lastSeen,
          priceCents: x.priceCents,
        });
      }
    }
  }
  return alerts;
}
function duplicates(listing, all) {
  const location = listing.location.trim().toLocaleLowerCase("pt-PT");
  if (!location || !listing.area || listing.priceCents === null) return [];
  return all
    .filter(
      (x) =>
        x.source !== listing.source &&
        (!(
          x.areaType &&
          listing.areaType &&
          x.areaType !== "unknown" &&
          listing.areaType !== "unknown"
        ) ||
          x.areaType === listing.areaType) &&
        (!(
          x.transaction &&
          listing.transaction &&
          x.transaction !== "unknown" &&
          listing.transaction !== "unknown"
        ) ||
          x.transaction === listing.transaction) &&
        x.location.trim().toLocaleLowerCase("pt-PT") === location &&
        x.typology &&
        x.typology === listing.typology &&
        x.area &&
        Math.abs(x.area - listing.area) / listing.area <= 0.03 &&
        x.priceCents !== null &&
        Math.abs(x.priceCents - listing.priceCents) /
          Math.max(1, listing.priceCents) <=
          0.05,
    )
    .map((x) => ({
      key: x.key,
      title: x.title,
      source: x.source,
      reasons: [
        "Localização textual e tipologia iguais",
        "Área dentro de 3% e preço dentro de 5%",
        "Sugestão sem confirmação de morada ou identidade",
      ],
    }));
}
function validateSettings(
  value,
  safeUrl,
  catalog = require("./catalog.cjs").initialSources(),
) {
  if (!value || typeof value.alerts !== "boolean" || !value.urls)
    throw Error("Configuração inválida");
  const urls = {};
  for (const name of catalog.map((x) => x.id)) {
    if (value.urls[name] === undefined)
      value.urls[name] = catalog.find((x) => x.id === name).searchUrl;
    if (typeof value.urls[name] !== "string") throw Error("URL inválido");
    urls[name] = value.urls[name] ? safeUrl(value.urls[name]) : "";
  }
  const thresholdCents = value.thresholdCents ?? null;
  if (
    thresholdCents !== null &&
    (!Number.isSafeInteger(thresholdCents) || thresholdCents < 0)
  )
    throw Error("Limite de preço inválido");
  if (value.thresholdEnabled && thresholdCents === null)
    throw Error("Defina o limite de preço");
  const searches = value.searches || [];
  if (!Array.isArray(searches) || searches.length > 100)
    throw Error("Máximo de 100 pesquisas");
  const ids = new Set();
  for (const s of searches) {
    if (
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      typeof s.query !== "string" ||
      !["", ...catalog.map((x) => x.id)].includes(s.source) ||
      typeof s.enabled !== "boolean"
    )
      throw Error("Pesquisa inválida");
    if (
      s.maxPriceCents != null &&
      (!Number.isSafeInteger(s.maxPriceCents) || s.maxPriceCents < 0)
    )
      throw Error("Preço da pesquisa inválido");
    if (s.minArea != null && (!Number.isFinite(s.minArea) || s.minArea <= 0))
      throw Error("Área da pesquisa inválida");
    ids.add(s.id);
  }
  return {
    urls,
    alerts: value.alerts,
    newEnabled: value.newEnabled !== false,
    dropEnabled: value.dropEnabled !== false,
    thresholdEnabled: !!value.thresholdEnabled,
    thresholdCents,
    searches,
  };
}
module.exports = { matches, evaluate, duplicates, validateSettings };
