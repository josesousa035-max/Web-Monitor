const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluate,
  matches,
  duplicates,
  validateSettings,
} = require("../src/core/rules.cjs");
const { Store, safeUrl } = require("../src/core/store.cjs");
const item = {
  key: "idealista:1",
  source: "idealista",
  title: "Moradia",
  reference: "1",
  location: "Póvoa",
  priceCents: 10000000,
  area: 100,
  typology: "T3",
  lastSeen: "2026-01-01T00:00:00Z",
};
test("alertas novos, descidas, limiar e pesquisas sem repetição", () => {
  const config = {
    thresholdEnabled: true,
    thresholdCents: 11000000,
    searches: [
      { id: "a", enabled: true, query: "moradia", maxPriceCents: 11000000 },
    ],
  };
  const alerts = evaluate(new Map(), [item], config);
  assert.equal(alerts.length, 3);
  assert.equal(evaluate(new Map([[item.key, item]]), [item], config).length, 0);
  assert.equal(
    evaluate(
      new Map(),
      [item],
      config,
      alerts.map((a) => a.id),
    ).length,
    0,
  );
  const old = { ...item, priceCents: 12000000 };
  assert.equal(evaluate(new Map([[item.key, old]]), [item], config).length, 3);
  assert.equal(
    evaluate(new Map(), [item], { newEnabled: false, dropEnabled: false })
      .length,
    0,
  );
});
test("pesquisas e candidatos conservadores a duplicados", () => {
  assert.ok(matches(item, { query: "MORADIA", minArea: 90 }));
  assert.ok(!matches(item, { maxPriceCents: 100 }));
  assert.equal(
    duplicates(item, [{ ...item, key: "boulder:2", source: "boulder" }]).length,
    1,
  );
  assert.equal(
    duplicates({ ...item, location: "" }, [{ ...item, source: "boulder" }])
      .length,
    0,
  );
});
test("configuração rejeita valores e fontes inválidos", () => {
  const config = {
    alerts: false,
    urls: { idealista: "", remax: "", boulder: "" },
    searches: [],
  };
  assert.equal(validateSettings(config, safeUrl).alerts, false);
  assert.throws(() =>
    validateSettings({ ...config, thresholdEnabled: true }, safeUrl),
  );
  assert.throws(() =>
    validateSettings(
      {
        ...config,
        searches: [
          { id: "a", name: "a", query: "", source: "evil", enabled: true },
        ],
      },
      safeUrl,
    ),
  );
});
test("erro de escrita reverte dados em memória e histórico", async () => {
  const s = await Store.open();
  const original = s.save.bind(s);
  s.save = () => {
    throw Error("disco cheio");
  };
  assert.throws(() =>
    s.import([
      {
        source: "idealista",
        reference: "1",
        url: "https://idealista.pt/imovel/1/",
        title: "Casa",
        price: 100,
      },
    ]),
  );
  assert.equal(s.list().length, 0);
  assert.equal(s.history("idealista:1").length, 0);
  s.save = original;
  s.close();
});
test("serviço importa anúncios e alertas atomicamente", async () => {
  const { importCollection } = require("../src/core/service.cjs");
  const { normalize } = require("../src/core/store.cjs");
  const s = await Store.open();
  const row = normalize({
    source: "idealista",
    reference: "1",
    title: "Casa",
    url: "https://idealista.pt/imovel/1/",
    price: 100,
  });
  const original = s.setMeta.bind(s);
  s.setMeta = () => {
    throw Error("erro ao guardar alertas");
  };
  assert.throws(() => importCollection(s, [row], {}));
  assert.equal(s.list().length, 0);
  assert.equal(s.rows("SELECT * FROM imports").length, 0);
  s.setMeta = original;
  assert.equal(importCollection(s, [row], {}).alerts.length, 1);
  assert.equal(importCollection(s, [row], {}).alerts.length, 0);
  assert.equal(JSON.parse(s.getMeta("alerts")).length, 1);
  s.close();
});
