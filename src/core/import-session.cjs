const crypto = require("node:crypto");
const { importCollection } = require("./service.cjs");
const { FIELDS, LABELS } = require("./observations.cjs");
const unknownFields = (row) => FIELDS.filter((field) =>
  row[field] === null || row[field] === undefined || row[field] === "" || row[field] === "unknown",
);
function fingerprint(store) {
  const snapshot = store.export();
  delete snapshot.exportedAt;
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
}
const small = (value) =>
  typeof value === "string" ? value.slice(0, 180) : value;
function review(entries) {
  const summary = {
    total: entries.length,
    newListings: 0,
    knownListings: 0,
    priceChanges: 0,
    metadataChanges: 0,
    unchanged: 0,
    unknownPrices: 0,
    unknownFields: 0,
    preservedListings: 0,
  };
  for (const entry of entries) {
    if (entry.previous) summary.knownListings++;
    else summary.newListings++;
    if (entry.changes.some((x) => x.field === "priceCents"))
      summary.priceChanges++;
    if (entry.changes.some((x) => x.field !== "priceCents"))
      summary.metadataChanges++;
    if (entry.previous && !entry.changes.length) summary.unchanged++;
    if (entry.next.priceCents === null) summary.unknownPrices++;
    summary.unknownFields += unknownFields(entry.next).length;
    if (entry.preservedFields.length) summary.preservedListings++;
  }
  const samples = [...entries]
    .sort(
      (a, b) =>
        Number(!!a.previous) - Number(!!b.previous) ||
        b.changes.length - a.changes.length,
    )
    .slice(0, 40)
    .map((entry) => ({
      key: entry.next.key,
      title: entry.next.title.slice(0, 160),
      source: entry.next.source,
      location: entry.next.location.slice(0, 160),
      priceCents: entry.next.priceCents,
      isNew: !entry.previous,
      preservedFields: entry.preservedFields,
      unknownFields: unknownFields(entry.next),
      unknownFieldLabels: unknownFields(entry.next).map((field) => LABELS[field]),
      changes: entry.changes
        .slice(0, 20)
        .map((x) => ({ ...x, before: small(x.before), after: small(x.after) })),
    }));
  return { summary, samples, sampleLimit: 40 };
}
class ImportSession {
  constructor(
    store,
    {
      now = Date.now,
      ttlMs = 15 * 60 * 1000,
      beforeCommit = () => {},
      config = () => ({}),
    } = {},
  ) {
    this.store = store;
    this.now = now;
    this.ttlMs = ttlMs;
    this.beforeCommit = beforeCommit;
    this.config = config;
    this.stage = null;
  }
  prepare(
    rows,
    {
      sourceId,
      label = "Ficheiro selecionado",
      warnings = [],
      partial = false,
    } = {},
  ) {
    // A replacement invalidates the previous token, including when validation fails.
    this.stage = null;
    this.store.source(sourceId);
    if (!Array.isArray(rows) || rows.length > 10000)
      throw Error("Limite de revisão: 10.000 anúncios; divida o ficheiro.");
    const data = structuredClone(rows);
    const entries = this.store.prepareImport(
      data,
      new Date(this.now()).toISOString(),
    );
    const token = crypto.randomUUID();
    const expires = this.now() + this.ttlMs;
    // Stage the observation, not the merged snapshot: omissions remain omissions.
    const { normalize } = require("./store.cjs");
    const catalog = this.store.sources();
    const stagedRows = data.map((x) => normalize(x, catalog));
    const output = {
      token,
      label: String(label)
        .replace(/[\r\n\x00-\x1f]/g, " ")
        .slice(0, 120),
      expiresAt: new Date(expires).toISOString(),
      partial: !!partial || warnings.length > 0,
      warnings: warnings.slice(0, 100).map((x) => String(x).slice(0, 400)),
      ...review(entries),
    };
    this.stage = {
      token,
      expires,
      fingerprint: fingerprint(this.store),
      rows: stagedRows,
      sourceId,
      output,
    };
    return structuredClone(output);
  }
  cancel(token) {
    if (this.stage?.token !== token) return false;
    this.stage = null;
    return true;
  }
  confirm(token, { acceptPartial = false } = {}) {
    const stage = this.stage;
    if (!stage || typeof token !== "string" || stage.token !== token)
      throw Error(
        "Revisão inexistente ou já confirmada. Selecione o ficheiro novamente.",
      );
    if (this.now() >= stage.expires) {
      this.stage = null;
      throw Error("A revisão expirou. Selecione o ficheiro novamente.");
    }
    if (fingerprint(this.store) !== stage.fingerprint) {
      this.stage = null;
      throw Error(
        "Os dados ou as configurações mudaram desde a revisão. Reveja o ficheiro novamente.",
      );
    }
    if (stage.output.partial && acceptPartial !== true)
      throw Error("Confirme explicitamente a importação parcial e os avisos.");
    const backup = this.beforeCommit();
    if (backup && typeof backup.then === "function")
      throw Error("O backup deve terminar antes de confirmar a importação");
    const date = new Date(this.now()).toISOString();
    const result = this.store.transaction(() => {
      const imported = importCollection(
        this.store,
        stage.rows,
        this.config(),
        date,
      );
      const sources = [...new Set(stage.rows.map((x) => x.source))];
      if (!sources.length) sources.push(stage.sourceId);
      for (const sourceId of sources) {
        const count = stage.rows.filter((x) => x.source === sourceId).length;
        const run = {
          id: crypto.randomUUID(),
          sourceId,
          zoneId: null,
          startedAt: date,
          finishedAt: date,
          status: "partial",
          method: "manual",
          exhaustive: false,
          pages: 0,
          items: count,
          warnings: [
            "Importação manual revista: ausências não verificadas",
            ...stage.output.warnings,
          ],
          error: null,
        };
        this.store.saveRun(run);
        this.store.sourceResult(sourceId, {
          status: "partial",
          date,
          items: count,
        });
      }
      return imported;
    });
    this.stage = null;
    return { summary: result.summary, alerts: result.alerts };
  }
}
module.exports = { ImportSession, fingerprint, review };
