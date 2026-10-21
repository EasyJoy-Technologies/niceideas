# NiceIdeas production on prod2 — plan (2026-10-21, awaiting approval)

## Target
- Host prod2 `46.224.3.146` (Debian 13, **2 vCPU, 3.8 GB RAM, ~1.1 GB available**, 12 GB disk free).
  Already runs Discourse (bbs.9696.me), NiceSpace, mail stack (postfix/dovecot/rspamd/clamd), PostgreSQL 17, nginx 1.31.
- Domain `niceideas.app` (Cloudflare zone, proxied, SSL mode Full). Today A/AAAA `niceideas.app` and `*.niceideas.app`
  point to this dev host (135.181.147.90); `t.niceideas.app` (staging) stays here.

## Layout on prod2
- Node 24 (same major as staging), app in `/var/www/niceideas/{releases,current}`, env `/etc/niceideas/env.production` (600).
- systemd `niceideas` (cluster.mjs, `WEB_CONCURRENCY=2`, `DB_POOL_MAX=5`, MemoryHigh 600M / MemoryMax 800M),
  `niceideas-maintain.timer` (daily).
- Database: new role + database `niceideas` in the existing PostgreSQL 17 (127.0.0.1); pg_trgm extension. Daily `pg_dump` to R2.
- Media: new R2 buckets `niceideas-prod-private`, `niceideas-prod-public`; public domain `media.niceideas.app`.
- nginx: new `sites-enabled/niceideas.app.conf` only (server_name niceideas.app; CF real-IP; Origin cert copied from
  `/etc/ssl/niceideas.app.{pem,key}`); `nginx -t` then reload. Other sites untouched.
- Deploy: build here, rsync release to prod2 (`deploy/deploy-production.sh`), migrate, switch symlink, restart, health check.

## Cutover
1. Prepare everything on prod2 and verify via `curl --resolve niceideas.app:443:46.224.3.146` (no public impact).
2. Cloudflare: change only `niceideas.app` A/AAAA → prod2 (keep `*.niceideas.app` as is; staging keeps its own record). Backup records first.
3. Verify public health, sign-in, CN 451, media; purge Cloudflare cache.
- Rollback: restore the saved DNS records (seconds); prod2 service can be stopped without affecting other sites.

## Dependencies (other teams)
- Production Logto (id.nicematrix.com): NiceIdeas web app (callback `https://niceideas.app/auth/callback`, sign-out redirect `https://niceideas.app/`), its id/secret.
- Production first-party audiences + NiceNote client_ids; account-events HMAC secret and target URL `https://niceideas.app/api/internal/v1/account-events`.
- Legal review of Terms / Privacy before public launch.

## Capacity note
- prod2 has 2 cores shared with other services: expect roughly 1/4 of the 8-core load-test figures
  (about 50–70 signed-in page views/s, anonymous cached pages several hundred/s). Fine for launch; move to a dedicated
  4–8 core host when traffic grows (the app scales by adding workers/hosts).
