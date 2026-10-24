import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishAs } from "../../helpers/publish";
import { GET as notificationsRoute } from "@/app/notifications/route";
import { GET as discoverRoute } from "@/app/discover/route";
import { startSession } from "@/server/auth/web/session";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { startAppContext } from "../../helpers/app-context";

const BASE = "http://localhost:3000";
let ctx: Awaited<ReturnType<typeof startAppContext>>;
let cookie: string;
let postId: string;
beforeAll(async () => {
  ctx = await startAppContext();
  postId = (await publishAs(ctx, "note-author", { version: 1, blocks: [{ type: "text", text: "Notify me" }] }, "n1")).id;
  await ensureProfile(ctx.db, "note-fan");
  await ctx.db.updateTable("profile").set({ display_name: "Fan Person", notifications_seen_at: new Date(Date.now() - 60_000) }).where("user_id", "in", ["note-fan", "note-author"]).execute();
  cookie = (await startSession(ctx.db, "note-author")).split(";")[0];
});
afterAll(async () => ctx?.stop());

const page = async (path: string) => (await (path === "/notifications" ? notificationsRoute : discoverRoute)(new Request(`${BASE}${path}`, { headers: { "accept-language": "en", cookie: `${cookie}; ni_sso=1` } }))).text();

describe("notifications", () => {
  it("lists likes, comments and follows, shows the unread badge, then marks them seen", async () => {
    await ctx.db.insertInto("post_like").values({ post_id: postId, liker_key: "v:guest", user_id: null, ip_hash: "h" }).execute();
    await ctx.db.insertInto("comment").values({ post_id: postId, author_id: null, visitor_key: "v:guest", anon_name: "Kitty", ip_hash: "h", body: "Lovely idea" }).execute();
    await ctx.db.insertInto("follow").values({ follower_id: "note-fan", followee_id: "note-author" }).execute();
    expect(await page("/discover")).toContain('class="ni-badge"');
    const html = await page("/notifications");
    expect(html).toContain("liked your post");
    expect(html).toContain("Kitty");
    expect(html).toContain("Lovely idea");
    expect(html).toContain("Fan Person");
    expect(html).toContain("ni-unread");
    expect(await page("/discover")).not.toContain('class="ni-badge"');
  });

  it("requires sign-in", async () => {
    const res = await notificationsRoute(new Request(`${BASE}/notifications`));
    expect(res.headers.get("location")).toBe("/auth/sign-in?next=%2Fnotifications");
  });
});
