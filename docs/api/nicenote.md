# NiceNote shares: NiceIdeas source API (implementation notes)

**The contract is nicematrix-backend `docs/integration/niceideas-share.md` (v1, 2026-10-23).** This page only
records how NiceIdeas implements its side (§3–§5 of the contract). The former client-token publishing
API for NiceNote (v1.0.62 edition of this page) is retired: NiceNote never calls NiceIdeas directly.

## Endpoints (NiceMatrix backend → NiceIdeas)
Base: `https://niceideas.app/api/internal/v1/nicenote` (staging `https://t.niceideas.app/api/internal/v1/nicenote`).

| Method | Path | Code |
|---|---|---|
| POST | `/posts` | `src/server/nicenote/create-share.ts` |
| PUT | `/posts/{id}/content` | `src/server/nicenote/push-content.ts` |
| PATCH / DELETE / GET | `/posts/{id}` | `src/server/nicenote/manage-share.ts` |

- Signature: `X-NM-*` HMAC (contract §3.1), `src/server/service-auth/` — byte-for-byte the backend's
  `shared/service-auth.js` algorithm; ±300 s; nonces stored once (`service_nonce`, purged daily); signature checked
  before the nonce is stored. Key unset → 503 `endpoint.disabled`.
- Errors: `{ "error": { "code", "status", "details?" } }`. Besides the contract: 400 `request.invalid` /
  `request.invalid_json` / `media.grant_invalid`, 401 `signature.invalid` / `signature.expired` / `nonce.replayed`,
  403 `service.not_allowed`, 404 `post.not_found`, 409 `share.conflict` (share id of another user) /
  `user.deleting` / `post.frozen` / `post.stale_update` / `post.removed` / `post.unpublished`, 413 `request.too_large` (> 8 MB).

## Configuration (`/etc/niceideas/env.<env>`)
| Variable | Meaning |
|---|---|
| `NICEMATRIX_SHARE_KEY` | HMAC key shared with the backend (both directions), ≥ 32 chars |
| `NICEMATRIX_SHARE_KEY_NEXT` | Second accepted key during a rotation (optional) |
| `NICEMATRIX_SHARE_SERVICES` | Accepted `X-NM-Service` ids, comma-separated (production `nicematrix-intl`, staging `nicematrix-staging`) |
| `NICEMATRIX_API_URL` | Backend origin: grant URLs must be `<origin>/v1/internal/niceideas/media/…`; notifications go there |

## Behaviour
- **Create**: database only (no outside calls); idempotent by `shareId`; post `preparing` (page "Getting this post
  ready", noindex, refreshes every 5 s, not in feeds / search); profile created on first contact and following the sent
  NiceMatrix data; first contact also queues the user registration (contract §4.1).
- **Push**: `sourceRevision` lower than stored → 409 `post.stale_update` `{ current }`; same revision with other content
  is accepted; same content → `changed: false` (media progress and new grant URLs still apply). Frozen posts take no
  push once they have content. The first push makes the post `active`. Page cache keys include the post's version, so
  the next request shows the change.
- **Document**: stored as received plus `origin: "nicenote"`; rendered structurally (`src/server/render/source-html.ts`),
  never as markdown; no count / length limits; links only http(s) / mailto.
- **Media**: stored per owner by `ref` (`media.source_ref`); refs not stored are queued in `media_job` with their grant
  (only grants under `NICEMATRIX_API_URL` are accepted). Blocks without stored media show a placeholder
  ("Processing…" / "Media unavailable"). `mediaState`: complete / processing / partial. Fetching and processing is the
  worker's job (phase S2, v1.0.64).
- **Delete** by the backend: `unpublished`, page 410, media withdrawn, purged after 30 days; no event back.
- **Events to the backend** (`outbox`, delivered by the worker from S2): `user_registered` on first profile;
  post events `unpublished` (author deleted on the web), `removed` / `restored` (moderation), `media_failed` / `media_ready` (S2).
- **Profiles**: one rule set for web sign-in, the create request and `profile_updated` (`src/server/profiles/profile-follow.ts`):
  handle follows the NiceMatrix username (none → user id; unusable / taken → kept); display name follows unless changed on
  NiceIdeas (`profile.name_locked`; clearing it follows again); avatar always follows.
- No per-user media quota (removed for every source, 2026-10-23); single files ≤ 2 GiB for shares.
