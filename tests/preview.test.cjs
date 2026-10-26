const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { JSDOM } = require("jsdom");
const { buildPreview } = require("../scripts/build-preview.cjs");
test("preview autónoma: CSP válida, dados fictícios, filtros, histórico e navegação", async () => {
  const html = fs.readFileSync(buildPreview(), "utf8");
  const dom = new JSDOM(html, {
    url: "https://preview.invalid/",
    runScripts: "dangerously",
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const d = dom.window.document;
  assert.equal(
    d.querySelectorAll('script[src],link[href],img[src^="http"]').length,
    0,
  );
  const csp = d.querySelector('[http-equiv="Content-Security-Policy"]').content;
  for (const node of d.querySelectorAll("script,style"))
    assert.ok(
      csp.includes(
        crypto.createHash("sha256").update(node.textContent).digest("base64"),
      ),
    );
  assert.match(d.querySelector(".preview-banner").textContent, /fictícios/);
  assert.equal(d.querySelectorAll("#listings article").length, 12);
  assert.match(d.querySelector("#stats").textContent, /12/);
  d.querySelector("#source-filter").value = "idealista";
  d.querySelector("#source-filter").dispatchEvent(
    new dom.window.Event("input"),
  );
  assert.equal(d.querySelectorAll("#listings article").length, 4);
  d.querySelector("#listings button").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.querySelector("#detail").open, true);
  assert.equal(d.querySelectorAll("#detail table tr").length, 3);
  assert.match(
    d.querySelector("#detail-content").textContent,
    /inteiramente fictício/,
  );
  d.querySelector("#close-detail").click();
  assert.equal(d.querySelector("#detail").open, false);
  d.querySelector('[data-view="settings"]').click();
  assert.equal(d.querySelector("#settings").hidden, false);
  assert.equal(d.querySelector("#restore").disabled, true);
  assert.equal(d.querySelector("#notifications").disabled, true);
  assert.equal(d.querySelectorAll(".search-rule").length, 1);
  dom.window.close();
});
test("preview: criar zona e fonte, alternar localização e preparar descoberta sem dados reais", async () => {
  const dom = new JSDOM(fs.readFileSync(buildPreview(), "utf8"), {
    url: "https://preview.invalid/",
    runScripts: "dangerously",
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    },
  });
  const flush = () => new Promise((r) => setImmediate(r));
  await flush();
  const d = dom.window.document;
  d.querySelector('[data-view="zones"]').click();
  assert.equal(d.querySelector("#zones").hidden, false);
  d.querySelector("#add-zone").click();
  d.querySelector("#zone-name").value = "Braga SINTÉTICA";
  d.querySelector("#zone-municipality").value = "Braga";
  d.querySelector("#zone-form").dispatchEvent(
    new dom.window.Event("submit", { cancelable: true }),
  );
  await flush();
  assert.equal(d.querySelectorAll("#zone-cards article").length, 2);
  assert.equal(d.querySelectorAll("#listings article").length, 0);
  d.querySelector("#zone-filter").value = "povoa-de-lanhoso";
  d.querySelector("#zone-filter").dispatchEvent(new dom.window.Event("change"));
  await flush();
  assert.equal(d.querySelectorAll("#listings article").length, 12);
  d.querySelector('[data-view="sources"]').click();
  d.querySelector("#add-source").click();
  d.querySelector("#source-name").value = "Agência SINTÉTICA de teste";
  d.querySelector("#source-homepage").value = "https://example.org/";
  d.querySelector("#source-form").dispatchEvent(
    new dom.window.Event("submit", { cancelable: true }),
  );
  await flush();
  assert.equal(d.querySelectorAll("#source-cards article").length, 4);
  assert.ok(d.querySelector('#source-filter option[value="example-org"]'));
  assert.match(
    d.querySelector("#source-cards").textContent,
    /autorização não confirmada/,
  );
  d.querySelector("#discover").click();
  await flush();
  assert.equal(d.querySelectorAll(".query-item").length, 3);
  assert.match(
    d.querySelector("#discovery-results").textContent,
    /Nenhuma fonte foi descoberta/,
  );
  d.querySelector("#discover-osm").click();
  await flush();
  assert.match(d.querySelector("#message").textContent, /preview não consulta/);
  assert.equal(d.querySelectorAll("#source-cards article").length, 4);
  dom.window.close();
});
