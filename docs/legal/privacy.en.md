# NiceIdeas Privacy Policy

**Effective date: [TO CONFIRM: insert effective date]**

This Privacy Policy explains how NiceIdeas (niceideas.app, t.niceideas.app), operated by [TO CONFIRM: legal entity name and registered address] ("we", "us", "our"), collects, uses, shares, and retains information in connection with the Service. It should be read together with our Terms of Use.

Contact / Data Protection inquiries: [TO CONFIRM: contact — suggested **privacy@niceideas.app**].

## 1. Who We Are and Scope

NiceIdeas is a public content-sharing platform. Accounts are provided by NiceMatrix (via NiceMatrix ID / Logto at id.nicematrix.com); NiceIdeas does not receive or store your NiceMatrix password. This policy covers data NiceIdeas itself collects and processes as operator of niceideas.app. NiceMatrix's handling of your account credentials is described in NiceMatrix's own privacy policy [TO CONFIRM: link].

## 2. Data We Collect

### 2.1 Account and profile data
- NiceMatrix user ID (a stable identifier, "sub"), used as your primary key on NiceIdeas.
- Handle (initially derived from your NiceMatrix username), display name, avatar URL, bio, and language preference, seeded from your NiceMatrix profile on first use and editable afterward on NiceIdeas.

### 2.2 Content you publish
- Posts (short posts and long articles), their revisions, images and audio you upload, titles/summaries/cover images, and metadata such as publish time and source (web, NiceNote, or an authorized third-party app).

### 2.3 Interaction data
- **Likes**: which signed-in users, or which anonymous visitor identifiers, liked a post.
- **Comments**: comment text; for signed-in users, your profile is shown; for anonymous commenters, an optional display name you choose to type (otherwise shown as "Anonymous"), plus a hashed visitor identifier and a hashed IP address used only for spam/abuse prevention — your actual IP address is not stored.
- **Reports**: content and reason you submit when reporting a post or comment.

### 2.4 Technical / security data
- **Cookies** (see the table in Section 6) including a session identifier (NiceIdeas stores only its SHA-256 hash, not the raw value), a short-lived sign-in flow marker, an SSO-attempt marker, a visitor identifier for anonymous interactions, and a language preference.
- Server access logs including the region classification used for the mainland-China access rule (Section 10), derived from a country code provided by our CDN (Cloudflare `CF-IPCountry`), not from your raw IP address for that purpose.
- Anti-abuse signals for anonymous comments: a server-issued proof-of-work challenge/response (no third-party CAPTCHA script is used; no personal data is required to solve it).

### 2.5 Information from NiceMatrix
- Account lifecycle events (account-deletion requested / cancelled / completed) sent by NiceMatrix to NiceIdeas so we can take your content offline or delete it (Section 9, Section 11).

### 2.6 Information from third-party apps
- If you authorize an third-party app (e.g., OmniFire) via OAuth, that app may send us posts/media on your behalf per the scopes you granted; see our Terms, Section 8.

### 2.7 What we do not collect
- We do not require a phone number to publish. We do not use third-party advertising or analytics trackers [TO CONFIRM: confirm final production configuration before publishing]. We do not store your raw IP address for comment attribution (only a keyed hash) or for mainland-China region classification (which uses a CDN-supplied country code, not your IP).

## 3. Sources of Data

- **From you**: content you create, profile edits, reports you submit.
- **From NiceMatrix**: initial profile fields at first sign-in; account-deletion lifecycle events.
- **From your browser**: cookies described in Section 6, standard request headers.
- **From our CDN (Cloudflare)**: a country code for regional access routing (Section 10).
- **From authorized third-party apps**: content you choose to publish via those apps.

## 4. How We Use Data (Purposes) and Legal Bases

| Purpose | Data used | Legal basis (GDPR Art. 6) |
|---|---|---|
| Operate your account and profile | Account/profile data | Performance of a contract (providing the Service you requested) |
| Publish and display your content, including on the home timeline, discovery, search, and shared links | Content, profile data | Performance of a contract |
| Enable likes, comments, and replies, including anonymous interactions | Interaction data | Performance of a contract (signed-in users); legitimate interest in providing a public commenting feature (anonymous visitors) |
| Prevent spam, abuse, and fraud (rate limiting, proof-of-work, bans) | Hashed visitor/IP identifiers, report data | Legitimate interest in platform integrity and security |
| Apply the mainland-China access routing rule | CDN-supplied country code | Legitimate interest in maintaining Service availability given regional network conditions |
| Respond to account-deletion and account-lifecycle events from NiceMatrix | Account ID, lifecycle event | Performance of a contract / legal obligation where applicable |
| Moderate content (review reports, remove/hide content, manage bans) | Content, reports, visitor/IP hashes | Legitimate interest in a safe platform; legal obligation where applicable |
| Security logging and troubleshooting | Server logs | Legitimate interest in Service security and reliability |
| Localize the interface | Language preference / cookie | Performance of a contract / legitimate interest |

We rely on **consent** only where law requires it for a specific feature (if any is introduced); we will update this table if that changes.

For users in Canada, our processing of personal information is conducted in accordance with the federal *Personal Information Protection and Electronic Documents Act* (PIPEDA) and, where applicable, Alberta's *Personal Information Protection Act* (PIPA): we collect, use, and disclose personal information only for purposes a reasonable person would consider appropriate in the circumstances, as described in this policy, and we limit collection to what is necessary for those purposes.

## 5. Public Nature of Content

Posts, your profile (handle, display name, avatar, bio), and non-anonymous comments are public by default and visible to anyone with the link, including people who are not signed in, and are indexed in search/discovery within the Service. Information in a public post is not treated as confidential. See the Terms of Use, Section 4, for the mainland-China access rule that currently restricts most pages other than specific shared post links.

## 6. Cookies

| Cookie | Purpose | Lifetime | Notes |
|---|---|---|---|
| `ni_sid` | Signed-in web session | 30 days, sliding (renewed on use) | Only a SHA-256 hash of the session value is stored in our database; the raw value lives only in your browser. |
| `ni_oidc` | Temporary state during the NiceMatrix sign-in flow (OIDC/PKCE) | Short-lived (minutes, flow duration) | Deleted once sign-in completes or fails. |
| `ni_sso` | Marks that a silent single-sign-on attempt was tried, to avoid redirect loops | Short-lived | No personal data. |
| `ni_vid` | Anonymous visitor identifier, used for likes and anonymous comments (e.g., per-visitor like de-duplication, abuse-rate limiting) | Long-lived (approx. 400 days) | Random identifier; only a keyed (HMAC) hash of it is stored server-side, not the raw cookie value. |
| Language cookie | Remembers your interface language choice | Persistent until changed | No personal data beyond the chosen language. |

We do not use third-party advertising or analytics cookies [TO CONFIRM before publishing]. You can clear cookies in your browser at any time; doing so will sign you out and reset your anonymous-visitor identifier (new like/comment rate-limit counters will start).

## 7. Sharing of Data and Processors

We share data with:
- **NiceMatrix** (sibling service operating NiceMatrix ID): to authenticate you and to receive account lifecycle events; we do not send your NiceIdeas content back to NiceMatrix except as needed to fulfill account-deletion.
- **Infrastructure providers**: Cloudflare (CDN/reverse proxy and object storage for published media, R2); our database (PostgreSQL) and application servers, hosted with [TO CONFIRM: Hetzner, data center region — Germany/Finland]. These providers process data on our behalf under their own data-processing terms.
- **Authorized third-party apps** (e.g., OmniFire): only the posts/media you choose to publish via that app's granted scopes, and nothing else; you can revoke access any time (Terms, Section 8).
- **The public**: your published posts, public profile fields, and non-anonymous comments are visible to anyone with the relevant link, by design.
- **Legal/compliance**: if required to comply with law, legal process, or to protect the rights, safety, or property of NiceIdeas, our users, or the public.
- We do not sell personal information.

## 8. International Data Transfers

Our infrastructure is located outside mainland China [TO CONFIRM: confirm exact hosting countries — currently believed to be Germany/Finland via Hetzner, and Cloudflare's global network for CDN/edge functions]. If you access NiceIdeas from the EU/UK, Canada, or elsewhere, your data may be processed in other countries, including Canada and EU member states where our infrastructure or processors operate. Where we transfer personal data out of the EEA/UK, we rely on appropriate safeguards (such as Standard Contractual Clauses) with our processors [TO CONFIRM: finalize processor DPAs/SCCs before publishing].

## 9. Retention

| Data | Retention |
|---|---|
| Published post, revisions, and its media | Until you withdraw it or it is removed, then purged automatically **30 days** after withdrawal/removal |
| Media no longer referenced by any post or revision | Deleted **7 days** after becoming unreferenced |
| Notifications (likes/comments/replies/follows shown to you) | Rolling **90-day** window |
| Web sessions, idempotency keys, visitor/IP bans, spent anti-spam challenges | Purged daily once expired |
| Account-deletion cooling-off | Your profile and posts go offline immediately on deletion request; if not cancelled within the cooling-off period, profile, posts, revisions, media, comments, likes, and follow relationships are **permanently deleted** (no extra 30-day retention after cooling-off ends) |
| Server/security logs | [TO CONFIRM: log retention period] |

## 10. Region-Specific Access (Mainland China)

To keep shared links reliably reachable from mainland China network connections, NiceIdeas currently restricts mainland-China traffic to specific shared post pages (and interactions on those pages); other site pages are not reachable from such traffic. This routing decision is based on a country code supplied by our CDN for the connecting request, not on separately stored personal data about you, and does not change how your data is otherwise processed.

## 11. Account Deletion

NiceIdeas does not manage account deletion directly — you request deletion of your **NiceMatrix ID**. NiceMatrix then notifies NiceIdeas:
1. On a deletion request, we immediately take your NiceIdeas profile and posts offline (pages show an error to visitors).
2. If you cancel within NiceMatrix's cooling-off period, everything is restored at the same links.
3. When the cooling-off period ends, we permanently delete your NiceIdeas profile, posts, post revisions, media, comments, likes, and follow relationships.

## 12. Your Rights

Depending on where you live, you may have rights to:
- **Access** the personal data we hold about you;
- **Correct** inaccurate data (most profile fields are editable directly in NiceIdeas);
- **Delete** your data (via NiceMatrix ID account deletion, Section 11, or by deleting individual posts/comments yourself);
- **Export/port** your data in a portable format;
- **Object to** or **restrict** certain processing based on legitimate interests;
- **Withdraw consent** where processing is based on consent;
- **Lodge a complaint** with your local data protection authority (for example, in the EU/EEA, your national supervisory authority; in the UK, the ICO; in Canada, the Office of the Privacy Commissioner of Canada or applicable provincial authority).

To exercise these rights, contact [TO CONFIRM: **privacy@niceideas.app**]. We will respond within the timeframe required by applicable law.

## 13. Children

NiceIdeas is not directed to children under [TO CONFIRM: minimum age — see Terms, Section 2]. We do not knowingly collect personal information from children below that age. If you believe a child has provided us personal data, contact us so we can take appropriate action, including deletion.

## 14. Region-Specific Notices

**European Economic Area / United Kingdom**: Processing is based on the legal bases in Section 4 (GDPR Art. 6). You have the rights listed in Section 12, including the right to complain to your supervisory authority. Where applicable, we will identify an EU/UK representative [TO CONFIRM: appoint if required under GDPR Art. 27 / UK GDPR].

**Canada**: We comply with PIPEDA and, where applicable, provincial legislation such as Alberta's PIPA, as described in Section 4. You may contact our privacy contact (Section 11 above) with requests or complaints, and you may also contact the Office of the Privacy Commissioner of Canada.

**California, USA**: [TO CONFIRM: assess CCPA/CPRA applicability based on user volume/revenue thresholds]. If applicable, California residents have rights to know, delete, and opt out of the "sale" or "sharing" of personal information; we do not sell personal information. To exercise rights, contact [TO CONFIRM: **privacy@niceideas.app**].

**Mainland China (PIPL)** [TO CONFIRM: legal assessment pending, including whether PIPL applies given no local entity/infrastructure and only specific links are reachable from mainland China networks]: if PIPL is determined to apply to processing of mainland China users' personal information, we will update this policy with the required disclosures (e.g., separate consent where needed, cross-border transfer mechanisms, and a domestic representative if required by law).

## 15. Security

We use industry-standard measures to protect data, including hashing session identifiers and visitor/IP identifiers rather than storing raw values, HMAC-signed server-to-server webhooks for account-deletion events, rate limiting, and a content security policy restricting third-party scripts. No system is perfectly secure; we cannot guarantee absolute security.

## 16. Changes to This Policy

We may update this Privacy Policy from time to time. We will post the updated policy with a new effective date and, for material changes, provide reasonable advance notice before they take effect.

## 17. Contact

Privacy questions or rights requests: [TO CONFIRM: **privacy@niceideas.app**].
