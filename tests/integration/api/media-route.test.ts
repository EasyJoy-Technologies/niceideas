import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/media/route";
import { startAppContext } from "../../helpers/app-context";
import { sha256, smallPngWithAlpha } from "../../helpers/media-fixtures";

let ctx: Awaited<ReturnType<typeof startAppContext>>;
beforeAll(async () => (ctx = await startAppContext()));
afterAll(async () => ctx?.stop());

const upload = (body: Buffer, headers: Record<string, string>) =>
  POST(new Request("http://x/api/v1/media", { method: "POST", body: new Uint8Array(body), headers, duplex: "half" } as RequestInit), {});

describe("POST /api/v1/media", () => {
  it("creates (201), dedupes (200) and returns a DTO", async () => {
    const png = await smallPngWithAlpha();
    const headers = { authorization: `Bearer ${await ctx.apiToken("api-user")}`, "x-content-sha256": sha256(png) };
    const first = await upload(png, headers);
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body.media).toMatchObject({ kind: "image", width: 300, height: 200, sha256: sha256(png) });
    const again = await upload(png, headers);
    expect(again.status).toBe(200);
    expect((await again.json()).media.id).toBe(body.media.id);
  });

  it("returns machine-readable errors", async () => {
    const png = await smallPngWithAlpha();
    expect((await upload(png, {})).status).toBe(401);
    const auth = `Bearer ${await ctx.apiToken("api-user")}`;
    const noSha = await upload(png, { authorization: auth });
    expect(await noSha.json()).toEqual({ error: { code: "media.sha256_required", status: 400 } });
    const bad = await upload(Buffer.from("plain text, not media"), { authorization: auth, "x-content-sha256": sha256(Buffer.from("plain text, not media")) });
    expect(bad.status).toBe(415);
  });
});
