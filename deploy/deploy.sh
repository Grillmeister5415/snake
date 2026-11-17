#!/usr/bin/env bash
# Publishes SNAKE//SHIFT to the droplet. Run on the Mac, from anywhere in the repository.
#
#   deploy/deploy.sh             upload the committed game and API as a new release and switch to it
#   deploy/deploy.sh --start     the same, and start the containers if they are not running yet
#                                (first go-live only)
#   deploy/deploy.sh --rollback  switch the game files and the API code back to the release before
#                                the current one. It does NOT roll the database back: see DEPLOY.md,
#                                "Rollback", for when a backup has to be restored by hand.
#   deploy/deploy.sh --backup    copy the leaderboard database now to ~/snake/backups on the droplet
#   deploy/deploy.sh --status    show what is live; changes nothing
#
# It only ever touches ~/snake on the droplet, the containers `snake` and `snake-api`, the volume
# `snake-api-data` and Snake's own network. Nothing of Tichu (/opt/tichu, its containers, its Caddy)
# or Unser Jahr (~/unser-jahr) is read or changed here. The whole picture is in DEPLOY.md.
set -euo pipefail

HOST="${SNAKE_HOST:-deploy@online-tichu.com}"
# This Mac trusts the droplet's key under its IP address, so ssh checks the key against that entry.
KEY_ALIAS="${SNAKE_HOST_KEY_ALIAS:-188.166.103.103}"
SITE="${SNAKE_SITE:-https://snake.online-tichu.com}"
KEEP=3          # releases kept on the droplet, the live one included (game and API each)
KEEP_BACKUPS=10 # database backups kept inside the volume

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o "HostKeyAlias=$KEY_ALIAS")
remote() { "${SSH[@]}" "$HOST" "$@"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="$ROOT/snake-shift"
MODE="${1:-deploy}"
# The API's image, as pinned in compose.yaml (also used once to give the data volume to user 1000).
API_IMAGE="$(awk '/^  snake-api:/ { f = 1 } f && /^    image:/ { print $2; exit }' "$ROOT/deploy/compose.yaml")"

status() {
  remote 'bash -s' <<'EOF'
cd ~/snake 2>/dev/null || { echo "~/snake does not exist yet"; exit 0; }
echo "live release: $(readlink www/current 2>/dev/null || echo none)"
echo "api release:  $(readlink api/current 2>/dev/null || echo none)"
echo "releases:     $(ls -1 www/releases 2>/dev/null | tr '\n' ' ')"
echo "container:    $(docker ps -a --filter name='^snake$' --format '{{.Status}}' | grep . || echo 'not created')"
echo "api:          $(docker ps -a --filter name='^snake-api$' --format '{{.Status}}' | grep . || echo 'not created')"
if docker ps --filter name='^snake$' --format x | grep -q x; then
  echo "on droplet:   http $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:8791/)"
  echo "api health:   $(curl -s -m 5 http://127.0.0.1:8791/api/health || echo 'no answer')"
fi
EOF
  echo "public:       $SITE -> http $(curl -s -o /dev/null -m 10 -w '%{http_code}' "$SITE/" || true)"
}

# Backs the database up inside the volume (/data/backups/<name>.sqlite) with SQLite's online
# backup, while the API keeps running. Only when the API runs and the database exists.
backup_db() {
  local name="$1"
  remote "NAME='$name' KEEP_BACKUPS='$KEEP_BACKUPS' bash -s" <<'EOF'
set -euo pipefail
if ! docker ps --filter name='^snake-api$' --format x | grep -q x; then
  echo "API not running: no backup taken"; exit 0
fi
if ! docker exec snake-api test -f /data/snake.sqlite; then
  echo "no database yet: no backup taken"; exit 0
fi
docker exec snake-api node /srv/api/current/server/backup.mjs "/data/backups/$NAME.sqlite"
docker exec snake-api sh -c "ls -1t /data/backups/*.sqlite | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --"
EOF
}

# Recreates snake-api on the code `api/current` points to and waits until it reports healthy.
restart_api() {
  remote 'bash -s' <<'EOF'
set -euo pipefail
cd ~/snake
docker compose up -d --force-recreate snake-api
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' snake-api 2>/dev/null || echo missing)"
  [ "$state" = healthy ] && { echo "snake-api is healthy"; exit 0; }
  sleep 2
done
echo "snake-api did not become healthy. Its last log lines:" >&2
docker logs --tail 20 snake-api >&2 || true
exit 1
EOF
}

case "$MODE" in
  --status)
    status
    exit 0
    ;;
  --backup)
    name="manual-$(date -u +%Y%m%d-%H%M%S)"
    backup_db "$name"
    remote "mkdir -p ~/snake/backups && docker cp snake-api:/data/backups/$name.sqlite ~/snake/backups/ && ls -l ~/snake/backups/$name.sqlite"
    exit 0
    ;;
  --rollback)
    remote 'bash -s' <<'EOF'
set -euo pipefail
back() { # $1: www or api
  cd ~/snake/"$1"
  [ -e current ] || { echo "$1: nothing deployed yet"; return 0; }
  now="$(readlink current)"; now="${now#releases/}"
  prev="$(ls -1 releases | grep -vx "$now" | sort | tail -1)"
  [ -n "$prev" ] || { echo "$1: no older release to go back to"; return 0; }
  ln -sfn "releases/$prev" current.new && mv -Tf current.new current
  echo "$1 switched back: $now -> $prev"
}
back www
back api
EOF
    if remote "test -e ~/snake/api/current"; then
      restart_api || {
        echo "The older API code does not start. Most likely the database has a newer schema than that" >&2
        echo "code knows (a migration came with the release you left). See DEPLOY.md, 'Rollback'." >&2
      }
    fi
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
[ -n "$API_IMAGE" ] || { echo "No snake-api image found in deploy/compose.yaml." >&2; exit 1; }
echo "==> Tests"
(cd "$GAME" && npm test >/dev/null) || { echo "Tests fail; nothing was uploaded." >&2; exit 1; }

REL="$(date -u +%Y%m%d-%H%M%S)-$(git -C "$ROOT" rev-parse --short HEAD)"
echo "==> Uploading release $REL"
remote "mkdir -p ~/snake/www/releases/$REL ~/snake/api/releases/$REL"
# The browser's files only: no tests, notes or development pages.
rsync -az --delete -e "${SSH[*]}" "$GAME/index.html" "$GAME/style.css" "$GAME/src" "$HOST:snake/www/releases/$REL/"
# The API: its own code, the shared rules in src/ (the server replays runs with the game's own
# simulation) and package.json (it marks the .js files as ES modules). Never the tests or .data/.
rsync -az --delete --exclude=/server/tests/ -e "${SSH[*]}" "$GAME/server" "$GAME/src" "$GAME/package.json" "$HOST:snake/api/releases/$REL/"

echo "==> Server files (compose.yaml, Caddyfile)"
# Written in place: the container mounts the Caddyfile as a single file and would keep the old
# content if the file were replaced. A change of either file needs the container made anew.
before="$(remote 'cat ~/snake/compose.yaml ~/snake/Caddyfile 2>/dev/null | sha256sum')"
remote 'cat > ~/snake/compose.yaml' <"$ROOT/deploy/compose.yaml"
remote 'cat > ~/snake/Caddyfile' <"$ROOT/deploy/Caddyfile"
after="$(remote 'cat ~/snake/compose.yaml ~/snake/Caddyfile | sha256sum')"

running="$(remote "docker ps --filter name='^snake\$' --format x")"

if [ -n "$running" ] || [ "$MODE" = "--start" ]; then
  echo "==> API: data volume"
  # A new named volume belongs to root; the API runs as user 1000. Idempotent, and only Snake's
  # own volume: a throwaway container of the API's image, no network.
  remote "docker volume create snake-api-data >/dev/null && docker run --rm --network none -v snake-api-data:/data '$API_IMAGE' sh -c 'mkdir -p /data/backups && chown -R 1000:1000 /data && chmod 700 /data'"
  echo "==> API: backup before the release"
  backup_db "before-$REL"
  echo "==> API: switching to $REL"
  remote "cd ~/snake/api && ln -sfn releases/$REL current.new && mv -Tf current.new current"
  # The new code migrates the database when it starts (forward only; the backup above is the way back).
  restart_api
else
  remote "cd ~/snake/api && ln -sfn releases/$REL current.new && mv -Tf current.new current"
fi

echo "==> Switching the game to $REL"
remote "cd ~/snake/www && ln -sfn releases/$REL current.new && mv -Tf current.new current"

if [ -n "$running" ] && [ "$before" != "$after" ]; then
  echo "==> Server files changed: making the snake container anew"
  remote 'cd ~/snake && docker compose up -d --force-recreate snake'
elif [ -z "$running" ] && [ "$MODE" = "--start" ]; then
  echo "==> Starting the snake container"
  remote 'cd ~/snake && docker compose up -d snake'
elif [ -z "$running" ]; then
  echo "The container is not running, so the files are uploaded but not served."
  echo "First go-live: deploy/deploy.sh --start (see DEPLOY.md)."
fi

echo "==> Removing old releases (keeping $KEEP of each)"
remote "cd ~/snake/www/releases && ls -1 | sort | head -n -$KEEP | grep -vx '$REL' | xargs -r rm -rf --"
remote "cd ~/snake/api/releases && ls -1 | sort | head -n -$KEEP | grep -vx '$REL' | xargs -r rm -rf --"

status
