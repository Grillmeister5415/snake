# Note to the Tichu project: Snake gets a leaderboard

Written on 17 November 2026 from the Snake project. For information only: **nothing is asked of Tichu.** No change to Tichu's Caddyfile, its compose files, its containers or `caddy-edge`.

## What changes on Snake's side

SNAKE//SHIFT (`~/snake`, its own compose project) gets a small leaderboard, HALL OF SHIFTERS:

- **A second container, `snake-api`.** Node (`node:26.13.1-alpine`, no npm packages) with an SQLite database. It runs as user 1000, read-only, with every capability dropped, at most 160 MB of memory, half a CPU and 64 processes.
- **A volume, `snake-api-data`,** for the database. Snake's own; it lives outside every release.
- **A private network, `snake-internal`** (Docker names it `snake_snake-internal`). It holds `snake` and `snake-api` only and is `internal`, so it has no route out.
- **Small JSON request bodies.** The game now sends `POST` and `PATCH` requests to `/api/*` on its own host: a username, a request for run tickets, and a finished run's replay (at most 512 KiB; Snake's Caddy refuses bodies over 600 KB). Before this the game sent no bodies at all, as the original request said.

## What stays the same for Tichu

- **Tichu's entry for `snake.online-tichu.com` stays byte-identical:** `reverse_proxy snake:8080`. Snake's own Caddy, inside `snake`, passes `/api/*` on to `snake-api`.
- **`caddy-edge` keeps its three members:** Tichu's Caddy, `unser-jahr` and `snake`. `snake-api` never joins it, publishes no port, and cannot be reached from Tichu's containers, nor reach them.
- **Names:** `snake` keeps its name and has no alias. `snake-api` exists only on Snake's private network.
- **Headers:** Snake still sends its own (content policy, six-month HSTS for this host only, `no-cache` for files). API answers add `Cache-Control: no-store`.
- **Addresses:** Snake's Caddy now reads `X-Forwarded-For` from private addresses (Tichu's Caddy on `caddy-edge`) so its rate limits see visitors rather than one proxy. Nothing is asked of Tichu's Caddy for this: it already sets the header. Snake does not store or log addresses.
- **Snake down:** if `snake-api` stops, only `snake.online-tichu.com/api/*` answers `502`; the game keeps running and keeps its scores locally until the API is back.

## If Tichu wants a limit at the edge

Optional, Tichu's choice: a `request_body` limit of 1 MB in Tichu's block for the host would sit comfortably above Snake's 600 KB.

## Contact points

The whole picture is `DEPLOY.md` in the Snake repository ("The leaderboard API" and the sections after it). Snake's deploy script still reads and writes only `~/snake`, Snake's containers, its volume and its own network.
