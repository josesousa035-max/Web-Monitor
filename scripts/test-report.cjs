const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.join(__dirname, "..");
const output = path.join(root, "dist", "reports");
fs.mkdirSync(output, { recursive: true });
const tests = fs
  .readdirSync(path.join(root, "tests"))
  .filter((file) => file.endsWith(".test.cjs"))
  .sort()
  .map((file) => path.join(root, "tests", file));
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-reporter=spec",
    "--test-reporter=junit",
    "--test-reporter-destination=stdout",
    "--test-reporter-destination=" + path.join(output, "tests.xml"),
    ...tests,
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
