import http from "node:http";
import type { AddressInfo } from "node:net";
import { signParts } from "@/server/service-auth/signature";

export type Recorded = { method: string; path: string; service: string; signed: boolean; body: string };
export type Reply = { status: number; body?: string | Buffer; headers?: Record<string, string> };

/**
 * Local stand-in for the NiceMatrix backend (notifications and media grants): records each request,
 * checks its X-NM signature against `key`, and answers with `route(path)`.
 */
export async function startFakeBackend(key: string, route: (path: string, body: string) => Reply) {
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const h = (n: string) => String(req.headers[n] ?? "");
      const parts = { method: req.method!, pathWithQuery: req.url!, service: h("x-nm-service"), timestamp: h("x-nm-timestamp"), nonce: h("x-nm-nonce"), body };
      requests.push({ method: req.method!, path: req.url!, service: parts.service, signed: h("x-nm-signature") === signParts(key, parts), body });
      const reply = route(req.url!, body);
      const payload = typeof reply.body === "string" ? Buffer.from(reply.body) : (reply.body ?? Buffer.alloc(0));
      res.writeHead(reply.status, { "content-length": String(payload.length), ...reply.headers });
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, requests, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
