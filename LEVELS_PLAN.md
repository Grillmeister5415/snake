# SNAKE//SHIFT — Levels and lives plan

This plan adds five new universes, lives and a music progression to the game that already exists in `snake-shift/`. It is written for the sessions that build it.

## 0. How to use this plan

- The game is built and playable. Its architecture is described in `BUILD_PLAN.md`; read sections 2, 6 and 15.3 there for background. Where the two plans disagree, **this plan wins**.
- The owner's source prompts (five levels; lives and a shift ramp) contradicted each other and the existing game in several places. Every contradiction was put to the owner and is resolved in section 1. Build from this plan, not from the prompts.
- Git: work happens on branch `levels-lives-ramp`. The last known-good game is on `main`. **Sessions never run git commands that change anything** (no add, commit, switch, stash, restore). The coordinator commits between waves.

Words used here:

- **Universe**: one of the sixteen worlds (the eleven existing timelines plus five new ones). A universe has a fixed rule kind.
- **Look**: how a universe is shown: `2d` (flat board), `3d` (room, board view) or `pov` (room, first person).
- **Shift**: the universe changes. It happens on every food, as in the game today, except while a special universe is being held.
- **Special universes**: the three that change the rules: `lane`, `mushroom`, `castle`. **Flip**: the look changes inside the same universe.

## 1. Decisions made by the owner

| Topic | Decision |
|---|---|
| Flow | One constant random flow. No level select, no modes. |
| Player choice | None. The player can never choose a universe or a look; the game decides at random. No key, button or menu for it. |
| Shifts | **On every food, from the first one, exactly as the game does today.** The ramp from the add-on prompt (10, 9, 8 …) was dropped by the owner: lives already make the game easier. |
| Lives | Every run starts with 3. A collision costs one and respawns a short snake. Maximum 5. Zero lives ends the run. Lives are shown in the HUD with an icon that belongs to the current universe. |
| Special universes | Endless Lane, Mushroom Land and Castle Cube are **held for about five bites**, cutting between their 2D and 3D look on each bite inside. They are rare: about one shift in ten. The thirteen standard universes still last one bite. |
| Leaving lane or cube | Body left outside the plain board is harmless and is used up from the tail. Length and score are untouched. |
| Mushrooms | An extra item beside the dot, only in Mushroom Land. Eating one is one food event (score, growth, and therefore a shift) and adds a life up to 5. At 5 it is still food. |
| 3D rooms | Board view with occasional first person. New rooms start in their own art style and turn neon as chaos rises. |
| First-person steering | Left always turns left, right always turns right; up and down do nothing. Board views use grid directions. |
| Wildness | Flashy by default and it stays that way: inversion on every bite, strobe bursts up to 0.4 s, warning screen, Reduced flash switch. The add-on prompt's "no flashing" sentence is overruled. Calm exceptions: Abyssal Cathedral and the 3310 Ghost opening. |
| Unchanged | Speed curve (150 ms, 1.5 ms per food, floor 95 ms), chaos `clamp(score / 25, 0, 1)`, Desktop Error stays, the opening universe is "3310 Ghost", no first person under Reduced motion, no third-party branding. |

Defaults the coordinator chose:

- Respawn puts the short snake at a safe spot in board view and waits for the first direction key.
- A mushroom appears when Mushroom Land arrives and again after every second food eaten there; each expires after 80 ticks.
- The lane is as wide as the board, turning back is allowed, the view follows the head, and its dots spawn ahead, beyond where the far wall was, so the open lane actually gets used.
- Each cube face is a full 16×16 board. Up always means up on screen. No first person on the cube. Its dots usually spawn on a neighbouring face, so seams actually get crossed.
- A hold lasts 4 to 6 food events, picked by the seeded generator.
- Reduced flash can no longer skip a universe change (universes now carry rules). It turns every change into a short veiled fade instead.

## 2. Run structure

### 2.1 The sixteen universes

| id | HUD name, year | Rules | Looks | Notes |
|---|---|---|---|---|
| `lcd` | 3310 GHOST, 1999 | box | 2d | Opening universe. Calm. |
| `arcade`, `acid`, `kombat`, `desktop` | as built | box | 2d | |
| `timewarp`, `wrong` | as built | box | 2d | Rare, as built. |
| `court`, `bunker`, `disco`, `plastic` | as built | box | 3d, pov | Without WebGL they use the existing 2D perspective stand-in. |
| `lane` | ACID ENDLESS LANE, 1967 | **lane** | 2d, 3d, pov | |
| `hangar` | RED IRON HANGAR, 1957 | box | 2d, 3d, pov | |
| `mushroom` | MUSHROOM LAND, 1991 | box + **mushrooms** | 2d, 3d, pov | |
| `castle` | CASTLE CUBE, ONCE | **cube** | 2d, 3d | No first person. |
| `abyss` | ABYSSAL CATHEDRAL, −4000 M | box | 2d, 3d, pov | Calm: no inversion, strobe, glitch or colour split while it shows. |

A new universe is two files with the same id: `src/render/timelines/<id>.js` (its 2D look) and `src/render/gl/rooms/<id>.js` (its 3D look).

### 2.2 Choosing the next universe

This moves from the director into the rules, because a universe can now change them. It uses the simulation's own seeded generator, so a seed and the same inputs always give the same run, on any device and with any settings.

Port today's selection behaviour from `src/director.js` and `src/config.js`:

- Every food event shifts to a different universe, from the first food, unless the current universe is being held.
- The first two shifts are scripted as a demonstration: `arcade`, then `court`. No special universe arrives before the fourth food.
- **Special universes are held.** When `lane`, `mushroom` or `castle` arrives, it stays for 4 to 6 food events (seeded); the food event that uses up the hold shifts away as usual. A mushroom counts as a food event here like anywhere else.
- **Special universes are rare.** Start each at weight 0.9 and tune so that about one shift in ten goes to one of them. Never two special universes back to back.
- Weights as built: a universe not yet visited this run weighs 1.6 times as much; one shown in the last three shifts weighs 0.4 times.
- `timewarp` and `wrong` stay rare as built: low weight, never before score 4, never straight after each other, and held for one or two bites (the only case where a food does not shift).
- Total Reset as built: after a room or a rare universe, a chance of `0.07 + 0.23 · chaos` to snap back to `lcd`.

## 3. Rules layer

Owner: the `rules` stream. Pure modules, no DOM, fully tested. This replaces the current `src/sim.js` in place and keeps its style.

### 3.1 Files

- `src/sim.js` — `createSim`, orchestration, lives, items, events, snapshot.
- `src/space.js` — the three spaces and the pure geometry helpers that renderers import.
- `src/flow.js` — the universe sequence of 2.2.
- `src/rules-config.js` — constants for all of the above.
- `src/autopilot.js` — steers through `queueTurn` using `space.js` neighbours, in all three spaces.

### 3.2 API

```js
createSim({ universes, speed, seed, start })
// universes: [{ id, rules: 'box' | 'lane' | 'cube', mushrooms: bool, rare: bool, room: bool, weight }]
//            the caller passes the universes that actually loaded; 'lcd' must be present
// start (tests and debug): { score, lives, universe, snake, dir, food }

sim.reset(seed)   sim.setPaused(bool)   sim.queueTurn(dir)   sim.advance(dtMs)   sim.step()
sim.snapshot()    sim.on(type, fn)
sim.lockUniverse(id | null)        // debug: hold one universe
```

Events: `reset`, `pause`, `resume`, `turn`, `step`, `ate { kind: 'dot' | 'mushroom', score, cell, lifeGained }`, `shift { from, to, index }`, `lifeLost { lives, death }`, `died { death, score }`.

Order on one food tick: `step`, then `ate`; then, unless the universe is held, the next universe is picked, the space changes, the dot is placed, and `shift` fires. A snapshot taken inside a `shift` listener already shows the new universe and space. On a held bite only `ate` fires and `universe.holdLeft` drops by one.

### 3.3 Snapshot

Renderers always see **one 16×16 board in board-local coordinates**, whatever the space is. That is what keeps the fifteen existing renderers working.

```js
snap = {
  cols, rows,            // 16, 16, always
  snake,                 // cells on the active board, head first, { x, y } board-local
  breaks,                // sorted indices k where snake[k] and snake[k+1] are NOT joined
  length,                // true body length, including cells that are off the board
  dir, prevDir, heading, // board-local
  prevTail,              // board-local cell the tail left this tick, or null if it was off the board
  grew,
  food,                  // board-local dot, or null when the dot is not on the active board
  mushroom,              // board-local cell, or null
  score, stepMs, tick, progress,
  alive, paused,
  waiting,               // 'start' | 'respawn' | null
  death,                 // last collision { reason: 'wall' | 'self', cell }
  lives, maxLives,       // 3 at start, 5
  universe: { id, rules, mushrooms, index, holdLeft },   // holdLeft: food events left before it shifts away (0 for standard universes)
  space,                 // see 3.4
  body,                  // full body in space coordinates; null in box space
  foodAt,                // the dot in space coordinates; null in box space
  seed,
}
```

Contract for every renderer: **never interpolate or draw a connection between two cells that are not adjacent, and never across an index listed in `breaks`.** Draw each cell where it is.

### 3.4 Spaces

**Box** — today's board. `space = { kind: 'box' }`. Walls lethal.

**Lane** — `space = { kind: 'lane', y0, prevY0 }`.

- Cells are `{ x, y }` with `x` in 0..15 and `y` any integer; forward is up (decreasing `y`). The side walls are lethal. There is no end wall in either direction.
- The active board is the 16-row window starting at absolute row `y0`; board-local `y = y − y0`.
- The window follows the head: it scrolls so the head's local row stays within 5..10. `prevY0` is the origin before this tick, for smooth scrolling.
- On arrival the dot is placed again, and every later dot in the lane spawns the same way: 2 to 8 rows beyond the window's top edge, on a free cell. It is off the board at first (`food` is null, `foodAt` has it) and comes into view as the window follows the head.

**Cube** — `space = { kind: 'cube', face, rot, prevFace, prevRot, entered }`.

- Six faces of 16×16. A canonical cell is `{ f, u, v }`.
- The active board is the head's face, shown in a frame that is carried across seams so that the snake's board-local direction never changes. Crossing the top seam while heading up puts the head on the bottom row of the new face, still heading up. `rot` (0..3) is that frame's rotation against the face's canonical axes; `entered` is the direction of a seam crossing on this tick, otherwise null.
- Seams are connections, never walls. Self-collision is checked on canonical cells across all faces.
- On arrival the dot is placed again, and every later dot on the cube spawns the same way: on a reachable free cell, 70% on a face next to the head's, otherwise on the head's face.
- `space.js` exports the pure helpers both renderers need: `cubeNeighbour(f, u, v, dir)`, `cubeCellToWorld(f, u, v) → { pos, normal }` on a cube of edge 16 centred at the origin, `faceFrame(f, rot) → { right, up, normal }`, `cubeNet(face, rot)` for the map.

**Changing space.** A shift goes old space → box → new space on the same tick, and never moves a cell:

- Leaving the lane: the current window becomes the box. Leaving the cube: the head's face, in its current frame, becomes the box.
- Body cells that end up outside the box become **off-board cells**: they stay in the body, cannot be hit, are not in `snake`, and are removed from the tail end as the snake moves. `breaks` marks where the visible body is interrupted.
- Entering the lane: the box becomes the window (`y0 = 0`). Entering the cube: the box becomes face 0 with `rot = 0`.
- Arriving in a box universe: if the dot is not on the board, it is placed again. The mushroom is removed when Mushroom Land leaves.

### 3.5 Items

- The dot always exists. All spawns are on **reachable** free cells (breadth-first from the head), falling back to any free cell.
- Mushroom: only while `universe.mushrooms`. One spawns on the tick after Mushroom Land arrives, and again after every second food event eaten there if none is present; always at least 4 cells from the head. Each expires after 80 ticks. Eating it: `score += 1`, the snake grows by one, `lives = min(5, lives + 1)`, and it counts as one food event toward the hold. The dot stays where it is.

### 3.6 Lives and respawn

- On a lethal collision with `lives > 1`: `lives −= 1`, the whole body is discarded, and a snake of length 3 is placed on the active board: at the cell nearest the centre that has at least 5 free cells straight ahead and is at least 3 cells from the dot and mushroom. Then `paused = true`, `waiting = 'respawn'`, event `lifeLost`. Score, universe, space, dot and speed are unchanged.
- With `lives === 1` the collision sets `lives = 0`, `alive = false`, event `died`.
- The run also starts with `waiting = 'start'`. In both cases the shell resumes on the first direction key.

### 3.7 Tests the rules stream owns

The universe sequence is deterministic and obeys 2.2, including hold lengths, the rarity of special universes over a long run, and never two of them in a row; no shift ever changes a body cell; every space pair transition (box, lane, cube in all orders) preserves cells and marks off-board cells; off-board cells are harmless and expire; lane has no end wall and lethal sides; cube: crossing any of the 24 directed seams and stepping back returns to the same canonical cell, and four turns around a corner behave consistently; lives 3 → 0 with respawn rules; mushroom rules including the cap; reachable spawns; same seed and inputs give the same run. Keep the classic checks that still apply.

## 4. Presentation layer

Owners: the `shell` stream (director, effects, main loop, HUD) and the `overlay` stream (the 2D canvas manager).

### 4.1 Director

The director no longer chooses universes. It listens to the simulation and chooses the **look** for each arrival, at random. The player never chooses.

- On `shift`: hard cut with today's impact: inversion for 60–90 ms, a strobe burst on first entry to a room or by the built chance (8% + 50% · chaos), phrase cards as built.
- Look on arrival: a universe with one look uses it. Rooms pick `3d` or `pov` with today's weighting (first person about 0.45 of the board view, only with 4 clear cells ahead, never before the fourth food, never under Reduced motion). New universes pick `2d` 40% of the time, otherwise a room look by the same rule. `castle` never picks `pov`.
- **Held bites flip the look.** On a bite inside a held special universe (an `ate` with no `shift`), the director cuts to a different look of the same universe with the same impact as a shift: `castle` alternates `2d` and `3d`; `lane` and `mushroom` move between `2d`, `3d` and, under the usual gate, `pov`.
- A first-person passage that lasts 12 seconds falls back to the `3d` look of the same universe, as built.
- On `lifeLost`: impact with a strobe burst, a phrase, and the board look is forced (`3d` or `2d`, never `pov`).
- Without WebGL: new universes show only `2d`; the four existing rooms use the perspective stand-in.
- **Calm** universes (`lcd`, `abyss`): no inversion, strobe, glitch or colour split while they show, and the beat pulse is capped at 15%.
- **Reduced flash:** no inversion or strobe anywhere; every shift is a 450 ms veiled fade. Shifts always happen on time, because they can change the rules. When they come less than 3.5 s apart, the veil stays partly up between them so the overall brightness changes slowly. (This replaces today's rule of skipping cuts.)
- **Reduced motion:** no first person, no slide or camera glide, cuts only.

### 4.2 `fx` additions

`lives`, `universe`, `look`, `calm`, `rules`. Everything else, including `chaos`, stays as in `BUILD_PLAN.md` 15.3.

### 4.3 Lives in the HUD, in each universe's own style

- Five slots in the top bar beside the score: filled for lives held, hollow for the rest. A slot visibly breaks on a loss and pops on a gain. Shape and count carry the meaning, not colour alone.
- **The icon belongs to the universe.** Every universe module, flat timeline or room, may export `life(ctx, x, y, size, filled, fx)`, a small Canvas 2D drawing. Rooms can export it too, since room modules load without WebGL. The shell draws the slots on a small canvas in the HUD with the current universe's function, and falls back to a rounded block in the HUD accent colour.
- Suggested icons: pixel blocks in 3310 Ghost, sprite heads in the Arcade, flowers in Acid Paradise, fight-bar pips in Pixel Kombat, tiny windows in Desktop Error, red lamps in the Bunker, mirror tiles in the Disco, chrome beads in Plastic Internet, glass blocks in Reality.exe, rivets in the Hangar, toadstools in Mushroom Land, berries in the Castle, pearls in the Abyss, flower discs in the Lane.

### 4.4 Respawn

Impact, then the short snake pulses gently and the hint reads "PRESS A DIRECTION" (or the tap wording). The music ducks (section 7). Game over, title, warning gate and switches stay as built.

### 4.5 Space helpers in `flat.js`

- **Cube map:** a small unfolded-cube map in the corner where the first-person minimap sits, in the current frame, showing the snake across all faces and the dot.
- **Dot arrow:** whenever `food` is null but `foodAt` exists (dot on another cube face, or ahead in the lane), an arrow on the board's edge points toward it.
- **Seam slide (2D look):** when `space.entered` is set, the old face slides out and the new one slides in along the travel direction over 140 ms. Cut instead under Reduced motion.

### 4.6 Debug switches

These are developer tools for testing. They are never shown in the game, and the ones that hold a universe or a look work **only together with `?debug`**, so a player cannot use them to choose.

Kept from `BUILD_PLAN.md` section 9: `?debug`, `?auto`, `?seed=`, `?nogl`, `?start=&ramp=&cap=`. New, owned by `shell`: `?universe=<id>&lock` holds one universe (replaces `?scene=`), `?look=2d|3d|pov` holds a look, `?score=<n>` starts a run at that food total, `?lives=<n>` sets the starting lives.

## 5. Engine extensions

Owner: the `engine-ext` stream. All additive: the four existing rooms must render exactly as before, and their harness cell checks must still pass.

1. **Room list:** add `lane`, `hangar`, `mushroom`, `castle`, `abyss` to `ROOM_IDS`.
2. **Gap-safe snake:** honour `snap.breaks` and adjacency in `drawSnake`; never interpolate across a break; treat a null `prevTail` as no tail motion; draw no dot when `food` is null.
3. **Items hook:** optional `instance.items(d)`, called after the snake, for opaque meshes on the board (the mushroom). The post-effects mask must cover them.
4. **Lane support:** when `snap.space.kind === 'lane'`, interpolate the snake in absolute rows and place it against a smoothly interpolated origin (`prevY0 → y0` over the tick). Expose that scroll to rooms as a uniform for the floor pattern and as `d.scroll` for repeating props. `F.board.open = true` draws the board as a strip running to the horizon with frame bands on the two sides only, and first-person energy walls on the sides only. The first-person camera uses the same absolute rows and smooth origin.
5. **Custom board:** `F.custom = true` makes the engine skip its own board, grid, curb, snake, dot, pools and walls, use `F.camera = { eye, target, up, fovy }`, and call `instance.surface(d)` for the room to draw its own board, snake and dot. `F.protect` is a list of world-space quads the post-effects pass must keep clean.
6. Prove 4 and 5 with two throwaway test rooms in the harness, so the lane and cube rooms can rely on them.

## 6. The five new universes

Each universe stream builds the flat timeline and the room, and exports a `life()` icon (4.3). Contracts: `BUILD_PLAN.md` 15.3 for flat timelines, the header of `rooms/court.js` for rooms. Reference images are mood only.

Shared rules:

- **Two styles in one room.** The room starts in the universe's own art style and shifts toward the neon look as `fx.chaos` rises: palettes, line colours and glow blend from "own" at chaos 0 to "neon" at chaos 1.
- **Wild in the scenery, crisp on the board.** React to `fx.beat`, `fx.punch`, `fx.chaos`, `fx.variant`. Head, body and dot differ by shape.
- **It must land in seconds.** A standard universe is on screen for one bite, and a special one changes look on every bite, so each look's identity has to read at a glance.
- **Edges say what they are.** A lethal edge looks like a wall or rail. The lane's two open ends fade out with no rail. The cube's four seams look like soft doorways, never like walls.
- **Board cells are exact in 2D.** Only scenery may move smoothly; the 2D lane may scroll its scenery and lane markings using `prevY0`, `y0` and `progress`.
- **Original designs only.** The images contain look-alikes that must not be reproduced: yellow item blocks and a small yellow creature in the castle images, a red spotted extra-life mushroom in a block world, and tanks close to real vehicles.

| id | Images (mood) | 2D look | 3D look, own style → neon |
|---|---|---|---|
| `lane` | `12_3D_ACID_TRIP_GLASSFLOWER`, 2D `01`, unique `01`, chaos `01` | Hand-printed sixties op-art board, cream ground, orange grid, floral worm; scrolls with the window; open ends fade out, side rails are the lethal edge | An endless arcade of swirling arches, giant flowers and mushrooms in screen-print colours → glass flowers, spiral sun, checker domes in neon. Built as a strip with repeating props (5.4). |
| `hangar` | `13_3D_SOVIET_TANK_HANGAR`, 2D `02`, unique `02`, chaos `02` | Aged blueprint sheet, riveted brass segments, red rivet border, gear drawings | A vast concrete hangar in amber haze: gantry cranes, chains, pipes, light shafts, wet floor, and boxy invented tanks with no markings → the same hall with red lamps, cyan grid and neon edges |
| `mushroom` | `14_3D_PIXEL_MUSHROOM_LAND`, 2D `03`, unique `03`, chaos `03` | Navy pixel board, checker snake, pixel border of ferns and toadstools | Terraced cubic hills, waterfalls, giant toadstools, pixel clouds in a limited palette → glowing voxel neon. The **life mushroom** is its own design: tall bell cap, mint and gold bands, no face, no red-and-white spots. It must read as different from the dot at a glance. |
| `castle` | `15_3D_STORYBOOK_SKY_CASTLE`, 2D `04`, unique `04`, chaos `04` | Watercolour wash with barely visible seams, ribbon-and-flower serpent, berry dot, storybook border. Shows the current face only. | A hand-painted sky kingdom of floating gardens, towers, bridges and clouds around **one floating cube**, whose six faces carry the board → glossy saturated neon. Uses the custom board (5.5): the camera sits off the current face so two neighbours are visible, and turns smoothly across a seam. Tiles nearly invisible. |
| `abyss` | `16_3D_ABYSSAL_CATHEDRAL`, 2D `05`, unique `05`, chaos `05` | Stained-glass board with lead lines, scallop-shell segments edged in gold, pearl dot | A drowned gothic nave: stained glass, columns, coral, drifting jellyfish, light shafts, gold filigree → bioluminescent neon coral. **Calm:** slow drift, no hard flashes. |

## 7. Music intensity progression design

No text was supplied for this, so the design below is the coordinator's. Owner: the `audio` stream. Web Audio only, no files.

**Idea:** one track that never stops and keeps growing, while every bite swaps the band. The rhythm and bar position carry on across a shift; only the instruments change.

### 7.1 Three dials

| Dial | Source | What it controls |
|---|---|---|
| **Stage** (0..10) | `min(10, floor(score / 5))` | How many layers play and how fast |
| **Hunger** (0..1) | time since the last bite, reaching 1 after about 6 seconds | A riser that builds while you have not eaten, and is released by the next bite |
| **Colour** | `universe.id` | Which kit and bite voice (existing eleven plus five new) |

### 7.2 Stage: layers and tempo

| Stage | Foods | Tempo | Layers |
|---|---|---|---|
| 0 | 0–4 | 112 | Kick and a sub pulse (clicks only while in 3310 Ghost) |
| 1 | 5–9 | 116 | + offbeat hat |
| 2 | 10–14 | 120 | + bass line |
| 3 | 15–19 | 124 | + snare or clap |
| 4 | 20–24 | 128 | + sixteenth hats |
| 5 | 25–29 | 132 | + the universe's lead or arpeggio |
| 6 | 30–34 | 136 | + second percussion layer |
| 7 | 35–39 | 140 | + fills every fourth bar |
| 8 | 40–44 | 144 | + stronger pumping, filters fully open |
| 9 | 45–49 | 148 | + rolls and stabs |
| 10 | 50+ | 152 | Everything |

Tempo changes keep the beat phase continuous (`beat.setBpm`). The visual beat pulse follows the same clock.

### 7.3 Every bite is a drop

- While hunger rises: the master low-pass closes a little, a noise riser swells, the hats tighten.
- On the bite: a sixteenth-note gap, then an impact (sub drop and crash, heavier on a brightness swing) and the new universe's kit enters on the same bar position with the full layer count for the stage.
- From stage 8 on, bites often come faster than a bar: the gap shrinks to a stutter so the groove never stalls.

### 7.4 Other events

- **Bite note:** still walks the universe's scale with the score.
- **Arriving in 3D or first person:** a whoosh, and the delay send widens; first person adds a low drone.
- **Life lost:** a tape-stop pitch drop, then the music continues muffled and quiet while waiting for the key press, and snaps back on the first move.
- **Last life:** a heartbeat pulse under the mix and a slight detune.
- **Life gained:** a short rising figure of its own (not the well-known extra-life jingle).
- **Calm universes:** `lcd` is always clicks and silence whatever the stage, which is the joke when it returns late. `abyss` plays half-time with soft attacks and at most the layers of stage 4.
- **New kits:** `lane` acid bass line and tabla-like hits; `hangar` march snare, anvil hits, low brass drone; `mushroom` bright chip arpeggios; `castle` music box and celesta in three-four feel over the four-four grid; `abyss` deep pads, slow plucks, distant calls.
- Loudness rises about 6 dB from stage 0 to stage 10 behind the existing limiter. Mute and the "safe before unlock" rule stay.

### 7.5 Interface

`createAudio` keeps its current methods and adds:

```js
audio.setScore(score)                              // drives the stage; call on every food event
audio.shift({ from, to, look, swing })             // every bite (replaces cut); on a held bite from === to: same kit, still a drop
audio.setLives(n)   audio.lifeLost()   audio.lifeGained()   audio.respawned()
beat.setBpm(bpm)                                   // phase-continuous
```

Unknown ids still fall back safely. The schedule logic (which layers at which stage, how the gap shrinks) lives in pure functions with unit tests.

## 8. Building it

### 8.1 Rules for every session

The rules of `BUILD_PLAN.md` 15.1 apply: never ask or wait, edit only files you own, a notes file of at most 40 lines at `snake-shift/notes/<stream>.md`, no subagents, final report at most 12 lines, save in small pieces. In addition:

- **No git writes** (section 0).
- **Browser:** use `http://localhost:4321`, the no-cache server the coordinator keeps running. If it is down, run `node serve.mjs <a free port>` yourself. Do not start dev servers by name; the folder is at its limit.
- The Browser pane may be hidden and throttle animation frames. Build harnesses that render on demand.
- Other streams edit their own files while you work. If something outside your files breaks, wait a minute and retry.

### 8.2 Waves and ownership

All paths inside `snake-shift/`. Each stream may add `dev/<stream>.*` harness files.

**Wave 1 — seven sessions**

| Stream | Owns |
|---|---|
| `rules` | `src/sim.js`, `src/space.js`, `src/flow.js`, `src/rules-config.js`, `src/autopilot.js`, `tests/sim.test.js`, `tests/space.test.js`, `tests/flow.test.js`, `tests/lives.test.js`, `tests/steer.test.js` |
| `engine-ext` | `src/render/gl/engine.js`, `shaders.js`, `post.js`, `geometry.js`, `glutil.js`, `m4.js`, `boxroom.js`, `dev/gl.*` |
| `audio` | `src/audio.js`, `src/beat.js`, `tests/beat.test.js`, `tests/music.test.js` |
| `hangar` | `src/render/timelines/hangar.js`, `src/render/gl/rooms/hangar.js` |
| `abyss` | `src/render/timelines/abyss.js`, `src/render/gl/rooms/abyss.js` |
| `mushroom` | `src/render/timelines/mushroom.js`, `src/render/gl/rooms/mushroom.js` |
| `flat-spaces` | `src/render/timelines/lane.js`, `src/render/timelines/castle.js` |

Room streams test with `createRoomRenderer(canvas, { roomIds: ['<id>'] })`, so they do not depend on `engine-ext` finishing. While wave 1 runs, the game itself is expected to be broken (the shell still speaks the old simulation); harnesses and your own test files are the measure. Run only your own test files (`node --test tests/<yours>.test.js`); `tests/director.test.js` belongs to wave 2 and may fail until then. `rules` may import existing constants from `src/config.js` but puts new ones in `src/rules-config.js`.

**Wave 2 — five sessions**

| Stream | Owns |
|---|---|
| `shell` | `src/director.js`, `src/fx.js`, `src/main.js`, `src/ui.js`, `src/input.js`, `src/prefs.js`, `src/config.js`, `src/render/registry.js`, `index.html`, `style.css`, `tests/director.test.js`, `README.md` |
| `overlay` | `src/render/flat.js`, `src/render/persp.js` |
| `lane-room` | `src/render/gl/rooms/lane.js` |
| `castle-room` | `src/render/gl/rooms/castle.js`, `src/render/gl/cube.js`, and the engine files for additive fixes only |
| `audit` | the seven existing timelines and the four existing rooms: make every one safe with `breaks`, off-board bodies and respawn, and give each a `life()` icon |

| `lane-2d` | `src/render/timelines/lane.js` |
| `castle-2d` | `src/render/timelines/castle.js` |

Wave 1 result: `rules`, `engine-ext`, `audio`, `hangar`, `abyss` and `mushroom` are done; 119 rules and music tests pass. The `flat-spaces` session was stopped with nothing saved, so the two 2D looks are rebuilt here as two single-file streams. Read `snake-shift/notes/rules.md`, `notes/engine-ext.md` and `notes/audio.md` for the exact exports, hooks and call order.

`shell` and `overlay` agree on one call: `flat.render({ snap, fx, d, timelines, glActive, persp, touch, padSide })`, unchanged from today; everything new that `flat.js` needs is in `snap` and `fx`. The director's read-only view `d` keeps its current field names (`showing`, `timeline`, `kind`, `view`, `sceneInfo`, `phrase`, `veil`, `strobe`, `invertUntil`, `bite`, `biteAt`, `cutAt`, `chaos`, `variant`): `timeline` is the universe id, `kind` is `'2d'` or `'3d'`, `view` is `'board'` or `'pov'`.

In wave 2 the rules files have no stream of their own: `shell` may make small additive fixes there and must keep their tests passing. One request is open: expose the mushroom's remaining ticks as `snap.mushroom.ttl`.

**Wave 3 — one session, `finish`**

Owns everything. Plays every universe in every look, lives, respawn in each space, both switches, no WebGL, phone size. Balances weights and the music. Fixes what fails, completes tests, updates the README.

### 8.3 Done when (whole project)

- `npm test` passes, including the new rules tests and a replay test across all three spaces.
- Every bite shifts the universe from the first bite, as today, with the same flashy impact in the default mode. The three special universes are held for 4 to 6 bites, change look on each bite inside, and arrive on about one shift in ten.
- Each of the five new universes appears in the random flow in both looks, with its rule: the lane has no end wall, the cube's seams connect with the camera following, a mushroom adds a life up to 5.
- Lives show in the HUD with the current universe's icon. Losing a life respawns a short snake with score and universe intact; the third loss ends the run (later with mushrooms).
- Leaving the lane or cube with a long snake leaves a harmless off-board body that is used up.
- The player has no way to choose a universe or a look.
- Abyssal Cathedral and 3310 Ghost never flash. Reduced flash and Reduced motion behave as in 4.1.
- The music follows section 7. Compressed size is measured and reported.

## 9. Risks

| Risk | Handling |
|---|---|
| The rules core is rebuilt; everything depends on its snapshot | It is in wave 1 with the strictest tests; the snapshot in 3.3 is frozen for the other streams |
| Castle Cube is the hardest piece (topology, camera, custom board) | Own stream; the game ships without `castle` if it slips, because universes load dynamically |
| Special universes held too long or arriving too often would slow the flow | Hold length and weight are two constants in `src/rules-config.js`; `finish` tunes them by playing |
| Fifteen existing renderers assumed an unbroken snake | The `audit` stream, plus the board-local snapshot that hides the new spaces from them |
| Shell is the largest wave 2 stream | `flat.js` is split off into `overlay` behind an unchanged call |
| Size: the game is about 142 KB compressed now, and ten new renderer files could bring it near the 250 KB target | `finish` measures it; the target was "ideally", so report rather than cut content |
| Between waves 1 and 2 the branch does not run | `main` holds the working game; the coordinator commits after each wave |
