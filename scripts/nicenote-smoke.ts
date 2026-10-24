// Smoke check of the NiceNote source API on a deployed NiceIdeas, signed exactly like the NiceMatrix
// backend (contract niceideas-share.md §3). Run from the dev box after a staging deploy:
//
//   NICEMATRIX_SHARE_KEY=… npx tsx scripts/nicenote-smoke.ts --base https://t.niceideas.app --user <Logto sub> [--service nicematrix-staging]
//
// Creates a share, pushes a text + rich + todo document, reads it back, changes settings, deletes it (link → 410).
// Leaves one deleted post (purged after 30 days). Exit code 1 on the first failed step.
import { randomUUID } from "node:crypto";
import { serviceHeaders } from "../src/server/service-auth/signature";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const base = (args.get("base") ?? "").replace(/\/+$/, "");
const user = args.get("user") ?? "";
const service = args.get("service") ?? "nicematrix-staging";
const key = process.env.NICEMATRIX_SHARE_KEY ?? "";
if (!base || !user || key.length < 32) {
  console.error("usage: NICEMATRIX_SHARE_KEY=… tsx scripts/nicenote-smoke.ts --base <url> --user <sub> [--service <id>]");
  process.exit(2);
}
const PREFIX = "/api/internal/v1/nicenote";

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = { ...serviceHeaders(key, service, method, PREFIX + path, raw), ...(raw ? { "content-type": "application/json" } : {}) };
  const res = await fetch(base + PREFIX + path, { method, headers, body: raw || undefined, redirect: "manual" });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function check(step: string, ok: boolean, detail: unknown): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${step}${ok ? "" : ` ${JSON.stringify(detail)}`}`);
  if (!ok) process.exit(1);
}

const shareId = randomUUID();
const created = await call("POST", "/posts", { shareId, userId: user, region: "intl", syncMode: "follow", commentsMode: null, profile: null });
const post = created.json.post as { id: string; url: string; status: string } | undefined;
check("create → 201 preparing", created.status === 201 && post?.status === "preparing", created);
check("create again → 200 same post", (await call("POST", "/posts", { shareId, userId: user, region: "intl" })).status === 200, null);
const pageStatus = async () => (await fetch(post!.url, { redirect: "manual" })).status;
check("preparing page → 200", (await pageStatus()) === 200, null);

const document = {
  version: 1,
  title: "Smoke test",
  blocks: [
    { type: "text", text: "Plain <b>text</b>" },
    { type: "rich", lines: [{ kind: "heading", level: 1, runs: [{ text: "Heading" }] }, { kind: "bullet", indent: 0, runs: [{ text: "item", bold: true }] }] },
    { type: "todo", items: [{ checked: true, runs: [{ text: "done" }] }] },
  ],
};
const pushed = await call("PUT", `/posts/${post!.id}/content`, { sourceRevision: 1, document });
check("push → changed, active", pushed.status === 200 && pushed.json.changed === true && (pushed.json.post as { status: string }).status === "active", pushed);
check("same push → unchanged", (await call("PUT", `/posts/${post!.id}/content`, { sourceRevision: 1, document })).json.changed === false, null);
const stale = await call("PUT", `/posts/${post!.id}/content`, { sourceRevision: 0, document });
check("older revision → 409 post.stale_update", stale.status === 409 && (stale.json.error as { code: string }).code === "post.stale_update", stale);
const html = await (await fetch(post!.url)).text();
check("page shows the content", html.includes("Plain &lt;b&gt;text&lt;/b&gt;") && html.includes("<h2>Heading</h2>"), html.slice(0, 200));
check("get → 200", (await call("GET", `/posts/${post!.id}`)).status === 200, null);
const patched = await call("PATCH", `/posts/${post!.id}`, { commentsMode: "closed" });
check("patch → commentsMode closed", (patched.json.post as { commentsMode: string } | undefined)?.commentsMode === "closed", patched);
check("delete → unpublished", ((await call("DELETE", `/posts/${post!.id}`)).json.post as { status: string }).status === "unpublished", null);
check("deleted page → 410", (await pageStatus()) === 410, null);
console.log(`smoke passed (${post!.url})`);
