# SNAKE//SHIFT — Build plan

This is the build plan for the model that implements the game. Nothing is built yet.

## 0. How to use this plan

Read in this order:

1. `SNAKE_SHIFT_REFERENCE_PACKAGE/MASTER_PROMPT.md` — the creative brief and the gameplay contract.
2. This file — architecture, decisions, order of work, and the places where later input overrides the brief.
3. `SNAKE_SHIFT_REFERENCE_PACKAGE/references/*.png` — mood boards only. Never ship them, never copy a layout or a character from them.

Where this plan and the master prompt disagree, this plan wins. There are four such places:

| Topic | Master prompt | This plan |
|---|---|---|
| Flash and strobing | Avoid strobing everywhere | **Wild by default**, with a warning gate. The prompt's restraint becomes the reduced-flash setting (section 5). |
| First review checkpoint | 2D timeline, one 3D room, shifts | Adds one first-person passage and the accessibility switches (section 11). |
| Timeline count | Ten | Eleven: adds "Desktop Error, 1995" (section 10). |
| Board drawn into the 3D room as a texture | Suggested for nested-reality gags | Not in the main path. Floor shows the grid only; snake and dot are separate 3D objects (section 6.3). |

Two rules outrank everything else in both documents:

- **The rules never change.** One flat grid, four directions, one segment and one point per dot, lethal walls and body, one speed curve. Visuals read game state and never write it.
- **It has to be wild.** The owner's words: as wild as "this needs a trigger warning for epilepsy". If a scene feels tasteful, it is not finished. The one thing that stays calm is the opening LCD scene, because the contrast is the joke.

## 1. Decisions already made

| Decision | Value | Why |
|---|---|---|
| Stack | Plain JavaScript ES modules, no dependencies, no build step needed to run | Brief asks for tiny and fast; the Tennis reference does the same with a hand-written WebGL renderer |
| Location | New folder `snake-shift/` beside this file | Keeps the game apart from the reference package |
| Grid | 16 × 16, square | Fits portrait phones and desktop; reads well as a 3D floor |
| Speed | Start 150 ms per step, 1.5 ms faster per dot, floor 95 ms | Starting values only. Expose `?start=&ramp=&cap=` URL overrides and let the owner tune by feel at checkpoint 1. Same curve in every timeline. |
| Run start | After PLAY the snake waits; the first direction key starts the run | The first ten seconds must be understandable |
| Opening timeline label | "3310 Ghost, 1999" (owner's choice; the id stays `lcd`, and older text here still says "LCD Ghost"), generic LCD handheld look | No phone maker's name, logo, or replica of that phone's game. |
| Fighters, sprites | Original designs only | Reference images 04 and 09 show a fighter close to a famous one, and 08 shows classic alien-invader sprites. Do not reproduce either. |
| Six Finger Punch material | Techniques only | No logo, name, panel artwork or wording from the Tennis app unless the owner says the studio is theirs |
| Assets | Everything generated in code | No images, fonts, audio or video downloaded at runtime. Target under 250 KB compressed. |

## 2. Architecture

One-way flow. Nothing on the right can change anything on the left.

```
input ──▶ simulation ──events──▶ director ──scene + intensity──▶ renderers
              │                                                  audio
              └────────── frozen snapshot ───────────────────────▶ UI
```

- **Simulation** (`sim.js`): pure, no DOM, own seeded random generator. Fixed tick.
- **Director** (`director.js`): pure, no DOM, its own random generator, so visuals can never influence where the dot spawns. Decides which scene is showing, how hard the cut hits, and when the first-person view runs.
- **Renderers**: read the snapshot and the director's state. Two stacked canvases: WebGL underneath for rooms, Canvas 2D on top for flat timelines and overlays.
- **Board always on top.** Every timeline draws in two phases, `scenery` then `board`. All heavy effects apply to scenery. The board layer (grid, snake, dot, lethal edge) is drawn last and crisp. The snake never gets echo trails or duplicates that could read as a second body.

Suggested layout:

```
snake-shift/
  index.html  style.css  package.json        ("type": "module", "test": "node --test tests/")
  src/
    main.js  config.js  rng.js  sim.js  director.js  autopilot.js
    prefs.js  input.js  ui.js  audio.js  beat.js
    render/
      flat.js            canvas manager, layout, first-person HUD, phrase cards, veil, glitch
      lcd.js  arcade.js  one file per flat timeline, each exports scenery() and board()
      gl/
        m4.js  glutil.js  geometry.js  shaders.js
        engine.js        programs, draw helpers, camera
        rooms/court.js   one file per room preset
  tests/
    sim.test.js  director.test.js
```

## 3. Simulation interface

```js
const sim = createSim({ cols, rows, speed: { startMs, rampMs, capMs }, seed });

sim.reset(seed)        // fresh run, paused; emits 'reset'
sim.setPaused(bool)    // emits 'pause' / 'resume'
sim.queueTurn(dir)     // 'up' | 'down' | 'left' | 'right'; returns false if rejected
sim.advance(dtMs)      // runs 0..n fixed ticks; returns how many
sim.step()             // exactly one tick (tests, autopilot)
sim.snapshot()         // deeply frozen, safe to hand to any renderer
sim.on(type, fn)       // 'reset' 'pause' 'resume' 'turn' 'step' 'ate' 'died'
```

Snapshot fields:

| Field | Meaning |
|---|---|
| `cols`, `rows` | Grid size |
| `snake` | Cells, head first |
| `dir`, `prevDir` | Direction of the last move, and the one before |
| `prevTail` | Cell the tail left on the last tick (same as the tail if it grew) |
| `grew` | Whether the last tick added a segment |
| `food` | Dot cell, or null if the board is full |
| `score`, `stepMs`, `tick` | Score, current step length, tick count |
| `progress` | 0..1 toward the next tick, for smooth drawing only |
| `alive`, `paused`, `death` | State; `death` is `{ reason: 'wall' | 'self' | 'complete', cell }` |

Rules to implement exactly:

- Turn queue holds at most two turns. A turn is rejected if it equals or reverses the last queued turn (or the current direction when the queue is empty).
- Moving into the cell the tail is leaving is legal, unless the snake grows on that tick.
- The dot spawns uniformly on a free cell using the simulation's own generator.
- Step length is taken before the tick, so a bite changes speed from the next step on.
- `advance` does not clamp time. `main.js` clamps frame time to 100 ms and pauses when the tab is hidden.

`autopilot.js` picks a direction from a snapshot alone and steers through `queueTurn`, like a player. It is used for tests and for demo/screenshot runs.

## 4. Director

### 4.1 Scenes

A scene is a timeline plus a view. Each declares a rough brightness (`luma`, 0..1), which the reduced-flash limiter uses.

| Scene id | Timeline | View | Kind | Luma |
|---|---|---|---|---|
| `lcd` | LCD Ghost, 1999 | board | 2D | 0.60 |
| `arcade` | Electric Arcade, 1986 | board | 2D | 0.08 |
| `court` | Reality.exe, 2088 (night court) | board | 3D | 0.25 |
| `court-pov` | same room | first person | 3D | 0.25 |

Later timelines add rows: acid 0.70, disco 0.35, kombat 0.20, plastic 0.65, bunker 0.06, timewarp 0.45, wrong 0.40, desktop 0.45.

### 4.2 Choosing the next scene

- A scripted opening makes the first shifts a clear demonstration: `arcade`, `court`, `court-pov`, `lcd`, `court`, `arcade`, `court-pov`. After that, weighted random.
- Never the same scene twice in a row.
- 3D scenes need WebGL. If it is missing or the context is lost, the director skips them.
- First-person scenes need at least 4 free cells straight ahead at the moment of the cut. If the scripted one is blocked, keep it for the next bite.
- First-person ends at the next bite, or after 12 seconds with a cut back to the board view of the same room.

### 4.3 Intensity modes

Two inputs conflicted here. A review asked for a strict flash limit; the owner then asked for trigger-warning-level wildness. Resolution: **wild is the default, the limiter is what the reduced-flash switch turns on.** Do not "fix" this back.

| | Wild (default) | Reduced flash |
|---|---|---|
| Scene cut | On every bite, no minimum gap | At most one every 3.5 s; bites in between cause local changes only |
| Brightness swings (luma difference over 0.3) | Unrestricted | At most one per 5 s; otherwise pick a scene of similar brightness |
| Bite impact | 60–90 ms full-screen inversion, then the new scene | None |
| Strobe bursts | On big events: 3–6 alternations inside 400 ms | Never |
| Beat pulse on scenery | Full | 15% or less |
| Glitch slices, colour splitting | Scales with chaos level | Off |
| Big swing softening | None | 450 ms veil in the old scene's average colour, starting at 50% opacity |

"Local changes" on a bite, in both modes: a burst at the bitten cell, an accent or pattern variant change, a sound, a score pop.

One guideline even in wild mode: **bursts, not drones.** No full-screen strobe that runs longer than about 0.4 s, and the board layer itself never strobes (a brief inversion is fine because it keeps contrast). The reason is playability: a snake you cannot see is not wild, it is broken.

### 4.4 Chaos level and beat

- `chaos = clamp(score / 25, 0, 1)`. It drives pulse strength, glitch amount, colour-split distance, phrase frequency, strobe-burst odds, and later the odds of collisions and corruption. Early shifts are clean single eras; it gets worse from there.
- `beat.js`: a clock at about 132 BPM that starts on the first bite. It exposes a 0..1 pulse that decays after each beat. Scenery reads it; the kick drum in `audio.js` is scheduled from the same clock. Use the audio clock when audio exists, the frame clock otherwise.

### 4.5 Phrase cards

Oversized text for about a second on some cuts: "TIME BREAK!" on the very first, "WELCOME TO 2088" on first entry to that room, otherwise a random pick from the brief's list. Drawn in the free band above the board, never over it. None on first-person cuts. None on the silent return to LCD.

## 5. Warning gate and accessibility

- The title screen shows a photosensitivity warning before PLAY on every page load, with the two switches right there: **Reduced flash** and **Reduced motion**.
- Both switches also live in the in-game settings and are saved locally. Reduced motion defaults to the system setting.
- These switches are part of the first slice. Every effect asks `prefs` before it runs; do not retrofit later.

| Reduced motion does | |
|---|---|
| Camera | Cuts only, no glides, no punch-zoom |
| First person | Skipped by default (an open question, section 13) |
| Scenery | Scrolls and warps frozen or slowed; shader time held |
| Dot | No bobbing |

Other requirements: head, body, dot and lethal edge must differ by shape, not only colour. HUD has a backing plate so it stays readable over any scene.

## 6. Rendering

### 6.1 Layers

1. WebGL canvas (rooms), hidden while a flat timeline is showing.
2. Canvas 2D on top: the whole picture for flat timelines; for rooms it is transparent apart from the first-person HUD, phrase cards and the veil.
3. One DOM overlay with `mix-blend-mode: difference` and a white background, switched on for the inversion impact. This inverts both canvases at once for no cost.
4. DOM HUD and panels.

### 6.2 Flat timelines

Each exports `scenery(ctx, L, snapshot, directorState, now, prefs)` and `board(...)`. `L` is a shared layout: the board is a centred square with cell size `floor(min(0.94·w / cols, 0.80·h / rows))`, pushed slightly down so there is a free band above it. Flat timelines draw the snake cell-exact, with no in-between positions. Glitch slices run between the two phases, so they shred scenery and leave the board intact.

### 6.3 3D engine

WebGL 1, hand-written, four small programs: sky, floor, mesh, glow.

**World coordinates.** Cell `(x, y)` sits at world `(x − cols/2 + 0.5, 0, y − rows/2 + 0.5)`. Grid-up is world −Z, away from the camera. Screen-up equals grid-up in the board view, always. No yaw in the board view, ever.

**Floor.** One huge quad. The shader draws the room's floor pattern, and inside the board rectangle a dark panel with grid lines and a bright frame band just outside the lethal edge. This is the "grid as a texture". The snake and the dot are separate meshes placed from the same cell coordinates. Never bake the snake into a texture.

**Sky** is a function in GLSL shared by the sky pass, the floor's glossy reflection, and chrome objects, which gives convincing chrome for free.

**Snake in 3D** moves smoothly between cells:

```
a    = (tick === 0 || !alive) ? 1 : progress
head = lerp(snake[1], snake[0], a)
body = grew ? snake[i]                                   // body holds still while a new head extends
            : lerp(i < n−1 ? snake[i+1] : prevTail, snake[i], a)
```

Segments are low blocks, no taller than 0.34 cells. Taller blocks hide the cell behind them at the far edge.

**Set dressing sits outside the board, always.** Because the board is convex and every prop is outside it, no prop can hide a cell from the first-person camera. For the board view, keep props out of the wedge between the camera and the near edge. Props are never collision geometry.

**Board-view camera.** This took some working out, so use these numbers as the start:

- There is a hard trade: seeing the horizon costs board size. With the horizon and sun in frame, the board takes about 37% of the stage height, and the far row is about 2.2% of stage height almost regardless of camera height. That is acceptable and matches reference image 10.
- Vertical field of view 66°, pitch 24° below horizontal, near board edge at 55° depression.
- Camera height `H`: smallest value from 15 upward where the near edge fits 94% of the width. Camera `z = rows/2 + 0.9 + H / tan(55°)`.
- Sun: centre about 3° above the horizon, radius about 13°. Only its lower part shows in the board view; the full sun is the payoff in first person.

**Draw order.** Clear depth; sky (no depth); floor; opaque meshes (props, curb, snake, dot); then additive glows with depth write off (light pools under segments, bite ring, first-person walls and beacon).

**Known WebGL 1 traps.** No `mat3(mat4)` constructor: use `(uModel * vec4(n, 0.0)).xyz`. `fwidth` needs `OES_standard_derivatives` and the `#extension` line first; fall back to a distance-based width. Do not declare the same uniform in vertex and fragment shaders with different precision. Bind attribute locations before linking. If any shader fails, log it, return null, and let the director run without 3D.

### 6.4 First-person view

- Camera rides the head's interpolated position, 0.95 cells up, looking along the current direction and about 14° down. Horizontal field of view about 90°. No roll, no shake.
- Yaw eases to a new direction with a time constant near 60 ms. In reduced motion it snaps.
- The head mesh is hidden. The body is drawn.
- First-person only: translucent energy walls 2.6 cells high standing exactly on the lethal edges, and a light beam over the dot. In the board view the edge is a low curb only, because tall walls would cover the near rows.
- Owner's decision after playing (overrides the brief): in first person, left and right turn relative to where the snake is heading, so left is always the player's left; up and down do nothing. Board views keep grid directions, where left is already screen-left. The mapping lives in `steerFor` in `src/input.js`; the simulation still only receives grid directions. The HUD shows a north-up minimap and fixed left and right keycaps.

### 6.5 Without WebGL

First slice: the director skips 3D scenes and the game alternates flat timelines. Later: draw rooms as a Canvas 2D perspective projection of the same floor and cells, using the same camera maths.

### 6.6 Effects stage (after checkpoint 1)

Render scenery into an offscreen buffer, apply glow, red/green/blue colour splitting, echo frames and scanlines, then draw the board on top. Flat timelines feed the same stage by uploading their scenery canvas as a texture. Transitions then become blends between two scenery buffers: tear, iris from the dot, pixel burst, split screen. Until this stage exists, wildness comes from the inversion overlay, shader "punch" uniforms that decay after a bite, the beat pulse, and 2D glitch slices.

## 7. Audio

Web Audio only, created on the PLAY click. Mute button always visible; state saved.

- Bite: a note that walks up a scale with the score, voiced per timeline (LCD click, arcade square-wave pair, room triangle plus sine).
- Cut: filtered noise sweep plus a sub drop.
- Death: falling saw.
- Kick on the beat clock from the first bite; layers thicken with chaos. Silence in LCD Ghost.

## 8. Interface and input

- Title: SNAKE//SHIFT, EAT THE DOT. BREAK TIME., warning line, the two switches, [ PLAY ].
- In play: score, timeline name and year, pause, mute, settings. The HUD re-themes per timeline through CSS variables.
- Game over: REALITY COLLAPSED, score, best (saved locally), [ AGAIN? ]. Restart is immediate.
- Keys by physical position (`event.code`): arrows and WASD steer, P or Escape pauses, Enter or Space confirms, M mutes.
- Touch: swipes on the stage with a 22 px threshold, re-armed mid-gesture so one drag can chain turns. `touch-action: none`, no page scroll.

## 9. Debug switches

`?debug` exposes `window.__ss` (sim, director, force a scene). `?auto` runs the autopilot. `?scene=court-pov&lock` holds one scene for screenshots. `?seed=` fixes the run. `?nogl` forces the no-WebGL path. `?start=&ramp=&cap=` tune speed.

## 10. Timelines

Every timeline re-skins the game objects themselves, not only the scenery. That idea comes from the Tennis reference, where the bat becomes a window and the ball a CD.

| # | Timeline | Renderer | Snake is | Dot is | Score shown as | Wild hook |
|---|---|---|---|---|---|---|
| 00 | LCD Ghost, 1999 | Flat | LCD pixel blocks | Four-pixel diamond | LCD digits | None. Calm on purpose. |
| 01 | Acid Paradise, 1968 | Flat + generated pattern | Striped illustrated worm | Sunburst flower | Bubble numerals | Colour-cycling bands, fractal crack, misregistered print layers jumping on the beat |
| 02 | Disco Inferno, 1977 | Room | Mirror-tile chain | Tiny mirror ball | Marquee bulbs | Floor tiles around the board light on the beat; sweeping light spots |
| 03 | Electric Arcade, 1986 | Flat | Chunky yellow sprite with a face | Striped red square | Hi-score font | Scrolling vector floor, frame colour steps on the beat |
| 04 | Pixel Kombat, 1993 | Flat, low-res upscaled | 16-bit green blocks | Red orb | Fight-HUD bar | Two original fighters react to each bite; parallax, crowd bounce, hit sparks |
| 05 | Plastic Internet, 2001 | Room | Chrome beads | Glossy yellow bead | Glossy pill button | Bubbles, lens flares, sky hue cycling |
| 06 | Berlin Bunker, 2026, 04:37 | Box room | Red light tiles | Red sphere | Stencil numerals on the wall | Kick-synced red strobes, laser sweeps, smoke. This is the strobe room. |
| 07 | Reality.exe, 2088 | Room, first-person capable | Glass blocks | Yellow gem | Huge 3D digits on the horizon | Sun pulse, checker colours swap on a bite |
| 08 | Time Warp | Flat + generated tunnel | Previous timeline's snake | Portal seed | Stretched digits | Maximum. Held for one or two bites. |
| 09 | Wrong Universe | Hybrid | Material from timeline B | From timeline C | From timeline D | Room from A; nothing matches |
| 10 | Desktop Error, 1995 | Flat | Trail of dragged windows | Desktop icon | LED counter | Error dialogs pile up around the board; one reads "Time is not responding." |

Two shared building blocks for rooms:

- **Box room.** Walls stand exactly on the lethal edges, so the boundary is a wall you can see coming. Used by the Bunker and for first-person passages.
- **Poster sheet.** A texture generated on a canvas at startup from the game's own phrases, years, stripes and barcodes ("TIME BREAK", "WRONG DECADE", "04:37", "2088"), plastered over box-room walls.

## 11. Stages

Normally: stop and show the owner at each checkpoint. For the overnight run in section 15 this is suspended: keep going, and leave the checkpoints for the owner to review in the morning.

**Stage 1 — first playable slice (checkpoint 1)**

Simulation and tests; director with both intensity modes and tests; title with warning gate and both switches; HUD, pause, game over, best score; keyboard and swipe; LCD Ghost and Electric Arcade; the night-court room with a 3D snake; one first-person passage with minimap and keycap cues; inversion impact, beat pulse, shader punch, 2D glitch slices; minimal sound with mute; debug switches.

Done when:

- A full run works start to death to restart, on desktop keys and on a phone by swipe.
- The first bite cuts LCD to Arcade with "TIME BREAK!"; later bites reach the 3D room and a first-person passage.
- With reduced flash on, cuts obey the limiter and no inversion or strobe appears.
- With `?nogl` the game is fully playable.
- `npm test` passes, including the replay test in section 12.
- The owner has played it and settled the speed numbers.

**Stage 2** — effects stage and buffer-blend transitions (6.6); perspective fallback without WebGL.

**Stage 3** — box room and poster sheet; Berlin Bunker, Disco Inferno, Plastic Internet. **Checkpoint 2.**

**Stage 4** — Acid Paradise, Pixel Kombat, Desktop Error, Time Warp.

**Stage 5** — Wrong Universe, Temporal Collisions, corruption, Total Reset, the remaining transition gestures. Nested-reality gag only if it can be done without ever showing two snakes. **Checkpoint 3.**

**Stage 6** — full sound: per-timeline voices and rhythm layers.

**Stage 7** — phone polish, optional on-screen direction buttons, quality scaling on slow devices, size check, final verification.

## 12. Tests and verification

Unit tests (`node --test`):

- One cell per tick; two-turn queue; reversal rejected, including two quick turns inside one tick.
- Over a long autopilot run: length is always 3 + score, the dot is never on the snake, every cell is inside the grid.
- Death on all four walls with no wrap; death on self; the vacating-tail move is legal.
- Speed curve values; `advance` consumes time exactly.
- Same seed and inputs give the same run.
- **Replay test:** the same seeded run executed twice, once with nothing attached and once with a director forcing a cut through every scene and view on each bite while both switches are toggled. State must match on every tick. Snapshots must reject mutation.
- Director: first-bite cut; reduced-flash hold and swing limits hold over a long random sequence; no repeat scene; no first person in reduced motion or without clear cells; no 3D without WebGL; first-person timeout.

In the browser, with screenshots at desktop and phone sizes: each scene held with `?scene=…&lock&auto`; `?nogl`; muted; both switches on. Check the compressed size.

These cover the seven checks at the end of the master prompt: 1–5 by the replay and unit tests, 6 by the board-on-top rule plus the visual pass, 7 by `?nogl` and mute.

## 13. Open questions for the owner

None of these block the build. Defaults are in place.

1. **Opening label.** Decided: "3310 Ghost, 1999".
2. **Strobe length in wild mode.** Default: bursts up to about 0.4 s. Longer sustained strobes are possible but hurt play.
3. **First person under reduced motion.** Default: skipped. Alternative: keep it with snap turns.
4. **Eleventh timeline.** Default: include Desktop Error, 1995.
5. **Six Finger Punch branding.** Default: none. If the studio is the owner's, its marks could go on the poster walls.

## 14. Kickoff prompt for the builder

> Read `BUILD_PLAN.md`, then `SNAKE_SHIFT_REFERENCE_PACKAGE/MASTER_PROMPT.md`, then look at the reference images. Build Stage 1 from the plan into a new `snake-shift/` folder. Write the simulation and its tests first and get them passing before any rendering. Run the game in a browser and check each "Done when" item yourself. Stop at checkpoint 1 and report what works, what does not, and the speed values you would suggest.

(This single-builder prompt is superseded for the overnight run by section 15.)

## 15. Parallel overnight build

The owner is asleep and asked for as much progress as possible, built by several sessions at once. This section is binding for every session and overrides anything above that conflicts with it.

### 15.1 Rules for every session

- **Never ask a question or wait for approval.** Take the default, write one line about it in your notes file, continue. Speed numbers stay at their defaults. Do not stop at checkpoints.
- **Edit only the files you own** (15.2). Never edit another stream's files, this plan, or `.claude/launch.json`. If you need something from another stream, code a tolerant fallback and write the request in your notes.
- **Notes file:** `snake-shift/notes/<stream>.md`, at most 40 lines: what is done, what is not, defaults you chose, requests for other streams.
- **Token care:** read this plan once. Read only the parts of the master prompt and only the reference images your brief names. No subagents. Final report at most 12 lines.
- **Verify your own piece** with `node --test` where it applies, and in the browser with your harness page on your own dev server. If the browser is unavailable or would need an approval, skip it, say so in your notes, and move on.
- Everything is generated in code. No network fetches, no dependencies, no git.
- The two top rules still hold: visuals never write game state, and it has to be wild. The board layer stays crisp and on top.

### 15.2 File ownership

All paths are inside `snake-shift/`.

| Stream | Owns | Dev server |
|---|---|---|
| `core` | `index.html`, `style.css`, `package.json`, `src/main.js`, `config.js`, `rng.js`, `sim.js`, `director.js`, `fx.js`, `autopilot.js`, `prefs.js`, `input.js`, `ui.js`, `src/render/flat.js`, `src/render/registry.js`, `src/render/timelines/lcd.js`, `tests/sim.test.js`, `tests/director.test.js`, `dev/core.*` | `ss-core`, port 4173 |
| `gl` | `src/render/gl/**`, `dev/gl.*` | `ss-gl`, port 4174 |
| `flat-a` | `src/render/timelines/arcade.js`, `acid.js`, `timewarp.js`, `dev/flat-a.*` | `ss-flat-a`, port 4175 |
| `flat-b` | `src/render/timelines/kombat.js`, `desktop.js`, `dev/flat-b.*` | `ss-flat-b`, port 4176 |
| `audio` | `src/audio.js`, `src/beat.js`, `tests/beat.test.js`, `dev/audio.*` | `ss-audio`, port 4177 |

The dev servers are already defined in `.claude/launch.json`; start yours by name with the browser preview tool. Each serves `snake-shift/`. A harness page `dev/<stream>.html` may fake a snapshot and `fx` to show your piece in isolation.

### 15.3 Contracts between streams

**`fx`** — built by `core` every frame and handed to every renderer. Animate from `fx.time` only; `core` has already applied the switches, so renderers rarely need to branch.

```js
fx = {
  now,          // ms, performance.now() clock
  time,         // seconds for animation; slowed to 15% under reduced motion
  beat,         // 0..1: 1 on the beat, then decays; scaled to 15% or less under reduced flash
  beatIndex,    // integer beat counter, for stepping things on the beat
  chaos,        // 0..1, rises with score
  punch,        // 0..1: 1 at a bite, decays over about 300 ms; 0 under reduced flash
  variant,      // integer, +1 on every bite: use it for accent and pattern variants
  bite,         // { x, y } of the last bitten cell, or null
  biteAge,      // ms since the last bite, Infinity if none
  cutAge,       // ms since this scene was cut in
  reducedFlash, reducedMotion,
}
```

**Flat timeline module** — `src/render/timelines/<id>.js`:

```js
export const meta = {
  id: 'arcade',                 // equals the file name
  name: 'ELECTRIC ARCADE', year: '1986',
  kind: '2d',
  luma: 0.08,                   // rough average brightness, 0..1
  veil: '#05030c',              // average colour of the scene
  weight: 3,                    // relative pick weight
  hud: { fg, bg, accent, panelFg, panelBg },   // CSS colours for HUD and panels
};
export function scenery(ctx, L, snap, fx) {}   // everything except the board; may paint the whole canvas
export function board(ctx, L, snap, fx) {}     // board panel, grid, lethal edge, snake, dot, bite burst
```

- `ctx` is a 2D context already scaled to CSS pixels. Restore any state you change. No clearing needed.
- `L = { w, h, cell, bx, by, bw, bh, cols, rows }` in CSS pixels; `cell` is an integer. Formula: `cell = floor(min(0.94·w / cols, 0.80·h / rows))`, `bx = round((w − bw) / 2)`, `by = round((h − bh) · 0.6)`.
- `snap` is the simulation snapshot from section 3. Flat timelines draw cells exactly, with no in-between positions.
- `board()` starts by painting its own panel so scenery never shows through cells confusingly. Head, body, dot and lethal edge must differ by shape, not only colour. When `snap.alive` is false, show the snake as dead without flashing it.
- Pure functions of their arguments, apart from caches. Budget about 4 ms per frame on a laptop: cache static layers in offscreen canvases, avoid `shadowBlur` on many elements.

**3D renderer** — `src/render/gl/engine.js`:

```js
export async function createRoomRenderer(canvas, { cols, rows })
// resolves to null when WebGL or a shader is unavailable; otherwise:
{
  rooms,                          // { [id]: meta } for every room that loaded; meta as above with kind: '3d' and views: ['board', 'pov']
  resize(cssW, cssH, dpr),
  render(roomId, view, snap, fx), // view: 'board' | 'pov'
  lost(),                         // true after context loss
}
```

Rooms live in `src/render/gl/rooms/<id>.js`. The engine loads the list `court`, `disco`, `plastic`, `bunker` by dynamic import and skips any that are missing. The room module interface is the `gl` stream's to design and document at the top of `rooms/court.js`; a new room must be one new file. The first-person minimap and keycaps are drawn by `core` on the 2D canvas; the engine draws the energy walls and dot beacon.

**Sound** — `src/beat.js` and `src/audio.js`:

```js
createBeat({ bpm = 132 } = {})
// → { bpm, running, setTimeSource(fn /* returns seconds */), start(), stop(), index(), phase() /* 0..1 */, pulse() /* 0..1 */ }

createAudio(getPrefs)
// → { unlock(), setMuted(bool), setTimeline(id), setChaos(x), eat(score), cut({ swing }), die(), start(), stop(), beat }
```

Every method is safe to call before `unlock()` and when Web Audio is missing. `beat` is a `createBeat()` instance that follows the audio clock once unlocked. Timeline ids: `lcd`, `acid`, `disco`, `arcade`, `kombat`, `plastic`, `bunker`, `court`, `timewarp`, `wrong`, `desktop`.

**Loading** — `core` loads flat timelines `lcd`, `arcade`, `acid`, `kombat`, `desktop`, `timewarp`, plus `audio.js`, `beat.js` and `gl/engine.js`, by dynamic import and falls back to stubs. The game must run with only `lcd` present. Scenes are derived from what loaded: one per flat timeline, and `<id>` plus `<id>-pov` per room.

### 15.4 Waves

1. **Wave 1, five sessions in parallel:** `core`, `gl`, `flat-a`, `flat-b`, `audio`.
2. **Wave 2, five sessions in parallel** (ownership in 15.5).
3. **Wave 3, one session `finish`:** wire in what wave 2 left unwired, a post-effects pass for rooms, phone polish, size check, final verification against the master prompt's seven checks.

### 15.5 Wave 2 status and ownership

Wave 1 result: `core`, `gl`, `flat-a` and `audio` are done and already load each other; `npm test` passes; the game runs through LCD, Arcade, Acid, Time Warp and the night court in both views. The first `flat-b` session was stopped with nothing saved, so Pixel Kombat and Desktop Error are rebuilt in wave 2. Read `snake-shift/notes/*.md` from wave 1 for what exists.

All paths are inside `snake-shift/`. Notes go to `notes/<stream>.md`.

| Stream | Owns | Dev server |
|---|---|---|
| `integrate` | every file in the wave 1 `core` row | `ss2-integrate`, port 4181 |
| `rooms-a` | `src/render/gl/engine.js`, `geometry.js`, `glutil.js`, `m4.js`, `shaders.js`, `rooms/court.js`, `rooms/bunker.js`, `dev/gl.*`, `dev/rooms-a.*` | `ss2-rooms-a`, port 4182 |
| `rooms-b` | `src/render/gl/rooms/disco.js`, `rooms/plastic.js`, `dev/rooms-b.*` | `ss2-rooms-b`, port 4183 |
| `flat-b` | `src/render/timelines/kombat.js`, `desktop.js`, `dev/flat-b.*` | `ss2-flat-b`, port 4184 |
| `flat-c` | `src/render/timelines/wrong.js`, `src/render/persp.js`, `dev/flat-c.*` | `ss2-flat-c`, port 4185 |

Extra rules for wave 2:

- Other streams are editing their own files while you work. If something outside your files breaks under you, wait a minute and retry; do not fix it yourself.
- `rooms-a` may extend the engine and the room kit, but only additively: nothing `rooms/court.js` or the documented room interface relies on may be renamed or removed, because `rooms-b` is building against it at the same time.
- Save work early and in small pieces: several short writes per file, never one very long one.

### 15.6 Wave 3 status and ownership

Wave 2 result: all seven flat timelines and all four rooms exist and pass their own harness cell checks; `npm test` passes 44 of 44; the game is about 136 KB compressed. The three new rooms, Desktop Error and the HUD over Pixel Kombat and Wrong Universe have not been checked inside the full game. `persp.js` is not wired in.

| Stream | Owns | Dev server |
|---|---|---|
| `finish` | every file in the wave 1 `core` row, `README.md`, and for bug fixes only: `src/render/timelines/**`, `src/render/persp.js`, `src/audio.js`, `src/beat.js` | `ss3-finish`, port 4186 |
| `fx-pass` | `src/render/gl/**`, `dev/gl.*`, `dev/fx-pass.*` | `ss-gl`, port 4174 |

The app allows only five dev servers per folder and earlier sessions may still hold them. If yours will not start, use any server already running on ports 4173–4177 or 4190: they all serve `snake-shift/`. The servers send no cache headers, so after editing a module switch between `localhost` and `127.0.0.1` or add a query string to see fresh code.
