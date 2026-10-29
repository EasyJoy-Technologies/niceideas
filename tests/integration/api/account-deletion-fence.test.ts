import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyAccountEvent } from "@/server/accounts/apply-account-event";
import { claimAccountEvent, lockProfileForStatusChange, purgeOldAccountEvents, setProfileStatus } from "@/server/db/repos/accounts";
import { ingestUpload } from "@/server/media/ingest";
import { mediaKeys } from "@/server/media/keys";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import { removePost, restorePost } from "@/server/moderation/admin";
import { refreshShareMedia } from "@/server/nicenote/apply-share-media";
import { createShare } from "@/server/nicenote/create-share";
import { pushShareContent } from "@/server/nicenote/push-content";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { loadSharePost } from "@/server/share/load-post";
import { removeTempDir, spoolBody } from "@/server/util/temp-file";
import { startAppContext } from "../../helpers/app-context";
import { jpegWithExif } from "../../helpers/media-fixtures";
import { publishAs, uploadAs } from "../../helpers/publish";

/** Account deletion fence (plan docs/plan/2026-10-26-share-review-fixes.md: F01, F02, F03). */
let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
});
afterAll(async () => {
  await ctx?.stop();
});

const CACHE = "no-store";
const rt = () => ({ db: ctx.db, stores: ctx.stores, cacheControl: CACHE });
const modRt = () => ({ ...rt(), retentionDays: 30 });
const op = { actorId: "ops", reason: "test" };
let n = 0;
const event = (event: "deletion_requested" | "deletion_cancelled" | "deletion_completed", userId: string, eventId = `fence-${++n}-evt`) =>
  applyAccountEvent(rt(), { eventId, event, userId, occurredAt: new Date(Date.UTC(2026, 9, 26, 0, 0, n)).toISOString() });
const share = (userId: string) => createShare(ctx.db, { shareId: randomUUID(), userId, region: "intl", syncMode: "follow", commentsMode: null, profile: null, sourceApp: null });
const imageDoc = (ref: string) => ({ version: 1 as const, blocks: [{ type: "image" as const, state: "ready" as const, ref, mime: "image/jpeg", bytes: 10 }] });
const textDoc = { version: 1 as const, blocks: [{ type: "text" as const, text: "fence test" }] };
const push = (postId: string, document: unknown, sourceRevision = 1) => pushShareContent(ctx.db, ctx.stores, CACHE, postId, { sourceRevision, document: document as never, media: {} });
const postRow = (id: string) => ctx.db.selectFrom("post").select(["status", "current_revision_id"]).where("id", "=", id).executeTakeFirst();
const pageState = async (slug: string) => (await loadSharePost(ctx.db, slug)).state;
async function isPublic(mediaId: string): Promise<boolean> {
  const m = await ctx.db.selectFrom("media").selectAll().where("id", "=", mediaId).executeTakeFirstOrThrow();
  const inPublic = await ctx.stores.publicStore.exists(mediaKeys(m)[0]);
  expect(inPublic).toBe(m.public_at !== null);
  return inPublic;
}

describe("F02: nothing goes live during the cooling-off period", () => {
  it("a preparing share pushed during cooling-off keeps its content offline; cancelling publishes it", async () => {
    const user = "fence-prep";
    const mediaId = await uploadAs(ctx, user, await jpegWithExif(), "ref-prep");
    const { post } = await share(user);
    await event("deletion_requested", user);
    expect(await pageState(post.slug)).toBe("gone");
    const pushed = await push(post.id, imageDoc("ref-prep"));
    expect(pushed.post.status).toBe("author_deleting");
    expect(await pageState(post.slug)).toBe("gone");
    expect(await isPublic(mediaId)).toBe(false);

    await event("deletion_cancelled", user);
    expect((await postRow(post.id))?.status).toBe("active");
    expect(await pageState(post.slug)).toBe("ok");
    expect(await isPublic(mediaId)).toBe(true);
  });

  it("media moved before the commit go back when the deletion request wins the lock", async () => {
    const user = "fence-race";
    const mediaId = await uploadAs(ctx, user, await jpegWithExif(), "ref-race");
    const { post } = await share(user);
    let pushing: Promise<unknown> | undefined;
    await ctx.db.transaction().execute(async (trx) => {
      // The request holds the profile lock, not committed yet: the push reads "active" and moves the media first.
      await lockProfileForStatusChange(trx, user);
      await setProfileStatus(trx, user, "deleting");
      pushing = push(post.id, imageDoc("ref-race"));
      await vi.waitFor(async () => expect(await ctx.stores.publicStore.exists(mediaKeys((await ctx.db.selectFrom("media").selectAll().where("id", "=", mediaId).executeTakeFirstOrThrow()))[0])).toBe(true));
    });
    await pushing;
    expect((await postRow(post.id))?.status).toBe("author_deleting");
    expect(await isPublic(mediaId)).toBe(false);
    await event("deletion_cancelled", user);
    expect(await isPublic(mediaId)).toBe(true);
  });

  it("an admin restore during cooling-off keeps the post offline; cancelling brings it back", async () => {
    const user = "fence-restore";
    const mediaId = await uploadAs(ctx, user, await jpegWithExif(), "ref-restore");
    const { post } = await share(user);
    await push(post.id, imageDoc("ref-restore"));
    await removePost(modRt(), op, post.slug);
    const removedOnly = (await share(user)).post;
    await push(removedOnly.id, textDoc);
    await removePost(modRt(), op, removedOnly.slug);
    await event("deletion_requested", user);
    await restorePost(modRt(), op, post.slug);
    expect((await postRow(post.id))?.status).toBe("author_deleting");
    expect(await isPublic(mediaId)).toBe(false);
    await event("deletion_cancelled", user);
    expect((await postRow(post.id))?.status).toBe("active");
    expect(await isPublic(mediaId)).toBe(true);
    // A post removed before the request (and not restored) stays removed.
    expect((await postRow(removedOnly.id))?.status).toBe("removed");
  });

  it("media completing during cooling-off stay private", async () => {
    const user = "fence-refresh";
    const { post } = await share(user);
    await push(post.id, imageDoc("ref-late"));
    await event("deletion_requested", user);
    const mediaId = await uploadAs(ctx, user, await jpegWithExif(), "ref-late");
    await refreshShareMedia(rt(), post.id, []);
    expect(await isPublic(mediaId)).toBe(false);
  });

  it("app posts: publishing during cooling-off answers 409 user.deleting", async () => {
    const user = "fence-app";
    await publishAs(ctx, user, { version: 1, blocks: [{ type: "text", text: "before" }] });
    await event("deletion_requested", user);
    await expect(publishAs(ctx, user, { version: 1, blocks: [{ type: "text", text: "during" }] })).rejects.toMatchObject({ code: "user.deleting", status: 409 });
  });
});

describe("F01: a deletion counts as done only once all its steps succeeded", () => {
  it("a storage failure answers an error, the redelivery deletes everything", async () => {
    const user = "fence-retry";
    const { post } = await share(user);
    await push(post.id, textDoc);
    const spy = vi.spyOn(ctx.stores.publicStore, "deleteMany").mockRejectedValueOnce(new Error("injected storage failure"));
    await expect(event("deletion_completed", user, "fence-retry-evt")).rejects.toThrow("injected storage failure");
    spy.mockRestore();
    expect(await postRow(post.id)).toBeDefined();
    expect(await event("deletion_completed", user, "fence-retry-evt")).toBe("applied");
    expect(await postRow(post.id)).toBeUndefined();
    expect(await event("deletion_completed", user, "fence-retry-evt")).toBe("duplicate");
  });

  it("a delivery while another one runs answers 503; unfinished events survive the purge", async () => {
    const e = { eventId: "fence-busy-evt", userId: "fence-busy", event: "deletion_requested" as const, occurredAt: new Date() };
    expect((await claimAccountEvent(ctx.db, e, 600)).state).toBe("claimed");
    await expect(applyAccountEvent(rt(), { ...e, occurredAt: e.occurredAt.toISOString() })).rejects.toMatchObject({ code: "account_event.in_progress", status: 503 });
    await purgeOldAccountEvents(ctx.db, 0);
    expect(await ctx.db.selectFrom("account_event").select("event_id").where("event_id", "=", e.eventId).executeTakeFirst()).toBeDefined();
    // Lease ran out (crashed attempt): the next delivery takes it over.
    await ctx.db.updateTable("account_event").set({ claimed_until: new Date(Date.now() - 1000) }).where("event_id", "=", e.eventId).execute();
    expect(await applyAccountEvent(rt(), { ...e, occurredAt: e.occurredAt.toISOString() })).toBe("applied");
  });
});

describe("F03: nothing is created again after the deletion completed", () => {
  it("profile, share, push and media are refused", async () => {
    const user = "fence-gone";
    const { post } = await share(user);
    await event("deletion_completed", user);
    expect(await ctx.db.selectFrom("profile").select("user_id").where("user_id", "=", user).executeTakeFirst()).toBeUndefined();
    await expect(ensureProfile(ctx.db, user)).rejects.toMatchObject({ code: "user.deleting" });
    await expect(share(user)).rejects.toMatchObject({ code: "user.deleting" });
    await expect(push(post.id, textDoc)).rejects.toMatchObject({ status: 404 });
    const upload = await spoolBody(new Response(new Uint8Array(await jpegWithExif())).body!, Number.MAX_SAFE_INTEGER);
    const put = vi.spyOn(ctx.stores.privateStore, "putFile");
    try {
      await expect(ingestUpload(ctx.db, ctx.stores.privateStore, { ownerId: user, upload, declaredSha256: upload.sha256, limits: mediaLimitsFromConfig() })).rejects.toMatchObject({ code: "user.deleting" });
      for (const [key] of put.mock.calls) expect(await ctx.stores.privateStore.exists(key)).toBe(false);
    } finally {
      put.mockRestore();
      await removeTempDir(upload.dir);
    }
    expect(await ctx.db.selectFrom("profile").select("user_id").where("user_id", "=", user).executeTakeFirst()).toBeUndefined();
  });

  it("a push in flight when the fence goes up is refused", async () => {
    const user = "fence-inflight";
    const { post } = await share(user);
    await ctx.db.insertInto("deleted_account").values({ user_id: user }).execute();
    await expect(push(post.id, textDoc)).rejects.toMatchObject({ code: "user.deleting" });
    expect((await postRow(post.id))?.status).toBe("preparing");
  });
});
