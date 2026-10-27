const { contextBridge, ipcRenderer } = require("electron");
const api = {};
for (const method of [
  "list",
  "history",
  "prepareImport",
  "confirmImport",
  "cancelImport",
  "diagnostics",
  "settings",
  "open",
  "export",
  "restore",
  "saveSource",
  "saveZone",
  "discovery",
  "importCandidates",
  "updateSource",
  "cancelUpdate",
  "association",
  "discoverOSM",
  "selectZone",
])
  api[method] = (...args) => ipcRenderer.invoke(method, ...args);
contextBridge.exposeInMainWorld("monitor", Object.freeze(api));
