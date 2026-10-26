const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const init = require("sql.js");
const { Store, normalize } = require("../src/core/store.cjs");
const {
  sourceInput,
  zoneInput,
  PILOT_ZONE,
} = require("../src/core/catalog.cjs");
const { zoneMatches, distanceKm } = require("../src/core/geography.cjs");
const { candidates, plan } = require("../src/core/discovery.cjs");
const custom = {
  id: "local-example",
  name: "Agência local de exemplo sintético",
  homepage: "https://example.org/",
  coverage: ["Póvoa de Lanhoso"],
  searchUrl: "https://example.org/imoveis",
  method: "jsonld",
  permission: {
    allowed: true,
    evidence: "Autorização sintética de teste, não válida para recolha real",
    termsUrl: "https://example.org/terms",
  },
  connector: { scopeVerified: true, transaction: "sale" },
};
test("fonte arbitrária registada permite importar sem lista fixa; domínio incoerente recusado", async () => {
  const s = await Store.open();
  s.saveSource(custom);
  s.import([
    {
      source: custom.id,
      url: "https://example.org/house/1",
      reference: "1",
      title: "SINTÉTICO",
      price: 100,
      transaction: "sale",
    },
  ]);
  assert.equal(s.list()[0].source, custom.id);
  assert.throws(() =>
    s.import([
      { source: custom.id, url: "https://evil.org/1", title: "Outro" },
    ]),
  );
  assert.throws(() => s.saveSource({ ...custom, id: "second" }));
  assert.throws(() =>
    s.saveSource({ ...custom, homepage: "https://evil.org/" }),
  );
  s.close();
});
test("migração SQLite v1→v2 cria backup e preserva registos e metadados", async () => {
  const SQL = await init();
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO meta VALUES('schema_version','1');CREATE TABLE listings(key TEXT PRIMARY KEY,data TEXT NOT NULL);",
  );
  const listing = {
    ...normalize({
      source: "idealista",
      reference: "1",
      url: "https://idealista.pt/imovel/1",
      title: "Casa",
      price: 100,
    }),
    firstSeen: "2026-01-01T00:00:00Z",
    lastSeen: "2026-01-01T00:00:00Z",
  };
  db.run("INSERT INTO listings VALUES (?,?)", [
    listing.key,
    JSON.stringify(listing),
  ]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wm-v1-")),
    file = path.join(directory, "monitor.sqlite");
  const original = db.export();
  fs.writeFileSync(file, original);
  db.close();
  const s = await Store.open(file);
  assert.equal(s.getMeta("schema_version"), "2");
  assert.deepEqual(s.list(), [listing]);
  assert.equal(s.sources().length, 3);
  assert.equal(s.zones()[0].id, PILOT_ZONE.id);
  const backup = fs.readdirSync(directory).find((x) => x.includes("pre-v2"));
  assert.ok(backup);
  assert.ok(
    fs.readFileSync(path.join(directory, backup)).equals(Buffer.from(original)),
  );
  s.close();
  fs.rmSync(directory, { recursive: true });
});
test("exportação v2 restaura catálogo/zonas/associações, desativando permissões de rede", async () => {
  const s = await Store.open();
  s.saveSource(custom);
  s.saveZone({ ...PILOT_ZONE, id: "another-zone", name: "Outra zona" });
  s.import([
    { source: custom.id, url: "https://example.org/1", title: "A" },
    { source: "idealista", url: "https://idealista.pt/1", title: "B" },
  ]);
  s.associate({ keys: s.list().map((x) => x.key), state: "confirmed" });
  const copy = await Store.open();
  copy.restore(s.export());
  assert.equal(copy.sources().length, 4);
  assert.equal(copy.zones().length, 2);
  assert.equal(copy.associations()[0].state, "confirmed");
  assert.equal(copy.source(custom.id).permission.allowed, false);
  copy.associate({ keys: copy.list().map((x) => x.key), state: "rejected" });
  assert.equal(copy.associations()[0].state, "rejected");
  s.close();
  copy.close();
});
test("geografia: raio exige precisão; texto não prova distância; áreas e preços limitam resultados", () => {
  assert.ok(distanceKm({ lat: 41, lon: -8 }, { lat: 41.01, lon: -8 }) > 1);
  const zone = zoneInput({
    ...PILOT_ZONE,
    mode: "radius",
    center: { lat: 41, lon: -8, precision: "exact" },
    radiusKm: 5,
  });
  const row = {
    location: "Póvoa de Lanhoso",
    coordinates: { lat: 41.01, lon: -8, precision: "exact" },
    priceCents: 100,
    area: 100,
    transaction: "sale",
  };
  assert.equal(zoneMatches(row, zone).match, true);
  assert.equal(
    zoneMatches(
      { ...row, coordinates: { ...row.coordinates, precision: "approximate" } },
      zone,
    ).match,
    false,
  );
  assert.equal(
    zoneMatches({ ...row, coordinates: null }, zone).precision,
    "unknown",
  );
  assert.equal(
    zoneMatches(row, { ...PILOT_ZONE, maxPriceCents: 50 }).match,
    false,
  );
  assert.throws(() => zoneInput({ ...zone, center: null }));
});
test("descoberta assistida extrai candidatos por domínio e não inventa cobertura", () => {
  const html =
    '<p><a href="https://example.org/agency">Imobiliária em Póvoa de Lanhoso</a></p><p><a href="https://www.example.org/contact">Imóveis</a></p><a href="https://facebook.com/agency">Imobiliária</a><a href="https://localhost/internal">Imobiliária</a>';
  const out = candidates(Buffer.from(html), ".html", PILOT_ZONE);
  assert.equal(out.sources.length, 1);
  assert.deepEqual(out.sources[0].coverage, []);
  assert.equal(out.sources[0].state, "discovered");
  assert.equal(out.sources[0].permission.allowed, false);
  assert.ok(out.warnings.length);
  assert.equal(plan(PILOT_ZONE).mode, "assisted");
  assert.ok(plan(PILOT_ZONE).queries.length >= 5);
});
module.exports = { custom };
test("pesquisas por zona são preservadas sem substituir filtros de outra zona", async () => {
  const s = await Store.open();
  s.saveSource(custom);
  s.saveZone({
    ...PILOT_ZONE,
    id: "braga",
    name: "Braga",
    municipality: "Braga",
  });
  s.saveSource({
    ...s.source(custom.id),
    searchZoneId: "braga",
    searchUrl: "https://example.org/search?place=braga",
  });
  const source = s.source(custom.id);
  assert.equal(source.searches.braga, "https://example.org/search?place=braga");
  assert.equal(source.searches[PILOT_ZONE.id], custom.searchUrl);
  assert.equal(source.searchUrl, custom.searchUrl);
  s.close();
});

test('backup preserva todo o diário e observações e aceita backup JSON v1', async () => {
  const store = await Store.open();
  store.import([{source:'idealista',reference:'one',url:'https://idealista.pt/1',title:'Exemplo',area:100,areaType:'gross',transaction:'sale'}]);
  store.import([{source:'idealista',reference:'one',url:'https://idealista.pt/1',title:'Exemplo',area:100,areaType:'usable',transaction:'rent'}]);
  store.transaction(() => {for (let i=0;i<105;i++)store.saveRun({id:String(i),sourceId:'idealista',finishedAt:'2026-01-01T00:00:00Z',status:'partial',items:1});store.db.run('INSERT INTO observations VALUES (?,?,?,?,?)',['scope','idealista:one',1,'1','2026-01-01T00:00:00Z']);});
  const backup=store.export();assert.equal(backup.runs.length,105);const copy=await Store.open();copy.restore(backup);assert.equal(copy.rows('SELECT * FROM runs').length,105);assert.equal(copy.rows('SELECT * FROM observations')[0].misses,1);assert.equal(copy.rows('SELECT * FROM changes').length,2);
  const legacy={...backup,version:1};delete legacy.sources;delete legacy.zones;delete legacy.runs;delete legacy.associations;delete legacy.observations;copy.restore(legacy);assert.equal(copy.list().length,1);assert.equal(copy.sources().length,3);store.close();copy.close();
});
