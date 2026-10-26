const { domainToASCII } = require("node:url");
const SOURCE_STATES = [
  "discovered",
  "evaluating",
  "automatic",
  "semiautomatic",
  "manual",
  "no-coverage",
  "unavailable",
  "unsupported",
];
const BOULDER_SEARCH =
  "https://boulderimobiliaria.pt/Imoveis?imovtn_id%5B%5D=1&imovnature_id%5B%5D=1&imovnature_id%5B%5D=7&place=concelho_42&precomin=&precomax=&reference=&imovest_id=&areamin=&areamax=&imovce_id=&zona_id=";
function publicUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw Error(
      "Use um URL HTTPS público, sem credenciais ou portas alternativas",
    );
  const host = domainToASCII(u.hostname).toLowerCase();
  if (
    host.length > 253 ||
    !host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    !/\.[a-z]{2,63}$/.test(host) ||
    /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)
  )
    throw Error("Destino não público ou domínio inválido");
  u.hash = "";
  return u.href;
}
function domain(value) {
  return new URL(publicUrl(value)).hostname.replace(/^www\./, "");
}
function belongs(url, host) {
  const actual = new URL(publicUrl(url)).hostname;
  return actual === host || actual.endsWith("." + host);
}
function text(value, max = 1000) {
  if (typeof value !== "string" || value.length > max)
    throw Error("Texto inválido ou demasiado extenso");
  return value.trim();
}
function sourceInput(input, previous) {
  if (
    !input ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id || "") ||
    ["__proto__", "constructor", "prototype"].includes(input.id)
  )
    throw Error("Identificador de fonte inválido");
  const homepage = publicUrl(input.homepage);
  const host = domain(homepage);
  if (previous && previous.domain !== host)
    throw Error(
      "O domínio de uma fonte existente não pode ser alterado; crie outra fonte",
    );
  const name = text(input.name, 150);
  if (!name) throw Error("Nome da fonte obrigatório");
  const searchUrl = input.searchUrl ? publicUrl(input.searchUrl) : "";
  if (searchUrl && !belongs(searchUrl, host))
    throw Error("A pesquisa deve pertencer ao domínio da fonte");
  const coverage = (input.coverage || []).map((x) => text(x, 150));
  if (coverage.length > 50) throw Error("Demasiadas localizações");
  const kind = input.kind || "local";
  if (
    !["portal", "network", "local", "agent", "directory", "other"].includes(
      kind,
    )
  )
    throw Error("Tipo de fonte inválido");
  const method = input.method || "manual";
  if (!["manual", "jsonld", "html", "rss"].includes(method))
    throw Error("Método inválido");
  let state = input.state || "discovered";
  if (!SOURCE_STATES.includes(state)) throw Error("Estado inválido");
  // Successful collection and explicit review are separate from a claim of live validation.
  if (state === "automatic" && !previous?.validatedAt)
    throw Error("Automatização não validada; use Em avaliação");
  const permission = {
    allowed: input.permission?.allowed === true,
    evidence: text(input.permission?.evidence || "", 2000),
    termsUrl: input.permission?.termsUrl
      ? publicUrl(input.permission.termsUrl)
      : "",
  };
  if (permission.allowed && (!permission.evidence || !permission.termsUrl))
    throw Error(
      "Registe a base de autorização e o URL das condições antes de ativar recolha",
    );
  const searches = { ...(previous?.searches || {}), ...(input.searches || {}) };
  const searchZoneId = input.searchZoneId || "povoa-de-lanhoso";
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(searchZoneId))
    throw Error("Zona da pesquisa inválida");
  if (input.searchUrl !== undefined) {
    if (searchUrl) searches[searchZoneId] = searchUrl;
    else delete searches[searchZoneId];
  }
  if (Object.keys(searches).length > 100)
    throw Error("Máximo de 100 pesquisas por fonte");
  for (const [id, url] of Object.entries(searches))
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !belongs(url, host))
      throw Error("Pesquisa fora do domínio ou zona inválida");
  const connector = input.connector || {};
  if (
    connector.selectors &&
    (typeof connector.selectors !== "object" ||
      Array.isArray(connector.selectors) ||
      Object.entries(connector.selectors).some(
        ([key, value]) =>
          ![
            "item",
            "title",
            "url",
            "reference",
            "price",
            "area",
            "typology",
            "location",
            "municipality",
            "description",
            "next",
            "empty",
          ].includes(key) ||
          typeof value !== "string" ||
          value.length > 300,
      ))
  )
    throw Error("Seletores inválidos");
  if (
    connector.maxPages !== undefined &&
    (!Number.isInteger(connector.maxPages) ||
      connector.maxPages < 1 ||
      connector.maxPages > 20)
  )
    throw Error("Limite de páginas: 1 a 20");
  const intervalMinutes =
    input.intervalMinutes === undefined ? 0 : input.intervalMinutes;
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 0 ||
    intervalMinutes > 10080 ||
    (intervalMinutes > 0 && intervalMinutes < 60)
  )
    throw Error("Intervalo mínimo: 60 minutos; zero desativa");
  return {
    ...previous,
    id: input.id,
    name,
    homepage,
    domain: host,
    searches,
    searchUrl: searches["povoa-de-lanhoso"] || "",
    kind,
    coverage,
    method,
    state,
    permission,
    enabled: input.enabled !== false,
    intervalMinutes,
    notes: text(input.notes || "", 3000),
    discoveredVia:
      previous?.discoveredVia ||
      text(input.discoveredVia || "Adicionada pelo utilizador", 1000),
    connector: {
      maxPages: connector.maxPages || 3,
      scopeVerified: connector.scopeVerified === true,
      transaction: ["sale", "rent"].includes(connector.transaction)
        ? connector.transaction
        : undefined,
      areaType: ["usable", "gross", "land", "unknown"].includes(
        connector.areaType,
      )
        ? connector.areaType
        : "unknown",
      currency: connector.currency === "EUR" ? "EUR" : undefined,
      ...(connector.selectors ? { selectors: connector.selectors } : {}),
    },
    updatedAt: new Date().toISOString(),
    lastChecked: previous?.lastChecked || null,
    lastResult: previous?.lastResult || null,
    validatedAt: previous?.validatedAt || null,
  };
}
function initialSources() {
  return [
    {
      id: "idealista",
      name: "Idealista",
      homepage: "https://www.idealista.pt/",
      searchUrl: "https://www.idealista.pt/comprar-casas/povoa-de-lanhoso/",
      kind: "portal",
      coverage: ["Póvoa de Lanhoso"],
      state: "manual",
      notes:
        "Condições consultadas: monitorização/cópia automática exige autorização escrita. Não recolher sem essa autorização.",
    },
    {
      id: "remax",
      name: "RE/MAX",
      homepage: "https://remax.pt/",
      kind: "network",
      coverage: [],
      state: "evaluating",
      notes:
        "URL filtrado por confirmar. Condições carregadas por JavaScript; não avaliadas integralmente. Sem recolha ativada.",
    },
    {
      id: "boulder",
      name: "Boulder Imobiliária",
      homepage: "https://boulderimobiliaria.pt/",
      searchUrl: BOULDER_SEARCH,
      kind: "local",
      coverage: ["Póvoa de Lanhoso"],
      state: "manual",
      notes:
        "Filtros fornecidos pelo utilizador preservados. robots.txt contém uma restrição específica a GPTBot. Sem extração automática validada.",
    },
  ].map((x) =>
    sourceInput({
      ...x,
      method: "manual",
      permission: { allowed: false },
      discoveredVia: "Fonte indicada pelo utilizador",
    }),
  );
}
const PILOT_ZONE = {
  id: "povoa-de-lanhoso",
  name: "Póvoa de Lanhoso",
  country: "Portugal",
  municipality: "Póvoa de Lanhoso",
  localities: [],
  mode: "administrative",
  center: null,
  radiusKm: null,
  transaction: "sale",
  minPriceCents: null,
  maxPriceCents: null,
  minArea: null,
  typology: "",
  propertyType: "",
};
function zoneInput(input) {
  if (!input || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id || ""))
    throw Error("Identificador de zona inválido");
  const name = text(input.name, 150),
    municipality = text(input.municipality || "", 150);
  if (!name || !municipality) throw Error("Nome e concelho são obrigatórios");
  const mode = input.mode || "administrative";
  if (!["administrative", "radius"].includes(mode))
    throw Error("Modo geográfico inválido");
  const center =
    input.center == null
      ? null
      : {
          lat: Number(input.center.lat),
          lon: Number(input.center.lon),
          precision: input.center.precision || "approximate",
        };
  if (
    center &&
    (!Number.isFinite(center.lat) ||
      !Number.isFinite(center.lon) ||
      Math.abs(center.lat) > 90 ||
      Math.abs(center.lon) > 180 ||
      !["exact", "approximate"].includes(center.precision))
  )
    throw Error("Coordenadas inválidas");
  const radiusKm = input.radiusKm == null ? null : Number(input.radiusKm);
  if (
    mode === "radius" &&
    (!center || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 200)
  )
    throw Error("Defina coordenadas e raio entre 0 e 200 km");
  for (const field of ["minPriceCents", "maxPriceCents"])
    if (
      input[field] != null &&
      (!Number.isSafeInteger(input[field]) || input[field] < 0)
    )
      throw Error("Preço da zona inválido");
  if (
    input.minPriceCents != null &&
    input.maxPriceCents != null &&
    input.minPriceCents > input.maxPriceCents
  )
    throw Error("Intervalo de preços inválido");
  const minArea = input.minArea ?? null;
  if (minArea !== null && (!Number.isFinite(minArea) || minArea <= 0))
    throw Error("Área mínima inválida");
  const transaction = input.transaction || "sale";
  if (!["sale", "rent"].includes(transaction))
    throw Error("Tipo de negócio inválido");
  return {
    id: input.id,
    name,
    country: text(input.country || "Portugal", 100),
    municipality,
    localities: (input.localities || []).map((x) => text(x, 150)),
    mode,
    center,
    radiusKm,
    transaction,
    minPriceCents: input.minPriceCents ?? null,
    maxPriceCents: input.maxPriceCents ?? null,
    minArea,
    typology: text(input.typology || "", 50),
    propertyType: text(input.propertyType || "", 100),
  };
}
module.exports = {
  SOURCE_STATES,
  sourceInput,
  initialSources,
  zoneInput,
  PILOT_ZONE,
  publicUrl,
  domain,
  belongs,
};
