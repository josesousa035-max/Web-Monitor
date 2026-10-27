// Presence is separate from normalized defaults: missing data is not a deletion.
const FIELDS = [
  "canonicalUrl",
  "publishedAt",
  "sourceUpdatedAt",
  "originalPrice",
  "originalCurrency",
  "municipality",
  "country",
  "coordinates",
  "transaction",
  "areaType",
  "title",
  "url",
  "description",
  "location",
  "priceCents",
  "area",
  "typology",
  "propertyType",
];
const LABELS = {
  canonicalUrl: "URL canónico",
  publishedAt: "Publicação",
  sourceUpdatedAt: "Atualização na fonte",
  originalPrice: "Preço original",
  originalCurrency: "Moeda original",
  municipality: "Concelho",
  country: "País",
  coordinates: "Coordenadas",
  transaction: "Negócio",
  areaType: "Tipo de área",
  title: "Título",
  url: "URL",
  description: "Descrição",
  location: "Localização",
  priceCents: "Preço",
  area: "Área",
  typology: "Tipologia",
  propertyType: "Tipo de imóvel",
};
function observedFields(input) {
  if (Array.isArray(input.observedFields)) {
    if (input.observedFields.some((x) => !FIELDS.includes(x)))
      throw Error("Campos observados inválidos");
    return [...new Set(input.observedFields)];
  }
  return FIELDS.filter((field) => {
    const property =
      field === "priceCents"
        ? input.priceCents !== undefined
          ? "priceCents"
          : "price"
        : field;
    if (
      !Object.hasOwn(input, property) ||
      input[property] === undefined ||
      input[property] === ""
    )
      return false;
    if (
      ["transaction", "areaType"].includes(field) &&
      input[property] === "unknown"
    )
      return false;
    return true;
  });
}
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function mergeObservation(previous, incoming, now) {
  const fields = new Set(incoming.observedFields || FIELDS);
  // Area and type must describe the same observation.
  if (fields.has("area")) fields.add("areaType");
  else fields.delete("areaType");
  if (fields.has("priceCents")) {
    fields.add("originalPrice");
    fields.add("originalCurrency");
  } else {
    fields.delete("originalPrice");
    fields.delete("originalCurrency");
  }
  const next = { ...incoming },
    preservedFields = [];
  const fieldObservedAt = { ...(previous?.fieldObservedAt || {}) };
  for (const field of FIELDS) {
    if (fields.has(field)) {
      fieldObservedAt[field] = now;
      continue;
    }
    if (previous && Object.hasOwn(previous, field)) {
      next[field] = previous[field];
      if (
        previous[field] !== null &&
        previous[field] !== "" &&
        previous[field] !== "unknown"
      )
        preservedFields.push(field);
      fieldObservedAt[field] ??= previous.lastSeen;
    }
  }
  next.observedFields = [...fields];
  next.preservedFields = preservedFields;
  next.fieldObservedAt = fieldObservedAt;
  next.firstSeen = previous?.firstSeen || now;
  next.lastSeen = now;
  next.status = "active";
  next.previousPriceCents =
    previous && previous.priceCents !== next.priceCents
      ? previous.priceCents
      : (previous?.previousPriceCents ?? null);
  const changes = previous
    ? FIELDS.filter((f) => fields.has(f) && !equal(previous[f], next[f])).map(
        (field) => ({
          field,
          label: LABELS[field],
          before: previous[field] ?? null,
          after: next[field] ?? null,
        }),
      )
    : [];
  return { next, changes, preservedFields };
}
function planImport(store, items, now = new Date().toISOString()) {
  if (!Array.isArray(items) || items.length > 50000)
    throw Error("Lista inválida ou demasiado grande");
  // Lazy import avoids a circular dependency during store initialization.
  const { normalize } = require("./store.cjs");
  const catalog = store.sources();
  const unique = new Map();
  for (const item of items) {
    const row = normalize(item, catalog);
    const previous = unique.get(row.key);
    if (
      previous &&
      !equal({ ...previous, provenance: null }, { ...row, provenance: null })
    )
      throw Error("Referências repetidas com dados contraditórios");
    unique.set(row.key, row);
  }
  const existing = new Map(store.list().map((x) => [x.key, x]));
  return [...unique.values()].map((row) => {
    const previous = existing.get(row.key) || null;
    return { previous, ...mergeObservation(previous, row, now) };
  });
}
module.exports = {
  FIELDS,
  LABELS,
  observedFields,
  mergeObservation,
  planImport,
};

function reconcileRows(first, second) {
  const a = new Set(first.observedFields || FIELDS),
    b = new Set(second.observedFields || FIELDS);
  if (
    FIELDS.some(
      (field) =>
        a.has(field) && b.has(field) && !equal(first[field], second[field]),
    )
  )
    return null;
  const merged = { ...first };
  for (const field of b) if (!a.has(field)) merged[field] = second[field];
  merged.observedFields = [...new Set([...a, ...b])];
  return merged;
}
module.exports.reconcileRows = reconcileRows;
