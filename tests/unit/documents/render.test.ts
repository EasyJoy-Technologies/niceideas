import { describe, expect, it } from "vitest";
import type { Media } from "@/server/db/schema";
import { parseDocument } from "@/server/documents/validate";
import { renderDocumentHtml } from "@/server/render/document-html";

const IMG = "11111111-1111-4111-8111-111111111111";
const AUD = "22222222-2222-4222-8222-222222222222";
const media = new Map<string, Media>([
  [IMG, { id: IMG, kind: "image", variants: { kind: "image", webp: [{ key: "m/a/w480.webp", mime: "image/webp", bytes: 1, width: 480, height: 320 }], fallback: { key: "m/a/fallback.jpg", mime: "image/jpeg", bytes: 1, width: 480, height: 320 } } } as Media],
  [AUD, { id: AUD, kind: "audio", variants: { kind: "audio", original: { key: "m/b/audio.m4a", mime: "audio/mp4", bytes: 1 } } } as Media],
]);
const url = (key: string) => `https://media.test/${key}`;
const render = (blocks: unknown[]) => renderDocumentHtml(parseDocument({ version: 1, blocks }), media, url);

describe("renderDocumentHtml", () => {
  it("escapes plain text and keeps line breaks", () => {
    expect(render([{ type: "text", text: "<script>alert(1)</script>\nline2\n\npara" }])).toBe(
      '<div class="ni-text"><p>&lt;script&gt;alert(1)&lt;/script&gt;<br>line2</p><p>para</p></div>',
    );
  });
  it("markdown: no raw html, no javascript: links, safe link attributes", () => {
    const html = render([{ type: "text", format: "markdown", text: '<img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://a.b) # H\n\n# Head' }]);
    // Raw HTML / unsafe links survive only as escaped text, never as markup.
    expect(html).not.toMatch(/<img|<[^>]+\son\w+=|href="javascript:/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('<a href="https://a.b" rel="nofollow noopener noreferrer ugc" target="_blank">ok</a>');
    expect(html).toContain("<h2>Head</h2>");
  });
  it("renders todo, image (eager first, escaped alt) and audio; skips unknown media", () => {
    const html = render([
      { type: "todo", items: [{ text: "a<b", checked: true }, { text: "c" }] },
      { type: "image", mediaId: IMG, caption: 'cap"' },
      { type: "image", mediaId: IMG },
      { type: "audio", mediaId: AUD, title: "Song" },
      { type: "image", mediaId: "33333333-3333-4333-8333-333333333333" },
    ]);
    expect(html).toContain('<li class="ni-todo-item ni-done"><label><input type="checkbox" disabled checked><span>a&lt;b</span>');
    expect(html.match(/fetchpriority="high"/g)).toHaveLength(1);
    expect(html.match(/loading="lazy"/g)).toHaveLength(1);
    expect(html).toContain('alt="cap&quot;"');
    expect(html).toContain('<source src="https://media.test/m/b/audio.m4a" type="audio/mp4">');
    expect(html.match(/<figure class="ni-image">/g)).toHaveLength(2);
  });
  it("image links open the viewer with every rendition, the zoom rendition first in detail", () => {
    const large = new Map<string, Media>([
      [IMG, {
        id: IMG,
        kind: "image",
        variants: {
          kind: "image",
          webp: [{ key: "m/a/w480.webp", mime: "image/webp", bytes: 1, width: 480, height: 320 }, { key: "m/a/w1600.webp", mime: "image/webp", bytes: 1, width: 1600, height: 1067 }],
          fallback: { key: "m/a/fallback.jpg", mime: "image/jpeg", bytes: 1, width: 1600, height: 1067 },
          large: { key: "m/a/large.webp", mime: "image/webp", bytes: 1, width: 4032, height: 2688 },
        },
      } as Media],
    ]);
    const html = renderDocumentHtml(parseDocument({ version: 1, blocks: [{ type: "image", mediaId: IMG }] }), large, url);
    expect(html).toContain(
      '<a class="ni-zoom" href="https://media.test/m/a/large.webp" data-pswp-width="4032" data-pswp-height="2688" data-pswp-srcset="https://media.test/m/a/w480.webp 480w, https://media.test/m/a/w1600.webp 1600w, https://media.test/m/a/large.webp 4032w">',
    );
    // Without a zoom rendition (older images): the largest responsive rendition.
    expect(render([{ type: "image", mediaId: IMG }])).toContain('href="https://media.test/m/a/w480.webp" data-pswp-width="480" data-pswp-height="320"');
    expect(html).not.toContain("data-cropped");
  });
});
