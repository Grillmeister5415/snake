# SNAKE//SHIFT

Snake where every dot eaten snaps the game to another universe: sixteen of them, shown as flat 2D
boards, real WebGL rooms, and now and then a first-person view. The game picks the universe and its
look at random; the player never chooses. Three rare special universes change the rules and are held
for four to six bites, cutting between their 2D and 3D look on each bite; about one shift in ten
goes to one of them (`SPECIAL.weight` in `src/rules-config.js`).
Plain ES modules, no dependencies, no build step, everything generated in code (~285 KB gzipped,
~225 KB with brotli; 943 KB raw).

## Run

`npm start` (or `node serve.mjs`), then open <http://localhost:4321/>. Add `--lan` to reach it from a
phone on the same network. Any static server works, but this one sends no-cache headers, so a reload
always shows the latest code. It also answers the leaderboard API (`/api/*`) from the same process,
with a development database in `.data/dev.sqlite` (not in git; `SNAKE_DB=<file>` picks another).
`node serve.mjs --no-api` serves the files only, as before, to try the offline paths.
Tests: `npm test` (Node 22.16 or newer: the server uses `node:sqlite`, which Node 22 still calls
experimental and warns about once; the live container runs Node 26).

## Controls

- Arrows or WASD steer (by key position). The first direction starts the run, and after a lost life the first direction resumes it.
- In the first-person view, left and right turn relative to where the snake is heading; up and down do nothing there.
- Swipe on the stage (22 px, chain turns in one drag). Optional on-screen arrows: settings > **Touch buttons**.
- P or Escape pauses (and opens settings), M mutes, Enter or Space confirms.
- While a menu is open (USERNAME, the leaderboard) or a text field has focus, no key reaches the game:
  Escape goes back, and arrows, Page Up/Down and Home/End scroll the list.

## Lives

Every run starts with 3 lives, at most 5, shown as five slots beside the score in the current
universe's own icon. A collision costs one: the snake respawns short at a safe spot in board view
with score and universe intact, and breathes gently while it waits for a direction. Zero lives ends the run. In Mushroom Land
a mushroom (beside the dot, gone after 80 steps) is food and adds a life.

## Music

One procedural track that never stops (Web Audio, no files). The snake's speed sets the tempo (118 to
138 BPM) and how full the arrangement is; every universe plays one shared motif in its own voice from
its first bar. A tight spot on the board tightens the music (faster hats, thinner melody) and lets go
when it clears; the tempo never jumps. A bite in the same universe is a small accent, a change swaps
the kit on the same bar position, and a few brightness swings or milestones get a vacuum and an impact.
3310 Ghost is only clicks, Abyssal Cathedral plays half-time. A lost life tape-stops and muffles the mix
until you move; the last life adds a quiet heartbeat. *Calmer sound* keeps the music and drops the
tension effects. Mute with M; nothing sounds before the first click. Details: `notes/audio.md`;
test bench `dev/audio.html`, before and after `dev/audio-compare.html`.

## Universes

| id | Look | Rules |
|---|---|---|
| `lcd` (opening), `arcade`, `acid`, `kombat`, `desktop`, `timewarp`, `wrong` | 2D | box |
| `court`, `bunker`, `disco`, `plastic` | room, first person | box |
| `hangar`, `abyss` | 2D, room, first person | box |
| `mushroom` | 2D, room, first person | box + mushrooms, held |
| `lane` | 2D, room, first person | endless lane (no end wall), held |
| `castle` | 2D, room | cube (six faces, seams connect), held |

A universe is `src/render/timelines/<id>.js` (2D) and/or `src/render/gl/rooms/<id>.js` (room); whatever
loads is used. 3310 Ghost and Abyssal Cathedral are calm: no inversion, strobe or glitch while they show.

## The switches

The title shows a photosensitivity warning on every load. Wild by default: strobes, inversions, violent cuts.

- **Reduced flash**: no strobes or inversions; every shift still happens on time (it can change the rules) but as a 450 ms veiled fade, and when shifts come less than 3.5 s apart the veil stays partly up between them. Beat pulse capped at 15%.
- **Reduced motion**: scenery at 15% speed, no camera glides, no first-person view. Defaults to the system setting.
- **Calmer sound**: no vacuum transitions, a third of the music's tension response, no anticipation noise or nerve voice on the last life. The music stays. Either switch above also gives the calmer sound.

All three are on the title and in settings, and are saved locally.

## Debug URL switches

| Switch | Effect |
|---|---|
| `?debug` | `window.__ss`: sim, director, `run(ms)` synthetic clock, `drive({ swipe, target })`, `lock(id)`, `look(l)`, `seenLooks()`, cut and event logs |
| `?auto` | autopilot plays, resumes after a lost life and restarts on its own |
| `?debug&universe=hangar&lock` | hold one universe (every bite then flips its look); `?scene=` still works as an alias |
| `?debug&look=2d\|3d\|pov` | hold a look wherever the universe has it |
| `?debug&score=20` | start runs at that food total |
| `?debug&lives=5` | starting lives (1 to 5) |
| `?seed=abc` | fixed run |
| `?nogl` | no WebGL: the four built rooms are drawn in 2D perspective, new universes in 2D, no first person |
| `?start=150&ramp=1.5&cap=95` | speed: ms per step at start, ms faster per dot, fastest ms |

The universe, look, score and lives switches work only together with `?debug`, so a player cannot use them to choose.
Every switch above except `?nogl` makes a run **practice**, by its mere presence in the address
(`?seed=` counts, `?start=abc` counts): never ranked, and it keeps its own local best instead of BEST.
`?auto` also skips the USERNAME step and makes no network request at all.
`dev/finish.js` holds the whole-game browser checks: load `?debug&auto`, then
`const F = await import('/dev/finish.js'); F.hook(); F.sweep()` (also `flow`, `frames`, `space`, `crash`, `offBoard`, `audioOrder`).

## HALL OF SHIFTERS in the page

The first PLAY asks for a USERNAME once (a suggestion, a shuffle, the rule beside the field;
`[ LET ME IN ]` or SKIP). The name is kept on this browser; the server knows the player by an
anonymous session cookie, created in the background. Skipping plays local runs only; "Set
username" stays on the title, in the pause menu and on the board. `[ LEADERBOARD ]` is on the title,
in the pause menu and on game over; `[ MENU ]` on game over goes back to the title.

A run is ranked when it starts with no practice switch, the canonical rules (`src/ruleset.js`), a
username with a server player and a run ticket on hand (fetched ahead, a few at a time, while a menu
is open). Otherwise it is a local run and game over says why. Nothing in PLAY, AGAIN or the death
delay waits for the network: a finished run goes to an outbox that sends it in the background, one at
a time, with backoff when offline, and game over shows "Saving…", "Saved" (with the rank the server
confirmed), "Waiting to sync" or "Local run". A score of 0 is never sent. The first run right after
choosing a name is local: its ticket arrives a moment later.

Kept in `localStorage` (memory only when the browser blocks it; then nothing is promised):
`snake-shift/identity/v1` (name, player ID, skip), `snake-shift/tickets/v1` (unused tickets),
`snake-shift/outbox/v1` (finished runs not yet acknowledged, at most 20 and 2 MiB),
`snake-shift/board/v1` (the last board seen per tab, shown offline as "Offline — showing saved scores"),
and, as before, `snake-shift/v1` (switches and the two local bests).

Modules: `api.js` (fetch wrapper, error kinds), `identity.js`, `tickets.js`, `outbox.js`, `ranked.js`
(a run's eligibility and status), `nav.js` (menu overlays and the one key router), `board.js`,
`username.js`, `store.js` (storage with a memory fallback). `main.js` only wires them.
For a board with ten-plus rows in development: `node dev/seed-board.mjs http://localhost:4321`
plays twelve fixture players through the real API (development servers only; takes a minute or two).

## Leaderboard API (HALL OF SHIFTERS)

A small same-origin API in `server/` keeps players, run tickets and scores in SQLite. Node only:
`node:http` and `node:sqlite`, no npm packages. The game itself still has no dependencies. Plan and
reasons: `LEADERBOARD_PLAN.md` in the repository root; deployment: `DEPLOY.md`.

**What it proves and what it does not.** The browser records a ranked run's turns (`src/replay.js`)
and the server plays them again on the same rules with a seed it chose itself, so a made-up score,
a changed replay or a replay for another seed is refused. A run also cannot arrive sooner than the
snake could have moved. It does not stop a program that plays the game and sends real turns: that
is a legal run as far as the server can tell. There is no fingerprinting and no captcha.

Every answer is JSON with `Cache-Control: no-store` (`private, no-store` for the boards). Errors are
`{ error, message, ...details }`. Mutations (`POST`, `PATCH`) need `Content-Type: application/json`,
the header `X-Snake: 1` and a same-origin `Origin` or `Sec-Fetch-Site`. The session is a cookie,
`__Host-ss` (Secure, HttpOnly, SameSite=Strict) on the live site and `ss_dev` without Secure in
development. Times are ISO strings from the server's clock.

| Route | Body | Answer |
|---|---|---|
| `GET /api/health` | | `{ ok, ruleset }` |
| `POST /api/player` | `{ handle }` | `201 { id, handle, created: true }` and the cookie; with a valid session `200 { id, handle, created: false }` (the body's handle is then ignored) |
| `GET /api/player` | | `{ id, handle }`, or `401 no_session` |
| `PATCH /api/player` | `{ handle }` | `{ id, handle }`: same player, same records |
| `POST /api/runs/tickets` | `{ ruleset, count }` (1 to 5) | `{ ruleset, now, tickets: [{ runId, seed, expiresAt }] }`; `409 ruleset_mismatch` with the server's `ruleset` |
| `POST /api/runs/:runId/complete` | `{ replay }` | `200 { runId, status: 'accepted', duplicate, score, tick, reason, universe, lives, receivedAt, best: { allTime, week }, rank: { allTime, week }, week: { from, to } }` |
| `GET /api/leaderboard?period=all-time\|week` | | `{ period, from, to, generatedAt, entries: [{ rank, handle, score, you }], you: { rank, handle, score } \| null, rival: { rank, handle, score, need } \| null }` |

Error codes: `bad_json`, `bad_request`, `bad_period` (400); `replay_malformed` (400, with `reason`);
`no_session` (401); `csrf`, `not_owner` (403); `not_found`, `ticket_unknown` (404);
`method_not_allowed` (405); `ruleset_mismatch`, `ticket_spent` (409); `ticket_expired`,
`ruleset_retired` (410); `too_large`, `replay_too_large` (413); `json_required` (415);
`handle_invalid` (422, `reason`: `empty`, `too_short`, `too_long`, `bad_chars`, `blocked`);
`replay_rejected` (422, `reason`: `turn_refused`, `ended_early`, `not_over`, `too_fast`, ...);
`rate_limited` (429) and `busy` (503), both with `Retry-After` and passing; `internal` (500).

Rules worth knowing:

- A ticket can start a run for 24 hours (`expiresAt`); the finished run may still be sent until
  `expiresAt` plus the run's own moving time plus 10 minutes, so a run that went offline has a day.
  A player holds at most 30 unexpired tickets; asking for more retires the oldest.
- The run ID is the idempotency key. The same replay again gets the stored answer with
  `duplicate: true` and the first `receivedAt`; a different replay for a used ticket is `409`.
  A rejected replay spends the ticket too (and repeats its `422`); a malformed one does not.
- The week is Monday 00:00 UTC to the next Monday, by the server's first receipt of the run.
- Boards: one best run per player, ordered by score, then the earlier receipt of that score, then
  player ID. An equal score never replaces an earlier one. Hidden players are left out.
- Limits (`REPLAY_LIMITS` in `src/replay.js`): 100 000 ticks (about 2.6 hours at full speed),
  60 000 turns, 512 KiB. A longer run stays local. At most two replays are checked at a time, in
  slices of 1 000 ticks, with 16 waiting; past that the answer is `503 busy`.
- `src/ruleset.js` holds the ranked rules: the universe table in its order, the speed curve and
  `RULESET`. A test compares them with what the game builds from its modules; when a rule, a weight
  or the speed changes on purpose, raise `RULESET` and update the table and
  `tests/fixtures/ranked-golden.json`. The server ranks only the current `RULESET`.

Administration, on the database (`SNAKE_DB`, `--db <file>`, or the development database):

```bash
node server/admin.mjs list                    # id, handle, hidden, best, runs
node server/admin.mjs rename <id> <handle>    # same rules and blocklist as the form
node server/admin.mjs hide <id>               # off every board; unhide <id> brings them back
node server/backup.mjs <file>                 # SQLite online backup, checked; --force to overwrite
```

## Folder map

```
index.html, style.css      shell: title, HUD, panels, touch pad
src/main.js                loop, wiring, debug switches, quality scaling
src/sim.js space.js flow.js rules-config.js
                           the rules: lives, items, box/lane/cube spaces, the universe sequence
src/config.js rng.js       speed curve, presentation constants, URL switches; seeded generator
src/director.js fx.js      universe table, which look shows and how hard a cut hits; per-frame effects
src/input.js ui.js prefs.js keys, swipes, pad; DOM; saved settings and best score
src/autopilot.js           BFS player for ?auto and tests
src/audio.js beat.js       procedural sound and the beat clock
src/arrange.js pressure.js music decisions (pace, world, motif, harmony, bites); board pressure for the music
src/render/flat.js         2D canvas: timelines, glitch, phrase cards, first-person HUD
src/render/registry.js     loads whatever modules exist, with stubs
src/render/timelines/*.js  2D looks (and life() icons)
src/render/gl/             WebGL engine and the rooms (3D looks, life() icons)
src/render/persp.js        Canvas 2D stand-in for the rooms without WebGL
src/ruleset.js replay.js handle.js
                           shared with the server: ranked rules, replay record/verify, usernames
src/api.js identity.js tickets.js outbox.js ranked.js store.js
                           the page's side of the leaderboard: requests, player, tickets, sending runs
src/nav.js board.js username.js
                           menu overlays and key routing, the HALL OF SHIFTERS panel, the USERNAME form
server/                    leaderboard API: app.js (routes), db.js + migrations/, players, tickets,
                           runs, leaderboard, verify-queue, ratelimit, blocklist; server.mjs (container),
                           admin.mjs, backup.mjs; tests/ (node --test)
tests/                     rules, lives, spaces, flow, director, music, arrange, pressure, beat, replay,
                           ranked runs, usernames, and the page's leaderboard modules (node --test)
dev/                       harness pages per stream; notes/ build notes per stream
```
