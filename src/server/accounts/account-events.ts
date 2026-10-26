import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, badRequest, unauthorized } from "@/server/http/errors";

// Kept for callers importing it from here (audit evidence scripts); the route imports apply-account-event directly.
export { applyAccountEvent, type AccountRuntime } from "./apply-account-event";

/**
 * NiceMatrix → NiceIdeas account events (plan §10; contract in docs/api/account-events.md).
 * Signature: hex HMAC-SHA256 of `${timestamp}.${rawBody}` with the shared secret;
 * timestamps older / newer than 5 minutes are rejected; `eventId` makes delivery idempotent.
 */
export const MAX_SKEW_SECONDS = 300;

const nullableText = (max: number) => z.string().max(max).nullable().optional().transform((v) => v ?? null);
const eventSchema = z.object({
  eventId: z.string().min(8).max(200),
  event: z.enum(["deletion_requested", "deletion_cancelled", "deletion_completed", "profile_updated"]),
  userId: z.string().min(1).max(200),
  occurredAt: z.iso.datetime({ offset: true }),
  /** profile_updated only: current NiceMatrix values (null = none). */
  profile: z.object({ username: nullableText(200), name: nullableText(500), avatarUrl: nullableText(2000) }).optional(),
});
export type AccountEvent = z.infer<typeof eventSchema>;

export function signAccountEvent(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyAccountEvent(secret: string, headers: Headers, rawBody: string, now = Date.now()): AccountEvent {
  const ts = headers.get("x-nicematrix-timestamp") ?? "";
  const sig = headers.get("x-nicematrix-signature") ?? "";
  if (!/^\d{9,12}$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > MAX_SKEW_SECONDS) throw unauthorized("signature.expired");
  const expected = Buffer.from(signAccountEvent(secret, ts, rawBody));
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), expected)) throw unauthorized("signature.invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw badRequest("request.invalid_json");
  }
  const r = eventSchema.safeParse(parsed);
  if (!r.success) throw badRequest("request.invalid");
  return r.data;
}

export function accountEventsDisabled(): ApiError {
  return new ApiError("endpoint.disabled", 503);
}
