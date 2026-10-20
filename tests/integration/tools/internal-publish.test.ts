import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as pageRoute } from "@/app/p/[slug]/route";
import { publishFromTool, withdrawFromTool } from "@/server/tools/internal-publish";
import { startAppContext } from "../../helpers/app-context";
import { params } from "../../helpers/api";
import { fixtureDir, jpegWithExif, m4aTone } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => (ctx = await startAppContext()));
afterAll(async () => ctx?.stop());

const page = (url: string) => {
  const slug = url.split("/p/")[1];
  return pageRoute(new Request(`http://localhost:3000/p/${slug}`, { headers: { "accept-language": "en" } }), params({ slug }));
};

describe("internal publishing tool (no HTTP endpoint)", () => {
  it("publishes text + image + audio through the same services, then withdraws", async () => {
    const dir = fixtureDir();
    const img = path.join(dir, "a.jpg");
    const aud = path.join(dir, "a.m4a");
    writeFileSync(img, await jpegWithExif());
    writeFileSync(aud, m4aTone());
    const rt = { db: ctx.db, stores: ctx.stores, cacheControl: "public, max-age=300", retentionDays: 30 };
    const input = {
      userId: "tool-user",
      displayName: "Tester",
      source: "nicenote_intl" as const,
      sourceRef: "cli-1",
      title: "From the CLI",
      blocks: [
        { kind: "text" as const, text: "## Hi\n\nmarkdown **works**", markdown: true },
        { kind: "image" as const, path: img, caption: "Purple" },
        { kind: "audio" as const, path: aud, title: "Tone" },
      ],
    };
    const out = await publishFromTool(rt, input);
    expect(out).toMatchObject({ created: true });
    expect(out.url).toMatch(/^http:\/\/localhost:3000\/p\/[a-z2-9]{14}$/);
    expect(await publishFromTool(rt, input)).toMatchObject({ id: out.id, created: false });

    const res = await page(out.url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("From the CLI");
    expect(html).toContain("Tester");
    expect(html).toContain("<strong>works</strong>");
    expect(html).toContain('class="ni-audio"');

    expect(await withdrawFromTool(rt, { userId: "tool-user", source: "nicenote_intl", postId: out.id })).toMatchObject({ status: "unpublished" });
    expect((await page(out.url)).status).toBe(410);
  });
});
