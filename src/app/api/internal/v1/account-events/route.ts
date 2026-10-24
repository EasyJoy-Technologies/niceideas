import { accountEventsDisabled, applyAccountEvent, verifyAccountEvent } from "@/server/accounts/account-events";
import { getConfig } from "@/server/config/env";
import { getDb } from "@/server/db";
import { apiRoute } from "@/server/http/api-route";
import { ApiError } from "@/server/http/errors";
import { jsonOk } from "@/server/http/json";
import { getMediaStores } from "@/server/storage";

const MAX_BYTES = 8192;

/** NiceMatrix account lifecycle events (server to server, HMAC-signed; contract docs/api/account-events.md). */
export const POST = apiRoute("account.events", "third_party_api", async (request) => {
  const cfg = getConfig();
  if (!cfg.ACCOUNT_EVENTS_SECRET) throw accountEventsDisabled();
  const raw = await request.text();
  if (raw.length > MAX_BYTES) throw new ApiError("request.too_large", 413, { maxBytes: MAX_BYTES });
  const event = verifyAccountEvent(cfg.ACCOUNT_EVENTS_SECRET, request.headers, raw);
  const result = await applyAccountEvent({ db: getDb(), stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL }, event);
  console.info(JSON.stringify({ event: "account_event", type: event.event, eventId: event.eventId, result }));
  return jsonOk({ result });
});
