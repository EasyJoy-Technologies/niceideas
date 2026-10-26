# NiceIdeas Legal Drafts — Owner / Lawyer Review Package

Status: **first draft, not reviewed by counsel, not published**. Grounded in the current codebase at `/root/projects/niceideas` as of 2026-10-21. Do not publish until all `[TO CONFIRM: …]` markers below are resolved and a lawyer has reviewed Sections 7, 14, 16 of the Terms and Sections 4, 8, 14 of the Privacy Policy.

## Files

- `terms.en.md` / `terms.zh-Hans.md` — Terms of Use (English / Simplified Chinese)
- `privacy.en.md` / `privacy.zh-Hans.md` — Privacy Policy (English / Simplified Chinese)

Both languages have identical section numbering and meaning; Chinese is a localized (not literal word-for-word) translation.

## Section list (same in both documents, EN/ZH)

**Terms of Use**: 1 What NiceIdeas Is · 2 Eligibility · 3 Accounts · 4 Public Nature of Content and Shared Links · 5 Your Content and the License You Grant Us · 6 Prohibited Conduct · 7 IP Complaints and Counter-Notice · 8 External Applications · 9 Moderation, Suspension, and Termination · 10 Account Deletion · 11 NiceNote Integration · 12 Availability and Changes · 13 Disclaimers · 14 Limitation of Liability · 15 Indemnity · 16 Governing Law and Dispute Resolution · 17 Changes to These Terms · 18 Miscellaneous · 19 Contact

**Privacy Policy**: 1 Who We Are and Scope · 2 Data We Collect · 3 Sources of Data · 4 Purposes and Legal Bases · 5 Public Nature of Content · 6 Cookies · 7 Sharing of Data and Processors · 8 International Data Transfers · 9 Retention · 10 Region-Specific Access (Mainland China) · 11 Account Deletion · 12 Your Rights · 13 Children · 14 Region-Specific Notices (EU/UK, Canada, California, China PIPL) · 15 Security · 16 Changes to This Policy · 17 Contact

## All `[TO CONFIRM: …]` placeholders (owner + lawyer action items)

1. **Effective date** — both documents, both languages (4 occurrences).
2. **Legal entity name and registered address** operating NiceIdeas (Terms preamble, Privacy §1). This determines governing law, DPA capacity, and who signs the documents.
3. **Contact emails** — suggested `legal@niceideas.app` for Terms/IP notices, `privacy@niceideas.app` for Privacy; confirm these inboxes exist/are monitored before publishing (Terms §7, §19; Privacy §1, §11/§12/§13/§14/§17).
4. **Minimum age** — suggested 13 as a baseline, but flagged because PIPL (China) and some EU member states' GDPR implementations (age of consent for information-society services, up to 16) may require a higher threshold; also interacts with mainland-China-link-only access (Terms §2; Privacy §13).
5. **Mainland-China rollout status** — confirm the link-only restriction (code: `src/server/region/region-policy.ts`) is actually live in production before stating it as current fact, vs. describing it as "may apply" (Terms §4.4; Privacy §10).
6. **IP/copyright designated contact and process** — whether a formal statutory notice-and-counter-notice regime (e.g., DMCA-style) applies and whether a designated agent must be registered, pending determination of operating jurisdiction(s) (Terms §7).
7. **Liability cap** amount/formula for Section 14 of the Terms — currently no paid membership is live (plan §17.2: "membership — data stats + no ads" is planned, not live), so a cap needs a lawyer-chosen formulation (e.g., fixed CAD amount) rather than "amount paid" (Terms §14).
8. **Governing law / forum** — suggested Alberta, Canada (operator's likely jurisdiction) but not confirmed; affects Terms §16 and the counter-notice consent in §7.2.
9. **Hosting/data-center countries** — plan doc states Hetzner servers "Germany/Finland" with `[TO CONFIRM]` already flagged there; confirm current production region(s) before stating them as fact (Privacy §7, §8).
10. **No ads/analytics trackers** — repo search found no analytics/ad/Sentry references in `src/server` or `src/app`, supporting the current claim, but reconfirm against the actual production build/CSP before publishing (Privacy §2.7, §6).
11. **Cross-border transfer safeguards** (SCCs/DPAs with Cloudflare and any other processor) — not yet verified as executed; needed before asserting "appropriate safeguards" in Privacy §8.
12. **CCPA/CPRA applicability** — depends on California user volume/revenue thresholds not available to this review; Privacy §14.
13. **PIPL applicability to mainland China users** — open legal question given no mainland entity/infrastructure and link-only access; Privacy §14 flags this as pending assessment.
14. **EU/UK GDPR Art. 27 representative** — appoint only if required once EU/UK user volumes are assessed; Privacy §14.
15. **Server/security log retention period** — not found as a fixed, documented number in the codebase (only data-purge jobs for posts/media/sessions/notifications/bans/idempotency/PoW challenges are implemented); needs an operational answer from infra before publishing Privacy §9's log row.

## Facts each clause relies on, with repo references

- **Accounts are NiceMatrix ID (Logto), no password stored by NiceIdeas** — `src/server/auth/web/auth-routes.ts`, `src/server/auth/web/sign-in-flow.ts`; plan §3. → Terms §3, Privacy §1/§2.1.
- **Profile fields seeded from NiceMatrix, editable after** — plan §3, §5 (`profile` table). → Terms §3.2, Privacy §2.1.
- **Posts public by default; timeline/discover/profile/search visibility** — plan §1, §5 (`post` table `status`), §6. → Terms §4.1, Privacy §5.
- **Mainland-China link-only access rule, including interactions allowed** — `src/server/region/region-policy.ts` (`AccessClass`, `ALLOWED_WHEN_RESTRICTED` includes `share`, `interaction`, `publish_api`, `third_party_api`, `public_meta`), `src/server/region/region-header.ts`; plan §4. → Terms §4.4, Privacy §10.
- **Region decision uses CDN country code (`CF-IPCountry`), not raw IP** — `region-policy.ts` `countryFromHeaders()`. → Privacy §2.4, §10.
- **User content license scope (host/display/distribute as published) ends on deletion, subject to retention/legal exceptions** — plan §10 (post lifecycle table), `src/server/accounts/account-events.ts` (`applyAccountEvent`). → Terms §5.
- **Likes/comments, anonymous comments with optional nickname, no IP shown** — plan §16.2; `src/server/interactions/visitor.ts` (hashed visitor id `ni_vid`, hashed IP via `ipHash`, no raw IP stored); `src/server/db/repos/notifications.ts` (`anonName` field, no IP in output). → Terms §6/§9.1, Privacy §2.3.
- **Proof-of-work anti-spam for anonymous comments, no third-party CAPTCHA** — `src/server/interactions/pow.ts`, migration `0008_pow_used.ts`. → Terms §6, Privacy §2.4.
- **Visitor/IP bans (moderation)** — `src/server/db/repos/maintenance.ts` (`purgeExpiredBans`, `visitor_ban` table). → Terms §9.1/§9.2.
- **Cookies**: `ni_sid` session, 30-day sliding, DB stores SHA-256 hash only — `src/server/auth/web/session.ts` (`SESSION_COOKIE`, `hashOf` using SHA-256). `ni_oidc` sign-in flow state — `src/server/auth/web/flow-cookie.ts` (`FLOW_COOKIE`). `ni_sso` SSO-attempt marker — `src/server/auth/web/sign-in-flow.ts` (`SSO_TRIED_COOKIE`). `ni_vid` visitor id, ~400-day lifetime, keyed hash stored — `src/server/interactions/visitor.ts` (`VISITOR_COOKIE`, `VISITOR_MAX_AGE`, `keyed()`). Language cookie — `src/server/share/locale.ts` (`LOCALE_COOKIE` via `@/i18n/locales`). Generic cookie mechanics (SameSite=Lax, Secure on https, HttpOnly) — `src/server/http/cookies.ts`. → Privacy §2.4, §6.
- **Retention periods**: posts purged 30 days after withdrawal/removal, unreferenced media purged 7 days, notifications 90-day rolling window, daily purge of expired sessions/idempotency keys/bans/spent PoW challenges — `src/server/maintenance/run-maintenance.ts` (`MEDIA_GRACE_DAYS = 7`, purge loop for expired posts), plan §10 (30-day post purge), `src/server/db/repos/notifications.ts` (`WINDOW_DAYS = 90`). → Terms §9.3, Privacy §9.
- **Account deletion lifecycle (requested/cancelled/completed), HMAC-signed server-to-server events, immediate offline on request, no extra 30-day retention after cooling-off** — `src/server/accounts/account-events.ts` (`applyAccountEvent`, `verifyAccountEvent`, `MAX_SKEW_SECONDS`), `docs/api/account-events.md`. → Terms §10, §9.4; Privacy §9, §11.
- **External/third-party app access (OAuth scopes, labeling, revocation, per-app rate limit, 404 isolation between apps)** — `docs/api/third-party.md` (scopes `posts:read`/`posts:write`/`media:write`, `Idempotency-Key`, `RATE_CLIENT_POSTS_PER_HOUR`); plan §9. → Terms §8, Privacy §2.6, §7.
- **NiceNote integration (publish selected content only, follow/fixed sync modes, delete-prompts-withdraw, source badge linking to NiceNote)** — plan §8 (sync endpoints), §16.4 (source badge, configurable per `api_client` registration). → Terms §11.
- **No phone number required to publish** — plan §3 (D7). → Terms §2 context, Privacy §2.7.
- **No ad/analytics trackers found in code** — repo-wide search of `src/server` and `src/app` for analytics/ads/Sentry/Google Analytics terms returned no matches (verified during drafting via `rg`). → Privacy §2.7, §6 (still flagged `[TO CONFIRM]` pending final production build/CSP review).
- **CSP / no third-party scripts** — referenced in `src/server/share/respond.ts` and plan §6/§16.2 ("无第三方脚本"). → Privacy §15.
- **Infrastructure**: Cloudflare (CDN, R2 object storage for published media), PostgreSQL, Hetzner servers Germany/Finland — plan §2 (architecture diagram, R2 bucket `media.niceideas.app`), plan §2 resource note marks Hetzner region itself as uncertain in the source plan. → Privacy §7, §8 (both flagged `[TO CONFIRM]`).
- **Community Guidelines folded into the Terms (v1.0.74, Xianglin 2026-10-26)** — the separate page is gone (`/guidelines` → 301 `/terms`); its one rule not already in Terms §6 (gory / graphically violent content) was added there. The drafts below still mention the guidelines; `content/legal/` is authoritative.
- **Membership (data stats, no ads) is planned, not live; no ads today** — plan §9 "待确认" table Q9/Q10 (§17 referenced, confirmed 2026-10-20 as a separate, not-yet-implemented feature). → Terms §14 context (liability-cap rationale), Privacy §2.7 context.

## Open questions for the product owner (beyond placeholders above)

- Who is the actual contracting/legal entity for NiceIdeas (a company, or part of NiceMatrix's corporate entity)? This single fact resolves placeholders #2, #8, #9 in combination with infra confirmation.
- Should the Terms/Privacy be versioned alongside the app's `A.B.C` version number (plan §15), or kept on an independent "legal document version" track? Recommend independent track with its own changelog entry, since legal changes don't always align with code releases.
- Confirm whether `docs/api/third-party.md`'s per-app rate limit default (2000/hour) or any other operational figures should be disclosed publicly — currently not referenced in the drafts, kept internal.
