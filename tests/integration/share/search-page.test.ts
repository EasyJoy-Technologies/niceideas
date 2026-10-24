import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishAs } from "../../helpers/publish";
import { GET as searchRoute } from "@/app/search/route";
import { startAppContext } from "../../helpers/app-context";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => {
  ctx = await startAppContext();
  const doc = (text: string) => ({ version: 1, blocks: [{ type: "text", text }] });
  for (const [text, ref] of [["Morning walk by the lake", "s1"], ["100% juice_box recipe", "s2"], ["Unrelated note", "s3"]]) {
    await publishAs(ctx, "search-author", doc(text), ref);
  }
  await ctx.db.updateTable("profile").set({ display_name: "Lake Walker" }).where("user_id", "=", "search-author").execute();
});
afterAll(async () => ctx?.stop());

const search = async (query: string, headers: Record<string, string> = {}) => {
  const res = await searchRoute(new Request(`http://localhost:3000/search${query}`, { headers: { "accept-language": "en", ...headers } }));
  return { status: res.status, html: await res.text() };
};

describe("site search", () => {
  it("finds posts by a case-insensitive substring", async () => {
    const { status, html } = await search("?q=LAKE");
    expect(status).toBe(200);
    expect(html).toContain("Morning walk by the lake");
    expect(html).not.toContain("Unrelated note");
    expect(html).toContain('value="LAKE"');
  });

  it("treats % and _ literally", async () => {
    const { html } = await search(`?q=${encodeURIComponent("0% juice_")}`);
    expect(html).toContain("juice_box");
    expect(html).not.toContain("Morning walk");
    expect((await search("?q=%25")).html).not.toContain("Unrelated note");
  });

  it("finds people by name or handle and shows the empty state", async () => {
    const people = await search("?q=walker&type=people");
    expect(people.html).toContain("Lake Walker");
    expect(people.html).toContain("ni-person");
    expect((await search("?q=zzzz-nothing")).html).toContain("No results for");
    expect((await search("")).html).toContain("Search posts and people.");
  });

  it("escapes the query", async () => {
    const { html } = await search(`?q=${encodeURIComponent("<script>x</script>")}`);
    expect(html).not.toContain("<script>x</script>");
  });
});
