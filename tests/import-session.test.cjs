const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store, normalize } = require("../src/core/store.cjs");
const {
  ImportSession,
  fingerprint,
} = require("../src/core/import-session.cjs");
const { readImportResult, readImport } = require("../src/core/importers.cjs");
const { importCollection } = require("../src/core/service.cjs");
const base = (extra = {}) => ({
  source: "idealista",
  reference: "1",
  url: "https://idealista.pt/imovel/1",
  title: "Casa de teste",
  price: 200000,
  description: "Descrição conhecida",
  location: "Póvoa de Lanhoso",
  area: 150,
  areaType: "gross",
  ...extra,
});
test("revisão não grava; cancelar e confirmar token cancelado preservam estado", async () => {
  const s = await Store.open();
  let backups = 0;
  const sessions = new ImportSession(s, { beforeCommit: () => backups++ });
  const before = fingerprint(s);
  const review = sessions.prepare([base()], { sourceId: "idealista" });
  assert.equal(review.summary.newListings, 1);
  assert.equal(fingerprint(s), before);
  assert.equal(backups, 0);
  assert.ok(sessions.cancel(review.token));
  assert.throws(() => sessions.confirm(review.token), /inexistente/);
  assert.equal(s.list().length, 0);
  s.close();
});
test("confirmação grava uma vez e gera diário/alertas por fonte real do ficheiro", async () => {
  const s = await Store.open();
  let backups = 0;
  const sessions = new ImportSession(s, { beforeCommit: () => backups++ });
  const review = sessions.prepare(
    [
      base(),
      { ...base(), source: "boulder", url: "https://boulderimobiliaria.pt/1" },
    ],
    { sourceId: "idealista" },
  );
  assert.equal(review.summary.total, 2);
  const result = sessions.confirm(review.token);
  assert.equal(result.summary.added, 2);
  assert.equal(result.alerts.length, 2);
  assert.equal(s.runs().length, 2);
  assert.equal(s.source("idealista").lastResult.items, 1);
  assert.equal(s.source("boulder").lastResult.items, 1);
  assert.equal(backups, 1);
  assert.throws(() => sessions.confirm(review.token), /já confirmada/);
  assert.equal(s.history("idealista:1").length, 1);
  s.close();
});
test("revisão expirada/obsoleta e token substituído não gravam", async () => {
  const s = await Store.open();
  let now = 1000;
  const sessions = new ImportSession(s, { now: () => now, ttlMs: 100 });
  const first = sessions.prepare([base()], { sourceId: "idealista" });
  now = 1200;
  assert.throws(() => sessions.confirm(first.token), /expirou/);
  const second = sessions.prepare([base()], { sourceId: "idealista" });
  s.setMeta("changed", "yes");
  assert.throws(() => sessions.confirm(second.token), /mudaram/);
  const third = sessions.prepare([base()], { sourceId: "idealista" });
  sessions.prepare([base({ reference: "2" })], { sourceId: "idealista" });
  assert.throws(() => sessions.confirm(third.token), /inexistente/);
  assert.equal(s.list().length, 0);
  s.close();
});
test("falha de backup ou gravação não deixa anúncios, alertas ou diário parciais", async () => {
  const s = await Store.open();
  const session = new ImportSession(s, {
    beforeCommit: () => {
      throw Error("backup falhou");
    },
  });
  let review = session.prepare([base()], { sourceId: "idealista" });
  assert.throws(() => session.confirm(review.token), /backup falhou/);
  assert.equal(s.list().length, 0);
  const other = new ImportSession(s);
  review = other.prepare([base()], { sourceId: "idealista" });
  const original = s.save.bind(s);
  s.save = () => {
    throw Error("disco cheio");
  };
  assert.throws(() => other.confirm(review.token), /disco cheio/);
  assert.equal(s.list().length, 0);
  assert.equal(s.getMeta("alerts"), undefined);
  assert.equal(s.runs().length, 0);
  s.save = original;
  other.confirm(review.token);
  assert.equal(s.list().length, 1);
  s.close();
});
test("observação parcial mantém preço/metadados e não gera alertas falsos", async () => {
  const s = await Store.open();
  importCollection(s, [normalize(base())], {});
  const patch = {
    source: "idealista",
    reference: "1",
    url: base().url,
    title: base().title,
  };
  const session = new ImportSession(s);
  const review = session.prepare([patch], { sourceId: "idealista" });
  assert.equal(review.summary.priceChanges, 0);
  assert.equal(review.summary.metadataChanges, 0);
  assert.equal(review.summary.preservedListings, 1);
  assert.ok(review.samples[0].preservedFields.includes("priceCents"));
  const result = session.confirm(review.token);
  assert.equal(result.alerts.length, 0);
  assert.equal(s.list()[0].priceCents, 20000000);
  assert.equal(s.list()[0].description, "Descrição conhecida");
  assert.equal(s.history("idealista:1").length, 1);
  s.close();
});
test("null explícito, zero e área/tipo mantêm semânticas distintas", async () => {
  const s = await Store.open();
  s.import([base()]);
  s.import([
    {
      source: "idealista",
      reference: "1",
      url: base().url,
      title: base().title,
      price: null,
      description: null,
    },
  ]);
  assert.equal(s.list()[0].priceCents, null);
  assert.equal(s.list()[0].description, "");
  assert.equal(s.list()[0].area, 150);
  s.import([
    {
      source: "idealista",
      reference: "1",
      url: base().url,
      title: base().title,
      price: 0,
      area: 120,
    },
  ]);
  assert.equal(s.list()[0].priceCents, 0);
  assert.equal(s.list()[0].area, 120);
  assert.equal(s.list()[0].areaType, "unknown");
  assert.throws(
    () =>
      s.import([
        {
          source: "idealista",
          reference: "1",
          url: base().url,
          title: base().title,
          areaType: "land",
        },
      ]),
    /forneça também/,
  );
  s.close();
});
test("HTML parcial conserva avisos; confirmação parcial é obrigatória", async () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify([
      {
        "@type": "House",
        name: "Casa",
        url: "https://idealista.pt/1",
        offers: { price: 100000, priceCurrency: "EUR" },
      },
      {
        "@type": "House",
        name: "Fora",
        url: "https://outro.org/1",
        offers: { price: 100000, priceCurrency: "EUR" },
      },
    ]) +
    "</script>";
  const result = await readImportResult(
    Buffer.from(html),
    ".html",
    "idealista",
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.partial, true);
  assert.ok(result.warnings.length);
  await assert.rejects(
    readImport(Buffer.from(html), ".html", "idealista"),
    /parcial/,
  );
  const s = await Store.open();
  const session = new ImportSession(s);
  const review = session.prepare(result.rows, {
    sourceId: "idealista",
    warnings: result.warnings,
    partial: result.partial,
  });
  assert.throws(() => session.confirm(review.token), /explicitamente/);
  assert.equal(s.list().length, 0);
  session.confirm(review.token, { acceptPartial: true });
  assert.equal(s.list().length, 1);
  s.close();
});
test("HTML sem preço/área não apaga os campos conhecidos; CSV vazio também preserva", async () => {
  const s = await Store.open();
  s.import([base()]);
  const html =
    '<script type="application/ld+json">{"@type":"House","sku":"1","name":"Casa de teste","url":"https://idealista.pt/imovel/1"}</script>';
  const result = await readImportResult(
    Buffer.from(html),
    ".html",
    "idealista",
  );
  s.import(result.rows);
  assert.equal(s.list()[0].priceCents, 20000000);
  assert.equal(s.list()[0].area, 150);
  assert.equal(s.list()[0].areaType, "gross");
  const csv =
    "source,reference,url,title,price,area\nidealista,1,https://idealista.pt/imovel/1,Casa de teste,,\n";
  s.import(await readImport(Buffer.from(csv), ".csv", "idealista"));
  assert.equal(s.list()[0].priceCents, 20000000);
  assert.equal(s.history("idealista:1").length, 1);
  s.close();
});

test("JSON com BOM e limite de revisão são tratados antes da gravação", async () => {
  const rows = await readImport(
    Buffer.from("\uFEFF" + JSON.stringify([base()])),
    ".json",
    "idealista",
  );
  assert.equal(rows.length, 1);
  const s = await Store.open();
  const session = new ImportSession(s);
  const previous = session.prepare([base()], { sourceId: "idealista" });
  assert.throws(
    () => session.prepare(Array(10001).fill(base()), { sourceId: "idealista" }),
    /10.000/,
  );
  assert.throws(() => session.confirm(previous.token), /inexistente/);
  assert.equal(s.list().length, 0);
  s.close();
});

test("backup v3 conserva a proveniência de campos preservados e lê backups v2", async () => {
  const s = await Store.open();
  s.import([base()]);
  s.import([
    {
      source: "idealista",
      reference: "1",
      title: base().title,
      url: base().url,
    },
  ]);
  const backup = s.export();
  assert.equal(backup.version, 3);
  const copy = await Store.open();
  copy.restore(backup);
  assert.equal(copy.list()[0].priceCents, 20000000);
  assert.ok(copy.list()[0].preservedFields.includes("priceCents"));
  assert.equal(
    copy.list()[0].fieldObservedAt.priceCents,
    s.list()[0].fieldObservedAt.priceCents,
  );
  copy.restore({ ...backup, version: 2 });
  assert.equal(copy.history("idealista:1").length, 1);
  s.close();
  copy.close();
});

test("datas inválidas ou sem fuso não apagam datas anteriores nem inventam calendário", async () => {
  const s = await Store.open();
  s.import([
    base({
      publishedAt: "2026-10-01",
      sourceUpdatedAt: "2026-10-26T12:00:00Z",
    }),
  ]);
  s.import([
    base({ publishedAt: "2026-02-31", sourceUpdatedAt: "2026-10-27T10:00:00" }),
  ]);
  assert.equal(s.list()[0].publishedAt, "2026-10-01");
  assert.equal(s.list()[0].sourceUpdatedAt, "2026-10-26T12:00:00Z");
  assert.ok(s.list()[0].preservedFields.includes("publishedAt"));
  s.close();
});
