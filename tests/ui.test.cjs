const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(
  path.join(__dirname, "../src/ui/index.html"),
  "utf8",
);
const code = fs.readFileSync(path.join(__dirname, "../src/ui/app.js"), "utf8");
async function setup(listings = []) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://app.invalid/",
  });
  dom.window.monitor = {
    list: async () => ({
      ok: true,
      data: {
        listings,
        imports: [],
        settings: {
          urls: { idealista: "https://idealista.pt", remax: "", boulder: "" },
          alerts: false,
        },
      },
    }),
    history: async () => ({ ok: true, data: [] }),
  };
  dom.window.eval(code);
  await new Promise((resolve) => setImmediate(resolve));
  return dom;
}
test("interface vazia: estatísticas, navegação e RE/MAX por configurar", async () => {
  const dom = await setup();
  const d = dom.window.document;
  assert.match(d.querySelector("#listings").textContent, /Importe um ficheiro/);
  assert.equal(d.querySelectorAll(".stat").length, 4);
  d.querySelector('[data-view="sources"]').click();
  assert.equal(d.querySelector("#sources").hidden, false);
  assert.match(d.querySelector("#source-cards").textContent, /Por configurar/);
  dom.window.close();
});
test("interface: pesquisa, filtros de preço e conteúdo importado tratado como texto", async () => {
  const dom = await setup([
    {
      key: "idealista:1",
      source: "idealista",
      reference: "1",
      title: "<img src=x onerror=alert(1)> Moradia",
      location: "Póvoa",
      priceCents: 15000000,
      previousPriceCents: 16000000,
      area: 100,
      typology: "T3",
      firstSeen: "2026-01-01T00:00:00Z",
      lastSeen: "2026-01-01T00:00:00Z",
    },
  ]);
  const d = dom.window.document;
  assert.equal(d.querySelectorAll("#listings article").length, 1);
  assert.equal(d.querySelectorAll("#listings img").length, 0);
  d.querySelector("#search").value = "sem correspondência";
  d.querySelector("#search").dispatchEvent(new dom.window.Event("input"));
  assert.equal(d.querySelectorAll("#listings article").length, 0);
  d.querySelector("#search").value = "";
  d.querySelector("#max").value = "100000";
  d.querySelector("#max").dispatchEvent(new dom.window.Event("input"));
  assert.equal(d.querySelectorAll("#listings article").length, 0);
  dom.window.close();
});
test("1.000 anúncios: paginação limita o DOM a 40 cartões", async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    key: `idealista:${i}`,
    source: "idealista",
    reference: String(i),
    title: `SINTÉTICO ${i}`,
    location: "Póvoa",
    priceCents: 10000000 + i,
    area: 100,
    typology: "T3",
    firstSeen: "2026-01-01T00:00:00Z",
  }));
  const dom = await setup(rows);
  const d = dom.window.document;
  assert.equal(d.querySelectorAll("#listings article").length, 40);
  assert.equal(d.querySelector("#page").textContent, "1 / 25");
  d.querySelector("#next").click();
  assert.equal(d.querySelector("#page").textContent, "2 / 25");
  assert.match(d.querySelector("#listings").textContent, /SINTÉTICO 40/);
  dom.window.close();
});
test("formulário de configurações guarda regras e pesquisa estruturada", async () => {
  const dom = await setup();
  const d = dom.window.document;
  let saved;
  dom.window.monitor.settings = async (value) => {
    saved = value;
    return { ok: true, data: true };
  };
  d.querySelector('[data-view="settings"]').click();
  d.querySelector("#notifications").checked = true;
  d.querySelector("#add-search").click();
  d.querySelector('[data-field="name"]').value = "Moradias";
  d.querySelector('[data-field="query"]').value = "moradia";
  d.querySelector('[data-field="max"]').value = "200000";
  d.querySelector("#settings-form").dispatchEvent(
    new dom.window.Event("submit", { cancelable: true }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.alerts, true);
  assert.equal(saved.searches[0].maxPriceCents, 20000000);
  assert.equal(saved.searches[0].name, "Moradias");
  dom.window.close();
});
test("IDs HTML únicos e API preload sem acesso genérico ao sistema", () => {
  const dom = new JSDOM(html);
  const ids = [...dom.window.document.querySelectorAll("[id]")].map(
    (x) => x.id,
  );
  assert.equal(ids.length, new Set(ids).size);
  const preload = fs.readFileSync(
    path.join(__dirname, "../src/desktop/preload.cjs"),
    "utf8",
  );
  assert.ok(!preload.includes("exposeInMainWorld('ipcRenderer'"));
  assert.ok(!preload.includes("require('node:fs')"));
  dom.window.close();
});
