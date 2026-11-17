# Deploying SNAKE//SHIFT

**State on 17 November 2026:** live at `https://snake.online-tichu.com` since 08:50 UTC. Tichu's Caddy passes the address on to Snake's container (Tichu task T407, decision 0104, [pull request 160](https://github.com/Grillmeister5415/tichu/pull/160), released as Tichu's release 46).

**Leaderboard (HALL OF SHIFTERS):** prepared in this repository, not deployed. It adds a second container, `snake-api`, and a database volume (sections "The leaderboard API" to "Administration" below). The next `deploy/deploy.sh` after it is committed starts it; read "First deploy with the leaderboard" before that.

| | |
|---|---|
| Address | `https://snake.online-tichu.com` (`www.snake.online-tichu.com` redirects to it) |
| Repository | `github.com/Grillmeister5415/snake` (private), branch `main` |
| Server | DigitalOcean droplet, `deploy@online-tichu.com` (188.166.103.103), Ubuntu 24.04 |
| Folder on the server | `~/snake` |
| Containers | `snake` (files, and the door to the API), `snake-api` (leaderboard, not deployed yet) |
| DNS | `snake.online-tichu.com` points to the droplet; `www.snake` is an alias of it (both checked 17 November 2026) |

## Three projects share the droplet

| Project | Folder | Containers | Deployed by |
|---|---|---|---|
| Tichu | `/opt/tichu` | `tichu-local-*` (web, api, game, worker, postgres, redis, caddy) | Tichu's own release process |
| Unser Jahr | `~/unser-jahr` | `unser-jahr` | its own deploy script |
| Snake | `~/snake` | `snake`, `snake-api` | `deploy/deploy.sh` in this repository |

The borders:

- **Snake touches only `~/snake`, its containers `snake` and `snake-api`, its volume `snake-api-data` and its own network `snake_snake-internal`.** `deploy/deploy.sh` reads and writes nothing else.
- **Never edit `/opt/tichu`, `~/unser-jahr`, their containers or their volumes from a Snake task.**
- **Caddy is Tichu's.** It is the only program on ports 80 and 443 and it holds every certificate. Its configuration is `/opt/tichu/infra/Caddyfile`, a file in Tichu's git repository. A change to it goes through Tichu's repository and Tichu's release process, never as an edit on the server (Tichu decision 0103, the owner's rule of 14 November 2026). Tichu's release checks expect `/opt/tichu` to match the released commit, so an edit on the server would block Tichu's next release.
- **One thing is shared: the Docker network `caddy-edge`.** Tichu's Caddy reaches the other projects through it. Both projects declare it external; nobody's compose file creates or removes it. Names on it are shared, so the Snake container must stay named `snake` and must never get an alias such as `web` or `game` (Tichu's Caddy looks those up).

## How a request reaches the game

```text
browser
  └─ https ─▶ Caddy (Tichu's; certificate for snake.online-tichu.com)
                └─ caddy-edge ─▶ snake:8080 (Snake's Caddy)
                                   ├─ /api/* ─ snake-internal ─▶ snake-api:8090 (Node, SQLite)
                                   │                               ├─ code: ~/snake/api/current ─▶ api/releases/<time>-<commit>/
                                   │                               └─ data: volume snake-api-data (/data/snake.sqlite)
                                   └─ everything else: ~/snake/www/current ─▶ www/releases/<time>-<commit>/
```

Tichu's entry is unchanged: it passes everything for the host to `snake:8080`. The Snake container serves the files and passes `/api/*` on to `snake-api` over Snake's own network `snake-internal`. That network is `internal` (no way out to the internet) and holds only these two containers. `snake-api` is not on `caddy-edge`, publishes no port and makes no outgoing requests. Snake's Caddy sets the headers (in `deploy/Caddyfile`), the same way Unser Jahr does, so Tichu's entry only has to pass requests on:

- `Cache-Control: no-cache` on the files: the browser asks each time whether a file changed, so players never run old code after a deploy. The API's answers keep their own `no-store` (`private, no-store` for the boards, which hold the visitor's own row).
- A content policy that allows only the game's own files and same-origin requests. It stays as it was: the username form never navigates (`form-action 'none'` holds) and `fetch` to the same origin is allowed by `default-src 'self'`.
- `Strict-Transport-Security` for six months, for this host only.
- At most 600 KB per request body on `/api/*` (a replay is at most 512 KiB; the API checks the exact limits).
- Snake's Caddy trusts `X-Forwarded-For` from private addresses only (Tichu's Caddy on `caddy-edge`), so the API's per-address rate limits see visitors, not one proxy. The API reads that header the same way, from the right, and never stores or logs an address.

## The `www.` address

`https://www.snake.online-tichu.com` answers with a permanent redirect to `https://snake.online-tichu.com`, path and query kept. Tichu's Caddy does this by itself (Tichu task T408, [pull request 162](https://github.com/Grillmeister5415/tichu/pull/162), Tichu's release 47 on 17 November 2026); Snake's container is not involved, and nothing in this repository changes for it. The same release gave Unser Jahr's address a `www.` form too. The DNS record for `www.snake` is the owner's, at the registrar.

## What is on the droplet

```text
~/snake/
  compose.yaml        copy of deploy/compose.yaml
  Caddyfile           copy of deploy/Caddyfile (Snake's own, inside the container)
  www/
    current           link to the release in use
    releases/
      20261117-083534-ceccd0b/    index.html, style.css, src/
  api/                (with the leaderboard)
    current           link to the API release in use
    releases/
      <time>-<commit>/            server/ (without its tests), src/, package.json
  backups/            copies taken with deploy.sh --backup
docker volume snake-api-data      /data/snake.sqlite, /data/backups/ (inside snake-api)
```

For the game only `index.html`, `style.css` and `src/` are uploaded. For the API, `server/` without its tests, `src/` (the server replays runs with the game's own simulation) and `package.json` (it marks the `.js` files as modules). Tests, notes, the development pages and the development database (`snake-shift/.data/`) stay on the Mac.

## Day to day

Run on the Mac, from the repository:

```bash
deploy/deploy.sh
```

It refuses to run with uncommitted changes, runs the tests (the game's and the server's), uploads a new release of the game and of the API, and keeps the last three of each. For the API it then backs the database up (`/data/backups/before-<release>.sqlite`, the last ten are kept), switches `api/current`, recreates `snake-api` and waits until it reports healthy; the new code applies any new migration when it starts. Then it switches the game's `current` link in one step. Players get the new version on their next page load. The `snake` container is made anew only when `compose.yaml` or `Caddyfile` changed; while `snake-api` restarts (a few seconds), `/api/*` answers `502` and the game keeps running locally and sends its scores later.

```bash
deploy/deploy.sh --status
```

Shows the live release, the container's state and what the public address answers. Changes nothing.

```bash
deploy/deploy.sh --rollback
```

Switches the game's files and the API's code back to the release before the current one and recreates `snake-api`. See "Rollback" below for what it does not undo.

```bash
deploy/deploy.sh --backup
```

Backs the leaderboard database up now and copies it to `~/snake/backups/` on the droplet.

## First go-live

| Step | Whose | State |
|---|---|---|
| DNS record for `snake.online-tichu.com` | owner | done |
| Upload the files, test them on the droplet in private | Snake | done, 17 November 2026 |
| Caddy entry for the host, and a Tichu decision that lets `snake` join `caddy-edge` | **Tichu** | done, 17 November 2026: [tichu#160](https://github.com/Grillmeister5415/tichu/pull/160) (T407, decision 0104), merged and released on the owner's yes as Tichu's release 46. Only Tichu's Caddy was recreated (about 6 to 9 seconds offline, nobody playing). Background: [deploy/TICHU_CADDY_REQUEST.md](deploy/TICHU_CADDY_REQUEST.md) |
| Start the container: `deploy/deploy.sh --start` | Snake | done, 17 November 2026, 08:50 UTC |
| Checks below | Snake | done, all passed |

The container was started only after Tichu's decision 0104 was merged. Before that, Tichu's runbook said `caddy-edge` holds Caddy and `unser-jahr` and nothing else, and joining earlier would have broken that rule. Since decision 0104 the network may hold three members: Caddy, `unser-jahr` and `snake`. A fourth needs a new Tichu decision.

## Checks after go-live

```bash
curl -sI https://snake.online-tichu.com/
```

Expect `200` with a `content-security-policy` header. A `502` means Caddy is fine but the `snake` container is not answering.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.online-tichu.com/
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://reflect.online-tichu.com/
```

Both must still answer as before (Tichu `200`, Unser Jahr `200`).

## The leaderboard API

`snake-api` runs `node /srv/api/current/server/server.mjs` in the pinned image `node:26.13.1-alpine` (Node's long-term support line on 17 November 2026; `node:sqlite` is a release candidate there). No npm packages. It runs as user 1000 on a read-only file system with every capability dropped, at most 160 MB of memory, half a CPU and 64 processes, and is checked every 30 seconds on `/api/health`. Settings come from `compose.yaml`: `SNAKE_DB=/data/snake.sqlite`, `SNAKE_PORT=8090`, `SNAKE_ORIGIN=https://snake.online-tichu.com` (the CSRF check compares the browser's `Origin` with it).

What it keeps: a random player ID and a handle per player, the SHA-256 of each session cookie (never the cookie itself), run tickets, and for every submitted run the ruleset, seed, the server's own score, end tick, reason, universe and the time it first arrived. No e-mail, real name, location, address, chat or contacts. Replays are kept for 30 days, or longer while they are a player's best of all time or of this week; tickets and sessions are deleted once expired. All of this happens by itself, hourly.

What it proves: the server plays every ranked run again with the seed it handed out, on the same rules, and stores only the score it computed itself. A made-up score or a changed replay is refused. It does not stop a program that plays the game and sends real turns; nothing here claims to.

Limits: request bodies (600 KB at Snake's Caddy, 512 KiB of replay at the API), 100 000 ticks and 60 000 turns per replay, two replays checked at a time with 16 waiting (more get `503 busy`, which the game treats as "try later"), and rate limits per session and per address. The details and the API itself are in `snake-shift/README.md`, "Leaderboard API".

## First deploy with the leaderboard

The first `deploy/deploy.sh` after the leaderboard is committed does, in this order:

1. Downloads the image `node:26.13.1-alpine` (new on the droplet).
2. Creates the volume `snake-api-data` and hands it to user 1000, with a throwaway container of that image and no network.
3. Uploads the API release, switches `api/current`, starts `snake-api` (which creates the database) and waits until it is healthy.
4. Makes the `snake` container anew, because `compose.yaml` and `Caddyfile` changed: it joins `snake-internal` and starts passing `/api/*` on. Snake answers `502` for a few seconds; Tichu and Unser Jahr are not affected.

Nothing changes on `caddy-edge` (still Caddy, `unser-jahr` and `snake`) or in Tichu's Caddy. The note for the Tichu project is [deploy/TICHU_NOTE_LEADERBOARD.md](deploy/TICHU_NOTE_LEADERBOARD.md).

Checks afterwards:

```bash
curl -s https://snake.online-tichu.com/api/health
```

Expect `{"ok":true,"ruleset":"1"}`. A `502` means `snake-api` is not answering (`docker logs snake-api` on the droplet).

```bash
curl -sI 'https://snake.online-tichu.com/api/leaderboard?period=week' | grep -i cache-control
```

Expect `private, no-store`. The game's files still answer `no-cache`.

## Backup and restore

`deploy.sh` backs the database up before every API release, inside the volume: `/data/backups/before-<release>.sqlite`, the last ten kept. `deploy/deploy.sh --backup` makes one at any time and copies it to `~/snake/backups/` on the droplet. Both use SQLite's online backup (`server/backup.mjs`), which is safe while the API runs, and check the copy before calling it a backup. Copy one off the droplet now and then; a backup inside the volume does not survive the loss of the volume.

To restore a backup, on the droplet:

```bash
cd ~/snake
docker compose stop snake-api
docker run --rm --network none -v snake-api-data:/data node:26.13.1-alpine sh -c \
  'cp /data/backups/<file>.sqlite /data/snake.sqlite && rm -f /data/snake.sqlite-wal /data/snake.sqlite-shm && chown 1000:1000 /data/snake.sqlite'
docker compose up -d snake-api
```

Everything that arrived after the backup is lost: runs, players, renames.

## Rollback

`deploy/deploy.sh --rollback` switches the game's files and the API's code back. It does not touch the database:

- **Without a new migration in between** (the normal case) the older code works on the same database, and nothing is lost.
- **With a migration in between** the database is newer than the older code knows, and that code refuses to start ("newer than this code knows") instead of writing into a schema it does not understand. `/api/*` then answers `502`, and the game keeps running locally. Either deploy forward again, or restore `before-<release>.sqlite` of the release you left (see "Backup and restore"; runs since then are lost) and then roll back.

Migrations only ever move forward (`server/migrations/`, numbered, each applied once in a transaction). A file rollback is not a database rollback.

A browser that still has the old page open keeps its tickets. When the rules change, `RULESET` (in `src/ruleset.js`) is raised: the server then ranks only the new rules, asks an old page to reload (`409 ruleset_mismatch` on new tickets) and answers an old page's finished runs with `410 ruleset_retired`; the game keeps those runs local.

## Administration

No admin web page. On the droplet, while the API runs:

```bash
docker exec snake-api node /srv/api/current/server/admin.mjs list
docker exec snake-api node /srv/api/current/server/admin.mjs rename <id> <handle>
docker exec snake-api node /srv/api/current/server/admin.mjs hide <id>
docker exec snake-api node /srv/api/current/server/admin.mjs unhide <id>
```

`rename` follows the same rules and blocklist as the form (`server/blocklist.js`, short on purpose). `hide` takes a player off every board without deleting anything; `unhide` brings them back with their scores.

## Taking it down

- **Stop serving:** on the droplet, `cd ~/snake && docker compose down`. The address then answers `502`; Tichu and Unser Jahr are not affected. The database stays in its volume (it is external, so not even `docker compose down -v` removes it).
- **Remove the leaderboard data:** only on purpose, after a backup: `docker volume rm snake-api-data`.
- **Remove the address:** delete the `snake.online-tichu.com` and `www.snake.online-tichu.com` blocks from Tichu's Caddyfile, through Tichu's release process, and remove the DNS records.
- **Remove everything:** after the two steps above, `rm -rf ~/snake`.

## Tested on 17 November 2026

A throwaway container on the droplet, with the same image and settings as `compose.yaml` but on Docker's default network (not `caddy-edge`), answering on `127.0.0.1:8791` only:

- The page and its modules answer `200`, compressed, with all headers above.
- Hidden files, missing files and paths outside the release answer `404`.
- Through an SSH tunnel, the game ran 60 seconds on autopilot in a browser: 13 universes, 3D included, no blocked request and no error.
- The container used 13 MB of memory.

After go-live the same day, from outside the droplet:

- `https://snake.online-tichu.com/` answers `200` over HTTP/2 with all headers above; plain http redirects to https. The certificate is Let's Encrypt's, valid to 15 February 2027; Tichu's Caddy renews it by itself.
- In a browser the game ran 45 seconds on autopilot from the public address: 14 universes, 3D included, no blocked request and no error.
- Tichu (`www`, the bare domain's redirect, `/intro`, `/health/live`) and Unser Jahr (`reflect`) answer as before.
- `caddy-edge` holds exactly `snake`, `unser-jahr` and Tichu's Caddy. From inside `snake`, none of Tichu's containers can be found by name.

Not tested: play by hand on the public address, and sound there.

The leaderboard's deployment files were checked on the Mac only (17 November 2026): `docker compose -f deploy/compose.yaml config` renders them, and `caddy validate` with the pinned `caddy:2.11.7-alpine` image accepts the Caddyfile. The API's own entry (`server/server.mjs`) ran on the Mac with production settings. Nothing of the leaderboard has run on the droplet or in its containers yet.

## Good to know

- **SSH from this Mac:** the droplet's key is trusted under its IP address, not under the name. `deploy.sh` therefore passes `HostKeyAlias=188.166.103.103`. If the droplet's address ever changes, set `SNAKE_HOST_KEY_ALIAS`.
- **One capability is kept.** The container drops every Linux capability except "may bind low ports". The image's `caddy` binary is marked with it, and the kernel refuses to start the binary when it is missing from the allowed set. Snake listens on 8080 and never uses it.
- **`?debug` works on the live site** (hold a universe, autopilot). It changes only what that visitor sees.
- **Logs:** `docker logs snake` on the droplet (at most 15 MB). Who visited is in Tichu's Caddy logs, which are Tichu's.
- **The container can reach the other members of `caddy-edge`** (Caddy and `unser-jahr`), as every member of a Docker network can. It runs no code that makes requests.
- **`snake-api` can reach only `snake`.** It is on `snake-internal` alone, which has no route out; Tichu's containers and `unser-jahr` cannot see it and it cannot see them.
- **API logs:** `docker logs snake-api` (at most 15 MB): one line per request with method, path, status and time. No addresses, no cookies.
