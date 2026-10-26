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
| `deletion_requested` | User submits account deletion (15-day cooling-off starts) | Profile and all posts go offline at once (pages answer 410); media leave the public bucket. Until cancelled nothing of the user goes live: NiceNote content pushed meanwhile is kept offline, a moderator restore keeps the post offline, API publishing answers 409 `user.deleting` (v1.0.70) |
| `deletion_cancelled` | User cancels within the cooling-off period | Everything offline because of the request goes back online with the same links (including shares that first got content during the cooling-off period); posts removed / deleted before stay so |
| `deletion_completed` | Cooling-off ended | Immediate physical deletion of profile, posts, revisions, media, comments, likes, follows (no extra 30-day retention). The user is remembered for good: no profile, post or media is created for them again (409 `user.deleting`; web sign-in shows "account being deleted") (v1.0.70) |
| `profile_updated` | The user's NiceMatrix profile changed (sent only for users registered with the backend) | Body adds `"profile": { "username", "name", "avatarUrl" }` (current values; `null` = none). Handle follows the username, display name follows unless changed on NiceIdeas, avatar follows. Unknown user → 200 `{"result":"unknown_user"}`. Added in v1.0.63 |

## Authentication
- Headers: `X-NiceMatrix-Timestamp: <unix seconds>`, `X-NiceMatrix-Signature: <hex>`
- `signature = hex(HMAC_SHA256(secret, "<timestamp>.<raw body>"))`
- Requests whose timestamp is more than 300 s away from NiceIdeas' clock are rejected (401 `signature.expired`); bad signature → 401 `signature.invalid`.
- Shared secret: `ACCOUNT_EVENTS_SECRET` (≥ 32 chars), one per environment, exchanged out of band. Unset → 503 `endpoint.disabled`.

## Delivery
- Idempotent by `eventId`: repeats of a **completed** event return 200 `{"result":"duplicate"}`. An event counts as completed only once all its steps succeeded (v1.0.70): a failed attempt answers 5xx and the redelivery runs it again (every step is idempotent).
- A delivery arriving while another delivery of the same event is running gets 503 `account_event.in_progress` with `Retry-After: 60` (retry as for other 5xx). A crashed attempt is taken over after 10 minutes.
- Ordering by `occurredAt`: a request / cancel older than the latest completed deletion event for the user returns 200 `{"result":"stale"}` and changes nothing. `deletion_completed` always applies. `profile_updated` carries the latest values and takes no part in this ordering.
- Body ≤ 8 KB; `eventId` ≤ 200 chars.
- Success: 200 `{"result":"applied"}`. Retry on network errors / 5xx with backoff (suggested: 1 min, 5 min, 30 min, then hourly for 24 h) and alert after the last attempt.
- 4xx other than 429 are not retryable (fix the request).

## Example (Node)

```js
const body = JSON.stringify({ eventId, event: "deletion_requested", userId, occurredAt: new Date().toISOString() });
const ts = Math.floor(Date.now() / 1000).toString();
const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-nicematrix-timestamp": ts, "x-nicematrix-signature": sig }, body });
```
