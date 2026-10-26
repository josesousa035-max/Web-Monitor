const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store, normalize, money, safeUrl } = require("../src/core/store.cjs");
const { readImport, htmlListings } = require("../src/core/importers.cjs");
const listing = (extra = {}) => ({
  source: "idealista",
  reference: "123",
  url: "https://www.idealista.pt/imovel/123/",
  title: "Moradia T3",
  price: "150.000,50",
  area: "120,5",
  ...extra,
});
test("normalização monetária portuguesa e preços desconhecidos", () => {
  assert.equal(money("150.000,50 €"), 15000050);
  assert.equal(money(null), null);
  assert.equal(money(0), 0);
  assert.throws(() => money("-2"));
  assert.throws(() => money("preço inválido"));
  assert.equal(normalize(listing()).area, 120.5);
});
test("URLs e dados não fiáveis são rejeitados", () => {
  for (const url of [
    "file:///etc/passwd",
    "http://idealista.pt",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://user:pass@idealista.pt",
  ])
    assert.throws(() => safeUrl(url));
  assert.throws(() =>
    normalize(listing({ url: "https://evil.example/imovel" })),
  );
  assert.throws(() => normalize(listing({ area: -5 })));
});
test("novos, subida, descida e reimportação idempotente", async () => {
  const s = await Store.open();
  assert.equal(s.import([listing()]).added, 1);
  assert.deepEqual(s.import([listing()]), { count: 1, added: 0, changed: 0 });
  assert.equal(s.history("idealista:123").length, 1);
  assert.equal(s.import([listing({ price: 160000 })]).changed, 1);
  assert.equal(s.import([listing({ price: 140000 })]).changed, 1);
  assert.equal(s.history("idealista:123").length, 3);
  assert.equal(s.list()[0].previousPriceCents, 16000000);
  s.close();
});
test("falha e importação parcial não removem anúncios nem alteram histórico", async () => {
  const s = await Store.open();
  s.import([listing()]);
  assert.throws(() =>
    s.import([
      listing({ price: 130000 }),
      listing({ reference: "456", price: "erro" }),
    ]),
  );
  s.import([]);
  assert.equal(s.list()[0].priceCents, 15000050);
  assert.equal(s.list()[0].status, "active");
  assert.equal(s.history("idealista:123").length, 1);
  s.close();
});
test("duplicados contraditórios rejeitados e duplicados iguais consolidados", async () => {
  const s = await Store.open();
  assert.throws(() => s.import([listing(), listing({ price: 1 })]));
  assert.equal(s.list().length, 0);
  assert.equal(s.import([listing(), listing()]).count, 1);
  s.close();
});
test("persistência SQLite, exportação e restauração conservam histórico", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wm-test-"));
  const file = path.join(dir, "data.sqlite");
  let s = await Store.open(file);
  s.import([listing()]);
  s.import([listing({ price: 120000 })]);
  s.setMeta("settings", '{"alerts":false}');
  const backupFile = s.backup(dir);
  s.close();
  s = await Store.open(file);
  assert.equal(s.list().length, 1);
  assert.equal(s.history("idealista:123").length, 2);
  const t = await Store.open();
  t.restore(JSON.parse(fs.readFileSync(backupFile)));
  assert.deepEqual(t.list(), s.list());
  assert.equal(t.history("idealista:123").length, 2);
  assert.equal(t.getMeta("settings"), '{"alerts":false}');
  assert.throws(() => t.restore({ format: "web-monitor", version: 9 }));
  assert.equal(t.list().length, 1);
  t.close();
  s.close();
  fs.rmSync(dir, { recursive: true });
});
test("restauração inválida não perde estado", async () => {
  const s = await Store.open();
  s.import([listing()]);
  const data = s.export();
  data.history[0].key = "unknown";
  assert.throws(() => s.restore(data));
  assert.equal(s.list().length, 1);
  const bad = s.export();
  bad.settings = [{ key: "schema_version", value: "2" }];
  assert.throws(() => s.restore(bad));
  assert.equal(s.history("idealista:123").length, 1);
  s.close();
});
test("JSON e CSV locais", async () => {
  assert.equal(
    (await readImport(Buffer.from(JSON.stringify([listing()])), ".json"))
      .length,
    1,
  );
  const csv =
    "source,reference,url,title,price\nidealista,123,https://idealista.pt/imovel/123/,Casa,120000\n";
  assert.equal(
    (await readImport(Buffer.from(csv), ".csv"))[0].priceCents,
    12000000,
  );
  await assert.rejects(readImport(Buffer.from("{}"), ".json"));
  await assert.rejects(readImport(Buffer.alloc(10 * 1024 * 1024 + 1), ".json"));
});
test("HTML estruturado local, sem executar scripts; página alterada e bloqueio rejeitados", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures/listing.html"),
    "utf8",
  );
  const rows = htmlListings(html, "boulder");
  assert.equal(rows[0].priceCents, 18000000);
  assert.throws(() => htmlListings("<h1>CAPTCHA</h1>", "boulder"));
  assert.throws(() =>
    htmlListings("<article>Formato alterado</article>", "boulder"),
  );
});
test("e-mail MIME local com anúncio estruturado", async () => {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures/listing.html"),
    "utf8",
  );
  const eml = `From: teste@example.invalid\r\nTo: teste@example.invalid\r\nSubject: Exemplo sintético\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`;
  const rows = await readImport(Buffer.from(eml), ".eml", "boulder");
  assert.equal(rows[0].reference, "SYNTHETIC-1");
});
test("alterações de metadados preservadas no backup sem duplicação", async () => {
  const s = await Store.open();
  s.import([listing()]);
  s.import([listing({ title: "Moradia renovada", area: 130 })]);
  assert.equal(s.rows("SELECT * FROM changes").length, 2);
  s.import([listing({ title: "Moradia renovada", area: 130 })]);
  assert.equal(s.rows("SELECT * FROM changes").length, 2);
  const copy = await Store.open();
  copy.restore(s.export());
  assert.equal(copy.rows("SELECT * FROM changes").length, 2);
  assert.equal(copy.history("idealista:123").length, 1);
  s.close();
  copy.close();
});
test("áreas portuguesas, preço sob consulta e datas sem fuso não são inventados", () => {
  const row = normalize(
    listing({
      area: "1.200,5",
      price: "Sob consulta",
      publishedAt: "2026-10-26",
      sourceUpdatedAt: "2026-10-26T10:00:00",
    }),
  );
  assert.equal(row.area, 1200.5);
  assert.equal(row.priceCents, null);
  assert.equal(row.publishedAt, "2026-10-26");
  assert.equal(row.sourceUpdatedAt, null);
});
test("identidade de páginas com id no query é estável e não inclui tracking", () => {
  const a = normalize(
    listing({
      reference: undefined,
      url: "https://idealista.pt/detail.aspx?id=1&utm_source=demo",
    }),
  );
  const b = normalize(
    listing({
      reference: undefined,
      url: "https://idealista.pt/detail.aspx?utm_source=other&id=1",
    }),
  );
  const c = normalize(
    listing({
      reference: undefined,
      url: "https://idealista.pt/detail.aspx?id=2",
    }),
  );
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
});
