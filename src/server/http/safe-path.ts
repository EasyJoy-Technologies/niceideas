/** UTF-8 percent-encoding of characters a header value cannot carry (Location must be ASCII). */
const encodeNonAscii = (s: string) => s.replace(/[^\x00-\x7f]+/g, (run) => Array.from(Buffer.from(run, "utf8"), (b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join(""));

/**
 * Same-site path for redirects taken from user input: starts with one "/", no "//" or "/\" (other
 * hosts), no whitespace, control characters or backslashes — browsers drop tabs and newlines from
 * URLs, so "/\t/evil.example" would become "//evil.example". Anything else becomes "/".
 * Non-ASCII characters (e.g. a decoded search query) come back percent-encoded, ready for a Location header.
 */
export function safeRedirectPath(value: string | null | undefined, maxLength = 512): string {
  return value && value.length <= maxLength && /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(value) ? encodeNonAscii(value) : "/";
}
