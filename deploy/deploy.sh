#!/usr/bin/env bash
# Publishes SNAKE//SHIFT to the droplet. Run on the Mac, from anywhere in the repository.
#
#   deploy/deploy.sh             upload the committed game as a new release and switch to it
#   deploy/deploy.sh --start     the same, and start the container if it is not running yet
#                                (first go-live only, after Tichu's Caddy entry is approved)
#   deploy/deploy.sh --rollback  switch back to the release before the current one
#   deploy/deploy.sh --status    show what is live; changes nothing
#
# It only ever touches ~/snake on the droplet and the container `snake`. Nothing of Tichu
# (/opt/tichu, its containers, its Caddy) or Unser Jahr (~/unser-jahr) is read or changed here.
# The whole picture is in DEPLOY.md.
set -euo pipefail

HOST="${SNAKE_HOST:-deploy@online-tichu.com}"
# This Mac trusts the droplet's key under its IP address, so ssh checks the key against that entry.
KEY_ALIAS="${SNAKE_HOST_KEY_ALIAS:-188.166.103.103}"
SITE="${SNAKE_SITE:-https://snake.online-tichu.com}"
KEEP=3 # releases kept on the droplet, the live one included

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o "HostKeyAlias=$KEY_ALIAS")
remote() { "${SSH[@]}" "$HOST" "$@"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="$ROOT/snake-shift"
MODE="${1:-deploy}"

status() {
  remote 'bash -s' <<'EOF'
cd ~/snake 2>/dev/null || { echo "~/snake does not exist yet"; exit 0; }
echo "live release: $(readlink www/current 2>/dev/null || echo none)"
echo "releases:     $(ls -1 www/releases 2>/dev/null | tr '\n' ' ')"
echo "container:    $(docker ps -a --filter name='^snake$' --format '{{.Status}}' | grep . || echo 'not created')"
if docker ps --filter name='^snake$' --format x | grep -q x; then
  echo "on droplet:   http $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:8791/)"
fi
EOF
  echo "public:       $SITE -> http $(curl -s -o /dev/null -m 10 -w '%{http_code}' "$SITE/" || true)"
}

case "$MODE" in
  --status)
    status
    exit 0
    ;;
  --rollback)
    remote 'bash -s' <<'EOF'
set -euo pipefail
cd ~/snake/www
now="$(readlink current)"; now="${now#releases/}"
prev="$(ls -1 releases | grep -vx "$now" | sort | tail -1)"
[ -n "$prev" ] || { echo "no older release to go back to"; exit 1; }
ln -sfn "releases/$prev" current.new && mv -Tf current.new current
echo "switched back: $now -> $prev"
EOF
    status
    exit 0
    ;;
  deploy | --start) ;;
  *)
    echo "unknown option: $MODE (see the top of this file)" >&2
    exit 2
    ;;
esac

# Only what is committed goes out, so the live site always matches a commit.
if [ -n "$(git -C "$ROOT" status --porcelain -- snake-shift deploy)" ]; then
  echo "There are uncommitted changes in snake-shift/ or deploy/. Commit them first." >&2
  exit 1
fi
echo "==> Tests"
(cd "$GAME" && npm test >/dev/null) || { echo "Tests fail; nothing was uploaded." >&2; exit 1; }

REL="$(date -u +%Y%m%d-%H%M%S)-$(git -C "$ROOT" rev-parse --short HEAD)"
echo "==> Uploading release $REL"
remote "mkdir -p ~/snake/www/releases/$REL"
# Only the files the browser needs: no tests, notes or development pages.
rsync -az --delete -e "${SSH[*]}" "$GAME/index.html" "$GAME/style.css" "$GAME/src" "$HOST:snake/www/releases/$REL/"

echo "==> Server files (compose.yaml, Caddyfile)"
# Written in place: the container mounts the Caddyfile as a single file and would keep the old
# content if the file were replaced. A change of either file needs the container made anew.
before="$(remote 'cat ~/snake/compose.yaml ~/snake/Caddyfile 2>/dev/null | sha256sum')"
remote 'cat > ~/snake/compose.yaml' <"$ROOT/deploy/compose.yaml"
remote 'cat > ~/snake/Caddyfile' <"$ROOT/deploy/Caddyfile"
after="$(remote 'cat ~/snake/compose.yaml ~/snake/Caddyfile | sha256sum')"

echo "==> Switching to $REL"
remote "cd ~/snake/www && ln -sfn releases/$REL current.new && mv -Tf current.new current"

running="$(remote "docker ps --filter name='^snake\$' --format x")"
if [ -n "$running" ] && [ "$before" != "$after" ]; then
  echo "==> Server files changed: making the snake container anew"
  remote 'cd ~/snake && docker compose up -d --force-recreate snake'
elif [ -z "$running" ] && [ "$MODE" = "--start" ]; then
  echo "==> Starting the snake container"
  remote 'cd ~/snake && docker compose up -d snake'
elif [ -z "$running" ]; then
  echo "The container is not running, so the files are uploaded but not served."
  echo "First go-live: deploy/deploy.sh --start (only after Tichu's Caddy entry is approved, see DEPLOY.md)."
fi

echo "==> Removing old releases (keeping $KEEP)"
remote "cd ~/snake/www/releases && ls -1 | sort | head -n -$KEEP | grep -vx '$REL' | xargs -r rm -rf --"

status
