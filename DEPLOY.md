# Deploying SNAKE//SHIFT

**State on 17 November 2026:** the game's files are on the droplet and tested there in private. The site is **not public yet**. One step is open and it is not Snake's to take: Tichu's Caddy needs an entry for `snake.online-tichu.com` (see [First go-live](#first-go-live)).

| | |
|---|---|
| Address | `https://snake.online-tichu.com` |
| Repository | `github.com/Grillmeister5415/snake` (private), branch `main` |
| Server | DigitalOcean droplet, `deploy@online-tichu.com` (188.166.103.103), Ubuntu 24.04 |
| Folder on the server | `~/snake` |
| Container | `snake` |
| DNS | `snake.online-tichu.com` points to the droplet (checked 17 November 2026) |

## Three projects share the droplet

| Project | Folder | Containers | Deployed by |
|---|---|---|---|
| Tichu | `/opt/tichu` | `tichu-local-*` (web, api, game, worker, postgres, redis, caddy) | Tichu's own release process |
| Unser Jahr | `~/unser-jahr` | `unser-jahr` | its own deploy script |
| Snake | `~/snake` | `snake` | `deploy/deploy.sh` in this repository |

The borders:

- **Snake touches only `~/snake` and the container `snake`.** `deploy/deploy.sh` reads and writes nothing else.
- **Never edit `/opt/tichu`, `~/unser-jahr`, their containers or their volumes from a Snake task.**
- **Caddy is Tichu's.** It is the only program on ports 80 and 443 and it holds every certificate. Its configuration is `/opt/tichu/infra/Caddyfile`, a file in Tichu's git repository. A change to it goes through Tichu's repository and Tichu's release process, never as an edit on the server (Tichu decision 0103, the owner's rule of 14 November 2026). Tichu's release checks expect `/opt/tichu` to match the released commit, so an edit on the server would block Tichu's next release.
- **One thing is shared: the Docker network `caddy-edge`.** Tichu's Caddy reaches the other projects through it. Both projects declare it external; nobody's compose file creates or removes it. Names on it are shared, so the Snake container must stay named `snake` and must never get an alias such as `web` or `game` (Tichu's Caddy looks those up).

## How a request reaches the game

```text
browser
  └─ https ─▶ Caddy (Tichu's; certificate for snake.online-tichu.com)
                └─ caddy-edge ─▶ snake:8080 (Snake's container, a plain file server)
                                   └─ ~/snake/www/current ─▶ www/releases/<time>-<commit>/
```

The Snake container serves files and nothing else: no database, no accounts, no outgoing requests. It sets its own headers (in `deploy/Caddyfile`), the same way Unser Jahr does, so Tichu's entry only has to pass requests on:

- `Cache-Control: no-cache`: the browser asks each time whether a file changed, so players never run old code after a deploy.
- A content policy that allows only the game's own files.
- `Strict-Transport-Security` for six months, for this host only.

## What is on the droplet

```text
~/snake/
  compose.yaml        copy of deploy/compose.yaml
  Caddyfile           copy of deploy/Caddyfile (Snake's own, inside the container)
  www/
    current           link to the release in use
    releases/
      20261117-083534-ceccd0b/    index.html, style.css, src/
```

Only `index.html`, `style.css` and `src/` are uploaded. Tests, notes and the development pages stay in the repository.

## Day to day

Run on the Mac, from the repository:

```bash
deploy/deploy.sh
```

It refuses to run with uncommitted changes, runs the tests, uploads a new release, switches the `current` link to it in one step and keeps the last three releases. Players get the new version on their next page load. The container is not restarted for a file change.

```bash
deploy/deploy.sh --status
```

Shows the live release, the container's state and what the public address answers. Changes nothing.

```bash
deploy/deploy.sh --rollback
```

Switches back to the release before the current one.

## First go-live

| Step | Whose | State |
|---|---|---|
| DNS record for `snake.online-tichu.com` | owner | done |
| Upload the files, test them on the droplet in private | Snake | done, 17 November 2026 |
| Caddy entry for the host, and a Tichu decision that lets `snake` join `caddy-edge` | **Tichu** | **open**, see [deploy/TICHU_CADDY_REQUEST.md](deploy/TICHU_CADDY_REQUEST.md) |
| Start the container: `deploy/deploy.sh --start` | Snake | open, only after the step above is approved |
| Checks below | Snake | open |

The container is deliberately not running yet. Tichu's runbook says `caddy-edge` holds Caddy and `unser-jahr` and nothing else, and its release check lists the members. Joining before Tichu's documents allow it would break that check.

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

## Taking it down

- **Stop serving:** on the droplet, `cd ~/snake && docker compose down`. The address then answers `502`; Tichu and Unser Jahr are not affected.
- **Remove the address:** delete the `snake.online-tichu.com` block from Tichu's Caddyfile, through Tichu's release process.
- **Remove everything:** after the two steps above, `rm -rf ~/snake`.

## Tested on 17 November 2026

A throwaway container on the droplet, with the same image and settings as `compose.yaml` but on Docker's default network (not `caddy-edge`), answering on `127.0.0.1:8791` only:

- The page and its modules answer `200`, compressed, with all headers above.
- Hidden files, missing files and paths outside the release answer `404`.
- Through an SSH tunnel, the game ran 60 seconds on autopilot in a browser: 13 universes, 3D included, no blocked request and no error.
- The container used 13 MB of memory.

Not tested: the public address, the certificate, and the path through Tichu's Caddy. Those exist only after go-live.

## Good to know

- **SSH from this Mac:** the droplet's key is trusted under its IP address, not under the name. `deploy.sh` therefore passes `HostKeyAlias=188.166.103.103`. If the droplet's address ever changes, set `SNAKE_HOST_KEY_ALIAS`.
- **One capability is kept.** The container drops every Linux capability except "may bind low ports". The image's `caddy` binary is marked with it, and the kernel refuses to start the binary when it is missing from the allowed set. Snake listens on 8080 and never uses it.
- **`?debug` works on the live site** (hold a universe, autopilot). It changes only what that visitor sees.
- **Logs:** `docker logs snake` on the droplet (at most 15 MB). Who visited is in Tichu's Caddy logs, which are Tichu's.
- **The container can reach the other members of `caddy-edge`** (Caddy and `unser-jahr`), as every member of a Docker network can. It runs no code that makes requests.
