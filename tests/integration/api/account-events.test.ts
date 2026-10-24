import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as eventsRoute } from "@/app/api/internal/v1/account-events/route";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { signAccountEvent } from "@/server/accounts/account-events";
import { resetConfigForTests } from "@/server/config/env";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { publishAs, uploadAs } from "../../helpers/publish";
import { ensureProfile } from "@/server/profiles/ensure-profile";

const SECRET = "s".repeat(40);
let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  process.env.ACCOUNT_EVENTS_SECRET = SECRET;
  ctx = await startAppContext();
});
afterAll(async () => {
  delete process.env.ACCOUNT_EVENTS_SECRET;
  resetConfigForTests();
  await ctx?.stop();
});

let n = 0;
const send = (event: string, occurredAt: string, opts: { secret?: string; ts?: number; eventId?: string; userId?: string; profile?: unknown } = {}) => {
  const body = JSON.stringify({ eventId: opts.eventId ?? `evt-${++n}-xxxx`, event, userId: opts.userId ?? "leaving-user", occurredAt, ...(opts.profile ? { profile: opts.profile } : {}) });
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
    const mediaId = await uploadAs(ctx, "leaving-user", await jpegWithExif());
    const post = await publishAs(ctx, "leaving-user", { version: 1, title: "Bye", blocks: [{ type: "image", mediaId }] }, "bye");
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

  it("profile_updated: handle and avatar follow, the name unless changed here; unknown users; never makes deletions stale", async () => {
    await ensureProfile(ctx.db, "pf-user");
    const upd = (eventId: string, profile: unknown, userId = "pf-user", at = "2026-10-25T00:00:00Z") => send("profile_updated", at, { eventId, userId, profile });
    const row = () => ctx.db.selectFrom("profile").select(["handle", "display_name", "avatar_url"]).where("user_id", "=", "pf-user").executeTakeFirstOrThrow();
    expect(await (await upd("evt-pf-0001", { username: "Pf.User", name: "Pf Name", avatarUrl: "https://cdn.test/p.png" })).json()).toEqual({ result: "applied" });
    expect(await row()).toEqual({ handle: "pf.user", display_name: "Pf Name", avatar_url: "https://cdn.test/p.png" });
    await ctx.db.updateTable("profile").set({ display_name: "Mine", name_locked: true }).where("user_id", "=", "pf-user").execute();
    await upd("evt-pf-0002", { username: "pf.user", name: "Other", avatarUrl: null });
    expect(await row()).toEqual({ handle: "pf.user", display_name: "Mine", avatar_url: null });
    expect(await (await upd("evt-pf-0003", { username: "x", name: null, avatarUrl: null }, "nobody-here")).json()).toEqual({ result: "unknown_user" });
    // A later-dated profile update does not make a deletion request look stale.
    await upd("evt-pf-0004", { username: "pf.user", name: null, avatarUrl: null }, "pf-user", "2026-12-01T00:00:00Z");
    expect(await (await send("deletion_requested", "2026-11-01T00:00:00Z", { eventId: "evt-pf-del1", userId: "pf-user" })).json()).toEqual({ result: "applied" });
  });
});
