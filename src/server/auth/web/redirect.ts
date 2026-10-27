/** 303 to a same-site path or the sign-in provider, never cached, with the given Set-Cookie values. */
export function seeOther(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}
