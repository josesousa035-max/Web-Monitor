const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../src/core/store.cjs");
const { sourceInput, PILOT_ZONE } = require("../src/core/catalog.cjs");
const { collect, updateSource } = require("../src/core/collector.cjs");
const input = {
  id: "fixture-agency",
  name: "Agência SINTÉTICA",
  homepage: "https://example.org/",
  searchUrl: "https://example.org/houses",
  method: "jsonld",
  permission: {
    allowed: true,
    evidence: "Autorização sintética exclusiva de testes",
    termsUrl: "https://example.org/terms",
  },
  connector: { scopeVerified: true, maxPages: 3, transaction: "sale" },
};
const page = (id, next = "", extra = {}) =>
  '<html><head><script type="application/ld+json">' +
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "House",
    name: "SINTÉTICO " + id,
    sku: id,
    url: "https://example.org/house/" + id,
    address: { addressLocality: "Póvoa de Lanhoso" },
    floorSize: { value: 120, unitCode: "MTK" },
    offers: { price: "100000", priceCurrency: "EUR" },
    ...extra,
  }) +
  "</script></head><body>" +
  next +
  "</body></html>";
function client(pages) {
  const visited = [];
  return {
    visited,
    fetch: async (url) => {
      visited.push(url);
      if (url.endsWith("/robots.txt"))
        return { body: "User-agent: *\nDisallow:", headers: {}, url };
      const value = pages[url];
      if (value instanceof Error) throw value;
      if (value === undefined) throw Error("Página inesperada");
      return { body: value, headers: { "content-type": "text/html" }, url };
    },
  };
}
test("conector estruturado percorre paginação e produz recolha completa sem inventar área útil", async () => {
  const result = await collect(
    sourceInput(input),
    PILOT_ZONE,
    client({
      "https://example.org/houses": page(
        "1",
        '<a rel="next" href="/page2">Seguinte</a>',
      ),
      "https://example.org/page2": page("2"),
    }),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.items, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.listings[0].areaType, "unknown");
  assert.equal(result.listings[0].coordinates, null);
});
test("limite de páginas e ciclos são parciais; bloqueio e página alterada não parecem zero resultados", async () => {
  const limited = await collect(
    sourceInput({ ...input, connector: { ...input.connector, maxPages: 1 } }),
    PILOT_ZONE,
    client({
      "https://example.org/houses": page(
        "1",
        '<a rel="next" href="/page2">Seguinte</a>',
      ),
    }),
  );
  assert.equal(limited.status, "partial");
  assert.equal(limited.exhaustive, false);
  const changed = await collect(
    sourceInput(input),
    PILOT_ZONE,
    client({
      "https://example.org/houses":
        "<h1>Nova página sem anúncios reconhecidos</h1>",
    }),
  );
  assert.equal(changed.status, "failed");
  const cycle = await collect(
    sourceInput(input),
    PILOT_ZONE,
    client({
      "https://example.org/houses": page(
        "1",
        '<a rel="next" href="/houses">Outra</a>',
      ),
    }),
  );
  assert.equal(cycle.status, "partial");
});
test("sem autorização, robots bloqueado e cancelamento não recolhem dados", async () => {
  const noPermission = client({});
  const denied = await collect(
    sourceInput({ ...input, permission: { allowed: false } }),
    PILOT_ZONE,
    noPermission,
  );
  assert.equal(denied.status, "blocked");
  assert.equal(noPermission.visited.length, 0);
  const robots = {
    fetch: async (url) => ({
      body: "User-agent: *\nDisallow: /houses",
      headers: {},
      url,
    }),
  };
  assert.equal(
    (await collect(sourceInput(input), PILOT_ZONE, robots)).status,
    "blocked",
  );
  const controller = new AbortController();
  controller.abort();
  const cancelled = await collect(sourceInput(input), PILOT_ZONE, client({}), {
    signal: controller.signal,
  });
  assert.equal(cancelled.status, "cancelled");
});
test("falha de página intermédia não remove nem altera os anúncios anteriores", async () => {
  const s = await Store.open();
  s.saveSource(input);
  await updateSource(s, input.id, PILOT_ZONE.id, {
    client: client({ "https://example.org/houses": page("1") }),
    now: () => "2026-01-01T00:00:00Z",
  });
  const result = await updateSource(s, input.id, PILOT_ZONE.id, {
    client: client({
      "https://example.org/houses": page(
        "2",
        '<a rel="next" href="/page2">Seguinte</a>',
      ),
      "https://example.org/page2": Error("Rede indisponível"),
    }),
  });
  assert.equal(result.run.status, "failed");
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].reference, "1");
  assert.equal(s.list()[0].status, "active");
  assert.equal(s.runs().length, 2);
  s.close();
});
test("ausências só mudam estado com recolhas completas espaçadas e mesma pesquisa", async () => {
  const s = await Store.open();
  s.saveSource({
    ...input,
    connector: { ...input.connector, selectors: { empty: ".empty" } },
  });
  const update = (body, date) =>
    updateSource(s, input.id, PILOT_ZONE.id, {
      client: client({ "https://example.org/houses": body }),
      now: () => date,
    });
  await update(page("1"), "2026-01-01T00:00:00Z");
  await update('<div class="empty"></div>', "2026-01-02T00:00:00Z");
  assert.equal(s.list()[0].status, "active");
  await update('<div class="empty"></div>', "2026-01-03T00:00:00Z");
  assert.equal(s.list()[0].status, "potentially-unavailable");
  await update('<div class="empty"></div>', "2026-01-04T00:00:00Z");
  assert.equal(s.list()[0].status, "unavailable");
  await update(page("1"), "2026-01-05T00:00:00Z");
  assert.equal(s.list()[0].status, "active");
  assert.equal(s.history(input.id + ":1").length, 1);
  s.close();
});
test("HTML específico e feed RSS extraem apenas campos configurados/publicados", async () => {
  const htmlSource = sourceInput({
    ...input,
    method: "html",
    connector: {
      selectors: {
        item: "article",
        title: "h2",
        url: "a",
        price: ".price",
        area: ".area",
        location: ".location",
      },
      areaType: "land",
    },
  });
  const result = await collect(
    htmlSource,
    PILOT_ZONE,
    client({
      "https://example.org/houses":
        '<article><h2>Terreno SINTÉTICO</h2><a href="/1">Ver</a><p class="price">90.000 €</p><p class="area">500 m²</p><p class="location">Póvoa de Lanhoso</p></article>',
    }),
  );
  assert.equal(result.items, 1);
  assert.equal(result.listings[0].areaType, "land");
  assert.equal(result.listings[0].priceCents, 9000000);
  const rss = await collect(
    sourceInput({ ...input, method: "rss" }),
    PILOT_ZONE,
    client({
      "https://example.org/houses":
        '<rss><channel><item><title>SINTÉTICO</title><link>https://example.org/1</link><guid>1</guid><price currency="EUR">100000</price></item></channel></rss>',
    }),
  );
  assert.equal(rss.items, 1);
  assert.equal(rss.listings[0].priceCents, 10000000);
});
test("zona nova não reutiliza silenciosamente a pesquisa de outra localização", async () => {
  const result = await collect(
    sourceInput(input),
    { ...PILOT_ZONE, id: "another" },
    client({}),
  );
  assert.equal(result.status, "failed");
  assert.match(result.error.message, /pesquisa/);
});
test("preço estrangeiro é preservado na origem sem conversão e datas explícitas são retidas", async () => {
  const result = await collect(
    sourceInput(input),
    PILOT_ZONE,
    client({
      "https://example.org/houses": page("1", "", {
        offers: { price: 200000, priceCurrency: "USD" },
        datePublished: "2026-01-01",
      }),
    }),
  );
  assert.equal(result.listings[0].priceCents, null);
  assert.equal(result.listings[0].originalCurrency, "USD");
  assert.equal(result.listings[0].originalPrice, "200000");
  assert.equal(result.listings[0].publishedAt, "2026-01-01");
  assert.equal(result.exhaustive, false);
});
