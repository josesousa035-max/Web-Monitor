const crypto = require("node:crypto");
const { SafeClient } = require("./network.cjs");
const { publicUrl, domain, sourceInput } = require("./catalog.cjs");
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const ATTRIBUTION =
  "© OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright";
function queryFor(zone) {
  let scope,
    prefix = "";
  if (zone.mode === "radius") {
    if (
      !zone.center ||
      !Number.isFinite(zone.center.lat) ||
      !Number.isFinite(zone.center.lon) ||
      Math.abs(zone.center.lat) > 90 ||
      Math.abs(zone.center.lon) > 180 ||
      !(zone.radiusKm > 0) ||
      zone.radiusKm > 50
    )
      throw Error("Descoberta OSM por raio: defina centro e raio até 50 km");
    scope = `(around:${Math.round(zone.radiusKm * 1000)},${Number(zone.center.lat)},${Number(zone.center.lon)})`;
  } else {
    if (!["Portugal", "PT"].includes(zone.country))
      throw Error(
        "Descoberta administrativa OSM disponível para Portugal; para outras zonas use centro e raio",
      );
    prefix = `area["ISO3166-1"="PT"]->.country;relation(area.country)["boundary"="administrative"]["name"=${JSON.stringify(zone.municipality)}]->.boundaries;.boundaries map_to_area->.search;`;
    scope = "(area.search)";
  }
  return `[out:json][timeout:20];${prefix}(${zone.mode === "radius" ? "" : ".boundaries;"}nwr${scope}["office"="estate_agent"];nwr${scope}["shop"="estate_agent"];);out center tags;`;
}
function parseOSM(data, zone, existing = []) {
  if (!Array.isArray(data.elements) || data.elements.length > 5000)
    throw Error("Resposta OSM inválida ou demasiado grande");
  if (data.remark)
    throw Error(
      "Consulta OSM incompleta: " + String(data.remark).slice(0, 200),
    );
  if (zone.mode !== "radius") {
    const boundaries = data.elements.filter(
      (e) =>
        e.type === "relation" &&
        e.tags?.boundary === "administrative" &&
        e.tags?.name === zone.municipality,
    );
    if (boundaries.length !== 1)
      throw Error(
        "Limite administrativo não encontrado ou ambíguo; use centro e raio",
      );
  }
  const sources = [],
    leads = [],
    warnings = [],
    known = new Set(existing.map((x) => x.domain));
  for (const element of data.elements) {
    if (
      !["node", "way", "relation"].includes(element.type) ||
      !Number.isSafeInteger(element.id)
    )
      continue;
    const tags = element.tags || {};
    if (tags.office !== "estate_agent" && tags.shop !== "estate_agent")
      continue;
    const name = String(tags.name || tags.brand || "").trim();
    if (!name) continue;
    const evidence = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const website = tags.website || tags["contact:website"];
    if (!website) {
      leads.push({
        name,
        evidence,
        reason: "Sem site indicado; verificar manualmente",
      });
      continue;
    }
    try {
      const homepage = publicUrl(website),
        host = domain(homepage);
      if (known.has(host)) continue;
      known.add(host);
      sources.push(
        sourceInput({
          id: host.replace(/[^a-z0-9]+/g, "-").slice(0, 80),
          name,
          homepage,
          kind: "local",
          coverage: [],
          method: "manual",
          state: "discovered",
          discoveredVia: "OpenStreetMap: " + evidence,
          notes: `Agência mapeada na área consultada (${zone.name}). Não confirma imóveis disponíveis nem cobertura comercial. Site indicado no OSM, ainda não visitado ou validado. ${ATTRIBUTION}`,
          permission: { allowed: false },
        }),
      );
    } catch (e) {
      warnings.push({ name, evidence, reason: e.message });
    }
  }
  return {
    sources,
    leads,
    warnings,
    attribution: ATTRIBUTION,
    coverageVerified: false,
  };
}
async function discoverOSM(
  store,
  zoneId,
  {
    client = new SafeClient({ timeoutMs: 30000, maxRetries: 0 }),
    signal,
    now = Date.now,
  } = {},
) {
  const zone = store.zones().find((x) => x.id === zoneId);
  if (!zone) throw Error("Zona não encontrada");
  const query = queryFor(zone),
    cacheKey =
      "osm-discovery-" +
      crypto.createHash("sha256").update(query).digest("hex");
  const cache = store.getMeta(cacheKey);
  let response,
    cached = false;
  if (cache && now() - JSON.parse(cache).time < 24 * 3600000) {
    response = JSON.parse(cache).data;
    cached = true;
  } else {
    const result = await client.fetch(
      ENDPOINT + "?data=" + encodeURIComponent(query),
      { signal, allowedDomain: "overpass-api.de" },
    );
    try {
      response = JSON.parse(result.body);
    } catch {
      throw Error("O serviço OSM não devolveu JSON válido");
    }
  }
  response = {
    ...(response.remark ? { remark: response.remark } : {}),
    elements: response.elements?.map((e) => ({
      type: e.type,
      id: e.id,
      tags: Object.fromEntries(
        Object.entries(e.tags || {}).filter(([key]) =>
          [
            "name",
            "brand",
            "office",
            "shop",
            "website",
            "contact:website",
            "boundary",
          ].includes(key),
        ),
      ),
    })),
  };
  const found = parseOSM(response, zone, store.sources());
  store.transaction(() => {
    for (const source of found.sources) store.saveSource(source);
    if (!cached)
      store.setMeta(cacheKey, JSON.stringify({ time: now(), data: response }));
  });
  return {
    ...found,
    added: found.sources.length,
    cached,
    checkedAt: new Date(now()).toISOString(),
    query,
  };
}
module.exports = { queryFor, parseOSM, discoverOSM, ENDPOINT, ATTRIBUTION };
