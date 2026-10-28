const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const asar = require("@electron/asar");

test("verificador Windows: caminhos nativos ASAR e rejeição de fonte alterada/ausente", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wm-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, data) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  const source = "src/core/catalog-store.cjs";
  const pkg = { version: "0.3.1", main: source };
  write(source, "module.exports = 'SYNTHETIC';\n");
  write("payload/" + source, fs.readFileSync(path.join(root, source)));
  write("payload/package.json", JSON.stringify(pkg));
  const archive = path.join(root, "dist/win-unpacked/resources/app.asar");
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  await asar.createPackage(path.join(root, "payload"), archive);
  const pe = Buffer.alloc(128);
  pe.write("MZ"); pe.writeUInt32LE(64, 60); pe.write("PE\0\0", 64); pe.writeUInt16LE(0x8664, 68);
  write("dist/win-unpacked/Web Monitor.exe", pe);
  const wasm = "node_modules/sql.js/dist/sql-wasm.wasm";
  write(wasm, Buffer.from("\0asmSYNTHETIC"));
  write("dist/win-unpacked/resources/app.asar.unpacked/" + wasm, Buffer.from("\0asmSYNTHETIC"));
  const code = fs.readFileSync(path.join(__dirname, "../scripts/verify-windows.cjs"), "utf8");
  const filesystemFile = path.join(path.dirname(require.resolve("@electron/asar")), "filesystem.js");
  const localRequire = createRequire(filesystemFile);
  function verify(paths) {
    // Run the installed ASAR lookup implementation with Windows path semantics,
    // even on Linux. Archive entries and source bytes are real, not stubbed.
    const exports = {};
    vm.runInNewContext(fs.readFileSync(filesystemFile, "utf8"), {
      exports, require: (name) => name === "path" ? paths : localRequire(name),
    }, { filename: filesystemFile });
    const lookup = new exports.Filesystem(root);
    lookup.setHeader(asar.getRawHeader(archive).header, 0);
    const native = (value) => typeof value === "string" ? value.split(paths.sep).join(path.sep) : value;
    const disk = new Proxy(fs, { get(target, key) {
      if (["readdirSync", "readFileSync", "openSync", "statSync"].includes(key))
        return (file, ...args) => target[key](native(file), ...args);
      return target[key];
    } });
    const nativeAsar = {
      listPackage: () => asar.listPackage(archive),
      extractFile: (_, name) => {
        lookup.getFile(name);
        return asar.extractFile(archive, native(name));
      },
    };
    vm.runInNewContext(code, {
      Buffer,
      __dirname: paths.join(root, "scripts"),
      process: { argv: ["node", "verify-windows.cjs", "--unpacked"] },
      console: { log() {} },
      require: (name) => ({ "node:fs": disk, "node:path": paths, "@electron/asar": nativeAsar, "../package.json": pkg })[name] || require(name),
    }, { filename: "verify-windows.cjs" });
  }
  verify(path.posix);
  verify(path.win32);
  write(source, "module.exports = 'TAMPERED';\n");
  assert.throws(() => verify(path.win32), /Fonte empacotada diferente/);
  write("src/core/missing.cjs", "module.exports = 'MISSING';\n");
  write(source, "module.exports = 'SYNTHETIC';\n");
  assert.throws(() => verify(path.win32), /not found|not exist/);
});
