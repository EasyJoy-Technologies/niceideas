/**
 * Single HTTP byte ranges (RFC 9110 §14.1.2): `bytes=a-b`, `bytes=a-`, `bytes=-n`. Multiple ranges and
 * other units are not supported (callers then serve the whole object).
 */
const SINGLE = /^bytes=(\d*)-(\d*)$/;

/** The header value when it is one well-formed byte range, else null. */
export function singleByteRange(header: string | null): string | null {
  const m = header?.trim().match(SINGLE);
  return m && (m[1] !== "" || m[2] !== "") ? header!.trim() : null;
}

/** Inclusive offsets of `range` within an object of `size` bytes; null when not satisfiable. */
export function resolveByteRange(range: string, size: number): { start: number; end: number } | null {
  const m = range.match(SINGLE);
  if (!m || size === 0) return null;
  if (m[1] === "") {
    const n = Number(m[2]);
    return n > 0 ? { start: Math.max(0, size - n), end: size - 1 } : null;
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start < size && start <= end ? { start, end } : null;
}
