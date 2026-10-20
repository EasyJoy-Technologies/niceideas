import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as eventsRoute } from "@/app/api/internal/v1/account-events/route";
import { POST as createRoute } from "@/app/api/v1/posts/route";
import { POST as mediaRoute } from "@/app/api/v1/media/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { signAccountEvent } from "@/server/accounts/account-events";
import { resetConfigForTests } from "@/server/config/env";
import { startAppContext } from "../../helpers/app-context";
import { jsonRequest, params } from "../../helpers/api";
import { jpegWithExif, sha256 } from "../../helpers/media-fixtures";

const SECRET = "s".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let token: string;
beforeAll(async () => {
  process.env.ACCOUNT_EVENTS_SECRET = SECRET;
  ctx = await startAppContext();
  token = await ctx.tokenFor("leaving-user");
});
afterAll(async () => {
  delete process.env.ACCOUNT_EVENTS_SECRET;
  resetConfigForTests();
  await ctx?.stop();
});

let n = 0;
const send = (event: string, occurredAt: string, opts: { secret?: string; ts?: number; eventId?: string } = {}) => {
  const body = JSON.stringify({ eventId: opts.eventId ?? `evt-${++n}-xxxx`, event, userId: "leaving-user", occurredAt });
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = signAccountEvent(opts.secret ?? SECRET, ts, body);
  return eventsRoute(new Request("http://localhost:3000/api/internal/v1/account-events", { method: "POST", body, headers: { "x-nicematrix-timestamp": ts, "x-nicematrix-signature": sig } }), {});
};
const status = async (slug: string) => (await pageRoute(new Request(`http://localhost:3000/p/${slug}`), params({ slug }))).status;

describe("account events", () => {
  it("rejects bad signatures and stale timestamps", async () => {
    expect((await send("deletion_requested", "2026-10-20T00:00:00Z", { secret: "x".repeat(40) })).status).toBe(401);
    expect((await send("deletion_requested", "2026-10-20T00:00:00Z", { ts: Math.floor(Date.now() / 1000) - 600 })).status).toBe(401);
  });

  it("request → offline, cancel → online, duplicates / stale ignored, completed → everything deleted", async () => {
    const buf = await jpegWithExif();
    const up = await mediaRoute(new Request("http://x/api/v1/media", { method: "POST", body: new Uint8Array(buf), headers: { authorization: `Bearer ${token}`, "x-content-sha256": sha256(buf) } }), {});
    const mediaId = (await up.json()).media.id;
    const doc = { version: 1, title: "Bye", blocks: [{ type: "image", mediaId }] };
    const post = (await (await createRoute(jsonRequest("POST", "/api/v1/posts", token, { document: doc, sourceRef: "bye", sourceUpdatedAt: "2026-10-20T00:00:00Z" }), {})).json()).post;
    expect(await status(post.slug)).toBe(200);

    const req = await send("deletion_requested", "2026-10-20T01:00:00Z", { eventId: "evt-req-0001" });
    expect(await req.json()).toEqual({ result: "applied" });
    expect(await status(post.slug)).toBe(410);
    expect((await ctx.db.selectFrom("media").select("public_at").where("id", "=", mediaId).executeTakeFirstOrThrow()).public_at).toBeNull();
    expect(await (await send("deletion_requested", "2026-10-20T01:00:00Z", { eventId: "evt-req-0001" })).json()).toEqual({ result: "duplicate" });

    expect(await (await send("deletion_cancelled", "2026-10-20T02:00:00Z")).json()).toEqual({ result: "applied" });
    expect(await status(post.slug)).toBe(200);
    expect(await (await send("deletion_requested", "2026-10-20T01:30:00Z")).json()).toEqual({ result: "stale" });
    expect(await status(post.slug)).toBe(200);

    expect(await (await send("deletion_completed", "2026-10-21T00:00:00Z")).json()).toEqual({ result: "applied" });
    expect(await status(post.slug)).toBe(404);
    expect(await ctx.db.selectFrom("profile").select("user_id").where("user_id", "=", "leaving-user").executeTakeFirst()).toBeUndefined();
    expect(await ctx.db.selectFrom("media").select("id").where("id", "=", mediaId).executeTakeFirst()).toBeUndefined();
  });
});
