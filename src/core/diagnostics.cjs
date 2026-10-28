function sourceDiagnostic(source, zone, runs) {
  const query =
    source.searches?.[zone.id] ||
    (zone.id === "povoa-de-lanhoso" ? source.searchUrl : "");
  const checks = {
    enabled: source.enabled !== false,
    queryConfigured: !!query,
    methodConfigured: source.method !== "manual",
    permissionDocumented:
      source.permission?.allowed === true &&
      !!source.permission?.evidence &&
      !!source.permission?.termsUrl,
  };
  let status = "ready",
    action =
      "Pode atualizar esta fonte. A conectividade e os dados ainda precisam de uma tentativa real.";
  if (!checks.enabled) {
    status = "disabled";
    action = "Ative a fonte nas configurações para a utilizar.";
  } else if (source.method === "manual") {
    status = "manual";
    action =
      "Importe um ficheiro e reveja os dados. A recolha automática não está configurada.";
  } else if (!checks.queryConfigured) {
    status = "needs-search";
    action =
      "Configure uma pesquisa para esta zona, sem reutilizar URLs de outra localização.";
  } else if (!checks.permissionDocumented) {
    status = "needs-permission";
    action =
      "Avalie as condições e registe a autorização antes de ativar recolha.";
  }
  const last = runs.find(
    (run) =>
      run.sourceId === source.id &&
      (run.zoneId === zone.id || run.zoneId === null),
  );
  const knownCodes = new Set([
    "blocked",
    "robots",
    "permission",
    "timeout",
    "proxy",
    "unsafe-destination",
    "unsafe-redirect",
    "rate-limit",
    "collection",
    "http",
    "cancelled",
    "size",
    "redirect",
    "cache",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ETIMEDOUT",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ]);
  const code = last?.error?.code
    ? knownCodes.has(last.error.code)
      ? last.error.code
      : "unknown"
    : null;
  const actions = {
    blocked:
      "A origem ou o proxy recusou o acesso. Verifique as condições e a rede; não contorne o bloqueio.",
    robots: "Respeite a restrição robots e procure um método permitido.",
    permission: "Registe a base de autorização ou mantenha importação manual.",
    timeout:
      "A fonte excedeu o tempo limite. Tente mais tarde e reduza a carga.",
    proxy:
      "Reveja a configuração do proxy; não desative TLS ou validação de destinos.",
    "unsafe-destination":
      "O destino não passou a validação de rede. Confirme o site oficial.",
    "rate-limit": "Respeite o intervalo pedido pela fonte antes de repetir.",
    collection:
      "Reveja o formato, a pesquisa e os seletores com um exemplo autorizado.",
    http: "Verifique a disponibilidade e o estado HTTP da fonte.",
    cancelled:
      "A atualização foi cancelada; os dados anteriores foram preservados.",
  };
  if (
    last &&
    !["complete", "partial"].includes(last.status) &&
    status === "ready"
  ) {
    status = "last-attempt-failed";
    action =
      actions[code] ||
      "A última tentativa falhou. Reveja a configuração e o diagnóstico da fonte.";
  }
  return {
    id: source.id,
    name: source.name,
    status,
    checks,
    action,
    networkVerified: false,
    method: source.method,
    scheduleMinutes: source.intervalMinutes || 0,
    lastAttempt: last
      ? {
          date:
            typeof last.finishedAt === "string" &&
            Number.isFinite(Date.parse(last.finishedAt))
              ? last.finishedAt
              : null,
          status: [
            "complete",
            "partial",
            "failed",
            "blocked",
            "cancelled",
          ].includes(last.status)
            ? last.status
            : "unknown",
          items:
            Number.isSafeInteger(last.items) && last.items >= 0
              ? last.items
              : 0,
          exhaustive: last.exhaustive === true,
          errorCode: code,
          httpStatus: Number.isInteger(last.error?.status)
            ? last.error.status
            : null,
        }
      : null,
  };
}
function diagnostics(
  store,
  zoneId,
  { appVersion = "0.3.1", platform = process.platform } = {},
) {
  const zone = store.zones().find((x) => x.id === zoneId);
  if (!zone) throw Error("Zona não encontrada");
  const runs = store
    .rows(
      "SELECT data FROM (SELECT data, ROW_NUMBER() OVER (PARTITION BY json_extract(data, '$.sourceId') ORDER BY rowid DESC) AS position FROM runs WHERE json_extract(data, '$.zoneId') = ? OR json_extract(data, '$.zoneId') IS NULL) WHERE position = 1",
      [zone.id],
    )
    .map((row) => JSON.parse(row.data));
  const sources = store
    .sources()
    .map((source) => sourceDiagnostic(source, zone, runs));
  const check = store.rows("PRAGMA quick_check");
  return {
    generatedAt: new Date().toISOString(),
    appVersion,
    platform,
    zone: { id: zone.id, name: zone.name },
    networkVerified: false,
    note: "Diagnóstico local. Não faz pedidos de rede nem confirma acesso ou compatibilidade real dos sites. A integridade refere-se à base carregada; não testa escrita no disco.",
    storage: {
      schema: store.getMeta("schema_version"),
      integrity:
        check.length === 1 && Object.values(check[0])[0] === "ok"
          ? "ok"
          : "failed",
      listings: store.list().length,
      priceEvents: store.rows("SELECT COUNT(*) AS total FROM history")[0].total,
    },
    sources,
  };
}
module.exports = { diagnostics, sourceDiagnostic };
