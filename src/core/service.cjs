const { evaluate } = require("./rules.cjs");
function importCollection(store, rows, config, now) {
  return store.transaction(() => {
    const before = new Map(store.list().map((x) => [x.key, x]));
    const summary = store.import(rows, now);
    const existing = JSON.parse(store.getMeta("alerts") || "[]");
    const importedKeys = new Set(rows.map((r) => r.key));
    const alerts = evaluate(
      before,
      store.list().filter((x) => importedKeys.has(x.key)),
      config,
      existing.map((x) => x.id),
    );
    store.setMeta(
      "alerts",
      JSON.stringify([...alerts, ...existing].slice(0, 1000)),
    );
    return { summary, alerts };
  });
}
module.exports = { importCollection };
