// Structural verification only: this does not execute Windows or its installer.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const asar = require("@electron/asar"); // supplied by the locked electron-builder toolchain
const root = path.join(__dirname, "..");
const pkg = require("../package.json");
const output = path.join(root, "dist");
const unpacked = path.join(output, "win-unpacked");
const archive = path.join(unpacked, "resources", "app.asar");

function machine(file) {
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(4096);
    const length = fs.readSync(fd, header, 0, header.length, 0);
    assert.equal(header.toString("ascii", 0, 2), "MZ", "Executável sem cabeçalho DOS");
    const pe = header.readUInt32LE(60);
    assert.ok(pe >= 64 && pe + 26 <= length, "Cabeçalho PE fora do limite");
    assert.equal(header.toString("ascii", pe, pe + 4), "PE\0\0", "Executável sem cabeçalho PE");
    return header.readUInt16LE(pe + 4);
  } finally {
    fs.closeSync(fd);
  }
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function digest(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, length));
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

assert.equal(machine(path.join(unpacked, "Web Monitor.exe")), 0x8664, "A aplicação deve ser Windows x64");
const bundledPackage = JSON.parse(asar.extractFile(archive, "package.json"));
assert.equal(bundledPackage.version, pkg.version, "Versão empacotada desatualizada");
assert.equal(bundledPackage.main, pkg.main);
const sources = files(path.join(root, "src"));
for (const file of sources) {
  // ASAR's filesystem splits paths using the host separator (path.sep).
  // Converting to '/' here prevents nested entries from resolving on Windows.
  const relative = path.relative(root, file);
  assert.ok(asar.extractFile(archive, relative).equals(fs.readFileSync(file)), "Fonte empacotada diferente: " + relative);
}
const wasm = "node_modules/sql.js/dist/sql-wasm.wasm";
const wasmFile = path.join(unpacked, "resources", "app.asar.unpacked", ...wasm.split("/"));
assert.equal(digest(wasmFile), digest(path.join(root, ...wasm.split("/"))), "SQLite WASM ausente ou diferente");
assert.ok(!asar.listPackage(archive).some((name) => /(?:^|[/\\])(?:monitor\.sqlite|\.env|diagnostics\.log)$/.test(name)), "Dados locais encontrados no pacote");
console.log("Pacote Windows x64: PE, versão, " + sources.length + " fontes e SQLite WASM verificados.");
if (!process.argv.includes("--unpacked")) {
  const targets = process.argv.includes("--portable") ? ["portable"] : ["setup", "portable"];
  const sums = targets.map((target) => {
    const name = `Web-Monitor-${pkg.version}-windows-x64-${target}.exe`;
    const executable = path.join(output, name);
    assert.ok([0x14c, 0x8664].includes(machine(executable)), "Executável PE inválido");
    assert.ok(fs.statSync(executable).size > 1024 * 1024, "Executável incompleto");
    const sum = digest(executable);
    console.log("Gerado (execução Windows por validar): " + name + " · SHA256: " + sum);
    return `${sum}  ${name}\n`;
  });
  fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), sums.join(""));
  fs.copyFileSync(path.join(root, "docs", "WINDOWS.md"), path.join(output, "LEIA-ME-Windows.md"));
}
