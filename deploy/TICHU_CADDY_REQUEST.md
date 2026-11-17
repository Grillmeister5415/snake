# Request to the Tichu project: serve `snake.online-tichu.com`

Written on 17 November 2026 from the Snake project. Nothing in Tichu has been changed. This is everything Snake needs from Tichu, to be done as a Tichu task through Tichu's own repository and release process.

## What Snake is

SNAKE//SHIFT is a browser game, a separate project of the same owner (repository `Grillmeister5415/snake`). On the droplet it lives in `~/snake` as its own compose project with one container, `snake`. That container is a plain file server (image `caddy:2.11.7-alpine`, the one already on the droplet) listening on port 8080. It has no database, no accounts and accepts no uploads. It runs read-only, as user 1000, with a 96 MB memory limit. `127.0.0.1:8791` answers on the droplet for checks.

DNS for `snake.online-tichu.com` already points to the droplet (188.166.103.103, checked 17 November 2026).

## The two changes asked for

**1. One site block in `infra/Caddyfile`, proxy only.** Every existing block stays byte-identical.

```caddyfile
# SNAKE//SHIFT: a separate project of Fabian's (~/snake on the droplet, its own compose project).
# Reached through the network caddy-edge. The container sets its own headers (CSP, six-month HSTS,
# no-cache), so this block only proxies. The name is resolved per request: if Snake is down, only
# this host answers 502, and the sites above are not affected.
snake.online-tichu.com {
	reverse_proxy snake:8080
}
```

**2. A decision that lets a third container join `caddy-edge`.** Decision 0103 and the production runbook ("Second site") say the network holds only Caddy and `unser-jahr`, and the runbook's check expects exactly those two members. Snake's container has to join it to be reachable. The decision and that runbook check need to name `snake` as an allowed member.

No change to `infra/compose.prod.yml` is needed: Caddy is already on `caddy-edge`.

## Facts for Tichu's review

- **Names.** The container is named `snake` and has no network alias. It cannot be mistaken for `web` or `game`.
- **Reach.** On `caddy-edge` the Snake container can reach Caddy and `unser-jahr`, as any member can. It still cannot reach postgres, redis, api, worker, web or game, which are not on that network.
- **Headers.** Snake sends its own: `Content-Security-Policy` (own files only), `Strict-Transport-Security: max-age=15552000` (this host only, no `includeSubDomains`), `Cache-Control: no-cache`, `X-Content-Type-Options`, `Referrer-Policy`. Nothing needs to be added in Tichu's block.
- **Request bodies.** The game sends none. Tichu may add a small `request_body` limit to the block if it wants one at the edge.
- **Snake down.** Caddy validates and starts without the container; only this host answers 502.
- **Certificate.** Caddy obtains one for the new host when it first loads the entry.
- **Release kind.** No network is joined, so Tichu's runbook ("Later changes to the entry") suggests a Caddyfile change with validate and reload rather than a Caddy recreate. Mind the single-file bind mount described there. Which way to release it is Tichu's decision.
- **Order.** Snake starts its container (`deploy/deploy.sh --start` in the Snake repository) only after this decision is approved. Until then the container is not on `caddy-edge`.

## Checks after Tichu's release

- `curl -sI https://snake.online-tichu.com/` answers `200` with a `content-security-policy` header once Snake's container runs, and `502` before that.
- `https://www.online-tichu.com/`, `https://online-tichu.com`, `/intro` and `https://reflect.online-tichu.com/` answer as before.
- `docker network inspect caddy-edge --format '{{range .Containers}}{{.Name}} {{end}}'` lists `unser-jahr`, `tichu-local-caddy-1` and, once started, `snake`.

## Rollback

Remove the block again and release that. Snake's container can keep running; without the entry nothing reaches it.

## What Snake promises

Snake's deploy script reads and writes only `~/snake` and the container `snake`. It never edits `/opt/tichu`, Tichu's containers or volumes, or `~/unser-jahr`. The full description is `DEPLOY.md` in the Snake repository.
