#!/usr/bin/env bash
# Deploys the current dev checkout to production (niceideas.app on prod2). Run from /root/projects/niceideas.
# Builds here, assembles a self-contained release (relative links), rsyncs it to prod2
# /var/www/niceideas/releases/<version>-<sha>, migrates, switches `current`, restarts, verifies. Keeps 3 releases.
# Requires explicit approval for every run (production).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HOST=root@46.224.3.146
KEY=/root/keys/nicematrix-id-prod_20260419_ed25519
SSH=(ssh -F /dev/null -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$HOST")
DEST=/var/www/niceideas
PORT=3120

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean — commit first"; exit 1; }
VERSION=$(node -p "require('./package.json').version")
SHA=$(git rev-parse --short HEAD)
NAME="$VERSION-$SHA"
STAGE=$(mktemp -d /tmp/ni-prod-XXXX)
trap 'rm -rf "$STAGE"' EXIT

pnpm install --frozen-lockfile
pnpm build
REL="$STAGE/$NAME"
mkdir -p "$REL/.next"
cp -a .next/standalone/. "$REL/"
cp -a .next/static "$REL/.next/static"
cp -a public "$REL/public"
cp -a dist "$REL/dist"
cp deploy/cluster.mjs "$REL/cluster.mjs"
rm -rf .next/standalone dist "$REL/docs" "$REL/src" "$REL/tests"
mkdir -p "$REL/dist/node_modules"
for pkg in sharp file-type music-metadata; do
  dir=$(cd "$REL" && ls -d node_modules/.pnpm/"$pkg"@*/node_modules/"$pkg" | head -1)
  [ -n "$dir" ] || { echo "missing runtime package $pkg"; exit 1; }
  ln -sfn "../../$dir" "$REL/dist/node_modules/$pkg"
done

"${SSH[@]}" "mkdir -p $DEST/releases"
rsync -a --delete -e "ssh -F /dev/null -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" "$REL/" "$HOST:$DEST/releases/$NAME/"
"${SSH[@]}" bash -s -- "$DEST" "$NAME" "$VERSION" "$PORT" <<'REMOTE'
set -euo pipefail
DEST=$1; NAME=$2; VERSION=$3; PORT=$4; REL="$DEST/releases/$NAME"
set -a; . /etc/niceideas/env.production; set +a
(cd "$REL/dist" && node --input-type=module -e 'for (const m of ["sharp", "file-type", "music-metadata"]) await import(m);')
node "$REL/dist/migrate.mjs"
ln -sfn "$REL" "$DEST/current.tmp" && mv -T "$DEST/current.tmp" "$DEST/current"
systemctl restart niceideas
for i in $(seq 1 40); do
  got=$(curl -s -m 3 "http://127.0.0.1:$PORT/api/v1/meta" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{}})' || true)
  [ "$got" = "$VERSION" ] && { echo "production is up: v$VERSION ($NAME)"; break; }
  sleep 1
  [ "$i" = 40 ] && { echo "health check failed (got '$got')"; journalctl -u niceideas -n 40 --no-pager; exit 1; }
done
ls -1dt "$DEST"/releases/* | tail -n +4 | xargs -r rm -rf
REMOTE
