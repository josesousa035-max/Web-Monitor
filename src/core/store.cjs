const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const initSqlJs = require("sql.js");
const { initialSources, publicUrl, belongs } = require("./catalog.cjs");
const SOURCES = ["idealista", "remax", "boulder"];
function money(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    /^(?:preço )?sob consulta$|^on request$|^poa$/i.test(String(value).trim())
  )
    return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw Error("Preço inválido");
    return Math.round(value * 100);
  }
  let s = String(value).replace(/[€\s\u00a0]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error("Preço inválido");
  return money(Number(s));
}
const safeUrl = publicUrl;
function normalize(x, catalog = initialSources()) {
  if (!x || typeof x !== "object") throw Error("Anúncio inválido");
  const source = String(x.source || "").toLowerCase();
  const entry = catalog.find((s) => s.id === source);
  if (!entry) throw Error("Fonte desconhecida: registe-a primeiro no catálogo");
  const url = safeUrl(x.url);
  if (!belongs(url, entry.domain)) throw Error("URL não pertence à fonte");
  const identityUrl = new URL(url);
  for (const key of [...identityUrl.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key))
      identityUrl.searchParams.delete(key);
  identityUrl.searchParams.sort();
  const reference = String(
    x.reference ?? x.id ?? identityUrl.pathname + identityUrl.search,
  ).trim();
  const title = String(x.title || "").trim();
  if (!reference || !title) throw Error("Referência e título são obrigatórios");
  const area =
    x.area === "" || x.area == null
      ? null
      : Number(
          String(x.area)
            .trim()
            .replace(
              /^(\d{1,3}(?:\.\d{3})+)(,\d+)?$/,
              (_, whole, decimal = "") => whole.replace(/\./g, "") + decimal,
            )
            .replace(",", "."),
        );
  if (area !== null && (!Number.isFinite(area) || area <= 0))
    throw Error("Área inválida");
  const price = x.priceCents !== undefined ? x.priceCents : money(x.price);
  if (price !== null && (!Number.isSafeInteger(price) || price < 0))
    throw Error("Preço em cêntimos inválido");
  let coordinates = null;
  if (x.coordinates != null) {
    coordinates = {
      lat: Number(x.coordinates.lat),
      lon: Number(x.coordinates.lon),
      precision: x.coordinates.precision || "approximate",
    };
    if (
      !Number.isFinite(coordinates.lat) ||
      !Number.isFinite(coordinates.lon) ||
      Math.abs(coordinates.lat) > 90 ||
      Math.abs(coordinates.lon) > 180 ||
      !["exact", "approximate"].includes(coordinates.precision)
    )
      throw Error("Coordenadas inválidas");
  }
  const transaction = x.transaction || "unknown";
  if (!["sale", "rent", "unknown"].includes(transaction))
    throw Error("Tipo de negócio inválido");
  const areaType = x.areaType || "unknown";
  if (!["usable", "gross", "land", "unknown"].includes(areaType))
    throw Error("Tipo de área inválido");
  const isoDate = (value) => {
    if (value == null || value === "") return null;
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T.+(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      return null;
    return value;
  };
  return {
    canonicalUrl:
      x.canonicalUrl && belongs(x.canonicalUrl, entry.domain)
        ? safeUrl(x.canonicalUrl)
        : null,
    publishedAt: isoDate(x.publishedAt),
    sourceUpdatedAt: isoDate(x.sourceUpdatedAt),
    originalPrice:
      x.originalPrice == null ? null : String(x.originalPrice).slice(0, 100),
    originalCurrency:
      x.originalCurrency == null
        ? null
        : String(x.originalCurrency).slice(0, 10),
    municipality: String(x.municipality || ""),
    country: String(x.country || ""),
    coordinates,
    transaction,
    areaType,
    provenance:
      x.provenance && typeof x.provenance === "object"
        ? x.provenance
        : { method: "manual", collectedAt: null },
    key: `${source}:${reference}`,
    source,
    reference,
    url,
    title,
    description: String(x.description || ""),
    location: String(x.location || ""),
    priceCents: price,
    area,
    typology: String(x.typology || ""),
    propertyType: String(x.propertyType || ""),
  };
}
class Store {
  static async open(file) {
    const SQL = await initSqlJs();
    const db = new SQL.Database(
      file && fs.existsSync(file) ? fs.readFileSync(file) : undefined,
    );
    return new Store(db, file, SQL);
  }
  constructor(db, file, SQL) {
    this.SQL = SQL;
    this.db = db;
    this.file = file;
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, key TEXT NOT NULL, old_price INTEGER, new_price INTEGER, date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY, key TEXT NOT NULL, field TEXT NOT NULL, old_value TEXT, new_value TEXT, date TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY, date TEXT NOT NULL, count INTEGER NOT NULL, added INTEGER NOT NULL, changed INTEGER NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('schema_version','1');`);
    const version = this.getMeta("schema_version");
    if (!["1", "2"].includes(version))
      throw Error("Versão de base de dados não suportada");
    if (version === "1") {
      if (file && fs.existsSync(file))
        fs.copyFileSync(
          file,
          file + ".pre-v2-" + Date.now() + ".sqlite",
          require("node:fs").constants.COPYFILE_EXCL,
        );
      this.transaction(() => this.migrateCatalog());
    }
  }
  rows(sql, args = []) {
    const s = this.db.prepare(sql);
    try {
      s.bind(args);
      const out = [];
      while (s.step()) out.push(s.getAsObject());
      return out;
    } finally {
      s.free();
    }
  }
  getMeta(key) {
    return this.rows("SELECT value FROM meta WHERE key=?", [key])[0]?.value;
  }
  setMeta(key, value) {
    this.transaction(() =>
      this.db.run("INSERT OR REPLACE INTO meta VALUES (?,?)", [key, value]),
    );
  }
  transaction(fn) {
    if (this.inTransaction) return fn();
    const snapshot = this.db.export();
    this.db.run("BEGIN");
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.run("COMMIT");
      this.save();
      return result;
    } catch (e) {
      this.db.close();
      this.db = new this.SQL.Database(snapshot);
      throw e;
    } finally {
      this.inTransaction = false;
    }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, this.db.export(), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
  list() {
    return this.rows("SELECT data FROM listings").map((r) =>
      JSON.parse(r.data),
    );
  }
  history(key) {
    return this.rows("SELECT * FROM history WHERE key=? ORDER BY id", [key]);
  }
  import(items, now = new Date().toISOString()) {
    if (!Array.isArray(items) || items.length > 50000)
      throw Error("Lista inválida ou demasiado grande");
    const catalog = this.sources();
    const data = items.map((x) => normalize(x, catalog));
    const unique = new Map();
    for (const x of data) {
      if (
        unique.has(x.key) &&
        JSON.stringify({ ...unique.get(x.key), provenance: null }) !==
          JSON.stringify({ ...x, provenance: null })
      )
        throw Error("Referências repetidas com dados contraditórios");
      unique.set(x.key, x);
    }
    let added = 0,
      changed = 0;
    return this.transaction(() => {
      for (const x of unique.values()) {
        const oldRow = this.rows("SELECT data FROM listings WHERE key=?", [
          x.key,
        ])[0];
        const old = oldRow ? JSON.parse(oldRow.data) : null;
        if (!old) added++;
        if (old && old.priceCents !== x.priceCents) changed++;
        if (!old || old.priceCents !== x.priceCents)
          this.db.run(
            "INSERT INTO history (key,old_price,new_price,date) VALUES (?,?,?,?)",
            [x.key, old?.priceCents ?? null, x.priceCents, now],
          );
        if (old)
          for (const field of [
            "title",
            "description",
            "location",
            "area",
            "typology",
            "propertyType",
            "url",
            "areaType",
            "transaction",
            "municipality",
          ]) {
            if (old[field] !== x[field])
              this.db.run(
                "INSERT INTO changes (key,field,old_value,new_value,date) VALUES (?,?,?,?,?)",
                [
                  x.key,
                  field,
                  JSON.stringify(old[field] ?? null),
                  JSON.stringify(x[field] ?? null),
                  now,
                ],
              );
          }
        const next = {
          ...x,
          firstSeen: old?.firstSeen || now,
          lastSeen: now,
          status: "active",
          previousPriceCents:
            old && old.priceCents !== x.priceCents
              ? old.priceCents
              : (old?.previousPriceCents ?? null),
        };
        this.db.run("INSERT OR REPLACE INTO listings VALUES (?,?)", [
          x.key,
          JSON.stringify(next),
        ]);
      }
      this.db.run(
        "INSERT INTO imports (date,count,added,changed) VALUES (?,?,?,?)",
        [now, unique.size, added, changed],
      );
      return { count: unique.size, added, changed };
    });
  }
  export() {
    return {
      format: "web-monitor",
      version: 2,
      sources: this.sources(),
      zones: this.zones(),
      runs: this.rows("SELECT data FROM runs ORDER BY rowid").map((x) =>
        JSON.parse(x.data),
      ),
      associations: this.associations(),
      observations: this.rows("SELECT * FROM observations"),
      exportedAt: new Date().toISOString(),
      listings: this.list(),
      history: this.rows("SELECT * FROM history ORDER BY id"),
      changes: this.rows("SELECT * FROM changes ORDER BY id"),
      imports: this.rows("SELECT * FROM imports ORDER BY id"),
      settings: this.rows("SELECT * FROM meta WHERE key != 'schema_version'"),
    };
  }
  restore(data) {
    if (
      data.format !== "web-monitor" ||
      ![1, 2].includes(data.version) ||
      !Array.isArray(data.listings) ||
      !Array.isArray(data.history) ||
      !Array.isArray(data.imports) ||
      !Array.isArray(data.settings)
    )
      throw Error("Backup incompatível");
    const { sourceInput, zoneInput } = require("./catalog.cjs");
    if (
      data.version === 2 &&
      (!Array.isArray(data.sources) ||
        !Array.isArray(data.zones) ||
        !Array.isArray(data.runs) ||
        !Array.isArray(data.associations) ||
        !Array.isArray(data.observations))
    )
      throw Error("Estrutura de backup v2 inválida");
    const catalog =
      data.version === 2
        ? data.sources.map((x) =>
            sourceInput(
              {
                ...x,
                permission: { ...x.permission, allowed: false },
                intervalMinutes: 0,
                state: x.state === "automatic" ? "semiautomatic" : x.state,
              },
              x,
            ),
          )
        : initialSources();
    if (
      new Set(catalog.map((x) => x.id)).size !== catalog.length ||
      new Set(catalog.map((x) => x.domain)).size !== catalog.length
    )
      throw Error("Fontes duplicadas no backup");
    const zones = data.version === 2 ? data.zones.map(zoneInput) : this.zones();
    const normalized = data.listings.map((x) => normalize(x, catalog));
    if (new Set(normalized.map((x) => x.key)).size !== normalized.length)
      throw Error("Backup com duplicados");
    const keys = new Set(normalized.map((x) => x.key));
    for (const h of data.history)
      if (
        !keys.has(h.key) ||
        !Number.isFinite(Date.parse(h.date)) ||
        [h.old_price, h.new_price].some(
          (v) => v !== null && (!Number.isSafeInteger(v) || v < 0),
        )
      )
        throw Error("Histórico inválido");
    for (const x of data.listings)
      if (
        !Number.isFinite(Date.parse(x.firstSeen)) ||
        !Number.isFinite(Date.parse(x.lastSeen))
      )
        throw Error("Datas inválidas");
    if (data.changes !== undefined && !Array.isArray(data.changes))
      throw Error("Alterações inválidas");
    for (const c of data.changes || []) {
      if (
        !keys.has(c.key) ||
        ![
          "title",
          "description",
          "location",
          "area",
          "typology",
          "propertyType",
          "url",
          "areaType",
          "transaction",
          "municipality",
        ].includes(c.field) ||
        !Number.isFinite(Date.parse(c.date))
      )
        throw Error("Alteração inválida");
      for (const value of [c.old_value, c.new_value]) {
        const parsed = JSON.parse(value);
        if (
          parsed !== null &&
          typeof parsed !== "string" &&
          typeof parsed !== "number"
        )
          throw Error("Valor de alteração inválido");
      }
    }
    return this.transaction(() => {
      this.db.run(
        "DELETE FROM sources; DELETE FROM zones; DELETE FROM runs; DELETE FROM associations; DELETE FROM observations",
      );
      catalog.forEach((x) =>
        this.db.run("INSERT INTO sources VALUES (?,?)", [
          x.id,
          JSON.stringify(x),
        ]),
      );
      zones.forEach((x) =>
        this.db.run("INSERT INTO zones VALUES (?,?)", [
          x.id,
          JSON.stringify(x),
        ]),
      );
      for (const run of data.runs || []) {
        if (!run || typeof run.id !== "string") throw Error("Recolha inválida");
        this.saveRun(run);
      }
      for (const observation of data.observations || []) {
        if (
          !keys.has(observation.key) ||
          typeof observation.scope !== "string" ||
          !Number.isInteger(observation.misses) ||
          observation.misses < 0 ||
          typeof observation.last_run !== "string" ||
          (observation.first_missing != null &&
            !Number.isFinite(Date.parse(observation.first_missing)))
        )
          throw Error("Observação inválida");
        this.db.run(
          "INSERT INTO observations (scope,key,misses,last_run,first_missing) VALUES (?,?,?,?,?)",
          [
            observation.scope,
            observation.key,
            observation.misses,
            observation.last_run,
            observation.first_missing ?? null,
          ],
        );
      }
      for (const association of data.associations || []) {
        if (
          !Array.isArray(association.keys) ||
          association.keys.length !== 2 ||
          !association.keys.every((k) => keys.has(k)) ||
          !["confirmed", "rejected", "pending"].includes(association.state)
        )
          throw Error("Associação inválida");
        this.db.run("INSERT INTO associations VALUES (?,?)", [
          JSON.stringify([...association.keys].sort()),
          JSON.stringify(association),
        ]);
      }
      this.db.run(
        "DELETE FROM listings; DELETE FROM history; DELETE FROM changes; DELETE FROM imports; DELETE FROM meta WHERE key != 'schema_version'",
      );
      data.listings.forEach((x, i) =>
        this.db.run("INSERT INTO listings VALUES (?,?)", [
          normalized[i].key,
          JSON.stringify({ ...x, ...normalized[i] }),
        ]),
      );
      data.history.forEach((h) =>
        this.db.run(
          "INSERT INTO history (key,old_price,new_price,date) VALUES (?,?,?,?)",
          [h.key, h.old_price, h.new_price, h.date],
        ),
      );
      (data.changes || []).forEach((c) =>
        this.db.run(
          "INSERT INTO changes (key,field,old_value,new_value,date) VALUES (?,?,?,?,?)",
          [c.key, c.field, c.old_value, c.new_value, c.date],
        ),
      );
      data.imports.forEach((r) =>
        this.db.run(
          "INSERT INTO imports (date,count,added,changed) VALUES (?,?,?,?)",
          [r.date, r.count, r.added, r.changed],
        ),
      );
      data.settings.forEach((r) => {
        if (
          typeof r.key !== "string" ||
          typeof r.value !== "string" ||
          r.key === "schema_version"
        )
          throw Error("Configuração inválida");
        this.db.run("INSERT INTO meta VALUES (?,?)", [r.key, r.value]);
      });
    });
  }
  backup(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(
      directory,
      `backup-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`,
    );
    fs.writeFileSync(file, JSON.stringify(this.export(), null, 2), {
      mode: 0o600,
    });
    return file;
  }
  close() {
    this.save();
    this.db.close();
  }
}
Object.assign(Store.prototype, require("./catalog-store.cjs"));
module.exports = { Store, money, normalize, safeUrl, SOURCES };
