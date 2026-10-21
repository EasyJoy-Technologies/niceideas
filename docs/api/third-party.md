# NiceIdeas third-party publishing API (plan §9)

Base: `https://niceideas.app/api/v1` (staging: `https://t.niceideas.app/api/v1`).

## Authorization
- Logto (NiceMatrix ID) API resource `https://api.niceideas.app`; scopes `posts:read`, `posts:write`, `media:write`.
- The calling app must be a Logto third-party app (user consent page) **and** registered on NiceIdeas
  (`node dist/clients.mjs register --client-id … --key omnifire --name OmniFire --homepage https://…`).
- `Authorization: Bearer <access token>`; token `aud` must be exactly the API resource.

## Endpoints (same as first party)
| Method | Path | Scope |
|---|---|---|
| POST | /media (raw bytes, `X-Content-SHA256`) | media:write |
| POST | /posts (`Idempotency-Key` **required**) | posts:write |
| GET | /posts/{id} | posts:read |
| PATCH | /posts/{id} | posts:write |
| PUT | /posts/{id}/content | posts:write |
| DELETE | /posts/{id} | posts:write |
| GET | /posts/{id}/comments | posts:read |
| DELETE | /posts/{id}/comments/{commentId} | posts:write |
| GET | /me | posts:read |

- An app sees and manages only the posts it published (source `api:<key>`); NiceNote posts look nonexistent (404).
- `/me/sources` is first-party only (403).
- Posts show "From <app name>" linking to the registered homepage.
- Limits: per-user publishing limits + `RATE_CLIENT_POSTS_PER_HOUR` per app (default 2000).
- Errors: `{ "error": { "code", "status", "details?" } }` — e.g. `auth.insufficient_scope` (403), `auth.client_not_allowed` (403), `idempotency.key_required` (400), `rate.limited` (429).
