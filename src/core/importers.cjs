const { parse } = require("csv-parse/sync");
const cheerio = require("cheerio");
const { simpleParser } = require("mailparser");
const { observedFields, reconcileRows } = require("./observations.cjs");
const { normalize } = require("./store.cjs");
const { initialSources, belongs } = require("./catalog.cjs");
function normalizeExtracted(raw, catalog) {
  let fields = observedFields(raw);
  const pricePresent = raw.originalPrice !== undefined;
  fields = fields.filter(
    (field) =>
      !(
        ["priceCents", "originalPrice", "originalCurrency"].includes(field) &&
        !pricePresent
      ) &&
      !(field === "area" && raw.area == null) &&
      !(field === "areaType" && raw.area == null) &&
      !(field === "coordinates" && raw.coordinates == null),
  );
  return normalize({ ...raw, observedFields: fields }, catalog);
}
function structured(html, source, catalog, baseUrl) {
  const $ = cheerio.load(html);
  const nodes = [];
  const byId = new Map();
  const rows = [];
  const warnings = [];
  if (
    $("#challenge-form,.g-recaptcha").length ||
    /access denied|attention required|captcha|just a moment/i.test(
      $("title").text(),
    )
  )
    throw Error("Página de bloqueio ou CAPTCHA: recolha interrompida");
  function index(x, depth = 0) {
    if (depth > 60) throw Error("Dados estruturados demasiado profundos");
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach((v) => index(v, depth + 1));
    nodes.push(x);
    if (x["@id"]) byId.set(x["@id"], x);
    Object.values(x)
      .filter((v) => v && typeof v === "object")
      .forEach((v) => index(v, depth + 1));
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      index(JSON.parse($(el).text()));
    } catch (e) {
      warnings.push("Bloco JSON-LD inválido: " + e.message);
    }
  });
  const resolve = (x) =>
    x && x["@id"] && Object.keys(x).length === 1 ? byId.get(x["@id"]) || x : x;
  const entry = catalog.find((s) => s.id === source);
  if (!entry) throw Error("Fonte não registada");
  for (const node of nodes) {
    const types = [].concat(node["@type"] || []);
    if (
      !types.some((t) =>
        [
          "Product",
          "Apartment",
          "House",
          "SingleFamilyResidence",
          "RealEstateListing",
          "Residence",
        ].includes(t),
      )
    )
      continue;
    const entity = resolve(node.mainEntity || node.about) || node;
    const offer = resolve([].concat(node.offers || entity.offers || [])[0]);
    const url = node.url || entity.url || offer?.url;
    const title = node.name || entity.name;
    if (!url || !title) continue;
    try {
      const absolute = new URL(url, baseUrl || entry.homepage).href;
      if (!belongs(absolute, entry.domain))
        throw Error("Anúncio fora do domínio da fonte");
      const currency = offer?.priceCurrency;
      let price = offer?.price ?? null;
      if (currency && currency !== "EUR") {
        price = null;
        warnings.push("Preço noutra moeda não convertido");
      }
      if (price !== null && !currency && entry.connector?.currency !== "EUR") {
        price = null;
        warnings.push("Moeda desconhecida; preço não assumido em euros");
      }
      const address = resolve(entity.address || node.address);
      const size = entity.floorSize || node.floorSize;
      const business = String(offer?.businessFunction || "");
      const transaction = /sell$/i.test(business)
        ? "sale"
        : /leaseout$/i.test(business)
          ? "rent"
          : entry.connector?.transaction || "unknown";
      const geo = resolve(entity.geo || node.geo);
      let coordinates = null;
      if (geo?.latitude != null && geo?.longitude != null)
        coordinates = {
          lat: geo.latitude,
          lon: geo.longitude,
          precision: "approximate",
        };
      rows.push(
        normalizeExtracted(
          {
            source,
            publishedAt:
              node.datePosted || node.datePublished || entity.datePublished,
            sourceUpdatedAt: node.dateModified || entity.dateModified,
            originalPrice: offer?.price,
            originalCurrency: offer?.priceCurrency,
            reference:
              node.sku ||
              node.productID ||
              (typeof entity.identifier === "object"
                ? entity.identifier.value
                : entity.identifier) ||
              undefined,
            url: absolute,
            title,
            description:
              typeof node.description === "string"
                ? node.description
                : entity.description || "",
            price,
            location:
              typeof address === "string"
                ? address
                : [
                    address?.streetAddress,
                    address?.addressLocality,
                    address?.addressRegion,
                  ]
                    .filter(Boolean)
                    .join(", "),
            municipality: entity.municipality || "",
            country:
              typeof address?.addressCountry === "string"
                ? address.addressCountry
                : "",
            area:
              size &&
              (["MTK", "M2"].includes(size.unitCode) ||
                /^(m²|m2|sqm)$/i.test(size.unitText || ""))
                ? size.value
                : null,
            areaType: "unknown",
            typology:
              entity.numberOfBedrooms != null
                ? "T" + entity.numberOfBedrooms
                : "",
            coordinates,
            transaction,
            provenance: {
              method: "jsonld",
              collectedAt: new Date().toISOString(),
              url: baseUrl || absolute,
              transactionBasis: /sell$|leaseout$/i.test(business)
                ? "published"
                : transaction === "unknown"
                  ? "unknown"
                  : "configured",
              areaBasis: "published; type unknown",
              currencyBasis: currency ? "published" : "unknown",
            },
          },
          catalog,
        ),
      );
    } catch (e) {
      warnings.push(e.message);
    }
  }
  return { listings: rows, warnings, $ };
}
function selectorRows(html, source, catalog, baseUrl) {
  const entry = catalog.find((s) => s.id === source),
    config = entry?.connector?.selectors;
  if (!config?.item || !config.title || !config.url)
    throw Error("Configure seletores de item, título e URL para esta fonte");
  const $ = cheerio.load(html),
    listings = [],
    warnings = [];
  const value = (item, field) =>
    config[field]
      ? item.find(config[field]).first().text().replace(/\s+/g, " ").trim()
      : "";
  $(config.item).each((_, element) => {
    const item = $(element);
    try {
      const link = item.find(config.url).first();
      const href = link.attr("href");
      if (!href) throw Error("Anúncio sem ligação");
      const url = new URL(href, baseUrl).href;
      const rawPrice = value(item, "price");
      const area = value(item, "area");
      listings.push(
        normalizeExtracted(
          {
            source,
            url,
            title: value(item, "title"),
            reference: value(item, "reference") || undefined,
            description: value(item, "description"),
            location: value(item, "location"),
            municipality: value(item, "municipality"),
            price: rawPrice || null,
            originalPrice: rawPrice || undefined,
            originalCurrency: rawPrice ? "EUR" : undefined,
            area: area ? area.replace(/\s*m[²2]\s*$/i, "") : null,
            areaType: entry.connector.areaType || "unknown",
            typology: value(item, "typology"),
            transaction: entry.connector.transaction || "unknown",
            provenance: {
              method: "html",
              url: baseUrl,
              collectedAt: new Date().toISOString(),
              transactionBasis: "configured",
              areaBasis: "configured selectors",
            },
          },
          catalog,
        ),
      );
    } catch (e) {
      warnings.push(e.message);
    }
  });
  return { listings, warnings, $ };
}
function rssRows(xml, source, catalog, baseUrl) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const listings = [],
    warnings = [];
  $("item,entry").each((_, element) => {
    const item = $(element);
    try {
      const url =
        item.find("link").first().attr("href") ||
        item.find("link").first().text();
      const rawPrice = item.find("price").first().text();
      const currency = item.find("price").first().attr("currency");
      const address = item.find("location").first().text();
      listings.push(
        normalizeExtracted(
          {
            source,
            url: new URL(url, baseUrl).href,
            title: item.find("title").first().text(),
            reference: item.find("guid,id").first().text() || undefined,
            description: cheerio
              .load(item.find("description,summary").first().text())
              .text(),
            location: address,
            price: rawPrice && currency === "EUR" ? rawPrice : null,
            originalPrice: rawPrice || undefined,
            originalCurrency: currency || undefined,
            provenance: {
              method: "rss",
              url: baseUrl,
              collectedAt: new Date().toISOString(),
              currencyBasis: currency === "EUR" ? "published" : "unknown",
            },
          },
          catalog,
        ),
      );
    } catch (e) {
      warnings.push(e.message);
    }
  });
  if (!listings.length) throw Error("Feed sem anúncios reconhecidos");
  return { listings, warnings, $ };
}
function parseDocument(html, source, catalog = initialSources(), baseUrl) {
  const entry = catalog.find((s) => s.id === source);
  if (!entry) throw Error("Fonte não registada");
  const result =
    entry.method === "rss"
      ? rssRows(html, source, catalog, baseUrl || entry.homepage)
      : entry.method === "html"
        ? selectorRows(html, source, catalog, baseUrl || entry.homepage)
        : structured(html, source, catalog, baseUrl);
  const selector =
    entry.connector?.selectors?.next ||
    (entry.method === "rss" ? '[rel="next"]' : 'a[rel="next"]');
  const nextUrls = [];
  result.$(selector).each((_, element) => {
    const href = result.$(element).attr("href");
    if (href)
      try {
        const url = new URL(href, baseUrl || entry.homepage).href;
        if (belongs(url, entry.domain)) nextUrls.push(url);
        else result.warnings.push("Paginação fora do domínio ignorada");
      } catch {
        result.warnings.push("URL de paginação inválido");
      }
  });
  const explicitEmpty =
    !!entry.connector?.selectors?.empty &&
    result.$(entry.connector.selectors.empty).length > 0;
  if (!result.listings.length && !explicitEmpty)
    throw Error(
      "Formato não reconhecido: não foram encontrados anúncios suportados. Use JSON/CSV ou reveja o conector.",
    );
  const unique = new Map(),
    conflicted = new Set();
  for (const row of result.listings) {
    if (conflicted.has(row.key)) continue;
    const previous = unique.get(row.key);
    const combined = previous ? reconcileRows(previous, row) : row;
    if (!combined) {
      unique.delete(row.key);
      conflicted.add(row.key);
      result.warnings.push(
        "Referência contraditória excluída: " + row.reference,
      );
    } else unique.set(row.key, combined);
  }
  return {
    listings: [...unique.values()],
    warnings: result.warnings,
    nextUrls: [...new Set(nextUrls)],
    explicitEmpty,
  };
}
function htmlListings(html, source, catalog = initialSources(), baseUrl) {
  return parseDocument(html, source, catalog, baseUrl).listings;
}
async function readImportResult(
  buffer,
  extension,
  source,
  catalog = initialSources(),
) {
  if (buffer.length > 10 * 1024 * 1024)
    throw Error("Limite de importação: 10 MB");
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
  let rows;
  if (extension === ".json") {
    const data = JSON.parse(content);
    if (data?.format === "web-monitor")
      throw Error(
        "Este ficheiro é um backup. Use Restaurar backup para preservar o histórico.",
      );
    rows = Array.isArray(data) ? data : data?.listings;
  } else if (extension === ".csv")
    rows = parse(content, { columns: true, skip_empty_lines: true, bom: true });
  else if ([".html", ".htm"].includes(extension))
    return documentImport(content, source, catalog);
  else if (extension === ".eml") {
    const mail = await simpleParser(buffer, {
      skipHtmlToText: true,
      skipTextToHtml: true,
    });
    if (!mail.html)
      throw Error("E-mail sem HTML estruturado suportado. Use JSON/CSV.");
    return documentImport(mail.html, source, catalog);
  } else throw Error("Formato não suportado");
  if (!Array.isArray(rows)) throw Error("É necessária uma lista de anúncios");
  return {
    warnings: [],
    partial: false,
    rows: rows.map((x) =>
      normalize(
        {
          ...x,
          source: x.source || source,
          provenance: {
            method: extension.slice(1),
            collectedAt: new Date().toISOString(),
          },
        },
        catalog,
      ),
    ),
  };
}
function documentImport(content, source, catalog) {
  const result = parseDocument(content, source, catalog);
  return {
    rows: result.listings,
    warnings: result.warnings,
    partial: result.warnings.length > 0,
  };
}
async function readImport(...args) {
  const result = await readImportResult(...args);
  if (result.partial)
    throw Error(
      "Importação parcial: use a revisão e confirme os avisos antes de gravar",
    );
  return result.rows;
}
module.exports = { readImport, readImportResult, htmlListings, parseDocument };
