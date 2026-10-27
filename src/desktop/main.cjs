const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Store, safeUrl } = require("../core/store.cjs");
const { duplicates, validateSettings } = require("../core/rules.cjs");
const { readImportResult } = require("../core/importers.cjs");
const { ImportSession } = require("../core/import-session.cjs");
const { diagnostics } = require("../core/diagnostics.cjs");
const { plan, candidates } = require("../core/discovery.cjs");
const { updateSource } = require("../core/collector.cjs");
const controllers = new Map();
let store;
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
const defaults = {
  idealista: "https://www.idealista.pt/comprar-casas/povoa-de-lanhoso/",
  remax: "",
  boulder:
    "https://boulderimobiliaria.pt/Imoveis?imovtn_id%5B%5D=1&imovnature_id%5B%5D=1&imovnature_id%5B%5D=7&place=concelho_42&precomin=&precomax=&reference=&imovest_id=&areamin=&areamax=&imovce_id=&zona_id=",
};
function settings() {
  const value = JSON.parse(
    store.getMeta("settings") ||
      JSON.stringify({ urls: defaults, alerts: false }),
  );
  return {
    ...value,
    urls: Object.fromEntries(
      store.sources().map((x) => [x.id, value.urls?.[x.id] ?? x.searchUrl]),
    ),
  };
}
function notifyAlerts(alerts) {
  if (settings().alerts && alerts.length && Notification.isSupported())
    try {
      new Notification({
        title: "Web Monitor",
        body: alerts.length + " novos alertas. Consulte a aplicação.",
      }).show();
    } catch {
      /* Available inside the app even without OS permission. */
    }
}
function handle(name, fn) {
  ipcMain.handle(name, async (_, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      try {
        fs.appendFileSync(
          path.join(app.getPath("userData"), "diagnostics.log"),
          `${new Date().toISOString()} ${name}: ${e.message}\n`,
        );
      } catch {
        /* Preserve the original operation error if logging is unavailable. */
      }
      return { ok: false, error: e.message };
    }
  });
}
app
  .whenReady()
  .then(async () => {
    store = await Store.open(
      path.join(app.getPath("userData"), "monitor.sqlite"),
    );
    handle("list", () => ({
      activeZoneId: store.getMeta("active-zone-id") ?? "povoa-de-lanhoso",
      sources: store.sources(),
      zones: store.zones(),
      runs: store.runs(),
      associations: store.associations(),
      listings: store.list(),
      imports: store.rows("SELECT * FROM imports ORDER BY id DESC LIMIT 20"),
      settings: settings(),
      alerts: JSON.parse(store.getMeta("alerts") || "[]"),
    }));
    handle("history", (key) => {
      if (typeof key !== "string") throw Error("Referência inválida");
      return {
        history: store.history(key),
        changes: store.rows(
          "SELECT * FROM changes WHERE key=? ORDER BY id DESC",
          [key],
        ),
        duplicates: duplicates(
          store.list().find((x) => x.key === key) || { location: "" },
          store.list(),
        ),
      };
    });
    const imports = new ImportSession(store, {
      config: settings,
      beforeCommit: () =>
        store.backup(path.join(app.getPath("userData"), "backups")),
    });
    handle("prepareImport", async (source) => {
      store.source(source);
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          {
            name: "Anúncios",
            extensions: ["json", "csv", "html", "htm", "eml"],
          },
        ],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 10 * 1024 * 1024)
        throw Error("Limite de importação: 10 MB");
      const parsed = await readImportResult(
        fs.readFileSync(file),
        path.extname(file).toLowerCase(),
        source,
        store.sources(),
      );
      return imports.prepare(parsed.rows, {
        sourceId: source,
        label: path.basename(file),
        warnings: parsed.warnings,
        partial: parsed.partial,
      });
    });
    handle("confirmImport", (token, options) => {
      const result = imports.confirm(token, options);
      notifyAlerts(result.alerts);
      return result.summary;
    });
    handle("cancelImport", (token) => imports.cancel(token));
    handle("diagnostics", (zoneId) =>
      diagnostics(store, zoneId, {
        appVersion: app.getVersion(),
        platform: process.platform,
      }),
    );
    handle("settings", (value) => {
      store.transaction(() => {
        const next = validateSettings(value, safeUrl, store.sources());
        for (const source of store.sources())
          if (source.searchUrl !== next.urls[source.id])
            store.saveSource({
              ...source,
              searchZoneId: "povoa-de-lanhoso",
              searchUrl: next.urls[source.id],
            });
        store.setMeta("settings", JSON.stringify(next));
      });
      return true;
    });
    handle("saveSource", (value) => {
      const result = store.saveSource(value);
      const config = settings();
      config.urls[result.id] = result.searchUrl;
      store.setMeta("settings", JSON.stringify(config));
      return result;
    });
    handle("saveZone", (value) =>
      store.transaction(() => {
        const zone = store.saveZone(value);
        store.setMeta("active-zone-id", zone.id);
        return zone;
      }),
    );
    handle("selectZone", (id) => {
      if (id !== "" && !store.zones().some((x) => x.id === id))
        throw Error("Zona não encontrada");
      store.setMeta("active-zone-id", id);
      return true;
    });
    handle("association", (value) => store.associate(value));
    handle("discoverOSM", async (zoneId) =>
      require("../core/osm-discovery.cjs").discoverOSM(store, zoneId),
    );
    handle("discovery", (zoneId) => {
      const zone = store.zones().find((z) => z.id === zoneId);
      if (!zone) throw Error("Zona não encontrada");
      return plan(zone);
    });
    handle("importCandidates", async (zoneId) => {
      const zone = store.zones().find((z) => z.id === zoneId);
      if (!zone) throw Error("Zona não encontrada");
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          {
            name: "Referências de fontes",
            extensions: ["json", "csv", "html", "htm"],
          },
        ],
      });
      if (result.canceled) return null;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 2 * 1024 * 1024)
        throw Error("Limite de 2 MB");
      const found = candidates(
        fs.readFileSync(file),
        path.extname(file).toLowerCase(),
        zone,
        store.sources(),
      );
      store.transaction(() =>
        found.sources.forEach((x) => store.saveSource(x)),
      );
      return { added: found.sources.length, warnings: found.warnings };
    });
    handle("updateSource", async (id, zoneId) => {
      if (controllers.has(id)) throw Error("Fonte já em atualização");
      const controller = new AbortController();
      controllers.set(id, controller);
      try {
        const result = await updateSource(store, id, zoneId, {
          signal: controller.signal,
          config: settings(),
          beforeImport: () =>
            store.backup(path.join(app.getPath("userData"), "backups")),
        });
        notifyAlerts(result.alerts);
        return result;
      } finally {
        controllers.delete(id);
      }
    });
    handle("cancelUpdate", (id) => {
      controllers.get(id)?.abort();
      return true;
    });
    handle("open", async (url) => {
      await shell.openExternal(safeUrl(url));
    });
    handle("export", async () => {
      const result = await dialog.showSaveDialog({
        defaultPath: "web-monitor-backup.json",
        filters: [{ name: "Backup JSON", extensions: ["json"] }],
      });
      if (result.canceled) return false;
      fs.writeFileSync(
        result.filePath,
        JSON.stringify(store.export(), null, 2),
        { mode: 0o600 },
      );
      return true;
    });
    handle("restore", async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Backup JSON", extensions: ["json"] }],
      });
      if (result.canceled) return false;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 50 * 1024 * 1024)
        throw Error("Backup demasiado grande");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const answer = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancelar", "Restaurar"],
        defaultId: 0,
        cancelId: 0,
        message:
          "Substituir os dados atuais? Será guardada uma cópia de segurança local.",
      });
      if (answer.response !== 1) return false;
      store.backup(path.join(app.getPath("userData"), "backups"));
      store.restore(data);
      return true;
    });
    function createWindow() {
      const win = new BrowserWindow({
        width: 1320,
        height: 860,
        minWidth: 920,
        minHeight: 650,
        backgroundColor: "#101820",
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.loadFile(path.join(__dirname, "../ui/index.html"));
    }
    const lastScheduled = new Map(),
      failures = new Map();
    const scheduler = setInterval(() => {
      for (const source of store.sources()) {
        if (
          !source.enabled ||
          !source.permission.allowed ||
          !source.intervalMinutes ||
          source.method === "manual" ||
          controllers.has(source.id)
        )
          continue;
        const previous = lastScheduled.get(source.id) || Date.now();
        if (!lastScheduled.has(source.id))
          lastScheduled.set(source.id, previous);
        if (
          Date.now() - previous <
          source.intervalMinutes *
            60000 *
            2 ** Math.min(failures.get(source.id) || 0, 4)
        )
          continue;
        lastScheduled.set(source.id, Date.now());
        const controller = new AbortController();
        controllers.set(source.id, controller);
        updateSource(
          store,
          source.id,
          store.getMeta("active-zone-id") || "povoa-de-lanhoso",
          {
            signal: controller.signal,
            config: settings(),
            beforeImport: () =>
              store.backup(path.join(app.getPath("userData"), "backups")),
          },
        )
          .then((result) => {
            notifyAlerts(result.alerts);
            failures.set(
              source.id,
              ["complete", "partial"].includes(result.run.status)
                ? 0
                : (failures.get(source.id) || 0) + 1,
            );
          })
          .catch((error) => {
            failures.set(source.id, (failures.get(source.id) || 0) + 1);
            console.error("Atualização periódica: " + error.message);
          })
          .finally(() => controllers.delete(source.id));
      }
    }, 60000);
    scheduler.unref();
    app.on("before-quit", () => {
      clearInterval(scheduler);
      for (const controller of controllers.values()) controller.abort();
    });
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    console.error(error.message);
    dialog.showErrorBox(
      "Não foi possível abrir o Web Monitor",
      error.message +
        "\nOs dados não foram apagados. Verifique a pasta de dados e os backups.",
    );
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => store?.close());
