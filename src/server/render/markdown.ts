import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

/**
 * Markdown → safe HTML. Raw HTML in the source is disabled at the parser
 * level, and the output is sanitized again against a strict allow-list.
 */
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: true });

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "s", "del", "code", "pre", "blockquote", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "a", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: { a: ["href"], ol: ["start"], th: ["align"], td: ["align"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // External links never get the referrer / window handle; nofollow discourages link spam.
    a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer ugc", target: "_blank" }),
    // Author headings sit below the post title in the page outline.
    h1: "h2",
  },
};
ALLOWED.allowedAttributes = { ...ALLOWED.allowedAttributes, a: ["href", "rel", "target"] };

export function renderMarkdown(source: string): string {
  return sanitizeHtml(md.render(source), ALLOWED);
}

/** Plain text of a markdown source (for summaries / counts). */
export function markdownToText(source: string): string {
  const html = md.render(source);
  return sanitizeHtml(html.replace(/<\/(p|li|h\d|blockquote|pre|tr)>/g, "\n").replace(/<br\s*\/?>/g, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
