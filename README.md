# NiceIdeas

NiceIdeas is a self-built platform for sharing ideas — short thoughts and long-form posts with images and audio — integrated with NiceNote publishing and NiceMatrix ID accounts.

## Domains
- Production: https://niceideas.app
- Staging: https://t.niceideas.app

## Paths
- Development: /root/projects/niceideas
- Production deploy: /var/www/niceideas
- Staging deploy: /var/www/niceideas-staging

## Stack
Next.js (App Router, standalone output) · TypeScript · PostgreSQL · Cloudflare R2 · sharp · next-intl (40 locales).

## Development
```bash
pnpm install
cp .env.example .env.local
pnpm dev            # http://localhost:3000
pnpm check          # lint, typecheck, i18n, structure, tests
pnpm build
```

## Conventions
- Version `A.B.C` lives only in `package.json`. A.B change only on explicit instruction; C +1 per code commit
  (`pnpm version:bump`, which also creates `changelog/v<version>.md`). Commit messages carry the version, e.g. `feat(posts): … (v1.0.3)`.
- No hardcoded user-facing strings: add keys with `node scripts/i18n-merge.mjs <batch.json>`, where every key has a
  native translation for all 40 locales. `pnpm check:i18n` blocks missing / empty / untranslated / placeholder-mismatched values.
  Values legitimately equal to English are allow-listed in `messages/_identical.json`.
- Source files ≤ 300 lines, one responsibility per file (`pnpm check:structure`).

## Docs
- Platform plan: docs/plan/2026-10-19-platform-plan.md
- Execution plan: docs/plan/2026-10-19-execution-plan.md
- Phase 1 architecture: docs/design/phase1-architecture.md
- Build vs Sharkey evaluation: docs/plan/2026-10-19-build-vs-sharkey-evaluation.md
