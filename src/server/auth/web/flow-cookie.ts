import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Short-lived, signed record of one sign-in attempt (state, nonce, PKCE verifier, return path). */
export type FlowState = { state: string; nonce: string; verifier: string; next: string; silent: boolean };

export const FLOW_COOKIE = "ni_oidc";
export const FLOW_MAX_AGE = 600;
export const SILENT_STATE_PREFIX = "s.";

const rand = () => randomBytes(32).toString("base64url");
const mac = (key: string, body: string) => createHmac("sha256", `ni-oidc-flow:${key}`).update(body).digest("base64url");

export function newFlow(next: string, silent: boolean): FlowState {
  // Silent attempts carry an "s." state prefix: the callback can still recognise them
  // when the flow cookie did not survive (cookies blocked) and fail quietly.
  return { state: `${silent ? SILENT_STATE_PREFIX : ""}${rand()}`, nonce: rand(), verifier: rand(), next, silent };
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function sealFlow(key: string, f: FlowState): string {
  const body = Buffer.from(JSON.stringify({ ...f, exp: Math.floor(Date.now() / 1000) + FLOW_MAX_AGE })).toString("base64url");
  return `${body}.${mac(key, body)}`;
}

/** Verified, unexpired flow, or null. */
export function openFlow(key: string, raw: string | null): FlowState | null {
  const [body, sig] = raw?.split(".") ?? [];
  if (!body || !sig) return null;
  const want = Buffer.from(mac(key, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const f = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as FlowState & { exp: number };
    return f.exp > Date.now() / 1000 ? { state: f.state, nonce: f.nonce, verifier: f.verifier, next: f.next, silent: !!f.silent } : null;
  } catch {
    return null;
  }
}
