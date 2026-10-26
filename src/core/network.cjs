const https = require("node:https");
const http = require("node:http");
const tls = require("node:tls");
const zlib = require("node:zlib");
const dns = require("node:dns/promises");
const net = require("node:net");
const { publicUrl } = require("./catalog.cjs");
const USER_AGENT = "WebMonitor/0.2.0 (local personal property monitor)";
class NetworkError extends Error {
  constructor(code, message, status = null, retryAfter = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (net.isIP(address) === 6) {
    const first = parseInt(address.split(":")[0], 16);
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !/^2001:(?:0:|db8:|10:|20:)/i.test(address) &&
      !/^2002:/i.test(address)
    );
  }
  return false;
}
function abortError() {
  return new NetworkError("cancelled", "Operação cancelada");
}
async function resolvePublic(url, lookup = dns.lookup) {
  const host = new URL(publicUrl(url)).hostname;
  const result = await lookup(host, { all: true, verbatim: true });
  if (!result.length || result.some((r) => !publicAddress(r.address)))
    throw new NetworkError(
      "unsafe-destination",
      "Destino não público recusado",
    );
  return result[0];
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(done, ms);
    function cancel() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
function proxyFor(host) {
  const bypass = (process.env.NO_PROXY || process.env.no_proxy || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (
    bypass.some(
      (x) =>
        x === "*" ||
        host === x ||
        host.endsWith(x.startsWith(".") ? x : "." + x),
    )
  )
    return null;
  return process.env.HTTPS_PROXY || process.env.https_proxy || null;
}
function tunnel(proxy, address, signal) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(proxy);
    } catch {
      return reject(new NetworkError("proxy", "Proxy configurado inválido"));
    }
    if (!["http:", "https:"].includes(u.protocol))
      return reject(
        new NetworkError("proxy", "Protocolo de proxy não suportado"),
      );
    const target =
      net.isIP(address.address) === 6
        ? "[" + address.address + "]"
        : address.address;
    const headers = { Host: target + ":443" };
    if (u.username || u.password)
      headers["Proxy-Authorization"] =
        "Basic " +
        Buffer.from(
          decodeURIComponent(u.username) + ":" + decodeURIComponent(u.password),
        ).toString("base64");
    const request = (u.protocol === "https:" ? https : http).request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      method: "CONNECT",
      path: target + ":443",
      headers,
      signal,
    });
    request.once("connect", (res, socket, head) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(
          new NetworkError(
            "proxy",
            "O proxy recusou a ligação segura",
            res.statusCode,
          ),
        );
      } else {
        if (head.length) socket.unshift(head);
        resolve(socket);
      }
    });
    request.once("error", reject);
    request.end();
  });
}
function transport(
  url,
  {
    address,
    signal,
    headers,
    proxy = proxyFor(new URL(url).hostname),
    maxBytes = 2 * 1024 * 1024,
    ca,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      headers,
      signal,
      ca,
      lookup: (_host, opts, cb) =>
        cb(
          null,
          opts?.all ? [address] : address.address,
          ...(opts?.all ? [] : [address.family]),
        ),
    };
    let agent;
    if (proxy) {
      agent = new https.Agent({ keepAlive: false });
      agent.createConnection = (_opts, callback) => {
        tunnel(proxy, address, signal)
          .then((socket) => {
            let settled = false;
            const secure = tls.connect({
              socket,
              servername: u.hostname,
              rejectUnauthorized: true,
              ca,
            });
            const settle = (error) => {
              if (settled) return;
              settled = true;
              callback(error, error ? undefined : secure);
            };
            secure.once("secureConnect", () => settle(null));
            secure.once("error", settle);
            signal?.addEventListener("abort", () => secure.destroy(), {
              once: true,
            });
          })
          .catch(callback);
      };
      options.agent = agent;
    }
    const request = https.request(u, options, (response) => {
      let size = 0;
      const chunks = [];
      const encoding = response.headers["content-encoding"];
      const stream =
        encoding === "gzip"
          ? response.pipe(zlib.createGunzip())
          : encoding === "br"
            ? response.pipe(zlib.createBrotliDecompress())
            : encoding === "deflate"
              ? response.pipe(zlib.createInflate())
              : response;
      response.once("error", reject);
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          const error = new NetworkError(
            "size",
            "Resposta excede o limite de 2 MB",
          );
          stream.destroy(error);
          response.destroy(error);
          request.destroy(error);
        } else chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => {
        try {
          const charset =
            /charset=["']?([^;s"']+)/i.exec(
              String(response.headers["content-type"] || ""),
            )?.[1] || "utf-8";
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: new TextDecoder(charset).decode(Buffer.concat(chunks)),
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    request.once("error", reject);
    request.once("close", () => agent?.destroy());
    request.end();
  });
}
class SafeClient {
  constructor({
    lookup = dns.lookup,
    request = transport,
    delay = wait,
    minIntervalMs = 2500,
    timeoutMs = 15000,
    maxRetries = 2,
  } = {}) {
    this.lookup = lookup;
    this.request = request;
    this.delay = delay;
    this.minIntervalMs = minIntervalMs;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.last = new Map();
    this.cache = new Map();
    this.cacheBytes = 0;
    this.busy = new Map();
  }
  async fetch(raw, { signal, allowedDomain, redirects = 3 } = {}) {
    const url = publicUrl(raw),
      u = new URL(url);
    if (
      allowedDomain &&
      u.hostname !== allowedDomain &&
      !u.hostname.endsWith("." + allowedDomain)
    )
      throw new NetworkError(
        "unsafe-redirect",
        "Destino fora do domínio autorizado",
      );
    if (signal?.aborted) throw abortError();
    const prior = this.busy.get(u.hostname) || Promise.resolve();
    let release;
    const queued = new Promise((resolve) => {
      release = resolve;
    });
    this.busy.set(u.hostname, queued);
    await prior;
    let response;
    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        await this.delay(
          Math.max(
            0,
            (this.last.get(u.hostname) || 0) + this.minIntervalMs - Date.now(),
          ),
          signal,
        );
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener("abort", cancel, { once: true });
        const timer = setTimeout(cancel, this.timeoutMs);
        const headers = {
          "User-Agent": USER_AGENT,
          Accept:
            "application/json,text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,text/plain",
          "Accept-Encoding": "identity",
        };
        const cached = this.cache.get(url);
        if (cached?.etag) headers["If-None-Match"] = cached.etag;
        if (cached?.modified) headers["If-Modified-Since"] = cached.modified;
        try {
          const address = await Promise.race([
            resolvePublic(url, this.lookup),
            new Promise((_, reject) =>
              controller.signal.addEventListener(
                "abort",
                () =>
                  reject(
                    new NetworkError(
                      signal?.aborted ? "cancelled" : "timeout",
                      signal?.aborted
                        ? "Operação cancelada"
                        : "Tempo limite excedido",
                    ),
                  ),
                { once: true },
              ),
            ),
          ]);
          response = await this.request(url, {
            address,
            signal: controller.signal,
            headers,
          });
          this.last.set(u.hostname, Date.now());
          if (response.status === 304) {
            if (!cached)
              throw new NetworkError("cache", "Resposta 304 sem cache");
            return { ...cached.response, cached: true, url };
          }
          if (
            [429, 500, 502, 503, 504].includes(response.status) &&
            attempt < this.maxRetries
          ) {
            const rawRetry = response.headers["retry-after"];
            const seconds = /^\d+$/.test(rawRetry || "")
              ? Number(rawRetry)
              : Math.max(0, (Date.parse(rawRetry) - Date.now()) / 1000) || 0;
            const pause = Math.max(1000 * 2 ** attempt, seconds * 1000);
            if (pause > 60000)
              throw new NetworkError(
                "rate-limit",
                "Fonte pede espera prolongada; tente mais tarde",
                response.status,
                seconds,
              );
            await this.delay(pause, signal);
            continue;
          }
          break;
        } catch (e) {
          if (controller.signal.aborted)
            throw new NetworkError(
              signal?.aborted ? "cancelled" : "timeout",
              signal?.aborted ? "Operação cancelada" : "Tempo limite excedido",
            );
          throw e;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
        }
      }
    } finally {
      release();
      if (this.busy.get(u.hostname) === queued) this.busy.delete(u.hostname);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects <= 0 || !response.headers.location)
        throw new NetworkError(
          "redirect",
          "Redirecionamento inválido ou excessivo",
        );
      return this.fetch(new URL(response.headers.location, url).href, {
        signal,
        allowedDomain,
        redirects: redirects - 1,
      });
    }
    if (response.status < 200 || response.status >= 300)
      throw new NetworkError(
        response.status === 403 ? "blocked" : "http",
        "Resposta HTTP " + response.status,
        response.status,
      );
    const output = { ...response, url, cached: false };
    if (this.cache.has(url))
      this.cacheBytes -= Buffer.byteLength(this.cache.get(url).response.body);
    this.cache.set(url, {
      etag: response.headers.etag,
      modified: response.headers["last-modified"],
      response: output,
    });
    this.cacheBytes += Buffer.byteLength(response.body);
    while (this.cache.size > 20 || this.cacheBytes > 8 * 1024 * 1024) {
      const key = this.cache.keys().next().value;
      this.cacheBytes -= Buffer.byteLength(this.cache.get(key).response.body);
      this.cache.delete(key);
    }
    return output;
  }
}
module.exports = {
  SafeClient,
  NetworkError,
  publicAddress,
  resolvePublic,
  transport,
  USER_AGENT,
};
