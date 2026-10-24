#!/usr/bin/env bash
# Deploys the current dev checkout to staging (t.niceideas.app). Run from /root/projects/niceideas.
# Builds, copies a release into /var/www/niceideas-staging/releases/<version>-<sha>, migrates,
# switches the `current` symlink, restarts the service and verifies /api/v1/meta. Keeps 3 releases.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST=/var/www/niceideas-staging
ENV_FILE=/etc/niceideas/env.staging
SERVICE=niceideas-staging
PORT=3110

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean — commit first"; exit 1; }
VERSION=$(node -p "require('./package.json').version")
SHA=$(git rev-parse --short HEAD)
REL="$DEST/releases/$VERSION-$SHA"

pnpm install --frozen-lockfile
pnpm build
mkdir -p "$REL"
cp -a .next/standalone/. "$REL/"
mkdir -p "$REL/.next"
cp -a .next/static "$REL/.next/static"
cp -a public "$REL/public"
cp -a content "$REL/content"
cp -a dist "$REL/dist"
cp deploy/cluster.mjs "$REL/cluster.mjs"
rm -rf .next/standalone dist
# The standalone tracer copies a few repo files (dynamic fs paths); none are used at runtime.
rm -rf "$REL/docs" "$REL/src" "$REL/tests"
# CLIs (dist/*.mjs) keep these packages third-party; link them from the traced pnpm store.
mkdir -p "$REL/dist/node_modules"
for pkg in sharp file-type music-metadata; do
  dir=$(ls -d "$REL"/node_modules/.pnpm/"$pkg"@*/node_modules/"$pkg" | head -1)
  [ -n "$dir" ] || { echo "missing runtime package $pkg"; exit 1; }
  ln -sfn "$dir" "$REL/dist/node_modules/$pkg"
done

set -a; . "$ENV_FILE"; set +a
# Fail before switching if a media-pipeline dependency is incomplete (the server's traced
# .next/node_modules entries point at the same store directories as these links).
(cd "$REL/dist" && node --input-type=module -e 'for (const m of ["sharp", "file-type", "music-metadata"]) await import(m);')
node "$REL/dist/migrate.mjs"

ln -sfn "$REL" "$DEST/current.tmp" && mv -T "$DEST/current.tmp" "$DEST/current"
systemctl restart "$SERVICE"

for i in $(seq 1 30); do
  got=$(curl -s -m 3 "http://127.0.0.1:$PORT/api/v1/meta" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{}})' || true)
  [ "$got" = "$VERSION" ] && { echo "staging is up: v$VERSION ($SHA)"; break; }
  sleep 1
  [ "$i" = 30 ] && { echo "health check failed (got '$got')"; journalctl -u "$SERVICE" -n 40 --no-pager; exit 1; }
done
# Background worker (deploy/niceideas-staging-worker.service), once installed: same release, restarted with it.
if systemctl is-enabled --quiet "$SERVICE-worker" 2>/dev/null; then
  systemctl restart "$SERVICE-worker"
  sleep 3
  systemctl is-active --quiet "$SERVICE-worker" || { echo "worker failed to start"; journalctl -u "$SERVICE-worker" -n 40 --no-pager; exit 1; }
  echo "worker is running"
fi

ls -1dt "$DEST"/releases/* | tail -n +4 | xargs -r rm -rf
