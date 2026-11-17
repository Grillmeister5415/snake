# HALL OF SHIFTERS: leaderboard plan

Written 17 November 2026 against commit `8e8f714`. This file is the specification for the work. Part A is what the owner asked for (his brief, with his later changes folded in). Part B is what the code review found. Part C is the design. Part D is the order of work.

Where Part A and Part C disagree, tell the coordinator; do not pick silently.

---

## Part A: requirements

### A0. Owner's changes to the brief (these win over everything below)

- The first-use form is **not** called "NAME YOUR GLITCH". Its heading and field label are simply **USERNAME**.
- The form has a **SKIP** button for people who do not want a username. Skipping plays local, unranked runs. The player is not asked again; a "Set username" action stays available on the title, the pause menu and the leaderboard.
- The form is its own small panel that opens on the first PLAY (the title panel stays as it is).
- v1 includes a short server-side blocklist for handles and a command-line admin script (rename, hide, unhide a player). No admin web page.
- A note file for the Tichu project is part of the work (see C7).

### A1. Core experience

Choose a username once, play, lose, retry immediately. Scores save in the background. The leaderboard is opened deliberately from a menu and never interrupts between runs. Preserve the current rules, scoring, speed curve, controls, lives, universe selection, rendering and audio. This feature adds identity, menus and score persistence only.

Reference image: `/Users/fabian/Documents/Codex/2026-11-17/new-chat-3/generated_images/exec-284c4cc2-dd5f-47e4-90eb-9dce9cde927b.png`. Open it. Use only the left panel, **01 / BUNKER CRT**. Two approved changes: the score list scrolls vertically, and each row is one line (rank, username, score) with no subtitle under the username.

### A2. Copy

- Feature name: HALL OF SHIFTERS. Tagline: "EAT DOTS. LEAVE A LEGEND." Footer: "NO COINS. JUST EGO."
- Returning identity: "PLAYING AS TRUBEL" with a small Change action.
- Personal record: "NEW PERSONAL BEST." Confirmed global top ten: "YOU MADE THE WALL."
- Next-rival line on the board, from the selected board's real data: "5 POINTS TO OVERTAKE N0_FUTURE." With 68 against 72 the player needs 5. A tie needs 1 more. Handle first place and unranked players explicitly.
- Empty board: "THE WALL IS EMPTY. MAKE SOME HISTORY."
- Use personality sparingly. Rank, player and score must be readable at once.

### A3. Username

- Real text input with a visible label. Policy: trim, uppercase, 3 to 12 ASCII characters from A-Z, 0-9 and underscore. The rule is shown beside the input; validation is inline on the client and repeated on the server.
- A suggested handle (for example DOT_GOBLIN) is prefilled and editable; a small shuffle control makes another.
- Primary action `[ LET ME IN ]`: saves and goes to the existing ready state, which still waits for a direction. Secondary: SKIP (A0).
- No email, password, signup, avatar or confirmation screen.
- Remembered on this browser. Never asked again on retry, life loss, opening the board or reload. Say "Saved on this browser." Do not imply the same name on another device restores anything.
- Change username from title and pause menu: same player, same records, no reset of a paused run.
- Storage blocked: keep it in memory, allow play, promise nothing.
- Server identity: a stable opaque player ID and an anonymous session in a Secure, HttpOnly, SameSite cookie. A handle is not authentication. Never accept a player ID from a request body as ownership.
- Duplicate handles are allowed. The player ID decides ownership and the YOU marker. Never merge players by handle. A rename keeps the records.
- The session is created in the background. Failure never blocks local play. A remembered handle with no server session is reconciled explicitly (a new player is created); it never takes over another player with the same handle.

### A4. Retry stays instant

At terminal run end (the `died` event, including board completion; never on an ordinary lost life):

1. Capture an immutable result and replay under a unique run ID.
2. Update the right local best at once.
3. Queue an eligible result for background submission.
4. `[ AGAIN? ]` stays the primary action with Enter/Space.
5. `[ LEADERBOARD ]` and `[ MENU ]` are secondary actions.

Never await the network before `again()`. No mandatory screen, animation, podium or countdown after death. Retry by key or touch resets at once, also while the previous result uploads or before the 650 ms panel timer fires.

A small status says "Saving…", "Saved", "Waiting to sync" or "Local run". It never takes focus, moves the Retry button or covers the next run. A rank is shown only when the server confirmed it.

Every asynchronous response is tied to its run ID and a screen generation. A late answer for run A never touches run B's score, identity, panel or menu. Retry clears old timers, not the outbox.

### A5. Menus

`[ LEADERBOARD ]` on the title, in the pause menu and on game over. `[ PLAY ]`, `[ RESUME ]`, `[ AGAIN? ]` stay primary.

Use one explicit overlay/navigation state, not scattered flags. Keep the gameplay mode and `pausedFrom` as they are.

| Board opened from | Back / Escape | Main action on board |
|---|---|---|
| Title | back to title | PLAY |
| Pause | back to pause, game stays paused | BACK TO MENU |
| Game over | back to game over | PLAY AGAIN |

Opening or closing the board never advances the snake, costs a life or resumes a paused run. Going from game over to the title keeps the identity and never submits twice. While a menu is open no gameplay key leaks through; buttons work normally.

### A6. Leaderboard

- Tabs ALL TIME and THIS WEEK.
- Top 10, one best eligible run per player per board, in a vertically scrolling list.
- YOU marker on the player's row. Outside the top 10: a separate "YOUR POSITION" row with the real rank, never duplicated.
- Exactly three columns: RANK, USERNAME, SCORE. One line per entry everywhere.
- Next-rival line. Empty state (A2).

Layout: panel limited to the viewport height including safe areas, with header / scrolling list / footer. Title, tabs and footer actions stay visible; the column header is sticky and opaque. Native scrolling (wheel, trackpad, touch, keyboard: arrows, Page Up/Down, Home/End) without touching the game. The list is the only scroll container (`min-height: 0`, `overflow-y: auto`, overscroll contained); no horizontal scroll. Narrow visible scrollbar in the frame's colours. A subtle "more below" cue only while rows remain. YOUR POSITION, the rival line and the buttons live in the footer. Short landscape: shrink decorative header spacing first; whole-panel overflow only as a last resort. No auto-scroll, no marquee, no forced scrollbar, no padding rows.

Order: score descending, then earliest server acceptance of that score, then player ID. Sequential ranks. Repeating a score never improves a tie position.

Week: Monday 00:00 UTC to the next Monday 00:00 UTC, by the server's first receipt time of a later validated result. Idempotent retries keep the first receipt time. Show the reset basis quietly. Never trust the browser clock.

One coherent server query returns top entries, own entry, next rival, period and freshness. A tab switch never shows the other tab's late answer.

Loading keeps panel and controls visible. Offline shows cached results marked "Offline — showing saved scores", or an honest empty offline state. Failure shows an inline Retry; going back to the game always works. No fake players or counts in production. Fetch on opening, after a successful submission when useful, and on explicit refresh. No polling.

### A7. Art direction: Bunker CRT

Semantic HTML and light CSS; scores are real text.

- Background `#080610` / `#050308`, text `#F4F4F4`, cyan `#19E6FF`, magenta `#FF2BD6`, yellow `#FFD400`.
- Angular borders, small offset cyan and magenta edges (double neon frame), condensed bold white heading, monospaced tabular scores.
- Compact one-line rows, YOU badge inline, score right-aligned.
- Scanlines on the background only. Names and scores stay crisp: no blur, bloom or colour split.
- Tiny pixel crown at first place; small pixel snake in a corner.
- YOU row cyan-tinted or reversed plus a text badge. Yellow for primary actions and small emphasis.
- No theme switcher, no other concept from the sheet, no static image of the mockup.

### A8. Input, mobile, accessibility

- `input.js` takes direction keys, P, M and Escape globally today. Fix first: no gameplay shortcut when the event comes from an input, textarea, select or editable element, or during composition (`isComposing`); respect modifiers. Typing WASD, P or M types text.
- The form submits through its own `submit` event.
- Opening the board moves focus to a heading or control; closing returns it to the opener. Focus is trapped while modal; the background is inert.
- Proper table or list semantics; tabs and buttons with names and visible focus.
- One restrained polite live region for a finished save or an error.
- Reduced motion and reduced flash apply. No strobing or fast blinking in these menus at all.
- Mute is honoured; any menu sound goes through the existing audio system after a user gesture and never delays navigation.
- 320 px wide, portrait and short landscape, safe areas, real text selection in the input, keyboard not covering the form, 44 px touch targets.
- The scroll region has a label and keyboard access. Scrolling never triggers stage gestures or shortcuts.
- Usernames stay on one line; the columns fit 12 characters plus the YOU marker at 320 px. Ellipsis with the full accessible name only in an exceptional case.
- Do not globally disable pinch zoom for the new screens; review the viewport restriction.
- No ongoing GPU effect or extra WebGL scene for a menu.

### A9. Ranked runs stay comparable

Eligibility is latched when the run starts.

- Practice (never on the public board): `?auto`, `?debug`, an explicit `?seed`, debug universe/look/score/lives locks, and speed overrides (`?start`, `?ramp`, `?cap`, which work today **without** `?debug`). Check the raw presence of these parameters, not only parsed values; any attempted override means practice.
- Still eligible: reduced flash, reduced motion, mute, calmer sound, touch buttons, keyboard, WebGL fallback (`?nogl` changes rendering only).
- The simulation's real universe table must equal the canonical one, or the run is local. A renderer fallback with identical rules is fine.
- Old local bests are not imported into the global board. The saved best stays local.

### A10. Backend

A small Snake-owned same-origin API with SQLite. The browser game keeps zero dependencies. Routes (proposed):

- `POST /api/player`, `GET /api/player`, `PATCH /api/player`
- `POST /api/runs/tickets`
- `POST /api/runs/:runId/complete`
- `GET /api/leaderboard?period=all-time|week`

Persist player IDs, current handles, session ownership, issued tickets, ruleset version, validated score, terminal tick, reason and universe, first-received time and record times. Transactions and indexed queries. The stored score is the one the server computed.

Bound replay retention and clean expired tickets. Explicit limits on payload size, input count, tick count and verification work, with clear client behaviour beyond them.

### A11. Server validation

- The server issues seed and ruleset; the client cannot choose either for a ranked run.
- The replay records simulation-level turns (after `steerFor`), with tick and order, including two turns between ticks, the first direction and respawns.
- The server replays with the same rules, speed, table and default start, and recomputes score, lives, terminal tick, reason and final universe.
- Rejected: nonterminal, mismatched, malformed, a ticket reused with different content, out of bounds.
- Plausibility: server time since ticket issue is not shorter than the simulated movement time.
- Verification runs inside bounded concurrency and work budgets and never blocks all API traffic.

This stops a forged score. It does not stop a bot that sends legal inputs. Document that limit; never write "cheat-proof"; no fingerprinting, no captcha.

### A12. No network in the retry path

- Prefetch a small batch of tickets while the title or a menu is open; refill in the background.
- No valid ticket or session: start a local run at once and label it honestly. Never wait, invent a ticket, change the seed mid-run or upgrade a local run afterwards.
- A ranked run that goes offline queues its ticket and replay. Ticket expiry allows a documented offline grace of 24 hours. Expired or rejected results stay local with an understandable status.
- Outbox: bounded and versioned, independent of the game UI. Run ID is the idempotency key. Backoff on transient errors and on reconnection; permanent failures are not retried. Persisted when storage allows, otherwise in memory. A retry never overwrites a queued run. A pending run stays with its original player. Bounded count and bytes with a clear "full" state. No heavy serialisation or DOM work on the animation frame. Nothing is called saved globally before the server acknowledged it.

### A13. Security

Server-side validation of handles and shapes, parameterised SQL, `textContent` for handles, same-origin mutations with CSRF protection and session ownership, no secrets in browser code. Rate limits on profile changes, tickets and submissions that allow fast retries. Body-size and CPU limits. Session secrets never in logs or responses. The board holds handles and scores only: no email, real name, location, IP, chat or social graph.

### A14. Deployment boundary

- The public TLS proxy is Tichu's. The outer route to `snake:8080` stays.
- A Snake-owned API service on a private Snake network. Snake's Caddy joins that network and proxies `/api/*`.
- The API never joins `caddy-edge`.
- SQLite in its own persistent volume, outside releases and the web root.
- Non-root, resource limits, health checks, existing security headers kept where compatible.
- Profile, ticket and submission answers are `no-store`; board caching never leaks the own-row data.
- Packaging covers versioned backend code, migrations, backup and rollback. A frontend symlink rollback is not a database rollback. Old-client tickets validate against a supported ruleset or get a clear local-only outcome.
- Nothing of Tichu or Unser Jahr is touched. **Deployment itself is not part of this work.**

### A15. Evidence required

Existing `npm test` passes, plus focused tests for:

- first-time identity, returning player, rename keeping rank, duplicate handles, rejected handle, blocked storage, skip;
- typing WASD/P/M and IME never controls the game;
- several immediate retries with slow, out-of-order and failed submissions: no stale score or focus change;
- no submission after an ordinary lost life; exactly one after final death or completion;
- pause → board → back keeps the paused run, also from ready and respawn;
- Enter/Space and touch retry respond during saving and the death delay;
- ranking, ties, one row per player, self outside the top 10, no duplication, rival arithmetic;
- the weekly UTC boundary and idempotent retries across it;
- practice exclusions, accessibility eligibility, ruleset mismatch, legacy local best;
- forged score, malformed replay, duplicate and conflicting submission, wrong owner, expired ticket, bounded verification;
- offline resync and immediate local fallback without tickets;
- data surviving an API restart, migration and backup procedure, deployment isolation;
- desktop, 320 to 390 px portrait and short landscape;
- scrolling all ten rows by wheel, touch and keyboard, sticky header, visible footer, end cue, no horizontal or nested scrollbars;
- one-line rows everywhere.

Fixture players only in development and tests. Final screenshots: the username form, the board at the top and partly scrolled on desktop and mobile, the own row outside the top 10, game over with Retry primary, plus offline, loading and empty states.

---

## Part B: what the review found in the current code

1. **Escape and Enter would break the menus.** `input.js` sends Escape/P to `togglePause()` and Enter/Space (with focus on the body) to `play()` / `again()` / `togglePause()` regardless of what is on screen. With a board open over the pause menu, Escape would resume the run; over game over, Enter would start a run behind the board. All global keys must go through the navigation state first.
2. **Arrow keys and WASD are `preventDefault`ed globally.** That kills caret movement in the input and keyboard scrolling of the list. Same fix.
3. **There is no way back to the title today.** `mode = 'title'` happens once, at load. `[ MENU ]` on game over is a new transition: it must clear `overTimer`, leave audio stopped, show the title and let `play()` start a fresh run.
4. **`?auto` calls `play()` at load.** The username step must be skipped for `?auto`, and `?auto` must make no network request at all.
5. **`again()` already works during the 650 ms delay** (mode is `over` at once). Keep that; the new code must not add a guard that waits for the panel.
6. **The rules table is built from loaded modules** (`buildUniverses`): a timeline that fails to load drops out of the table and changes the game. Ranked play needs the comparison with a canonical table (C1).
7. **The simulation is safe to replay across browsers and Node**: integer and basic float arithmetic only, no `Math.sin`/`pow`/`exp`, no clock, its own generator. The sim already emits `turn` for every accepted turn, so recording needs no change to the rules.
8. **`sim.advance(dt)` on the client equals `sim.step()` on the server** as long as each turn is recorded with the tick count at the time it was queued. `tick` increments before a collision is detected, so turns after a lost life never share a tick with turns before it.
9. **`prefs.best` is one number** and may hold debug or autopilot scores. See C5.
10. **The Caddyfile's CSP has `form-action 'none'`.** A form whose `submit` handler calls `preventDefault()` never navigates, so the policy can stay. `default-src 'self'` already allows same-origin `fetch`.
11. **The Caddyfile's `header` block sets `Cache-Control: no-cache` for everything.** API answers need their own `no-store`; scope the headers so neither overwrites the other.
12. **`deploy.sh` ships `index.html`, `style.css` and `src/` only**, and the compose file says "nothing new is downloaded". Both change (C7).
13. **`body` has `user-select: none`** and the viewport has `maximum-scale=1`. The input needs `user-select: text` and a font size of at least 16 px (iOS zooms into smaller inputs). Remove `maximum-scale=1`; the stage and the direction pad keep `touch-action: none`, so play cannot zoom.
14. **The cookie must be host-only.** `snake.online-tichu.com` sits under Tichu's domain; use the `__Host-` prefix so a cookie set for the parent domain can never be taken for Snake's session. Local development over plain HTTP (also from a phone on the LAN) needs a development switch for the cookie name and the Secure flag.
15. **Client IPs arrive through two proxies** (Tichu's Caddy, then Snake's). Rate limiting by IP must read the forwarded address only from trusted private ranges, and must also limit per session.

---

## Part C: design

### C1. Shared pure modules (browser and server)

- `src/ruleset.js`: `RULESET` (a version string, start at `'1'`), the canonical universe table for `createSim` (ids, rules, mushrooms, rare, room, weight, **in order**), the canonical `SPEED`, and `sameRules(simTable, speed)`. A test builds the table the way `main.js` does from the real module metas (see `tests/replay.test.js`) and asserts it equals the canonical one, so a changed weight in a module fails the tests until `RULESET` is raised. If the real table differs from `rules-config.js` `UNIVERSES` today, the real one is canonical.
- `src/replay.js`:
  - `createRecorder(sim)` listens to `turn` and stores `[tick, dirIndex]` pairs in order. Add `tick` to the `turn` event payload in `sim.js` (the only sim change; it stays pure). `snapshot()` returns `{ v: 1, turns, endTick }`, immutable.
  - `verifyReplay({ seed, replay, limits })` creates a sim with the canonical table, and for each tick applies that tick's turns in order then calls `step()`. A turn the sim refuses, a turn after the end, an end tick that does not match the real death, or a run that is not over at `endTick` is a rejection. Returns `{ ok, score, tick, reason, universe, lives, activeMs }` where `activeMs` is the sum of `stepMsFor(score)` over the ticks. It must be usable in slices (a generator or a `budget` argument) so the server can yield between slices.
  - Encoding: JSON, turns as a flat array of numbers. Limits in one exported constant: `maxTicks`, `maxTurns`, `maxBytes`.
- `src/handle.js`: `normaliseHandle`, `validateHandle` (returns a reason code), `suggestHandle(rng)` from two short word lists. Used by the form and the server.
- `src/week.js` is not needed in the browser; the server sends the period bounds.

### C2. Server (`snake-shift/server/`)

Node with the built-in `node:http` and `node:sqlite`; **no npm dependencies**. Check nodejs.org for the current LTS and the state of `node:sqlite` there, pin the image tag in the compose file, and make the tests run on the Mac's Node 22.17 as well (where `node:sqlite` prints an experimental warning).

Files: `server.mjs` (entry, env, graceful shutdown), `app.js` (router, body limits, errors), `db.js` with `migrations/001_init.sql` (forward-only, applied at start inside a transaction, `user_version`), `players.js`, `tickets.js`, `runs.js`, `leaderboard.js`, `verify-queue.js`, `ratelimit.js`, `blocklist.js`, `admin.mjs`, `backup.mjs`. An injectable clock and random source for tests.

- **Session**: 32 random bytes in the cookie `__Host-ss` (`Secure; HttpOnly; SameSite=Strict; Path=/`, about one year, refreshed); only its SHA-256 is stored. `SNAKE_DEV=1` uses `ss_dev` without Secure.
- **CSRF**: every mutation needs `Content-Type: application/json`, the header `X-Snake: 1`, and a same-origin `Origin` / `Sec-Fetch-Site`.
- **Player**: opaque ID (random, URL-safe), handle, `hidden` flag, timestamps. `POST /api/player { handle }` creates a player and session, or returns the current one when a valid session exists. `PATCH` renames. `GET` returns `{ id, handle }` or 401.
- **Tickets**: `POST /api/runs/tickets { ruleset, count }` returns up to 5 `{ runId, seed, expiresAt }`; seed is a random uint32 from the server; a cap on unspent tickets per player; expiry 24 hours plus the run itself; wrong ruleset answers 409 with the server's ruleset.
- **Submission**: `POST /api/runs/:runId/complete { replay }`. Checks owner, expiry, limits; verifies in the queue; checks the elapsed-time plausibility with a small tolerance; stores score, tick, reason, universe, ruleset, `received_at` (first receipt). The same content again returns the stored answer; different content for a spent ticket answers 409. The answer carries the score, whether it is the player's best, and the rank on both boards.
- **Leaderboard**: `GET /api/leaderboard?period=all-time|week` returns `{ period, from, to, generatedAt, entries: [{ rank, handle, score, you }], you: { rank, handle, score } | null, rival: { handle, score, need } | null }` in one read transaction. Hidden players are left out. `private, no-store` because of the own row.
- **One wall across ruleset versions** for now; each run stores its ruleset, so a later split by version needs no migration.
- **Retention**: replays of stored runs are kept only for a player's current best per board and for the last 30 days; expired tickets are deleted by a periodic sweep.
- **Rate limits**: token buckets per session and per client address, in memory.
- **Admin**: `node server/admin.mjs list | rename <id> <handle> | hide <id> | unhide <id>` on the database file.
- **Backup**: `node server/backup.mjs <target>` using SQLite's online backup.
- `GET /api/health` for the container check.

### C3. Local development

`node serve.mjs` keeps working and now also answers `/api/*` in the same process with a development database at `snake-shift/.data/dev.sqlite` (ignored by git) and `SNAKE_DEV=1`. A `--no-api` switch gives the old static behaviour for testing the offline paths. `npm test` runs `tests/*.test.js` and `server/tests/*.test.js`.

### C4. Client modules (`snake-shift/src/`)

- `api.js`: thin `fetch` wrapper (headers, timeouts, error classes: transient / permanent / unauthenticated).
- `identity.js`: handle and player ID in local storage (own key, versioned), in-memory fallback, `skipped` flag, background session creation and explicit reconciliation.
- `tickets.js`: prefetch and refill, never awaited by the game; `take()` is synchronous and returns a ticket or `null`.
- `outbox.js`: the queue of A12.
- `nav.js`: the overlay state machine of A5 (`none | username | board`, with origin and opener), the single place global keys are checked against.
- `board.js`: the leaderboard panel (render, tabs, cache, states). `username.js`: the form.
- `main.js` gets wiring only; `ui.js` gets the new buttons and status line; `input.js` gets the editable-target and overlay checks; `prefs.js` gets the second best (C5).

Run start: `startRun()` latches eligibility (URL parameters, `sameRules`, a username, a ticket). Ranked: `sim.reset(ticket.seed)` and a recorder. Otherwise the existing random seed and the label "Local run".

### C5. Local best

The saved `best` stays and is still shown as BEST. Normal runs (ranked or local) update it. Practice runs (A9) no longer do; they get a separate `practiceBest`, shown as BEST during practice. Nothing local is ever uploaded.

### C6. Username step and skip

First PLAY with no username and no skip recorded opens the USERNAME panel: label, input with a suggestion, shuffle, the rule, "Saved on this browser.", `[ LET ME IN ]`, SKIP, and Back to the title. `audio.unlock()` runs in the same user gesture that leaves the panel. After a skip, PLAY starts at once from then on.

### C7. Deployment files (prepared, not run)

- `deploy/compose.yaml`: a second service `snake-api` (pinned Node image, user 1000, read-only, all capabilities dropped, memory and pid limits, health check on `/api/health`, a named volume for `/data`), on a new network `snake-internal` marked `internal: true`. The `snake` service joins both networks. `snake-api` is not on `caddy-edge` and publishes no port.
- `deploy/Caddyfile`: `handle /api/*` with `reverse_proxy snake-api:<port>`, a `request_body` limit, and the security headers kept; static files keep `no-cache`.
- `deploy/deploy.sh`: ships `server/` and the shared `src/` modules to `~/snake/api/releases/<release>`, switches `api/current`, backs the database up before a release with a migration, restarts the API, and documents what `--rollback` does and does not undo.
- `DEPLOY.md` and `snake-shift/README.md` updated: the API, the data, backup, restore, rollback, the admin script, the verification limit of A11.
- `deploy/TICHU_NOTE_LEADERBOARD.md`: an informational note for the Tichu project: Snake now has an API container, a SQLite volume and accepts small JSON request bodies; nothing on `caddy-edge` or in Tichu's Caddy changes; the membership stays at three.

---

## Part D: order of work

**Stage 1: shared core, server, deployment files.** C1, C2, C3, C7 with their tests (the server and replay items of A15). No change to the game's screens. Ends with `npm test` green and a short report of the final API shapes.

**Stage 2: client.** Part B items 1 to 5 and 13, then C4, C5, C6, A2 to A8, wired to the real API from stage 1. Verified in a browser at desktop and phone sizes with screenshots (A15).

**Stage 3: review.** The coordinator checks both stages against Part A, runs the tests and walks through the flows.

Nothing is committed, pushed or deployed without the owner's word.
