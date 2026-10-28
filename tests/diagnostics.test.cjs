const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/core/store.cjs");
const { diagnostics } = require("../src/core/diagnostics.cjs");
test("diagnóstico local verifica armazenamento sem consultar rede ou expor segredos", async () => {
  const s = await Store.open();
  let report = diagnostics(s, "povoa-de-lanhoso");
  assert.equal(report.networkVerified, false);
  assert.equal(report.storage.integrity, "ok");
  assert.equal(report.storage.schema, "2");
  assert.equal(report.sources.length, 3);
  assert.equal(report.sources[0].status, "manual");
  assert.equal(report.sources[0].method, "manual");
  s.saveSource({
    id: "test-agency",
    name: "Teste",
    homepage: "https://example.org/",
    method: "jsonld",
    searchUrl: "https://example.org/houses",
    permission: {
      allowed: true,
      evidence: "SEGREDO QUE NÃO DEVE APARECER NO DIAGNÓSTICO",
      termsUrl: "https://example.org/terms",
    },
  });
  s.transaction(() =>
    s.saveRun({
      id: "failed",
      sourceId: "test-agency",
      zoneId: "povoa-de-lanhoso",
      finishedAt: "2026-10-27T00:00:00Z",
      status: "blocked",
      items: 0,
      error: {
        code: "blocked",
        status: 403,
        message: "/home/private/file.txt token=SECRET",
      },
    }),
  );
  report = diagnostics(s, "povoa-de-lanhoso");
  const source = report.sources.find((x) => x.id === "test-agency");
  assert.equal(source.status, "last-attempt-failed");
  assert.equal(source.method, "jsonld");
  assert.equal(source.lastAttempt.httpStatus, 403);
  assert.match(source.action, /não contorne/);
  assert.ok(!JSON.stringify(report).includes("SEGREDO"));
  assert.ok(!JSON.stringify(report).includes("/home/private"));
  s.close();
});
test("diagnóstico distingue falta de pesquisa, autorização e fonte desativada", async () => {
  const s = await Store.open();
  s.saveSource({
    id: "test-agency",
    name: "Teste",
    homepage: "https://example.org/",
    method: "jsonld",
  });
  let source = diagnostics(s, "povoa-de-lanhoso").sources.find(
    (x) => x.id === "test-agency",
  );
  assert.equal(source.status, "needs-search");
  s.saveSource({
    ...s.source("test-agency"),
    searchUrl: "https://example.org/houses",
  });
  source = diagnostics(s, "povoa-de-lanhoso").sources.find(
    (x) => x.id === "test-agency",
  );
  assert.equal(source.status, "needs-permission");
  s.saveSource({ ...s.source("test-agency"), enabled: false });
  source = diagnostics(s, "povoa-de-lanhoso").sources.find(
    (x) => x.id === "test-agency",
  );
  assert.equal(source.status, "disabled");
  assert.throws(() => diagnostics(s, "missing"), /Zona não encontrada/);
  s.close();
});

test("diagnóstico conserva a última tentativa por fonte mesmo além das 100 entradas da interface", async () => {
  const s = await Store.open();
  s.saveSource({
    id: "test-agency",
    name: "Teste",
    homepage: "https://example.org/",
    method: "jsonld",
    searchUrl: "https://example.org/search",
    permission: {
      allowed: true,
      evidence: "Autorização de teste",
      termsUrl: "https://example.org/terms",
    },
  });
  s.transaction(() => {
    s.saveRun({
      id: "old-error",
      sourceId: "test-agency",
      zoneId: "povoa-de-lanhoso",
      finishedAt: "2026-10-26T00:00:00Z",
      status: "failed",
      items: 0,
      error: { code: "timeout" },
    });
    for (let i = 0; i < 120; i++)
      s.saveRun({
        id: "recent-" + i,
        sourceId: "idealista",
        zoneId: "povoa-de-lanhoso",
        finishedAt: "2026-10-27T00:00:00Z",
        status: "partial",
        items: 1,
      });
  });
  assert.equal(s.runs().length, 100);
  const report = diagnostics(s, "povoa-de-lanhoso");
  assert.equal(
    report.sources.find((x) => x.id === "test-agency").lastAttempt.errorCode,
    "timeout",
  );
  s.close();
});
