const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/core/store.cjs");
const { PILOT_ZONE } = require("../src/core/catalog.cjs");
const {
  parseOSM,
  discoverOSM,
  queryFor,
} = require("../src/core/osm-discovery.cjs");
const fixture = {
  elements: [
    {
      type: "relation",
      id: 10,
      tags: { boundary: "administrative", name: "Póvoa de Lanhoso" },
    },
    {
      type: "node",
      id: 1,
      tags: {
        office: "estate_agent",
        name: "AGÊNCIA SINTÉTICA",
        website: "https://example.org/",
        phone: "NÃO GUARDAR",
      },
    },
    {
      type: "node",
      id: 2,
      tags: { shop: "estate_agent", name: "SEM SITE SINTÉTICO" },
    },
    {
      type: "node",
      id: 3,
      tags: {
        office: "estate_agent",
        name: "IP PRIVADO",
        website: "https://127.0.0.1/",
      },
    },
  ],
};
test("OSM: candidatos não confirmam cobertura, não ativam recolha e conservam atribuição", () => {
  const result = parseOSM(fixture, PILOT_ZONE);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].coverage, []);
  assert.equal(result.sources[0].permission.allowed, false);
  assert.match(result.attribution, /OpenStreetMap/);
  assert.equal(result.leads.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.ok(!JSON.stringify(result).includes("NÃO GUARDAR"));
  assert.throws(
    () => parseOSM({ ...fixture, remark: "timeout" }, PILOT_ZONE),
    /incompleta/,
  );
});
test("OSM: cache evita repetição e candidatos são persistidos sem duplicar domínio", async () => {
  const s = await Store.open();
  let calls = 0;
  const client = {
    fetch: async () => {
      calls++;
      return { body: JSON.stringify(fixture) };
    },
  };
  const first = await discoverOSM(s, PILOT_ZONE.id, {
    client,
    now: () => 1_000_000,
  });
  assert.equal(first.added, 1);
  const second = await discoverOSM(s, PILOT_ZONE.id, {
    client,
    now: () => 1_000_001,
  });
  assert.equal(second.cached, true);
  assert.equal(second.added, 0);
  assert.equal(calls, 1);
  assert.ok(
    !s
      .rows("SELECT value FROM meta WHERE key LIKE 'osm-discovery-%'")[0]
      .value.includes("NÃO GUARDAR"),
  );
  s.close();
});
test("consulta geográfica escapa nomes e limita raio sem fingir geocodificação", () => {
  assert.ok(
    queryFor({ ...PILOT_ZONE, municipality: 'Nome "com aspas"' }).includes(
      '\\"com aspas\\"',
    ),
  );
  assert.throws(
    () =>
      queryFor({
        ...PILOT_ZONE,
        mode: "radius",
        center: { lat: 41, lon: -8 },
        radiusKm: 100,
      }),
    /50 km/,
  );
  assert.throws(
    () => queryFor({ ...PILOT_ZONE, country: "Outro país" }),
    /Portugal/,
  );
});
