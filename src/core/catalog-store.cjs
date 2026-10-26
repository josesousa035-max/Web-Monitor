const {
  initialSources,
  sourceInput,
  zoneInput,
  PILOT_ZONE,
} = require("./catalog.cjs");
module.exports = {
  migrateCatalog() {
    this.db
      .run(`CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS zones (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS associations (pair TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (scope TEXT NOT NULL, key TEXT NOT NULL, misses INTEGER NOT NULL, last_run TEXT NOT NULL, first_missing TEXT, PRIMARY KEY(scope,key));`);
    for (const source of initialSources())
      this.db.run("INSERT OR IGNORE INTO sources VALUES (?,?)", [
        source.id,
        JSON.stringify(source),
      ]);
    this.db.run("INSERT OR IGNORE INTO zones VALUES (?,?)", [
      PILOT_ZONE.id,
      JSON.stringify(PILOT_ZONE),
    ]);
    this.db.run("UPDATE meta SET value='2' WHERE key='schema_version'");
  },
  sources() {
    return this.rows("SELECT data FROM sources ORDER BY id").map((x) =>
      JSON.parse(x.data),
    );
  },
  source(id) {
    const row = this.rows("SELECT data FROM sources WHERE id=?", [id])[0];
    if (!row) throw Error("Fonte não registada no catálogo");
    return JSON.parse(row.data);
  },
  saveSource(value) {
    const previous = this.sources().find((x) => x.id === value?.id);
    const next = sourceInput(value, previous);
    if (
      this.sources().some((x) => x.id !== next.id && x.domain === next.domain)
    )
      throw Error("Este domínio já está no catálogo; edite a fonte existente");
    this.transaction(() =>
      this.db.run("INSERT OR REPLACE INTO sources VALUES (?,?)", [
        next.id,
        JSON.stringify(next),
      ]),
    );
    return next;
  },
  sourceResult(id, result) {
    const source = this.source(id);
    source.lastChecked = new Date().toISOString();
    source.lastResult = result;
    this.db.run("UPDATE sources SET data=? WHERE id=?", [
      JSON.stringify(source),
      id,
    ]);
  },
  zones() {
    return this.rows("SELECT data FROM zones ORDER BY id").map((x) =>
      JSON.parse(x.data),
    );
  },
  saveZone(value) {
    const next = zoneInput(value);
    this.transaction(() =>
      this.db.run("INSERT OR REPLACE INTO zones VALUES (?,?)", [
        next.id,
        JSON.stringify(next),
      ]),
    );
    return next;
  },
  runs() {
    return this.rows("SELECT data FROM runs ORDER BY rowid DESC LIMIT 100").map(
      (x) => JSON.parse(x.data),
    );
  },
  saveRun(run) {
    this.db.run("INSERT INTO runs VALUES (?,?)", [run.id, JSON.stringify(run)]);
  },
  associations() {
    return this.rows("SELECT data FROM associations").map((x) =>
      JSON.parse(x.data),
    );
  },
  associate(input) {
    if (
      !["confirmed", "rejected", "pending"].includes(input?.state) ||
      !Array.isArray(input.keys) ||
      input.keys.length !== 2 ||
      input.keys[0] === input.keys[1]
    )
      throw Error("Associação inválida");
    const all = new Set(this.list().map((x) => x.key));
    if (input.keys.some((k) => !all.has(k)))
      throw Error("Anúncio não encontrado");
    const keys = [...input.keys].sort();
    const pair = JSON.stringify(keys);
    const data = { keys, state: input.state, date: new Date().toISOString() };
    this.transaction(() =>
      this.db.run("INSERT OR REPLACE INTO associations VALUES (?,?)", [
        pair,
        JSON.stringify(data),
      ]),
    );
    return data;
  },
};
