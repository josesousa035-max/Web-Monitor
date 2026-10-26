const fold = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const lat = r(b.lat - a.lat),
    lon = r(b.lon - a.lon);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function locate(listing, zone) {
  if (zone.mode === "radius") {
    if (!listing.coordinates || !zone.center)
      return {
        match: false,
        precision: "unknown",
        reason: "Sem coordenadas: não confirma inclusão no raio",
      };
    const distance = distanceKm(zone.center, listing.coordinates);
    const exact =
      listing.coordinates.precision === "exact" &&
      zone.center.precision === "exact";
    return {
      match: exact && distance <= zone.radiusKm,
      precision: exact ? "exact" : "approximate",
      distanceKm: distance,
      reason: exact
        ? "Distância calculada"
        : "Coordenadas aproximadas: inclusão não confirmada",
    };
  }
  const haystack = ` ${fold([listing.municipality, listing.location].filter(Boolean).join(" "))} `;
  const municipality = fold(zone.municipality);
  const localities = zone.localities.map(fold);
  const match =
    haystack.includes(` ${municipality} `) &&
    (!localities.length || localities.some((x) => haystack.includes(` ${x} `)));
  return {
    match,
    precision: match ? "textual" : "unknown",
    reason: match
      ? "Correspondência textual, sem validação de limites administrativos"
      : "Localização não confirmada nesta zona",
  };
}
function zoneMatches(listing, zone) {
  const geography = locate(listing, zone);
  const criteria =
    (!listing.transaction ||
      listing.transaction === "unknown" ||
      listing.transaction === zone.transaction) &&
    (zone.minPriceCents == null ||
      (listing.priceCents !== null &&
        listing.priceCents >= zone.minPriceCents)) &&
    (zone.maxPriceCents == null ||
      (listing.priceCents !== null &&
        listing.priceCents <= zone.maxPriceCents)) &&
    (zone.minArea == null ||
      (listing.area !== null && listing.area >= zone.minArea)) &&
    (!zone.typology || fold(listing.typology) === fold(zone.typology)) &&
    (!zone.propertyType ||
      fold(listing.propertyType).includes(fold(zone.propertyType)));
  return {
    ...geography,
    match: geography.match && criteria,
    criteriaMatch: criteria,
    transactionConfirmed: listing.transaction === zone.transaction,
  };
}
if (typeof module !== "undefined" && module.exports)
  module.exports = { fold, distanceKm, locate, zoneMatches };
else window.WebMonitorGeo = { fold, distanceKm, locate, zoneMatches };
