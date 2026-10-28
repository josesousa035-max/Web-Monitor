const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { JSDOM } = require("jsdom");
const { buildPreview } = require("../scripts/build-preview.cjs");
test("preview: hashes CSP correspondem ao DOM com fontes CRLF Windows e CR", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "wm-preview-eol-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(__dirname, "..");
  const assets = ["src/ui/index.html", "src/ui/style.css", "src/ui/app.js", "src/shared/geography.js", "src/preview/bridge.js"];
  for (const file of ["scripts/build-preview.cjs", "src/core/catalog.cjs", ...assets]) {
    const destination = path.join(temporary, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  const baseline = fs.readFileSync(buildPreview(), "utf8");
  for (const ending of ["\r\n", "\r"]) {
    for (const file of assets) {
      const source = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");
      fs.writeFileSync(path.join(temporary, file), source.replace(/\n/g, ending));
    }
    execFileSync(process.execPath, [path.join(temporary, "scripts/build-preview.cjs")], { stdio: "pipe" });
    const html = fs.readFileSync(path.join(temporary, "dist/preview.html"), "utf8");
    const dom = new JSDOM(html); // Parse exactly as HTML, without executing imported scripts.
    try {
      const csp = dom.window.document.querySelector('[http-equiv="Content-Security-Policy"]').content;
      const nodes = dom.window.document.querySelectorAll("script,style");
      assert.equal(nodes.length, 4);
      for (const node of nodes) {
        const hash = crypto.createHash("sha256").update(node.textContent).digest("base64");
        assert.ok(csp.includes(`'sha256-${hash}'`), `${node.tagName}: CSP diverge após normalização HTML de ${JSON.stringify(ending)}`);
      }
      assert.equal(html.includes("\r"), false);
      assert.equal(html, baseline, "A preview deve ser independente das terminações de linha das fontes");
    } finally {
      dom.window.close();
    }
  }
});
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

test("preview: revisão, cancelamento, confirmação parcial e diagnóstico", async () => {
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
  d.querySelector('[data-view="sources"]').click();
  const importButton = () =>
    [...d.querySelectorAll("#source-cards button")].find(
      (x) => x.textContent === "Importar anúncios",
    );
  importButton().click();
  await flush();
  assert.equal(d.querySelector("#import-review").open, true);
  assert.equal(d.querySelector("#confirm-import").disabled, true);
  assert.match(d.querySelector("#review-summary").textContent, /Conhecidos/);
  assert.match(d.querySelector("#review-summary").textContent, /Alterações de metadados/);
  assert.match(d.querySelector("#review-summary").textContent, /Campos desconhecidos/);
  assert.match(d.querySelector("#review-samples").textContent, /Campos desconhecidos após a importação: Coordenadas/);
  assert.match(d.querySelector("#review-samples").textContent, /DEMONSTRAÇÃO/);
  assert.equal((await dom.window.monitor.list()).data.listings.length, 12);
  d.querySelector("#cancel-import").click();
  await flush();
  assert.equal(d.querySelector("#import-review").open, false);
  assert.equal((await dom.window.monitor.list()).data.listings.length, 12);
  importButton().click();
  await flush();
  d.querySelector("#review-partial").checked = true;
  d.querySelector("#review-partial").dispatchEvent(
    new dom.window.Event("change"),
  );
  assert.equal(d.querySelector("#confirm-import").disabled, false);
  d.querySelector("#confirm-import").click();
  await flush();
  assert.equal(d.querySelector("#import-review").open, false);
  assert.equal((await dom.window.monitor.list()).data.listings.length, 13);
  assert.match(d.querySelector("#message").textContent, /confirmada/);
  d.querySelector('[data-view="diagnostics"]').click();
  await flush();
  assert.equal(d.querySelector("#diagnostics").hidden, false);
  assert.match(d.querySelector("#diagnostics-content").textContent, /Método: manual/);
  assert.match(
    d.querySelector("#diagnostics-content").textContent,
    /sem verificação SQLite/,
  );
  assert.match(
    d.querySelector("#diagnostics-content").textContent,
    /13 anúncios/,
  );
  assert.equal((await dom.window.monitor.list()).data.listings.length, 13);
  dom.window.close();
});
