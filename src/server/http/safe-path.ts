/**
 * Same-site path for redirects taken from user input: starts with one "/", no "//" or "/\" (other
 * hosts), no whitespace, control characters or backslashes — browsers drop tabs and newlines from
 * URLs, so "/\t/evil.example" would become "//evil.example". Anything else becomes "/".
 */
export function safeRedirectPath(value: string | null | undefined, maxLength = 512): string {
  return value && value.length <= maxLength && /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(value) ? value : "/";
}
