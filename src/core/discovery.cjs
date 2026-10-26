const cheerio = require("cheerio");
const { parse } = require("csv-parse/sync");
const { publicUrl, domain, sourceInput } = require("./catalog.cjs");
const { fold } = require("./geography.cjs");
const EXCLUDED = [
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "linkedin.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "wikipedia.org",
];
function plan(zone) {
  const place = zone.municipality;
  const locations = [place, ...zone.localities].slice(0, 8);
  const queries = [
    ...locations.flatMap((name) => [
      `imobiliárias "${name}"`,
      `"${name}" "imobiliária" "moradia"`,
      `"${name}" "imóveis" "comprar"`,
    ]),
    `"${place}" "agência imobiliária"`,
    `"${place}" "mediação imobiliária"`,
    `"${place}" "quinta" "imobiliária"`,
  ];
  return {
    mode: "assisted",
    zoneId: zone.id,
    queries: [...new Set(queries)].map((query) => ({
      query,
      url: "https://www.google.com/search?q=" + encodeURIComponent(query),
    })),
    note: "Plano de pesquisa assistida. Abrir uma pesquisa não consulta resultados na aplicação. Importe referências verificadas ou ficheiros que tenha direito a processar.",
  };
}
function unwrap(raw) {
  const u = new URL(raw);
  if (EXCLUDED.some((d) => u.hostname === d || u.hostname.endsWith("." + d))) {
    for (const key of ["q", "url", "uddg"]) {
      const target = u.searchParams.get(key);
      if (target?.startsWith("https://")) return target;
    }
  }
  return raw;
}
function candidates(buffer, extension, zone, existing = []) {
  if (buffer.length > 2 * 1024 * 1024) throw Error("Limite do catálogo: 2 MB");
  const text = buffer.toString("utf8");
  let entries;
  if (extension === ".json") {
    const data = JSON.parse(text);
    entries = Array.isArray(data) ? data : data.sources;
  } else if (extension === ".csv")
    entries = parse(text, { columns: true, bom: true, skip_empty_lines: true });
  else if ([".html", ".htm"].includes(extension)) {
    const $ = cheerio.load(text);
    entries = $("a[href]")
      .toArray()
      .map((a) => ({
        url: $(a).attr("href"),
        name: $(a).text().replace(/\s+/g, " ").trim(),
        evidence: $(a)
          .closest("article,li,p,div")
          .text()
          .replace(/\s+/g, " ")
          .slice(0, 1000),
      }));
  } else
    throw Error(
      "Importe referências em JSON, CSV ou HTML que tenha direito a processar",
    );
  if (!Array.isArray(entries) || entries.length > 2000)
    throw Error("Máximo de 2.000 referências");
  const unique = new Map(),
    warnings = [];
  for (const row of entries) {
    try {
      const raw = unwrap(row.homepage || row.url);
      const url = publicUrl(raw);
      const host = domain(url);
      if (EXCLUDED.some((d) => host === d || host.endsWith("." + d))) continue;
      if (existing.some((s) => s.domain === host)) continue;
      const name = String(row.name || host).slice(0, 150),
        evidence = String(row.evidence || "").slice(0, 1000);
      const content = fold(name + " " + evidence);
      const locality =
        content.includes(fold(zone.municipality)) ||
        zone.localities.some((x) => content.includes(fold(x)));
      const realEstate = /imobili|imoveis|real estate|mediacao|moradia/.test(
        content,
      );
      if (!realEstate && !row.homepage) continue;
      const id = host.replace(/[^a-z0-9]+/g, "-").slice(0, 80);
      const source = sourceInput({
        id,
        name,
        homepage: "https://" + host + "/",
        kind: row.kind || "local",
        coverage: [],
        state: "discovered",
        method: "manual",
        discoveredVia:
          "Referências importadas pelo utilizador; sem verificação web automática",
        notes:
          "Referência importada: " +
          url +
          ". Menção textual à zona: " +
          (locality ? "sim" : "não") +
          ". " +
          evidence +
          " Cobertura e acesso por confirmar.",
      });
      source.relevance = {
        score: (realEstate ? 2 : 0) + (locality ? 3 : 0),
        basis:
          "Sinais textuais da referência importada; não confirma cobertura",
      };
      const previous = unique.get(host);
      if (!previous || previous.relevance.score < source.relevance.score)
        unique.set(host, source);
    } catch (e) {
      warnings.push(e.message);
    }
  }
  return {
    sources: [...unique.values()].sort(
      (a, b) => b.relevance.score - a.relevance.score,
    ),
    warnings,
  };
}
module.exports = { plan, candidates };
