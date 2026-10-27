// Real Electron smoke test. Requires a graphical session and a usable OS sandbox.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "web-monitor-desktop-"));
app.setPath("userData", root);
const input = path.join(root, "synthetic.json");
const output = path.join(root, "backup.json");
fs.writeFileSync(
  input,
  JSON.stringify([
    {
      source: "idealista",
      reference: "SYNTHETIC-SMOKE",
      url: "https://idealista.pt/imovel/synthetic-smoke/",
      title: "EXEMPLO SINTÉTICO",
      price: 100000,
      area: 100,
    },
  ]),
);
let nextFile = input;
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [nextFile],
});
dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
dialog.showMessageBox = async () => ({ response: 1 });
const timer = setTimeout(() => {
  console.error("Desktop smoke timeout");
  app.exit(1);
}, 30000);
app.on("browser-window-created", (_, win) => {
  win.webContents.once("did-finish-load", async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async()=>{
        const cancelled=await window.monitor.prepareImport('idealista');
        if(!cancelled.ok || cancelled.data.summary.newListings!==1)throw Error('Revisão desktop falhou');
        const before=await window.monitor.list();if(before.data.listings.length!==0)throw Error('Revisão escreveu dados');
        await window.monitor.cancelImport(cancelled.data.token);
        const prepared=await window.monitor.prepareImport('idealista');
        const first=await window.monitor.confirmImport(prepared.data.token,{acceptPartial:false});
        if(!first.ok || first.data.added!==1)throw Error('Importação desktop falhou');
        const preparedAgain=await window.monitor.prepareImport('idealista');
        const repeated=await window.monitor.confirmImport(preparedAgain.data.token,{acceptPartial:false});
        if(!repeated.ok || repeated.data.added!==0 || repeated.data.changed!==0)throw Error('Idempotência desktop falhou');
        const history=await window.monitor.history('idealista:SYNTHETIC-SMOKE');
        if(!history.ok || history.data.history.length!==1)throw Error('Histórico desktop falhou');
        const data=await window.monitor.list();
        if(!data.ok || data.data.listings.length!==1 || data.data.alerts.length!==1)throw Error('Persistência/alertas desktop falharam');
        const diagnostic=await window.monitor.diagnostics('povoa-de-lanhoso');if(!diagnostic.ok || diagnostic.data.storage.integrity!=='ok' || diagnostic.data.networkVerified!==false)throw Error('Diagnóstico desktop falhou');
        const exported=await window.monitor.export();
        if(!exported.ok || !exported.data)throw Error('Exportação desktop falhou');
        return {sandboxed:typeof require==='undefined',title:document.title};
      })()`);
      if (!result.sandboxed || result.title !== "Web Monitor")
        throw Error("Isolamento ou página inválida");
      const backup = JSON.parse(fs.readFileSync(output, "utf8"));
      if (backup.history.length !== 1)
        throw Error("Histórico ausente no backup");
      nextFile = output;
      const restored = await win.webContents.executeJavaScript(
        "window.monitor.restore()",
      );
      if (!restored.ok || !restored.data)
        throw Error("Restauro desktop falhou");
      console.log(
        "PASS: revisão/cancelamento/confirmação IPC, diagnóstico, idempotência, histórico, alertas, exportação, restauro e isolamento Electron",
      );
      clearTimeout(timer);
      app.quit();
    } catch (error) {
      console.error(error);
      clearTimeout(timer);
      app.exit(1);
    }
  });
});
require("../src/desktop/main.cjs");
