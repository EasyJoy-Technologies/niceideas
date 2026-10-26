import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import type { Db } from "@/server/db/client";
import { migrateToLatest } from "@/server/db/migrate";
import { insertProfileIfAbsent } from "@/server/db/repos/profiles";
import { findLivePostBySource, insertPost, updatePost } from "@/server/db/repos/posts";
import { insertRevision, linkRevisionMedia } from "@/server/db/repos/revisions";
import { insertMediaOrGet } from "@/server/db/repos/media";
import { mediaReferences } from "@/server/db/repos/media-visibility";
import { claimIdempotency, completeIdempotency, releaseIdempotency } from "@/server/db/repos/idempotency";
import { startTestDb } from "../helpers/pg";

let db: Db;
let stop: () => Promise<void>;
const HASH = "a".repeat(64);

beforeAll(async () => {
  ({ db, stop } = await startTestDb());
  await insertProfileIfAbsent(db, { user_id: "u1", handle: "user_one", display_name: "One", bio: "" });
});
afterAll(async () => stop?.());

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await migrateToLatest(db)).toEqual([]);
  });
});

describe("profiles", () => {
  it("inserts only new users: undefined for an existing user, a taken handle or a deleted account", async () => {
    expect(await insertProfileIfAbsent(db, { user_id: "u1", handle: "other_handle", display_name: "", bio: "" })).toBeUndefined();
    expect(await insertProfileIfAbsent(db, { user_id: "u2", handle: "user_one", display_name: "", bio: "" })).toBeUndefined();
    await db.insertInto("deleted_account").values({ user_id: "u-gone" }).execute();
    expect(await insertProfileIfAbsent(db, { user_id: "u-gone", handle: "gone_handle", display_name: "", bio: "" })).toBeUndefined();
    expect((await insertProfileIfAbsent(db, { user_id: "u4", handle: "user_four", display_name: "", bio: "" }))?.handle).toBe("user_four");
  });
  it("rejects invalid handles", async () => {
    await expect(insertProfileIfAbsent(db, { user_id: "u3", handle: "Bad-Handle", display_name: "", bio: "" })).rejects.toThrow();
  });
});

describe("posts + revisions", () => {
  it("enforces one live post per source item; allows a new one after unpublish", async () => {
    const base = { author_id: "u1", kind: "short" as const, source: "nicenote_intl" as const, source_ref: "note-1" };
    const p1 = await insertPost(db, { ...base, slug: "slugslugslug01" });
    await expect(insertPost(db, { ...base, slug: "slugslugslug02" })).rejects.toMatchObject({ code: "23505" });
    expect((await findLivePostBySource(db, "u1", "nicenote_intl", "note-1"))?.id).toBe(p1.id);

    await updatePost(db, p1.id, { status: "unpublished", purge_after: new Date(Date.now() + 86_400_000) });
    const p2 = await insertPost(db, { ...base, slug: "slugslugslug03" });
    expect((await findLivePostBySource(db, "u1", "nicenote_intl", "note-1"))?.id).toBe(p2.id);
  });

  it("rejects purge_after on live posts and short slugs", async () => {
    const p = await insertPost(db, { author_id: "u1", kind: "short", source: "web", source_ref: null, slug: "slugslugslug04" });
    await expect(updatePost(db, p.id, { purge_after: new Date() })).rejects.toThrow();
    await expect(insertPost(db, { author_id: "u1", kind: "short", source: "web", source_ref: null, slug: "short" })).rejects.toThrow();
  });

  it("numbers revisions sequentially", async () => {
    const post = await insertPost(db, { author_id: "u1", kind: "article", source: "nicenote_cn", source_ref: "note-9", slug: "slugslugslug05" });
    const r1 = await insertRevision(db, { postId: post.id, document: { version: 1, blocks: [] }, contentHash: HASH, sourceUpdatedAt: null });
    const r2 = await insertRevision(db, { postId: post.id, document: { version: 1, blocks: [] }, contentHash: "b".repeat(64), sourceUpdatedAt: new Date() });
    expect([r1.revision_no, r2.revision_no]).toEqual([1, 2]);
    expect((await updatePost(db, post.id, { current_revision_id: r2.id })).current_revision_id).toBe(r2.id);
  });

  it("current_revision_id must reference an existing revision (checked at commit)", async () => {
    const post = await insertPost(db, { author_id: "u1", kind: "short", source: "web", source_ref: null, slug: "slugslugslug06" });
    await expect(updatePost(db, post.id, { current_revision_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow();
  });
});

describe("media", () => {
  it("dedupes by owner + sha256 and tracks public references", async () => {
    const row = { owner_id: "u1", sha256: "c".repeat(64), kind: "image" as const, mime: "image/jpeg", byte_size: 10, width: 1, height: 1, duration_ms: null, variants: JSON.stringify({ kind: "image", webp: [], fallback: { key: "k", mime: "image/jpeg" } }) };
    const a = await insertMediaOrGet(db, row);
    const b = await insertMediaOrGet(db, row);
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ created: false, media: { id: a.media.id } });

    const post = await insertPost(db, { author_id: "u1", kind: "article", source: "web", source_ref: null, slug: "slugslugslug07" });
    const rev = await insertRevision(db, { postId: post.id, document: {}, contentHash: HASH, sourceUpdatedAt: null });
    await linkRevisionMedia(db, rev.id, [a.media.id, a.media.id]);
    expect(await mediaReferences(db, a.media.id)).toEqual({ live: false, referenced: false });
    await updatePost(db, post.id, { current_revision_id: rev.id });
    expect(await mediaReferences(db, a.media.id)).toEqual({ live: true, referenced: true });
    await db.updateTable("profile").set({ status: "deleting" }).where("user_id", "=", "u1").execute();
    expect(await mediaReferences(db, a.media.id)).toEqual({ live: false, referenced: true });
    await db.updateTable("profile").set({ status: "active" }).where("user_id", "=", "u1").execute();
    await updatePost(db, post.id, { status: "unpublished" });
    expect(await mediaReferences(db, a.media.id)).toEqual({ live: false, referenced: true });
  });
});

describe("idempotency", () => {
  const base = { scope: "u1:posts.create", key: "k1", requestHash: "h1", ttlSeconds: 60 };
  it("claims, detects in-progress / mismatch, replays, releases and reclaims expired", async () => {
    expect(await claimIdempotency(db, base)).toEqual({ state: "claimed" });
    expect(await claimIdempotency(db, base)).toEqual({ state: "in_progress" });
    expect(await claimIdempotency(db, { ...base, requestHash: "h2" })).toEqual({ state: "mismatch" });
    await completeIdempotency(db, { scope: base.scope, key: base.key, status: 201, body: { id: "x" } });
    expect(await claimIdempotency(db, base)).toEqual({ state: "replay", status: 201, body: { id: "x" } });

    expect(await claimIdempotency(db, { ...base, key: "k2" })).toEqual({ state: "claimed" });
    await releaseIdempotency(db, base.scope, "k2");
    expect(await claimIdempotency(db, { ...base, key: "k2" })).toEqual({ state: "claimed" });

    await sql`UPDATE idempotency SET expires_at = now() - interval '1 second' WHERE key = 'k1'`.execute(db);
    expect(await claimIdempotency(db, { ...base, requestHash: "h3" })).toEqual({ state: "claimed" });
  });
});
