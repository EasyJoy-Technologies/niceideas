# NiceMatrix → NiceIdeas account events (deletion contract)

Server-to-server. NiceMatrix calls NiceIdeas when an account enters or leaves the deletion
cooling-off period (plan §10). Implemented in v1.0.15.

## Endpoint
- `POST https://niceideas.app/api/internal/v1/account-events` (staging: `https://t.niceideas.app/...`)
- Body (JSON, ≤ 4 KB):

```json
{ "eventId": "evt_01J…", "event": "deletion_requested", "userId": "<Logto sub>", "occurredAt": "2026-10-20T19:00:00Z" }
```

| `event` | When | NiceIdeas action |
|---|---|---|
| `deletion_requested` | User submits account deletion (15-day cooling-off starts) | Profile and all posts go offline at once (pages answer 410); media leave the public bucket |
| `deletion_cancelled` | User cancels within the cooling-off period | Everything goes back online with the same links |
| `deletion_completed` | Cooling-off ended | Immediate physical deletion of profile, posts, revisions, media, comments, likes, follows (no extra 30-day retention) |

## Authentication
- Headers: `X-NiceMatrix-Timestamp: <unix seconds>`, `X-NiceMatrix-Signature: <hex>`
- `signature = hex(HMAC_SHA256(secret, "<timestamp>.<raw body>"))`
- Requests whose timestamp is more than 300 s away from NiceIdeas' clock are rejected (401 `signature.expired`); bad signature → 401 `signature.invalid`.
- Shared secret: `ACCOUNT_EVENTS_SECRET` (≥ 32 chars), one per environment, exchanged out of band. Unset → 503 `endpoint.disabled`.

## Delivery
- Idempotent by `eventId`: repeats return 200 `{"result":"duplicate"}`.
- Ordering by `occurredAt`: a request / cancel older than the latest applied event for the user returns 200 `{"result":"stale"}` and changes nothing. `deletion_completed` always applies.
- Success: 200 `{"result":"applied"}`. Retry on network errors / 5xx with backoff (suggested: 1 min, 5 min, 30 min, then hourly for 24 h) and alert after the last attempt.
- 4xx other than 429 are not retryable (fix the request).

## Example (Node)

```js
const body = JSON.stringify({ eventId, event: "deletion_requested", userId, occurredAt: new Date().toISOString() });
const ts = Math.floor(Date.now() / 1000).toString();
const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-nicematrix-timestamp": ts, "x-nicematrix-signature": sig }, body });
```
