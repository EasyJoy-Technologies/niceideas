import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/** Addresses never reachable from a public URL (loopback, private, link-local, CGNAT, multicast, reserved…). */
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(net, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged by its IPv4 address.
  const mapped = family === 6 ? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] : undefined;
  if (mapped) return !BLOCKED.check(mapped, "ipv4");
  return !BLOCKED.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** DNS lookup that refuses non-public addresses, checked on every connection (no DNS-rebinding window). */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = (addresses as LookupAddress[]).filter((a) => isPublicAddress(a.address));
    if (list.length === 0) return callback(Object.assign(new Error("address not public"), { code: "ENOTPUBLIC" }), "", 0);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** `permanent`: the URL / answer can never work (blocked address, 4xx, too big); otherwise worth retrying. */
export class PublicFetchError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export type PublicFetchResult = { contentType: string; body: Buffer };

/**
 * GET of a public https URL into memory (e.g. avatars): only https, only public IP addresses (also
 * after redirects, at most 3), at most `maxBytes`, `timeoutMs` per request.
 */
export async function fetchPublicHttps(url: string, opts: { maxBytes: number; timeoutMs: number; redirects?: number }): Promise<PublicFetchResult> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new PublicFetchError("invalid url", true);
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new PublicFetchError("only plain https urls", true);
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(u.hostname.replace(/^\[|\]$/g, ""))) throw new PublicFetchError("address not public", true);
  return new Promise((resolve, reject) => {
    const req = https.get(u, { lookup: publicLookup, timeout: opts.timeoutMs, headers: { accept: "image/*", "user-agent": "NiceIdeas/1 (+https://niceideas.app)" }, agent: false }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const left = opts.redirects ?? 3;
        if (left <= 0) return reject(new PublicFetchError("too many redirects", true));
        return resolve(fetchPublicHttps(new URL(res.headers.location, u).toString(), { ...opts, redirects: left - 1 }));
      }
      if (status !== 200) {
        res.resume();
        return reject(new PublicFetchError(`HTTP ${status}`, status >= 400 && status < 500 && status !== 408 && status !== 429));
      }
      if (Number(res.headers["content-length"] ?? 0) > opts.maxBytes) {
        res.destroy();
        return reject(new PublicFetchError("too large", true));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBytes) {
          res.destroy();
          reject(new PublicFetchError("too large", true));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
      res.on("error", (err) => reject(new PublicFetchError(err.message, false)));
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (err: NodeJS.ErrnoException) => reject(new PublicFetchError(err.message, err.code === "ENOTPUBLIC")));
  });
}
