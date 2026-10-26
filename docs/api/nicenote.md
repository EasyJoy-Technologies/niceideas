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
- Account deletion (v1.0.70): during the cooling-off period `POST /posts` answers 409 `user.deleting`; a content
  push is **accepted and kept offline** (status `author_deleting`, goes live when the deletion is cancelled). After
  `deletion_completed` every call for the user answers 409 `user.deleting` (or 404 for its deleted posts).

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
- **Media**: an owner's `ref` maps to a stored media through `media_job.media_id` (one stored file can serve several
  refs; files already uploaded on the web are reused by sha256). Refs not stored are queued in `media_job` with their
  grant (only grants under `NICEMATRIX_API_URL` are accepted). Blocks without stored media show a placeholder
  ("Processing…" / "Media unavailable"). `mediaState`: complete / processing / partial.
- **Worker** (`dist/worker.mjs`, systemd `niceideas[-staging]-worker`; plan `docs/plan/2026-10-24-s2-worker.md`): fetches
  grants (signed GET, ≤ 2 GiB, `MEDIA_SHARE_MAX_BYTES`), stores web versions, updates every share using the ref (links,
  publishes, cover, `mediaState`; the page shows it on the next request).
  - Images: JPEG / PNG / WebP / GIF / AVIF / TIFF with sharp; HEIC / HEIF / BMP decoded by ImageMagick (`MAGICK_PATH`)
    first; ≤ 100 MP (`too_large`); animated GIF / WebP stay animated; renditions taller than 16383 px are JPEG / PNG and
    at most 65500 px high (narrowed, no slicing).
  - Audio (`FFMPEG_PATH`, `FFPROBE_PATH`): MP3 stored exactly as received (all ID3 tags); AAC re-wrapped into a
    fast-start M4A; everything else encoded to 128 kbps AAC / M4A. Converted files keep the standard tags (title,
    artist, album, comment, …) without location tags; ffmpeg rewrites `encoder` and drops non-standard M4A tags, so an
    app name belongs in `comment` (Xianglin 2026-10-24: ID tags are kept). No duration limit; video or no audio →
    `unsupported_format`.
  - Failures: temporary ones (`fetch_failed` after 3 tries, `fetch_expired`, `temporarily_unavailable`) leave the job
    `failed` (a new grant queues it again); permanent ones (`too_large`, `unsupported_format`, `decode_failed`,
    `transcode_failed`) leave it `rejected` and that owner's ref is never fetched again.
- **Delete** by the backend: `unpublished`, page 410, media withdrawn, purged after 30 days; no event back.
- **Events to the backend** (`outbox`, delivered by the worker, signed, `X-NM-Service: niceideas`; retried after 1 min,
  5 min, 30 min, then hourly for 24 h; 400 / 404 / 409 / 410 / 413 / 422 are not retried): `user_registered` on first
  profile (existing users were queued by migration 0014); post events `unpublished` (author deleted on the web),
  `removed` / `restored` (moderation), `media_failed` (`details.refs` + `reason`, per reason) and `media_ready` (the
  post's media became complete — by the worker or by a push).
- **Profiles**: one rule set for web sign-in, the create request and `profile_updated` (`src/server/profiles/profile-follow.ts`):
  handle follows the NiceMatrix username (none → user id; unusable / taken → kept); display name follows unless changed on
  NiceIdeas (`profile.name_locked`; clearing it follows again); avatar always follows: `profile.avatar_source` is the
  NiceMatrix URL, the worker downloads it (public https only, ≤ 10 MB) into the public bucket as a 256 px WebP
  (`a/<uuid>.webp`) and points `avatar_url` there; a failed download keeps the current avatar.
- No per-user media quota (removed for every source, 2026-10-23); single files ≤ 2 GiB for shares.
