const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const hash = (value) =>
  `'sha256-${crypto.createHash("sha256").update(value).digest("base64")}'`;
function buildPreview() {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const css =
    read("src/ui/style.css") +
    "\n.preview-banner{background:#28483f;color:#b9f8df;border:1px solid #507c6c;border-radius:9px;padding:14px 18px;font-size:12px;line-height:1.7;margin-bottom:28px}.local{white-space:pre-line}@media(max-width:750px){body{display:block}aside{position:static;width:100%;padding:18px}nav{display:flex;flex-wrap:wrap;margin-top:12px;gap:2px}.local,aside>p{display:none}main{margin:0;width:100%;padding:20px}header{display:block}header .primary{margin-top:10px}.stats{grid-template-columns:repeat(2,1fr)}.toolbar{flex-wrap:wrap}.toolbar input,.toolbar select{flex:1 1 40%}.cards{grid-template-columns:1fr}.search-rule{grid-template-columns:1fr}}";
  const { initialSources, PILOT_ZONE } = require("../src/core/catalog.cjs");
  const bridge = read("src/preview/bridge.js")
    .replace("/*CATALOG_DATA*/ []", JSON.stringify(initialSources()))
    .replace("/*ZONE_DATA*/ []", JSON.stringify([PILOT_ZONE]));
  const app = read("src/ui/app.js"),
    geo = read("src/shared/geography.js");
  let html = read("src/ui/index.html");
  html = html.replace(
    /content="default-src[^\"]+"/,
    `content="default-src 'none'; script-src ${hash(bridge)} ${hash(geo)} ${hash(app)}; style-src ${hash(css)}; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'"`,
  );
  html = html.replace(
    /<link\b[^>]*href="style\.css"[^>]*>/,
    `<style>${css}</style>`,
  );
  html = html.replace(
    "<title>Web Monitor</title>",
    "<title>Web Monitor — demonstração interativa</title>",
  );
  html = html.replace('<script src="../shared/geography.js"></script>', "");
  html = html.replace(
    '<script src="app.js"></script>',
    `<script>${bridge}</script><script>${geo}</script><script>${app}</script>`,
  );
  const output = path.join(root, "dist", "preview.html");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html);
  return output;
}
if (require.main === module) console.log(buildPreview());
module.exports = { buildPreview };
