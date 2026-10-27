const $ = (id) => document.getElementById(id);
const names = {
  idealista: "Idealista",
  remax: "RE/MAX",
  boulder: "Boulder Imobiliária",
};
const currency = (cents) =>
  cents == null
    ? "Preço sob consulta"
    : new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(cents / 100);
const date = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("pt-PT")
    : "Data não disponível";
let state;
let activeZoneId = null;
const updating = new Set();
let page = 0;
const pageSize = 40;
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
}
async function call(method, ...args) {
  const result = await window.monitor[method](...args);
  if (!result.ok) throw Error(result.error);
  return result.data;
}
function task(fn) {
  return async (event) => {
    const button = event?.currentTarget;
    if (button?.tagName === "BUTTON") button.disabled = true;
    try {
      await fn(event);
    } catch (e) {
      message(e.message, true);
    } finally {
      if (button?.tagName === "BUTTON") button.disabled = false;
    }
  };
}
function change(x) {
  return x.priceCents != null && x.previousPriceCents > 0
    ? ((x.priceCents - x.previousPriceCents) / x.previousPriceCents) * 100
    : 0;
}
function view(name) {
  for (const id of [
    "dashboard",
    "zones",
    "sources",
    "alerts",
    "settings",
    "diagnostics",
  ])
    $(id).hidden = id !== name;
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
}
async function load() {
  state = await call("list");
  if (state.sources) {
    for (const key of Object.keys(names)) delete names[key];
    for (const source of state.sources) names[source.id] = source.name;
  }
  const previous = $("source-filter").value;
  $("source-filter").replaceChildren(el("option", "Todas as fontes"));
  $("source-filter").firstChild.value = "";
  for (const [value, name] of Object.entries(names)) {
    const option = el("option", name);
    option.value = value;
    $("source-filter").append(option);
  }
  $("source-filter").value = previous;
  if (activeZoneId === null)
    activeZoneId =
      state.activeZoneId ??
      (state.zones?.find((x) => x.id === "povoa-de-lanhoso")?.id || "");
  $("zone-filter").replaceChildren(el("option", "Todas as localizações"));
  $("zone-filter").firstChild.value = "";
  for (const zone of state.zones || []) {
    const option = el("option", zone.name);
    option.value = zone.id;
    $("zone-filter").append(option);
  }
  $("zone-filter").value = activeZoneId;
  render();
  renderSettings();
  renderZones();
  if (!$("diagnostics").hidden && window.monitor.diagnostics)
    await refreshDiagnostics();
}
function selectedZone() {
  return (state.zones || []).find((z) => z.id === activeZoneId);
}
function sourceLabel(id) {
  return names[id] || id;
}
function render() {
  const zone = selectedZone();
  const results =
    zone && window.WebMonitorGeo
      ? state.listings.map((x) => ({
          listing: x,
          result: window.WebMonitorGeo.zoneMatches(x, zone),
        }))
      : state.listings.map((x) => ({ listing: x, result: { match: true } }));
  const all = results.filter((x) => x.result.match).map((x) => x.listing);
  $("zone-label").textContent = zone
    ? zone.name.toLocaleUpperCase("pt-PT")
    : "TODAS AS LOCALIZAÇÕES";
  $("zone-summary").textContent = zone
    ? (zone.mode === "radius"
        ? "Raio de " +
          zone.radiusKm +
          " km; apenas coordenadas com precisão confirmada."
        : "Correspondência textual de localização, sem validação de limites administrativos.") +
      " " +
      (state.listings.length - all.length) +
      " registos fora dos critérios ou por confirmar."
    : "Sem filtro geográfico. Os dados mantêm a localização e precisão fornecidas pela fonte.";
  $("stats").replaceChildren();
  for (const [label, value] of [
    ["Imóveis monitorizados", all.length],
    [
      "Novos na última importação",
      state.imports[0]
        ? all.filter((x) => x.firstSeen === state.imports[0].date).length
        : 0,
    ],
    ["Com descida registada", all.filter((x) => change(x) < 0).length],
    ["Com subida registada", all.filter((x) => change(x) > 0).length],
  ]) {
    const card = el("div", null, "stat");
    card.append(el("span", label), el("strong", String(value)));
    $("stats").append(card);
  }
  const query = $("search").value.toLowerCase();
  const rows = all.filter(
    (x) =>
      (!query ||
        `${x.title} ${x.location} ${x.reference}`
          .toLowerCase()
          .includes(query)) &&
      (!$("source-filter").value || x.source === $("source-filter").value) &&
      (!$("min").value ||
        (x.priceCents !== null &&
          x.priceCents >= Number($("min").value) * 100)) &&
      (!$("max").value ||
        (x.priceCents !== null &&
          x.priceCents <= Number($("max").value) * 100)) &&
      (!$("typology").value ||
        x.typology.toLowerCase().includes($("typology").value.toLowerCase())) &&
      (!$("area").value || x.area >= Number($("area").value)),
  );
  rows.sort((a, b) =>
    ({
      price: () => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity),
      drop: () => change(a) - change(b),
      sqm: () =>
        (a.area && a.priceCents != null ? a.priceCents / a.area : Infinity) -
        (b.area && b.priceCents != null ? b.priceCents / b.area : Infinity),
      recent: () => b.firstSeen.localeCompare(a.firstSeen),
    })[$("sort").value](),
  );
  $("count").textContent = `${rows.length} resultados`;
  $("listings").replaceChildren();
  $("listings").className = rows.length ? "cards" : "";
  if (!rows.length) {
    const empty = el("div", null, "empty");
    empty.append(
      el(
        "strong",
        all.length
          ? "Sem resultados para estes filtros"
          : "O seu próximo imóvel começa aqui.",
      ),
      el(
        "p",
        "Importe um ficheiro de anúncios para começar. Os seus dados ficam neste computador.",
      ),
    );
    $("listings").append(empty);
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  page = Math.min(page, pages - 1);
  $("page").textContent = `${page + 1} / ${pages}`;
  $("previous").disabled = page === 0;
  $("next").disabled = page >= pages - 1;
  for (const x of rows.slice(page * pageSize, (page + 1) * pageSize)) {
    const card = el("article", null, "card");
    card.append(
      el("span", sourceLabel(x.source), "tag"),
      el("h3", x.title),
      el("p", x.location || "Localização não indicada", "muted"),
      el("div", currency(x.priceCents), "price"),
    );
    if (change(x))
      card.append(
        el(
          "div",
          `${change(x) > 0 ? "+" : ""}${change(x).toFixed(1)}% face ao preço anterior`,
          change(x) < 0 ? "down" : "up",
        ),
      );
    if (zone && window.WebMonitorGeo) {
      const location = window.WebMonitorGeo.zoneMatches(x, zone);
      card.append(
        el(
          "p",
          (location.precision === "textual"
            ? "Localização textual"
            : location.precision === "exact"
              ? "Distância: " + location.distanceKm.toFixed(1) + " km"
              : "Localização por confirmar") +
            (!location.transactionConfirmed ? " · Negócio por confirmar" : ""),
          "status-note",
        ),
      );
    }
    if (x.area && (!x.areaType || x.areaType === "unknown"))
      card.append(
        el("p", "Tipo de área não indicado pela fonte", "status-note"),
      );
    card.append(
      el(
        "p",
        [
          x.typology,
          x.area ? `${x.area} m²` : "",
          x.area && x.priceCents != null
            ? `${currency(x.priceCents / x.area)}/m²`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        "metadata",
      ),
    );
    const button = el("button", "Ver imóvel e histórico →");
    button.onclick = task(() => detail(x));
    card.append(button);
    $("listings").append(card);
  }
  renderSources(state.listings);
  $("alert-list").replaceChildren(
    ...(state.alerts || []).map((a) =>
      el(
        "p",
        `${date(a.date)} · ${{ new: "Novo imóvel", drop: "Descida de preço", threshold: "Abaixo do limite" }[a.reason] || "Pesquisa guardada"} · ${a.title} · ${currency(a.priceCents)}`,
        "card",
      ),
    ),
  );
  if (!(state.alerts || []).length)
    $("alert-list").append(
      el(
        "p",
        "Ainda não existem alertas. Configure as regras e importe anúncios.",
        "muted",
      ),
    );
  if (!state.runs?.length)
    $("runs").replaceChildren(
      ...state.imports.map((r) =>
        el(
          "p",
          `${date(r.date)} · ${r.count} anúncios · ${r.added} novos · ${r.changed} preços alterados`,
          "muted",
        ),
      ),
    );
}
function renderSettings() {
  $("url-fields").replaceChildren();
  for (const source of Object.keys(names)) {
    const label = el("label", `Pesquisa ${names[source]}`);
    const input = el("input");
    input.id = `url-${source}`;
    input.type = "url";
    input.value = state.settings.urls[source];
    input.placeholder = "URL HTTPS da pesquisa";
    label.append(input);
    $("url-fields").append(label);
  }
  $("notifications").checked = state.settings.alerts;
  $("new-enabled").checked = state.settings.newEnabled !== false;
  $("drop-enabled").checked = state.settings.dropEnabled !== false;
  $("threshold-enabled").checked = !!state.settings.thresholdEnabled;
  $("threshold").value =
    state.settings.thresholdCents == null
      ? ""
      : state.settings.thresholdCents / 100;
  $("saved-searches").replaceChildren();
  for (const search of state.settings.searches || []) addSearch(search);
}
function addSearch(search = {}) {
  const card = el("div", null, "card search-rule");
  card.dataset.id = search.id || crypto.randomUUID();
  for (const [field, labelText, type, value] of [
    ["name", "Nome da pesquisa", "text", search.name || ""],
    ["query", "Texto a procurar", "text", search.query || ""],
    [
      "max",
      "Preço máximo (€)",
      "number",
      search.maxPriceCents == null ? "" : search.maxPriceCents / 100,
    ],
    ["area", "Área mínima (m²)", "number", search.minArea ?? ""],
  ]) {
    const label = el("label", labelText),
      input = el("input");
    input.dataset.field = field;
    input.type = type;
    input.value = value;
    if (type === "number") {
      input.min = "0";
      input.step = field === "max" ? "0.01" : "any";
    }
    if (field === "name") input.required = true;
    label.append(input);
    card.append(label);
  }
  const label = el("label", "Fonte"),
    select = el("select");
  select.dataset.field = "source";
  for (const [value, name] of [
    ["", "Todas as fontes"],
    ...Object.entries(names),
  ]) {
    const option = el("option", name);
    option.value = value;
    select.append(option);
  }
  select.value = search.source || "";
  label.append(select);
  card.append(label);
  const enabledLabel = el("label", " Ativar alertas desta pesquisa", "check"),
    enabled = el("input");
  enabled.type = "checkbox";
  enabled.dataset.field = "enabled";
  enabled.checked = search.enabled !== false;
  enabledLabel.prepend(enabled);
  card.append(enabledLabel);
  const remove = el("button", "Remover pesquisa");
  remove.type = "button";
  remove.onclick = () => card.remove();
  card.append(remove);
  $("saved-searches").append(card);
}
async function detail(x) {
  const result = await call("history", x.key);
  const history = result.history;
  const content = $("detail-content");
  content.replaceChildren(
    el("span", names[x.source], "tag"),
    el("h2", x.title),
    el("p", currency(x.priceCents), "price"),
    el("p", x.description || "Sem descrição disponível."),
    el("p", `Referência: ${x.reference}`, "muted"),
    el(
      "p",
      `Primeira deteção: ${date(x.firstSeen)} · Última observação: ${date(x.lastSeen)}`,
      "muted",
    ),
  );
  if (x.publishedAt)
    content.append(
      el("p", "Publicação indicada pela fonte: " + x.publishedAt, "muted"),
    );
  if (x.sourceUpdatedAt)
    content.append(
      el("p", "Atualização indicada pela fonte: " + x.sourceUpdatedAt, "muted"),
    );
  if (x.originalCurrency && x.originalCurrency !== "EUR")
    content.append(
      el(
        "p",
        "Preço original: " +
          (x.originalPrice ?? "—") +
          " " +
          x.originalCurrency +
          " · sem conversão para euros",
        "status-note",
      ),
    );
  const open = el("button", "Abrir anúncio original ↗");
  open.onclick = task(() => call("open", x.url));
  content.append(open, el("h2", "Evolução do preço"));
  const bars = el("div", null, "bars");
  const max = Math.max(...history.map((h) => h.new_price || 0), 1);
  for (const h of history) {
    const bar = el("div", null, "bar");
    bar.style.height = `${Math.max(3, ((h.new_price || 0) / max) * 100)}%`;
    bar.title = `${date(h.date)}: ${currency(h.new_price)}`;
    bars.append(bar);
  }
  content.append(bars);
  if (result.duplicates.length)
    content.append(
      el(
        "p",
        "Possíveis duplicados (sem fusão automática): " +
          result.duplicates
            .map((d) => `${sourceLabel(d.source)}: ${d.title}`)
            .join("; "),
        "muted",
      ),
    );
  for (const candidate of result.duplicates) {
    const row = el("div", null, "source-actions");
    const pair = (state.associations || []).find(
      (a) => a.keys.includes(x.key) && a.keys.includes(candidate.key),
    );
    row.append(
      el(
        "span",
        sourceLabel(candidate.source) + ": " + (pair?.state || "por avaliar"),
      ),
    );
    for (const [label, status] of [
      ["Confirmar mesmo imóvel", "confirmed"],
      ["Rejeitar associação", "rejected"],
      ["Repor avaliação", "pending"],
    ]) {
      const button = el("button", label);
      button.onclick = task(async () => {
        await call("association", {
          keys: [x.key, candidate.key],
          state: status,
        });
        await load();
        $("detail").close();
        await detail(x);
      });
      row.append(button);
    }
    content.append(row);
  }
  content.append(
    el(
      "p",
      "Negócio: " +
        { sale: "Venda", rent: "Arrendamento", unknown: "Por confirmar" }[
          x.transaction || "unknown"
        ] +
        " · Tipo de área: " +
        {
          usable: "Útil",
          gross: "Bruta",
          land: "Terreno",
          unknown: "Não identificado",
        }[x.areaType || "unknown"],
      "muted",
    ),
  );
  const table = el("table");
  for (const h of history) {
    const row = el("tr");
    const difference =
      h.old_price !== null && h.new_price !== null
        ? h.new_price - h.old_price
        : null;
    row.append(
      el("td", date(h.date)),
      el("td", currency(h.new_price)),
      el(
        "td",
        difference === null
          ? "—"
          : `${currency(difference)}${h.old_price > 0 ? " (" + ((difference / h.old_price) * 100).toFixed(1) + "%)" : ""}`,
      ),
    );
    table.append(row);
  }
  content.append(table);
  if (result.changes?.length) {
    content.append(el("h2", "Outras alterações"));
    const labels = {
      title: "Título",
      description: "Descrição",
      location: "Localização",
      area: "Área",
      typology: "Tipologia",
      propertyType: "Tipo",
      url: "URL",
      transaction: "Negócio",
      areaType: "Tipo de área",
      municipality: "Concelho",
    };
    for (const c of result.changes)
      content.append(
        el(
          "p",
          date(c.date) +
            " · " +
            labels[c.field] +
            ": " +
            String(JSON.parse(c.old_value) ?? "—") +
            " → " +
            String(JSON.parse(c.new_value) ?? "—"),
          "muted",
        ),
      );
  }
  if (x.preservedFields?.length)
    content.append(
      el(
        "p",
        "Alguns campos foram conservados de observações anteriores e não foram confirmados na última importação.",
        "status-note",
      ),
    );
  $("detail").showModal();
}
let pendingReview = null;
async function importSource(source) {
  const result = await call("prepareImport", source);
  if (!result) return;
  pendingReview = result;
  showImportReview(result);
}
function showImportReview(review) {
  $("review-label").textContent =
    review.label + " · Rever até " + date(review.expiresAt);
  $("review-error").textContent = "";
  $("review-summary").replaceChildren();
  for (const [label, value] of [
    ["Anúncios", review.summary.total],
    ["Novos", review.summary.newListings],
    ["Alterações de preço", review.summary.priceChanges],
    ["Dados conservados", review.summary.preservedListings],
  ]) {
    const card = el("div", null, "stat");
    card.append(el("span", label), el("strong", String(value)));
    $("review-summary").append(card);
  }
  $("review-warnings").replaceChildren(
    ...review.warnings.map((w) => el("p", w, "status-note")),
  );
  if (review.summary.unknownPrices)
    $("review-warnings").append(
      el(
        "p",
        review.summary.unknownPrices + " anúncios com preço desconhecido.",
        "status-note",
      ),
    );
  $("review-samples").replaceChildren(
    el(
      "p",
      "Amostra de até " +
        review.sampleLimit +
        " anúncios. Os totais incluem o ficheiro completo.",
      "muted",
    ),
  );
  for (const sample of review.samples) {
    const card = el("article", null, "card");
    card.append(
      el("h3", sample.title),
      el(
        "p",
        sourceLabel(sample.source) +
          " · " +
          (sample.isNew ? "Novo anúncio" : "Anúncio conhecido") +
          " · " +
          currency(sample.priceCents),
        "muted",
      ),
    );
    if (sample.preservedFields.length)
      card.append(
        el(
          "p",
          sample.preservedFields.length +
            " campos anteriores conservados; não foram novamente confirmados neste ficheiro.",
          "status-note",
        ),
      );
    for (const change of sample.changes) {
      const value = (field, v) =>
        field === "priceCents"
          ? v === null
            ? "Desconhecido"
            : currency(v)
          : v === null || v === ""
            ? "Desconhecido"
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
      card.append(
        el(
          "p",
          change.label +
            ": " +
            value(change.field, change.before) +
            " → " +
            value(change.field, change.after),
          "metadata",
        ),
      );
    }
    $("review-samples").append(card);
  }
  $("review-partial-label").hidden = !review.partial;
  $("review-partial").checked = false;
  $("confirm-import").disabled = review.partial;
  if (!$("import-review").open) $("import-review").showModal();
}
async function cancelReview() {
  const token = pendingReview?.token;
  pendingReview = null;
  $("import-review").close();
  if (token) await call("cancelImport", token);
  message("Importação cancelada. Os dados não foram alterados.");
}

document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => view(b.dataset.view)));
for (const id of [
  "search",
  "source-filter",
  "sort",
  "min",
  "max",
  "typology",
  "area",
])
  $(id).addEventListener("input", () => {
    page = 0;
    render();
  });
$("add-search").onclick = () => addSearch();
$("previous").onclick = () => {
  page--;
  render();
};
$("next").onclick = () => {
  page++;
  render();
};
$("import-top").onclick = () => view("sources");
$("close-detail").onclick = () => $("detail").close();
$("settings-form").onsubmit = task(async (event) => {
  event.preventDefault();
  const urls = {};
  for (const s of Object.keys(names)) urls[s] = $(`url-${s}`).value;
  const searches = [...document.querySelectorAll(".search-rule")].map(
    (card) => {
      const value = (field) =>
        card.querySelector('[data-field="' + field + '"]').value;
      return {
        id: card.dataset.id,
        name: value("name"),
        query: value("query"),
        source: value("source"),
        maxPriceCents: value("max")
          ? Math.round(Number(value("max")) * 100)
          : null,
        minArea: value("area") ? Number(value("area")) : null,
        enabled: card.querySelector('[data-field="enabled"]').checked,
      };
    },
  );
  await call("settings", {
    urls,
    alerts: $("notifications").checked,
    newEnabled: $("new-enabled").checked,
    dropEnabled: $("drop-enabled").checked,
    thresholdEnabled: $("threshold-enabled").checked,
    thresholdCents: $("threshold").value
      ? Math.round(Number($("threshold").value) * 100)
      : null,
    searches,
  });
  await load();
  message("Configurações guardadas.");
});
$("export").onclick = task(async () => {
  if (await call("export")) message("Backup exportado com histórico.");
});
$("restore").onclick = task(async () => {
  if (await call("restore")) {
    await load();
    message("Backup restaurado.");
  }
});
load().catch((e) => message(e.message, true));
const sourceStates = {
  discovered: "Descoberta · por avaliar",
  evaluating: "Em avaliação",
  automatic: "Automática validada",
  semiautomatic: "Semiautomática",
  manual: "Importação manual",
  "no-coverage": "Sem cobertura confirmada",
  unavailable: "Temporariamente inacessível",
  unsupported: "Não suportada",
};
function catalogSources() {
  return (
    state.sources ||
    Object.keys(names).map((id) => ({
      id,
      name: names[id],
      homepage: "",
      searchUrl: state.settings.urls[id] || "",
      state: state.settings.urls[id] ? "manual" : "evaluating",
      method: "manual",
      coverage: [],
      permission: { allowed: false },
      enabled: true,
      connector: {},
    }))
  );
}
function renderSources(all) {
  $("source-cards").replaceChildren();
  for (const original of catalogSources()) {
    const source = {
      ...original,
      searchUrl: original.searches
        ? original.searches[selectedZone()?.id || "povoa-de-lanhoso"] || ""
        : original.searchUrl,
    };
    const card = el("article", null, "card");
    const header = el("div", null, "source-line");
    header.append(
      el("h3", source.name),
      el("span", sourceStates[source.state] || "Por avaliar", "tag"),
    );
    card.append(header);
    if (!source.searchUrl)
      card.append(
        el("p", "Por configurar: pesquisa da localização", "status-note"),
      );
    card.append(
      el("p", source.domain || "Fonte inicial", "muted"),
      el(
        "p",
        "Cobertura indicada: " +
          (source.coverage?.join(", ") || "não confirmada") +
          " · Método: " +
          ({
            manual: "Importação manual",
            jsonld: "Dados estruturados",
            html: "HTML configurado",
            rss: "Feed RSS/Atom",
          }[source.method] || "Não definido"),
        "metadata",
      ),
    );
    const listings = all.filter((x) => x.source === source.id),
      priced = listings.filter((x) => x.priceCents !== null),
      latest = listings
        .map((x) => x.lastSeen)
        .sort()
        .at(-1);
    card.append(
      el(
        "p",
        listings.length +
          " anúncios locais · Preço médio: " +
          (priced.length
            ? currency(
                priced.reduce((sum, x) => sum + x.priceCents, 0) /
                  priced.length,
              )
            : "—") +
          " · Última observação: " +
          (latest ? date(latest) : "sem dados"),
        "metadata",
      ),
    );
    if (source.notes) card.append(el("p", source.notes, "muted"));
    const last = source.lastResult;
    if (last)
      card.append(
        el(
          "p",
          "Última tentativa: " +
            last.status +
            " · " +
            date(last.date) +
            " · " +
            (last.items || 0) +
            " anúncios" +
            (last.error ? " · " + last.error.message : ""),
          "source-diagnostic",
        ),
      );
    const actions = el("div", null, "source-actions");
    const edit = el("button", "Avaliar / configurar");
    edit.onclick = () => editSource(source);
    const importing = el("button", "Importar anúncios");
    importing.onclick = task(() => importSource(source.id));
    actions.append(edit, importing);
    if (source.searchUrl || source.homepage) {
      const open = el("button", "Abrir site ↗");
      open.onclick = task(() =>
        call("open", source.searchUrl || source.homepage),
      );
      actions.append(open);
    }
    const update = el(
      "button",
      updating.has(source.id) ? "A atualizar…" : "Atualizar fonte",
    );
    update.disabled =
      updating.has(source.id) ||
      !source.enabled ||
      !source.permission?.allowed ||
      source.method === "manual" ||
      !source.searchUrl;
    update.title = update.disabled
      ? "Requer método, pesquisa e autorização documentada"
      : "";
    update.onclick = task(async () => {
      const zone = selectedZone() || state.zones?.[0];
      if (!zone) throw Error("Crie uma zona primeiro");
      updating.add(source.id);
      renderSources(state.listings);
      try {
        const result = await call("updateSource", source.id, zone.id);
        await load();
        message(
          "Atualização " +
            result.run.status +
            ": " +
            result.run.items +
            " anúncios." +
            (result.run.error ? " " + result.run.error.message : ""),
          !["complete", "partial"].includes(result.run.status),
        );
      } finally {
        updating.delete(source.id);
        renderSources(state.listings);
      }
    });
    actions.append(update);
    if (updating.has(source.id)) {
      const cancel = el("button", "Cancelar atualização");
      cancel.onclick = task(() => call("cancelUpdate", source.id));
      actions.append(cancel);
    }
    if (!source.permission?.allowed)
      card.append(
        el(
          "p",
          "Recolha automática desativada: autorização não confirmada.",
          "status-note",
        ),
      );
    card.append(actions);
    $("source-cards").append(card);
  }
  const runs = state.runs || [];
  if (runs.length) {
    $("runs").replaceChildren(
      ...runs.map((run) =>
        el(
          "p",
          date(run.finishedAt) +
            " · " +
            sourceLabel(run.sourceId) +
            " · " +
            run.status +
            " · " +
            run.items +
            " anúncios" +
            (run.exhaustive
              ? " · completa e comparável"
              : " · ausências não verificadas") +
            (run.error ? " · " + run.error.message : ""),
          "muted",
        ),
      ),
    );
  }
}
function renderZones() {
  $("zone-cards").replaceChildren();
  for (const zone of state.zones || []) {
    const card = el("article", null, "card");
    card.append(
      el("h3", zone.name),
      el(
        "p",
        zone.country +
          " · " +
          zone.municipality +
          " · " +
          (zone.mode === "radius"
            ? "Raio: " + zone.radiusKm + " km"
            : "Concelho / localidades"),
        "muted",
      ),
    );
    const actions = el("div", null, "source-actions"),
      choose = el("button", "Usar esta zona"),
      edit = el("button", "Editar zona"),
      discover = el("button", "Descobrir fontes");
    choose.onclick = task(async () => {
      await call("selectZone", zone.id);
      activeZoneId = zone.id;
      $("zone-filter").value = zone.id;
      page = 0;
      render();
      view("dashboard");
    });
    edit.onclick = () => editZone(zone);
    discover.onclick = task(async () => {
      activeZoneId = zone.id;
      $("zone-filter").value = zone.id;
      render();
      view("sources");
      await showDiscovery();
    });
    actions.append(choose, edit, discover);
    card.append(actions);
    $("zone-cards").append(card);
  }
}
function editZone(zone = {}) {
  $("zone-form").reset();
  $("zone-error").textContent = "";
  $("zone-id").value = zone.id || crypto.randomUUID();
  for (const [id, value] of Object.entries({
    name: zone.name || "",
    country: zone.country || "Portugal",
    municipality: zone.municipality || "",
    localities: (zone.localities || []).join(", "),
    mode: zone.mode || "administrative",
    lat: zone.center?.lat ?? "",
    lon: zone.center?.lon ?? "",
    radius: zone.radiusKm ?? "",
    transaction: zone.transaction || "sale",
    min: zone.minPriceCents == null ? "" : zone.minPriceCents / 100,
    max: zone.maxPriceCents == null ? "" : zone.maxPriceCents / 100,
    area: zone.minArea ?? "",
    typology: zone.typology || "",
    property: zone.propertyType || "",
  }))
    $("zone-" + id).value = value;
  $("zone-exact").checked = zone.center?.precision === "exact";
  $("zone-dialog").showModal();
}
function editSource(source = {}) {
  source = {
    ...source,
    searchUrl: source.searches
      ? source.searches[selectedZone()?.id || "povoa-de-lanhoso"] || ""
      : source.searchUrl,
  };
  $("source-form").reset();
  $("source-error").textContent = "";
  $("edit-source-id").value = source.id || "";
  for (const [id, value] of Object.entries({
    name: source.name || "",
    homepage: source.homepage || "",
    kind: source.kind || "local",
    search: source.searchUrl || "",
    coverage: (source.coverage || []).join(", "),
    state:
      source.state === "automatic"
        ? "semiautomatic"
        : source.state || "discovered",
    notes: source.notes || "",
    method: source.method || "manual",
    terms: source.permission?.termsUrl || "",
    permission: source.permission?.evidence || "",
    pages: source.connector?.maxPages || 3,
    interval: source.intervalMinutes || 0,
    transaction: source.connector?.transaction || "",
    currency: source.connector?.currency || "",
    selectors: source.connector?.selectors
      ? JSON.stringify(source.connector.selectors, null, 2)
      : "",
    "area-type": source.connector?.areaType || "unknown",
  }))
    $("source-" + id).value = value;
  $("source-enabled").checked = source.enabled !== false;
  $("source-allowed").checked = source.permission?.allowed === true;
  $("source-exhaustive").checked = source.connector?.scopeVerified === true;
  $("source-dialog").showModal();
}
async function showDiscovery() {
  const zone = selectedZone() || state.zones?.[0];
  if (!zone) throw Error("Crie uma zona de interesse primeiro");
  const result = await call("discovery", zone.id);
  $("discovery-results").replaceChildren(
    el("h3", "Plano de pesquisa · " + zone.name),
    el("p", result.note, "muted"),
  );
  for (const item of result.queries) {
    const row = el("div", null, "query-item"),
      button = el("button", "Abrir pesquisa ↗");
    button.onclick = task(() => call("open", item.url));
    row.append(el("span", item.query), button);
    $("discovery-results").append(row);
  }
}
$("zone-filter").onchange = task(async () => {
  const next = $("zone-filter").value;
  await call("selectZone", next);
  activeZoneId = next;
  page = 0;
  render();
});
$("add-zone").onclick = () => editZone();
$("add-source").onclick = () => editSource();
$("close-zone").onclick = () => $("zone-dialog").close();
$("close-source").onclick = () => $("source-dialog").close();
$("discover").onclick = task(showDiscovery);
$("import-candidates").onclick = task(async () => {
  const zone = selectedZone() || state.zones?.[0];
  if (!zone) throw Error("Crie uma zona primeiro");
  const result = await call("importCandidates", zone.id);
  if (result) {
    await load();
    message(
      result.added +
        " novas fontes candidatas, sem cobertura ou autorização presumida.",
    );
  }
});
$("zone-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const num = (id) => ($(id).value === "" ? null : Number($(id).value));
    const zone = {
      id: $("zone-id").value,
      name: $("zone-name").value,
      country: $("zone-country").value,
      municipality: $("zone-municipality").value,
      localities: $("zone-localities")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      mode: $("zone-mode").value,
      center:
        num("zone-lat") === null || num("zone-lon") === null
          ? null
          : {
              lat: num("zone-lat"),
              lon: num("zone-lon"),
              precision: $("zone-exact").checked ? "exact" : "approximate",
            },
      radiusKm: num("zone-radius"),
      transaction: $("zone-transaction").value,
      minPriceCents:
        num("zone-min") === null ? null : Math.round(num("zone-min") * 100),
      maxPriceCents:
        num("zone-max") === null ? null : Math.round(num("zone-max") * 100),
      minArea: num("zone-area"),
      typology: $("zone-typology").value,
      propertyType: $("zone-property").value,
    };
    await call("saveZone", zone);
    activeZoneId = zone.id;
    await load();
    $("zone-dialog").close();
    message(
      "Zona guardada. Configure pesquisas das fontes para esta localização.",
    );
  } catch (error) {
    $("zone-error").textContent = error.message;
  }
};
$("source-form").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const existing = catalogSources().find(
      (x) => x.id === $("edit-source-id").value,
    );
    const host = new URL($("source-homepage").value).hostname.replace(
      /^www\./,
      "",
    );
    const source = {
      ...existing,
      id:
        $("edit-source-id").value ||
        host.replace(/[^a-z0-9]+/g, "-").slice(0, 80),
      searchZoneId: selectedZone()?.id || "povoa-de-lanhoso",
      name: $("source-name").value,
      homepage: $("source-homepage").value,
      kind: $("source-kind").value,
      searchUrl: $("source-search").value,
      coverage: $("source-coverage")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      state: $("source-state").value,
      notes: $("source-notes").value,
      enabled: $("source-enabled").checked,
      method: $("source-method").value,
      permission: {
        allowed: $("source-allowed").checked,
        evidence: $("source-permission").value,
        termsUrl: $("source-terms").value,
      },
      intervalMinutes: Number($("source-interval").value),
      connector: {
        maxPages: Number($("source-pages").value),
        scopeVerified: $("source-exhaustive").checked,
        transaction: $("source-transaction").value || undefined,
        currency: $("source-currency").value || undefined,
        areaType: $("source-area-type").value,
        ...($("source-selectors").value
          ? { selectors: JSON.parse($("source-selectors").value) }
          : {}),
      },
    };
    await call("saveSource", source);
    await load();
    $("source-dialog").close();
    message("Fonte guardada. Configuração não equivale a integração validada.");
  } catch (error) {
    $("source-error").textContent = error.message;
  }
};

$("discover-osm").onclick = task(async () => {
  const zone = selectedZone() || state.zones?.[0];
  if (!zone) throw Error("Crie uma zona primeiro");
  message("A consultar o OpenStreetMap…");
  const result = await call("discoverOSM", zone.id);
  await load();
  $("discovery-results").replaceChildren(
    el("h3", "Descoberta OSM · " + zone.name),
    el(
      "p",
      result.added +
        " novas fontes candidatas. " +
        result.leads.length +
        " agências sem site indicado. " +
        (result.cached ? "Resultado em cache. " : "") +
        result.attribution,
      "muted",
    ),
  );
  for (const lead of result.leads)
    $("discovery-results").append(
      el("p", lead.name + " · " + lead.reason, "muted"),
    );
  message(
    "Pesquisa concluída. Os sites candidatos ainda precisam de avaliação; cobertura comercial não confirmada.",
  );
});

$("review-partial").onchange = () => {
  $("confirm-import").disabled =
    !!pendingReview?.partial && !$("review-partial").checked;
};
$("confirm-import").onclick = async () => {
  if (!pendingReview) return;
  $("confirm-import").disabled = true;
  try {
    const summary = await call("confirmImport", pendingReview.token, {
      acceptPartial: $("review-partial").checked,
    });
    pendingReview = null;
    $("import-review").close();
    await load();
    message(
      "Importação confirmada: " +
        summary.count +
        " anúncios, " +
        summary.added +
        " novos e " +
        summary.changed +
        " alterações de preço.",
    );
    view("dashboard");
  } catch (error) {
    $("review-error").textContent = error.message;
  } finally {
    $("confirm-import").disabled =
      !!pendingReview?.partial && !$("review-partial").checked;
  }
};
$("cancel-import").onclick = task(cancelReview);
$("import-review").addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelReview().catch((e) => message(e.message, true));
});
$("import-review").addEventListener("close", () => {
  if (pendingReview) {
    const token = pendingReview.token;
    pendingReview = null;
    call("cancelImport", token).catch((e) => message(e.message, true));
  }
});
async function refreshDiagnostics() {
  const zone = selectedZone() || state.zones?.[0];
  if (!zone) {
    $("diagnostics-content").replaceChildren(
      el("p", "Crie uma zona para consultar o diagnóstico.", "muted"),
    );
    return;
  }
  const report = await call("diagnostics", zone.id);
  const content = $("diagnostics-content");
  content.replaceChildren(
    el("p", report.note, "muted"),
    el(
      "p",
      "Versão " +
        report.appVersion +
        " · Base de dados " +
        (report.demonstration
          ? "demonstração, sem verificação SQLite"
          : report.storage.integrity === "ok"
            ? "verificada"
            : "com problema") +
        " · " +
        report.storage.listings +
        " anúncios · " +
        report.storage.priceEvents +
        " observações de preço",
      "card",
    ),
  );
  const statuses = {
    ready: "Configurada · acesso por testar",
    manual: "Importação manual",
    disabled: "Desativada",
    "needs-search": "Pesquisa em falta",
    "needs-permission": "Autorização por confirmar",
    "last-attempt-failed": "Última tentativa falhada",
  };
  for (const source of report.sources) {
    const card = el("article", null, "card");
    card.append(
      el("h3", source.name),
      el("span", statuses[source.status] || source.status, "tag"),
      el("p", source.action, "muted"),
      el(
        "p",
        "Pesquisa: " +
          (source.checks.queryConfigured ? "configurada" : "em falta") +
          " · Autorização: " +
          (source.checks.permissionDocumented
            ? "documentada"
            : "por confirmar") +
          " · Programação: " +
          (source.scheduleMinutes
            ? source.scheduleMinutes + " min enquanto a aplicação está ativa"
            : "desativada"),
        "metadata",
      ),
    );
    if (source.lastAttempt)
      card.append(
        el(
          "p",
          "Última tentativa: " +
            date(source.lastAttempt.date) +
            " · " +
            source.lastAttempt.status +
            (source.lastAttempt.httpStatus
              ? " · HTTP " + source.lastAttempt.httpStatus
              : ""),
          "metadata",
        ),
      );
    content.append(card);
  }
}
$("refresh-diagnostics").onclick = task(refreshDiagnostics);
document.querySelector('[data-view="diagnostics"]').onclick = task(async () => {
  view("diagnostics");
  await refreshDiagnostics();
});
