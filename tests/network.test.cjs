const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  SafeClient,
  publicAddress,
  resolvePublic,
} = require("../src/core/network.cjs");
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const response = (status = 200, body = "ok", headers = {}) => ({
  status,
  body,
  headers,
});
test("DNS privado, misto, metadados e IPv6 reservados são recusados antes do transporte", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("93.184.216.34"), true);
  await assert.rejects(
    resolvePublic("https://example.org", async () => [
      { address: "127.0.0.1", family: 4 },
    ]),
    /não público/,
  );
  let calls = 0;
  const client = new SafeClient({
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    request: async () => {
      calls++;
      return response();
    },
    minIntervalMs: 0,
  });
  await assert.rejects(client.fetch("https://example.org"));
  assert.equal(calls, 0);
});
test("redirecionamentos revalidam domínio e DNS; ciclos têm limite", async () => {
  const client = new SafeClient({
    lookup: publicLookup,
    request: async () =>
      response(302, "", { location: "https://private.example.net/" }),
    minIntervalMs: 0,
  });
  await assert.rejects(
    client.fetch("https://example.org", { allowedDomain: "example.org" }),
    /fora do domínio/,
  );
  const loop = new SafeClient({
    lookup: publicLookup,
    request: async () => response(302, "", { location: "/again" }),
    minIntervalMs: 0,
  });
  await assert.rejects(loop.fetch("https://example.org"), /excessivo/);
});
test("429 e 503 têm retries limitados e respeitam Retry-After; 403 não repete", async () => {
  let calls = 0;
  const pauses = [];
  const client = new SafeClient({
    lookup: publicLookup,
    request: async () =>
      ++calls < 3 ? response(429, "", { "retry-after": "2" }) : response(),
    delay: async (ms) => pauses.push(ms),
    minIntervalMs: 0,
  });
  assert.equal((await client.fetch("https://example.org")).body, "ok");
  assert.equal(calls, 3);
  assert.ok(pauses.includes(2000));
  calls = 0;
  const blocked = new SafeClient({
    lookup: publicLookup,
    request: async () => {
      calls++;
      return response(403);
    },
    minIntervalMs: 0,
  });
  await assert.rejects(
    blocked.fetch("https://example.org"),
    (e) => e.code === "blocked",
  );
  assert.equal(calls, 1);
});
test("cache ETag conserva corpo na resposta 304", async () => {
  let calls = 0;
  const client = new SafeClient({
    lookup: publicLookup,
    request: async (_url, { headers }) => {
      if (calls++) {
        assert.equal(headers["If-None-Match"], "abc");
        return response(304);
      }
      return response(200, "page", { etag: "abc" });
    },
    minIntervalMs: 0,
  });
  await client.fetch("https://example.org");
  const cached = await client.fetch("https://example.org");
  assert.equal(cached.body, "page");
  assert.equal(cached.cached, true);
});
test("timeout DNS e cancelamento são distinguidos", async () => {
  const client = new SafeClient({
    lookup: () => new Promise(() => {}),
    timeoutMs: 10,
    minIntervalMs: 0,
  });
  await assert.rejects(
    client.fetch("https://example.org"),
    (e) => e.code === "timeout",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.fetch("https://example.org", { signal: controller.signal }),
    (e) => e.code === "cancelled",
  );
});
