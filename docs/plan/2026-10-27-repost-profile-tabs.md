# 2026-10-27 — Mobile chrome review, repost/quote, profile tabs, card fixes

Requested by Xianglin 2026-10-27 00:20 (7 items). Status: **draft, awaiting confirmation**. Nothing implemented.
Screenshots: workspace `review/mobile-chrome/` (current state, staging v1.0.79) and `review/repost-profile/` (mockups on real staging pages).

## 1. Mobile header / footer — current state (phone 390 px, staging v1.0.79)

| Page | Overseas guest | Overseas signed in | Mainland guest | Mainland signed in (app) |
|---|---|---|---|---|
| Feed pages (`/`, `/discover`, `/@x`, `/bookmarks`, …) header | logo · search · language · theme | same | 451 page: logo (no link) · language · theme | same as guest |
| Feed pages bottom | footer (logo+tagline · About/Terms/Privacy/Help · © language theme) + tab bar **Discover / Sign in** | footer + tab bar **Home / Discover / ＋ / Notifications / Me** | 451 footer: logo+tagline · © language theme | same |
| Post page `/p/` header | logo · search · language · theme · **Join** | logo · search · language · theme · **avatar menu** | logo (no link) · language · theme | same |
| Post page bottom | footer + fixed action bar (like/comment/bookmark/share), **no tab bar** | same | footer without page links + action bar | same |
| Info pages (About/Terms/…) | logo · language · theme · ☰ ; footer © only; no tab bar | same (no account) | 451 | 451 |

Inconsistencies found:
- I1 language + theme appear twice (header and footer) on feed and post pages.
- I2 sign-in entry differs: tab bar "Sign in" (feed) / header "Join" (post) / none (info pages).
- I3 **signed in on a phone, Bookmarks / Settings / Sign out / Admin are only reachable from a post page** (header avatar); feed and profile pages hide the account menu.
- I4 post pages have no tab bar → no way to Home / Notifications / Me except the logo.
- I5 info pages use a third header/footer style.
Unification options to be decided by Xianglin (not part of this plan until chosen).

## 2. Repost and quote (new)
- Repost icon (two arrows) after comment: like · comment · repost · star · share. Tap → menu **Repost** / **Quote**; reposted → **Undo repost**.
- Repost: no new post; `post_repost (user_id, post_id, created_at)`; followers' home timeline shows the original with a "X reposted" line (newest repost wins, one card per post); not in Discover.
- Quote: a new short post (text, images, audio; short limit) with `post.quote_of`; compose sheet with the quoted card below the editor; quote shows the original as an embedded mini card (link to it).
- `post.repost_count` = reposts + quotes. Notifications: "X reposted your post", "X quoted your post".
- Rules: signed in only; private / removed posts cannot be reposted or quoted; original later unavailable → plain reposts disappear, quote shows "Original post unavailable"; own posts may be reposted.
- Mainland China: repost button hidden (no compose / in-site navigation there). Migration 0024.

## 3. Short posts open their page
- Tap anywhere on a short card (text / empty area) → `/p/{slug}`; links, buttons, image viewer, audio, text selection excluded; Ctrl/⌘-click opens a new tab. No-JS: time link (as today).

## 4. Article cards
- Cover image → bordered card (as today). No cover → no border, no inner padding; title / summary / facts aligned with post text.

## 5. Bookmark icon → star
- Star everywhere bookmarks appear (cards, post page, phone action bar, rail, account menu). Saved = filled brand purple (unchanged colour).

## 6. Menus never wrap
- Menu items `nowrap`; menu as wide as its longest item (max screen − 2 rem, then ellipsis). Delete confirmation text keeps wrapping inside a fixed width.
- Measured today (own-post menu, 390 px): "Make visible only to me" wraps in en/de/ru (2 lines), fr (3 lines); zh/ja fine.

## 7. Profile tabs
- Own profile: **All · Articles · Replies · Reposts · Bookmarks** (equal width; scrolls sideways if a language is too long). Other profiles: All · Articles · Replies · Reposts (bookmarks stay private).
- Replies: the account's comments on public live posts, newest first: "Replying to @x", text, mini card of the post; tap → post at the comment. Only signed-in comments (since v1.0.79) are attributable.
- Reposts: reposts + quotes, newest first. All: own posts incl. quotes, not plain reposts.
- Bookmarks: same list as `/bookmarks`; `/bookmarks` redirects to `/@me?tab=bookmarks` (rail / account menu links follow).
- Own profile gets a **Settings** button (fixes I3 together with Sign out on the settings page).

## Releases (proposal)
- v1.0.80: items 3, 4, 5, 6 (UI only, no migration).
- v1.0.81: items 2 + 7 together (Reposts tab needs reposts), migration 0024; i18n 40 locales.

## Round 2 (Xianglin 2026-10-27 12:06) — decisions and revised drafts (workspace `review/round2/`)
- Header: unchanged (approved as is).
- Footer, phones: language + theme removed (already in the header). Two kinds only:
  - **A (with links)**: logo + tagline / About · Terms · Privacy · Help edge to edge, evenly spread (thin rules above and below) / ©. Overseas feed, profile, bookmarks, post pages.
  - **B (no links)**: logo + tagline / ©. Info pages (links are in the header ☰), mainland China (post page, 451).
  - Long languages (≈15 of 40, e.g. ru/fr/uk/vi at 390 px) do not fit one row → 2 × 2, each row edge to edge.
- Bookmarks: left-rail `/bookmarks` page stays separate; profile also gets its own Bookmarks tab (no redirect).
- Quote composer: quoted post full width under the editor (not indented under the avatar); short/long switch hidden (quote = short post).
- Article cards: "Read more ›" (primary colour) at the end of the facts line, with or without cover.
- Hover (mouse): today only bordered article boxes react (border → light purple); short cards none. Proposed: whole card light-grey tint + pointer for every clickable card; borderless article title turns purple; bordered box keeps its border highlight.
- Approved: repost hidden in mainland China; Replies/Reposts public on other profiles; quotes in All + Reposts, plain reposts only in Reposts.
- Round 3 (Xianglin 12:23): footer links row without rules above/below. Hover: only short cards get the grey tint; articles (with or without cover) get the purple frame — the borderless article reserves a transparent 1 px frame (negative inline margin) so its text stays aligned with the post text and nothing shifts on hover.
