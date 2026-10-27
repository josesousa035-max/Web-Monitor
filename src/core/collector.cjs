const crypto = require("node:crypto");
const robotsParser = require("robots-parser");
const { SafeClient, USER_AGENT } = require("./network.cjs");
const { parseDocument } = require("./importers.cjs");
const { belongs } = require("./catalog.cjs");
const { reconcileRows } = require("./observations.cjs");
const { importCollection } = require("./service.cjs");
const running = new Set();
const defaultClient = new SafeClient();
function scopeFor(source, zone) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        source: source.id,
        url: source.searchUrl,
        connector: source.connector,
        zone,
      }),
    )
    .digest("hex");
}
async function collect(
  source,
  zone,
  client = defaultClient,
  { signal, now = () => new Date().toISOString() } = {},
) {
  source = {
    ...source,
    searchUrl:
      source.searches?.[zone.id] ||
      (zone.id === "povoa-de-lanhoso" ? source.searchUrl : ""),
  };
  const run = {
    id: crypto.randomUUID(),
    sourceId: source.id,
    zoneId: zone.id,
    scope: scopeFor(source, zone),
    startedAt: now(),
    finishedAt: null,
    status: "failed",
    method: source.method,
    exhaustive: false,
    pages: 0,
    items: 0,
    listings: [],
    warnings: [],
    error: null,
  };
  try {
    if (!source.enabled || !source.permission.allowed)
      throw Object.assign(
        Error("Recolha desativada: falta avaliação e autorização documentada"),
        { code: "permission" },
      );
    if (source.method === "manual" || !source.searchUrl)
      throw Error("Configure um método e uma pesquisa antes de recolher");
    const robotsUrl = new URL("/robots.txt", source.searchUrl).href;
    let rules;
    try {
      const response = await client.fetch(robotsUrl, {
        signal,
        allowedDomain: source.domain,
      });
      rules = robotsParser(robotsUrl, response.body);
    } catch (e) {
      if (e.status === 404) rules = robotsParser(robotsUrl, "");
      else throw e;
    }
    const queue = [source.searchUrl],
      visited = new Set(),
      unique = new Map(),
      conflicted = new Set();
    const maxPages = source.connector.maxPages || 3;
    while (queue.length && run.pages < maxPages) {
      if (signal?.aborted)
        throw Object.assign(Error("Recolha cancelada"), { code: "cancelled" });
      const url = queue.shift();
      if (visited.has(url)) {
        run.warnings.push("Ciclo de paginação detetado");
        continue;
      }
      if (!belongs(url, source.domain)) throw Error("Paginação fora da fonte");
      if (rules.isAllowed(url, USER_AGENT) === false)
        throw Object.assign(Error("robots.txt não permite este acesso"), {
          code: "robots",
        });
      visited.add(url);
      const response = await client.fetch(url, {
        signal,
        allowedDomain: source.domain,
      });
      if (rules.isAllowed(response.url || url, USER_AGENT) === false)
        throw Error("Redirecionamento para caminho não permitido");
      const type = String(response.headers["content-type"] || "");
      if (type && !/html|xml|rss|atom|text\/plain/i.test(type))
        throw Error("Tipo de conteúdo não suportado");
      const page = parseDocument(
        response.body,
        source.id,
        [source],
        response.url || url,
      );
      run.pages++;
      run.warnings.push(...page.warnings);
      for (const row of page.listings) {
        if (conflicted.has(row.key)) continue;
        const old = unique.get(row.key);
        const combined = old ? reconcileRows(old, row) : row;
        if (!combined) {
          unique.delete(row.key);
          conflicted.add(row.key);
          run.warnings.push(
            "Referência contraditória excluída entre páginas: " + row.reference,
          );
        } else unique.set(row.key, combined);
      }
      for (const next of page.nextUrls) {
        if (visited.has(next)) run.warnings.push("Ciclo de paginação detetado");
        else if (!queue.includes(next)) queue.push(next);
      }
    }
    if (queue.length)
      run.warnings.push("Limite de páginas atingido; recolha parcial");
    run.listings = [...unique.values()];
    run.items = run.listings.length;
    run.exhaustive =
      source.connector.scopeVerified === true &&
      !queue.length &&
      !run.warnings.length;
    run.status = run.exhaustive ? "complete" : "partial";
    if (!source.connector.scopeVerified)
      run.warnings.push(
        "Exaustividade da pesquisa não confirmada; ausências ignoradas",
      );
  } catch (e) {
    run.status =
      e.code === "cancelled"
        ? "cancelled"
        : e.code === "blocked" || e.code === "robots" || e.code === "permission"
          ? "blocked"
          : "failed";
    run.error = {
      code: e.code || "collection",
      message: e.message,
      status: e.status || null,
    };
  }
  run.finishedAt = now();
  return run;
}
function applyAbsences(store, run, now) {
  if (!run.exhaustive || run.status !== "complete") return;
  const seen = new Set(run.listings.map((x) => x.key));
  const previous = store.rows("SELECT * FROM observations WHERE scope=?", [
    run.scope,
  ]);
  for (const row of previous) {
    if (seen.has(row.key)) continue;
    const misses = row.misses + 1,
      firstMissing = row.first_missing || now;
    store.db.run(
      "UPDATE observations SET misses=?,last_run=?,first_missing=? WHERE scope=? AND key=?",
      [misses, run.id, firstMissing, run.scope, row.key],
    );
    const stored = store.rows("SELECT data FROM listings WHERE key=?", [
      row.key,
    ])[0];
    if (!stored) continue;
    const listing = JSON.parse(stored.data);
    const elapsed = Date.parse(now) - Date.parse(firstMissing);
    if (misses >= 3 && elapsed >= 48 * 3600000) listing.status = "unavailable";
    else if (misses >= 2 && elapsed >= 24 * 3600000)
      listing.status = "potentially-unavailable";
    listing.statusReason = `${misses} recolhas completas sem observação; primeira ausência ${firstMissing}`;
    store.db.run("UPDATE listings SET data=? WHERE key=?", [
      JSON.stringify(listing),
      listing.key,
    ]);
  }
  for (const key of seen)
    store.db.run(
      "INSERT OR REPLACE INTO observations (scope,key,misses,last_run,first_missing) VALUES (?,?,?,?,NULL)",
      [run.scope, key, 0, run.id],
    );
}
async function updateSource(
  store,
  sourceId,
  zoneId,
  {
    client = defaultClient,
    signal,
    now,
    config = {},
    beforeImport = () => {},
  } = {},
) {
  if (running.has(sourceId))
    throw Error("Já existe uma atualização desta fonte em curso");
  running.add(sourceId);
  try {
    const source = store.source(sourceId),
      zone = store.zones().find((z) => z.id === zoneId);
    if (!zone) throw Error("Zona não encontrada");
    const run = await collect(source, zone, client, { signal, now });
    let summary = null,
      alerts = [];
    if (["complete", "partial"].includes(run.status)) {
      beforeImport();
    }
    store.transaction(() => {
      if (["complete", "partial"].includes(run.status)) {
        const result = importCollection(
          store,
          run.listings,
          config,
          run.finishedAt,
        );
        summary = result.summary;
        alerts = result.alerts;
        applyAbsences(store, run, run.finishedAt);
      }
      const { listings, ...record } = run;
      store.saveRun(record);
      store.sourceResult(sourceId, {
        status: run.status,
        date: run.finishedAt,
        items: run.items,
        error: run.error,
        warnings: run.warnings,
      });
    });
    const { listings, ...record } = run;
    return { run: record, summary, alerts };
  } finally {
    running.delete(sourceId);
  }
}
module.exports = { collect, updateSource, applyAbsences, scopeFor };
