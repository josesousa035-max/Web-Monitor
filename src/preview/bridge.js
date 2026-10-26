// Browser-only demonstration adapter. No real listings, filesystem access or network.
(() => {
  const now = "2026-10-26T12:00:00Z";
  const sourceIds = ["idealista", "boulder", "remax"];
  let catalog = /*CATALOG_DATA*/ [];
  let zones = /*ZONE_DATA*/ [];
  let associations = [];
  let activeZoneId = "povoa-de-lanhoso";
  const examples = [
    ["Moradia T3 com jardim", "Póvoa de Lanhoso", 225000, 245000, 180, "T3"],
    [
      "Apartamento T2 no centro",
      "Nossa Senhora do Amparo",
      142000,
      150000,
      95,
      "T2",
    ],
    ["Quinta com terreno", "Fontarcada", 350000, 350000, 260, "T4"],
    ["Moradia para recuperar", "Taíde", 89000, 99000, 120, "T2"],
    [
      "Apartamento T3 com varanda",
      "Póvoa de Lanhoso",
      195000,
      185000,
      135,
      "T3",
    ],
    ["Moradia térrea com garagem", "Garfe", 275000, 290000, 210, "T3"],
    ["Casa de pedra e logradouro", "Serzedelo", 118000, 118000, 110, "T2"],
    [
      "Moradia T4 com vista para a serra",
      "Sobradelo da Goma",
      325000,
      340000,
      240,
      "T4",
    ],
    ["Apartamento T1 renovado", "Póvoa de Lanhoso", 107000, 107000, 65, "T1"],
    ["Moradia familiar com piscina", "Ferreiros", 395000, 410000, 285, "T4"],
    ["Casa de campo com terreno", "Vilela", 165000, 165000, 145, "T3"],
    [
      "Apartamento T2 com garagem",
      "Póvoa de Lanhoso",
      158000,
      155000,
      105,
      "T2",
    ],
  ];
  const listings = examples.map(
    ([title, location, price, previous, area, typology], i) => ({
      key: `${sourceIds[i % 3]}:DEMO-${i + 1}`,
      source: sourceIds[i % 3],
      reference: `DEMO-${i + 1}`,
      title: `${title} · DEMONSTRAÇÃO`,
      location,
      priceCents: price * 100,
      previousPriceCents: previous * 100,
      municipality: "Póvoa de Lanhoso",
      transaction: "sale",
      areaType: "gross",
      area,
      typology,
      propertyType: title.startsWith("Apartamento") ? "Apartamento" : "Moradia",
      firstSeen: `2026-10-${String(26 - i).padStart(2, "0")}T10:00:00Z`,
      lastSeen: now,
      status: "active",
      description:
        "Anúncio inteiramente fictício, criado para explorar a interface. Não corresponde a qualquer imóvel ou oferta real. Na aplicação desktop, este espaço apresenta os dados importados pelo utilizador.",
      url: "https://example.invalid/demonstracao",
    }),
  );
  let settings = {
    urls: {
      idealista: "https://www.idealista.pt/comprar-casas/povoa-de-lanhoso/",
      boulder: "https://boulderimobiliaria.pt/",
      remax: "",
    },
    alerts: false,
    newEnabled: true,
    dropEnabled: true,
    thresholdEnabled: true,
    thresholdCents: 15000000,
    searches: [
      {
        id: "demo-moradias",
        name: "Moradias até 200 mil",
        query: "moradia",
        source: "",
        maxPriceCents: 20000000,
        minArea: 100,
        enabled: true,
      },
    ],
  };
  const imports = [{ date: now, count: 12, added: 3, changed: 6 }];
  const alerts = listings
    .slice(0, 4)
    .map((x, i) => ({
      id: `demo-alert-${i}`,
      key: x.key,
      title: x.title,
      reason: i % 2 ? "new" : "drop",
      date: now,
      priceCents: x.priceCents,
    }));
  const ok = (data) => ({ ok: true, data });
  window.monitor = {
    list: async () =>
      ok({
        listings,
        settings,
        imports,
        alerts,
        sources: catalog,
        zones,
        runs: [],
        associations,
        activeZoneId,
      }),
    history: async (key) => {
      const x = listings.find((x) => x.key === key);
      if (!x) return { ok: false, error: "Exemplo não encontrado" };
      return ok({
        history: [
          {
            date: "2026-09-01T10:00:00Z",
            old_price: null,
            new_price: Math.round(x.previousPriceCents * 1.03),
          },
          {
            date: "2026-10-01T10:00:00Z",
            old_price: Math.round(x.previousPriceCents * 1.03),
            new_price: x.previousPriceCents,
          },
          {
            date: now,
            old_price: x.previousPriceCents,
            new_price: x.priceCents,
          },
        ],
        changes: [],
        duplicates: [],
      });
    },
    saveSource: async (value) => {
      try {
        const domain = new URL(value.homepage).hostname.replace(/^www\./, "");
        if (catalog.some((x) => x.id !== value.id && x.domain === domain))
          throw Error("Este domínio já existe no catálogo");
        const row = { ...value, domain, lastResult: null };
        catalog = [...catalog.filter((x) => x.id !== row.id), row];
        settings.urls[row.id] = row.searchUrl;
        return ok(row);
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    selectZone: async (id) => {
      activeZoneId = id;
      return ok(true);
    },
    saveZone: async (value) => {
      if (
        !value.name.trim() ||
        !value.municipality.trim() ||
        (value.mode === "radius" && (!value.center || !value.radiusKm))
      )
        return {
          ok: false,
          error: "Defina o nome, concelho e os parâmetros geográficos",
        };
      zones = [...zones.filter((x) => x.id !== value.id), value];
      activeZoneId = value.id;
      return ok(value);
    },
    discoverOSM: async () => ({
      ok: false,
      error:
        "A preview não consulta a Internet. A descoberta OSM está implementada na aplicação desktop, mas a execução real ficou bloqueada pelo acesso de rede deste ambiente.",
    }),
    discovery: async (zoneId) => {
      const zone = zones.find((x) => x.id === zoneId);
      if (!zone) return { ok: false, error: "Zona não encontrada" };
      return ok({
        mode: "assisted",
        zoneId,
        note: "Demonstração do plano de pesquisa assistida. Nenhuma fonte foi descoberta ou verificada nesta preview.",
        queries: [
          'imobiliárias "' + zone.municipality + '"',
          '"' + zone.municipality + '" "imóveis" "comprar"',
          '"' + zone.municipality + '" "agência imobiliária"',
        ].map((query) => ({
          query,
          url: "https://www.google.com/search?q=" + encodeURIComponent(query),
        })),
      });
    },
    importCandidates: async () => ({
      ok: false,
      error: "Importação de referências disponível na aplicação desktop.",
    }),
    updateSource: async () => ({
      ok: false,
      error: "A preview não consulta fontes nem recolhe anúncios reais.",
    }),
    cancelUpdate: async () => ok(true),
    association: async (value) => {
      associations = [
        ...associations.filter(
          (x) =>
            JSON.stringify([...x.keys].sort()) !==
            JSON.stringify([...value.keys].sort()),
        ),
        { ...value, date: now },
      ];
      return ok(true);
    },
    settings: async (value) => {
      settings = JSON.parse(JSON.stringify(value));
      return ok(true);
    },
    open: async () => ({
      ok: false,
      error: "Demonstração: não existe um anúncio real para abrir.",
    }),
    import: async () => ({
      ok: false,
      error: "A importação de ficheiros está disponível na aplicação desktop.",
    }),
    restore: async () => ({
      ok: false,
      error: "O restauro de dados está disponível na aplicação desktop.",
    }),
    export: async () => {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              notice:
                "DADOS FICTÍCIOS — DEMONSTRAÇÃO, não é um backup da aplicação",
              listings,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "web-monitor-demonstracao.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return ok(true);
    },
  };
  const banner = document.createElement("div");
  banner.className = "preview-banner";
  banner.setAttribute("role", "note");
  banner.textContent =
    "PRÉ-VISUALIZAÇÃO INTERATIVA · Todos os imóveis e preços são fictícios. As alterações de configuração duram apenas nesta sessão. Sem recolha, notificações ou acesso aos seus ficheiros.";
  document.querySelector("main").prepend(banner);
  document.querySelector(".local").textContent =
    "Modo demonstração · dados fictícios\nNenhuma ligação aos portais";
  document.getElementById("import-top").textContent = "Explorar fontes";
  document.getElementById("notifications").disabled = true;
  document.getElementById("restore").disabled = true;
  document.getElementById("restore").title = "Disponível na aplicação desktop";
  document.getElementById("export").textContent = "Exportar exemplos fictícios";
})();
