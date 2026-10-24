import { getConfig } from "@/server/config/env";
import type { OutboxKind } from "@/server/db/schema";
import { serviceHeaders } from "@/server/service-auth/signature";

/** Our caller id on the NiceMatrix backend (contract §4: `X-NM-Service: niceideas`). */
export const NICEIDEAS_SERVICE = "niceideas";

/** Backend endpoint of each notification kind (contract §4.1, §4.2). */
const PATHS: Record<OutboxKind, string> = {
  user_registered: "/v1/internal/niceideas/users",
  post_event: "/v1/internal/niceideas/post-events",
};

export type BackendAnswer = { status: number; body: string };

const TIMEOUT_MS = 15_000;

/**
 * Sends one notification to the NiceMatrix backend, signed like the backend signs its calls to us.
 * Network errors throw; any HTTP answer is returned for the caller to classify.
 */
export async function postToBackend(kind: OutboxKind, payload: unknown, key: string): Promise<BackendAnswer> {
  const url = new URL(getConfig().NICEMATRIX_API_URL.replace(/\/+$/, "") + PATHS[kind]);
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...serviceHeaders(key, NICEIDEAS_SERVICE, "POST", url.pathname + url.search, body), "content-type": "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}
