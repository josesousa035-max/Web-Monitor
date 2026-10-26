const { test } = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync, spawnSync } = require("node:child_process");
const { transport } = require("../src/core/network.cjs");
const available =
  spawnSync("openssl", ["version"], { stdio: "ignore" }).status === 0;
test(
  "transporte HTTPS real: CA explícita, TLS verificado, descompressão e limite de resposta",
  { skip: !available },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wm-test-tls-"));
    const key = path.join(dir, "key.pem"),
      cert = path.join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=example.org",
        "-addext",
        "subjectAltName=DNS:example.org",
      ],
      { stdio: "ignore" },
    );
    const ca = fs.readFileSync(cert);
    const server = https.createServer(
      { key: fs.readFileSync(key), cert: ca },
      (req, res) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-encoding": "gzip",
        });
        res.end(
          zlib.gzipSync(
            Buffer.from(
              req.url === "/large" ? "x".repeat(5000) : "Póvoa de Lanhoso",
            ),
          ),
        );
      },
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const address = { address: "127.0.0.1", family: 4 };
    // Trusted internal transport tested in isolation. SafeClient rejects this loopback address.
    try {
      await assert.rejects(
        transport(`https://example.org:${port}/`, { address, proxy: null }),
      );
      const response = await transport(`https://example.org:${port}/`, {
        address,
        proxy: null,
        ca,
      });
      assert.equal(response.body, "Póvoa de Lanhoso");
      await assert.rejects(
        transport(`https://example.org:${port}/large`, {
          address,
          proxy: null,
          ca,
          maxBytes: 100,
        }),
        /limite/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true });
    }
  },
);
