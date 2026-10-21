# NiceIdeas third-party API (plan §9)

Base: `https://niceideas.app/api/v1` (staging: `https://t.niceideas.app/api/v1`).
The platform-wide authorization flow (consent page, per-scope choice, revocation) is described in the
NiceMatrix developer guide; this page covers only what is specific to NiceIdeas.

## Tokens
- Logto (NiceMatrix ID) access token, `Authorization: Bearer <token>`.
- `iss` = `https://id.nicematrix.com/oidc` (staging `https://id-staging.nicematrix.com/oidc`), ES384, `exp` checked.
- `aud` must be exactly `https://api.niceideas.app` (resource display name: **NiceIdeas**).
- No registration on NiceIdeas: the app is recognised through the NiceMatrix app directory
  (`GET {platform}/v1/oauth/apps/{clientId}`; cached ≤ 5 min, last known entry used ≤ 1 h if the directory is unreachable).
- Users may grant only some of the requested scopes; every endpoint checks its own scope.

## Scopes and exact boundaries
| Scope | Allows | Boundary |
|---|---|---|
| `posts:read` | Read the posts **this app published** for the user (`GET /posts/{id}`), their comments (`GET /posts/{id}/comments`), and the user's NiceIdeas profile (`GET /me`). | Never posts published from NiceNote, the web or other apps (they look nonexistent: 404). Public pages need no token. |
| `posts:write` | Publish (`POST /posts`), edit content (`PUT /posts/{id}/content`), change settings (`PATCH /posts/{id}`), **withdraw** (`DELETE /posts/{id}`), and delete comments on those posts. | Only posts this app published. `Idempotency-Key` header required on `POST /posts`. |
| `media:write` | Upload images and audio for the app's posts (`POST /media`, raw bytes + `X-Content-SHA256`). | Images: JPEG, PNG, WebP, GIF, AVIF; ≤ 30 MB, ≤ 100 MP (SVG/HEIC/BMP rejected). Audio: MP3, M4A/AAC, Ogg/Opus, WebM, WAV; ≤ 150 MB, ≤ 4 h. Type detected from the bytes. Per-user storage quota 5 GB (shared with all sources). |

## Endpoints
| Method | Path | Scope |
|---|---|---|
| POST | /media | media:write |
| POST | /posts | posts:write |
| GET | /posts/{id} | posts:read |
| PATCH | /posts/{id} | posts:write |
| PUT | /posts/{id}/content | posts:write |
| DELETE | /posts/{id} | posts:write |
| GET | /posts/{id}/comments | posts:read |
| DELETE | /posts/{id}/comments/{commentId} | posts:write |
| GET | /me | posts:read |

- Posts show "From <app>" with the directory's `name`, `logoUrl` and a link to `websiteUrl`; every post records the app's `client_id`.
- Mainland-China region rules do not apply to API calls.

## Errors (`{ "error": { "code", "status", "details?" } }`)
| Code | Status | Meaning |
|---|---|---|
| `auth.missing_token` / `auth.invalid_token` | 401 | No token, bad signature, wrong issuer, expired. |
| `auth.audience_not_accepted` | 401 | Token is for another API (or several at once). |
| `auth.client_unknown` | 403 | The client is not an third-party app in the NiceMatrix directory. |
| `auth.client_suspended` | 403 | The app is suspended platform-wide. |
| `auth.client_blocked` | 403 | The app is blocked on NiceIdeas. |
| `auth.insufficient_scope` | 403 | The token lacks the endpoint's scope (e.g. the user unticked it). |
| `auth.directory_unavailable` | 503 | First call from an app while the directory is unreachable; retry later. |
| `idempotency.key_required` | 400 | `POST /posts` without `Idempotency-Key`. |
| `rate.limited` | 429 | Limit reached; `Retry-After` header and `details.retryAfterSeconds`. |

## Rate limits (per hour unless noted)
- Per app × user: 20 posts.
- Per user, all sources together: 30 posts (200/day), 720 content edits, 300 media uploads.
- Per app, all users: 2000 posts (may be adjusted per app).

## Consent-page copy
Resource display name: **NiceIdeas**.

| Scope | 中文 | English |
|---|---|---|
| `posts:read` | 查看此应用代你发布的帖子及其评论，以及你的 NiceIdeas 公开资料 | View the posts this app published for you, their comments, and your NiceIdeas public profile |
| `posts:write` | 代你发布、修改和撤回帖子，并删除这些帖子下的评论 | Publish, edit and withdraw posts for you, and delete comments on those posts |
| `media:write` | 代你上传帖子中的图片和音频 | Upload images and audio for your posts |
