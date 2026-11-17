# SNAKE//SHIFT — Sound plan (adaptive music rework)

This plan reworks the sound of the game in `snake-shift/`. It replaces section 7 of `LEVELS_PLAN.md`. The owner's brief is in `SOUND_BRIEF.md`; read it first, it holds the creative direction and the acceptance criteria. This plan adds what the brief leaves open: facts checked in the code, decisions, traps, a build order and how to prove the result.

## 0. How to use this plan

- Work in this worktree only: branch `claude/sound-design-music-levels-759bf4`, base `184b3c8`. `main` is one commit ahead and that commit only touches `DEPLOY.md`, so nothing needs merging.
- Do not run git commands that change anything (no add, commit, switch, stash, restore, reset). The owner commits.
- Do not touch `deploy/`, `DEPLOY.md`, the main checkout or the other worktree.
- No new dependencies, no audio files, no build step. Plain ES modules, as today.
- Numbers in this plan are starting values. Tune them, and write the final values into `snake-shift/notes/audio.md`.
- If you depart from a decision here, say so in the handover with the reason.
- Order of importance when time is short (from the brief): early musical identity, continuous propulsion, correct danger response, bite and transition hierarchy, mix clarity. Decoration comes last.

Words used here:

- **Pace**: long-term drive, 0..1, mainly from the snake's step interval.
- **Danger**: short-term pressure, 0..1, from the board situation right now.
- **World**: the universe id. It picks instruments, mode, space and limits.
- **Gesture**: a world's one characteristic figure. It carries the motif.
- **Level**: arrangement density, 0..3, derived from pace and capped per world.

## 1. What the code does today (checked on this checkout)

All paths are relative to `snake-shift/`. Tests: `npm test` gives 138 of 138 passing before any change.

| Fact | Where |
|---|---|
| One score ladder sets layers, tempo and level: stage = score ÷ 5, 112 to 152 BPM, +6 dB. Bass arrives at score 10, the lead at 25. | `src/audio.js:49-97` |
| Every bite calls `audio.shift()` then `audio.eat()`. `shift()` always cancels queued notes, ducks the mix and plays sub plus crash, also for held bites. | `src/main.js:137-145`, `src/audio.js:1217-1277` |
| Hunger rises from 1 s to 6 s after a bite, then stays at maximum: noise riser, mix low-pass down to 3.2 kHz. | `src/audio.js:100-117`, `984-992` |
| Speed: `stepMs = max(capMs, startMs − rampMs × score)`, default 150 → 95 ms, capped at score 37. `sim.speed` holds the range including URL overrides. | `src/sim.js:16-18`, `src/config.js:6` |
| The snapshot has `dir` and `heading` (direction after all queued turns). It does not expose the next direction. The turn queue holds at most two turns. | `src/sim.js:210-219`, `466-493` |
| On a food tick the sim emits `step`, then `ate`, then changes universe and space, then emits `shift`. A `step` listener therefore sees a half-finished tick. | `src/sim.js:353-376` |
| In a box, `snap.body` is null and `snap.snake` is the hittable body. In lane and cube, `snap.body` and `snap.foodAt` are in space coordinates; `snap.snake`, `snap.food` and `snap.mushroom` are board-local. Body cells left outside the board by a space change are dropped from both, so `snap.length` can exceed the visible count. | `src/sim.js:439-464`, `src/autopilot.js:8-18` |
| `stepIn()` returns null only for a wall: four walls in a box, the two side walls in the lane, never on the cube. On the cube it reads the frame from `space.face` and `space.rot` and returns the frame after the step. | `src/space.js:210-225` |
| Master: compressor at −10 dB, 20:1, 2 ms attack, then a soft clipper with its knee at 0.7. | `src/audio.js:413-429` |
| Reverb and echo return straight to the master. They bypass the low-pass, the respawn gain, the duck and the stop fade. | `src/audio.js:441-466` |
| Every pitched part is a fixed pattern above the bar root (A, A, F, G), so modes move in parallel. The bite note stays in A. The first-person drone stays on A1. | `src/audio.js:34`, `241-245`, `482-495` |
| Four things share 55 Hz: the `sub` layer, most bass lines, the first-person drone and the kick tails. The bunker bass sits at 27.5 Hz. | `src/audio.js:267-282`, `735-741` |
| Last life detunes every pitched music voice and adds a heartbeat every half bar at 0.45 on a bus that skips the music level. | `src/audio.js:640`, `830-834`, `183` |
| Abyss is capped at the stage-4 layers, so its lead and its drip percussion can never play. | `src/audio.js:94`, `921-923` |
| The voice ceiling is 320 at once. | `src/audio.js:35` |
| Offline renders cannot run the real scheduler: with `opts.context` the beat clock is never pointed at context time, and `tick()` returns unless the context state is `running`. The harness works around it with `_step()` by hand. | `src/audio.js:994-995`, `1159-1166` |
| `registry.js` copies only the methods named in `AUDIO_METHODS` onto the audio object the game uses. A method not listed there does not exist for `main.js`. | `src/render/registry.js:64-86` |
| `prefs.set()` ignores keys that are not in its state object. Settings switches are generic: any `data-pref` checkbox in `index.html` is wired by `ui.js`. | `src/prefs.js:33-40`, `src/ui.js:29-45` |
| `tests/music.test.js` encodes the old ladder, drop, riser, heartbeat and detune. `tests/beat.test.js:165` checks that the legacy methods stay safe. `dev/finish.js:210` checks the call order `setScore [setLives lifeGained] shift eat`. | as named |
| `.claude/launch.json` in this worktree served the main checkout only. A config named `ss-sound` (port 4310) now serves this worktree. | `.claude/launch.json` |

## 2. Decisions

### 2.1 Three signals instead of one ladder

| Signal | Source | Changes | Drives |
|---|---|---|---|
| Pace | `stepMs` inside the configured range, with score and length as support | slowly, on bites | tempo, level, phrase variety |
| Danger | the board, through `src/pressure.js` | within a fraction of a second | a few parameters per world (2.5) |
| World | `universe.id` | on shifts | kit, mode, gesture, space, level cap |

Anticipation (time since the last bite) is a fourth, minor input. It is bounded (2.7).

Tempo follows pace only. Danger never changes the tempo.

### 2.2 Files

| File | Role |
|---|---|
| `src/pressure.js` (new) | Pure danger estimate from a snapshot. Imports only `space.js`. |
| `src/arrange.js` (new) | Pure music decisions: pace, tempo, level, arrangement plan, step patterns, motif, harmony, bite classification, anticipation, danger envelope. |
| `src/audio.js` | The engine: graph, voices, kits, scheduler, events. Re-exports the pure API of `arrange.js` so tests and the harness keep one import. Keep the voice helpers, kits and bite voices; change what they are asked to play. |
| `src/sim.js` | One addition: `turns` in the snapshot (2.4). Nothing else. |
| `src/main.js` | Calls `setGameplay`, `bite`, `shift`; evaluates pressure after each advance. |
| `src/render/registry.js` | New method names in `AUDIO_METHODS`. |
| `src/prefs.js`, `index.html` | The `reducedAudio` switch (2.10). |
| `dev/audio.html`, `dev/audio-scenarios.js`, `dev/audio-compare.html`, `dev/legacy/audio.legacy.js` (new) | Harness, scripted scenarios, before/after comparison (section 4). |
| `tests/pressure.test.js`, `tests/arrange.test.js` (new), `tests/music.test.js` | Section 5. |

Do not change `flow.js`, `space.js`, `rules-config.js`, `director.js`, the renderers or anything that decides gameplay.

### 2.3 Audio interface

New, and added to `AUDIO_METHODS`:

- `setGameplay({ stepMs, startMs, capMs, score, length, pressure, clear })`. Partial objects are allowed; missing fields keep their value. `pressure` is the raw 0..1 estimate; the engine smooths it. `clear: true` drops danger to zero quickly (reset, respawn wait, pause, game over, space kind changed).
- `bite({ score, kind, from, to, look, prevLook, held, reset, swing, lifeGained })`. One call per food event. It plays the bite voice of the destination world at once and applies the transition that `classifyBite()` picks (2.6).
- `shift({ from, to, look })` keeps its name but changes meaning: a universe change without a bite (debug lock). Kit swap on the next grid step, no bite voice, no impact.

Unchanged: `unlock setMuted setLives lifeLost lifeGained respawned setLook die start stop debug beat muted`. `setScore` stays and feeds pace. `setTimeline`, `setChaos`, `eat` and `cut` stay callable and harmless, because `tests/beat.test.js` and old callers use them.

Call order in `main.js` on a food event, once the universe and look are known (the existing `pendingBite` flow stays): `setGameplay({ stepMs, score, length })` → if a life was gained: `setLives`, `lifeGained` → `bite({...})`. `pendingBite` must carry `held`, `kind` and `lifeGained` as well as the score. Update `dev/finish.js audioOrder()` to this order.

Every method stays safe muted, before unlock, without Web Audio and after an interrupted context, as today.

### 2.4 Danger estimate (`src/pressure.js`)

Snapshot addition in `sim.js`: `turns`, a frozen copy of the turn queue (0 to 2 directions), built in the cached part of the snapshot. Input handling does not change. The projected path is: next step `turns[0] ?? dir`, the step after `turns[1] ??` the same, then straight on. Never use `heading` for the next step.

Evaluate in `main.js` inside `frame()`, after `sim.advance()` and `flushBite()`, and only when `snap.tick` or `snap.turns` changed. That is at most one evaluation per tick or per turn. Do not evaluate inside the `step` listener (see section 1). Reuse buffers between evaluations (`createPressure()` holding typed arrays sized for the largest graph).

Returns `{ danger, exits, ahead, escape, room, certain }`. Zero when the snake is dead, paused or waiting.

Rules:

- Hittable cells: `snap.snake` in a box, `snap.body` in lane and cube. Food and mushroom in space coordinates (`foodAt`, `fromBoard()` for the mushroom).
- Moving tail: with a body of length L and no growth, the cell at index i is still occupied at step k only if `i <= L − 1 − k`. Each food on the projected path at or before step k adds one to the right side. If the visible count is below `snap.length`, the true tail is unknown: treat every visible cell as occupied.
- Walls come from `stepIn()` only. On the cube, carry the frame from each `stepIn()` result into the next call, as `doStep()` does.
- `exits`: legal moves at the next step among the three non-reverse directions (0..3).
- `ahead`: safe steps along the projected path, looking at most 6 steps. `escape`: sideways moves open at the last safe cell (0..2). `certain`: the collision happens on a queued turn, or there is no exit.
- `room`: cells reachable from the head within 5 steps (bounded flood fill; a body cell that vacates before arrival counts as free).

Starting formula:

```
tti      = ahead × stepMs                         (∞ when the path is clear for 6 steps)
close    = 1 at tti ≤ 200 ms, 0 at tti ≥ 560 ms, linear between
pPath    = certain ? 1 : close × [1.0, 0.7, 0.4][escape]
pExit    = [1, 0.55, 0.1, 0][exits]
pRoom    = 0.8 × clamp01(1 − room / min(24, length + 2))
danger   = max(pPath, pExit, pRoom)
```

What this must give, and what the tests check:

| Situation | Expected |
|---|---|
| Moving along a wall with open space ahead and to the side | low (about 0.1) |
| Heading at a wall in the open, both sides free | rises only in the last cells, stays at or below 0.4 |
| One-cell corridor between body and wall | about 0.55 for as long as it lasts |
| Small enclosed pocket | high through `pRoom` |
| No legal move, or a queued turn into the body | 1 |
| The cell ahead is the tail and no food is eaten | not a collision |
| The same, but the step eats | collision |
| Lane, moving forward for any distance | no wall ahead, ever |
| Cube seam ahead | not a wall; the path continues on the next face |
| Paused, waiting, dead | 0 |

This is a musical estimate. No directional cues, no warning beeps, nothing the player could read as a safety promise.

Smoothing lives in the engine, on the audio clock (pure helper in `arrange.js`): attack time constant about 0.07 s (90% in about 160 ms), release about 0.5 s (10% left after about 1.1 s). States with hysteresis: tense on at 0.40 and off at 0.25; critical on at 0.75 and off at 0.55. A bite never resets danger. `clear` does.

### 2.5 Pace, tempo, level

```
speed  = clamp01((startMs − stepMs) / (startMs − capMs))      (1 when startMs ≤ capMs)
pace   = clamp01(0.9 × max(speed, 0.6 × clamp01(score / 50)) + 0.1 × clamp01(length / 40))
bpm    = 118 + 20 × pace                                       (118 → 138)
level  = 0 below 0.15, 1 below 0.45, 2 below 0.80, else 3      (capped per world)
```

- The score term only matters when a debug override flattens the speed curve. The length term makes the music a touch lighter right after a respawn.
- Smooth pace in the engine (about 2 s) and call `beat.setBpm()` only for changes of 0.25 BPM or more. The bar position stays continuous; the echo time follows.
- Music bus level: at most +1.5 dB from pace 0 to 1. Intensity comes from the arrangement.
- Level 0 is already a complete arrangement: pulse, anchor, gesture. Level 1 adds the backbeat and the full bass pattern. Level 2 adds sixteenth motion and second percussion. Level 3 opens the filters, deepens the pump and allows fills at phrase ends.
- After pace reaches 1, variety comes from an eight-bar section cycle keyed to the bar index (full, stripped with the bass exposed, full, percussion forward). Nothing gets louder.
- Fills, rolls and crashes belong to phrase ends and events. No random high-register hits on arbitrary steps.

Danger speaks through at most four roles. Each world maps them to its own instruments (2.8):

1. Pulse subdivision: the hat or tick layer tightens from eighths to sixteenths.
2. Thinning: the gesture loses ornaments when tense and drops out when critical, so pulse and bass stand exposed.
3. Tone: one filter or register move on the anchor.
4. Rub: when critical, a short dissonant ghost note (flat second or tritone above the root) that resolves to the root on release.

Net level change from danger: at most +1 dB.

### 2.6 Bites and transitions

`classifyBite(event, context)` in `arrange.js` is pure. It reads the explicit event fields, not only `swing` or `from === to`.

| Kind | When | Sound |
|---|---|---|
| `held` | `held` is true | Bite voice. A tiny release: a tonal-bus dip of at most 60 ms or one open-hat lift. No queue cancel, no gap, no sub, no crash. A look flip adds a soft whoosh only. |
| `change` | the universe changed and it is not one of the rows below | Bite voice of the new world. Kit swap on the next grid step; queued old-kit notes are cancelled and sounding long tails are released within about 70 ms. A short thump (150 ms at most), no crash, no full-mix gap. Then the answer: the head of the motif in the new world's voice on the next eighth note. |
| `major` | a change with `swing`, or a first-person arrival, or score on a multiple of 10, and the cooldown has passed (8 beats since the last major, 2 beats since the last bite), and reduced audio is off | The vacuum: a sixteenth of silence, or a stutter from level 3 on. Heavy impact, crash allowed, answer after the impact. |
| `lcd` | `to` is `lcd` | Hard stop: music and the reverb and echo returns cut within 40 ms. Dry LCD bite. Clicks carry on at the same bar position. No impact. |
| `abyss` | `to` is `abyss` | Soft bloom. Earlier tails may ring into it. Half-time. No crash. |

- Life gained on the same bite: the life figure has priority. The tonal bus dips about 4 dB under it and the bite voice is shortened.
- Bites closer than 2 beats: lighter each time. No sub, no answer, shorter bite tails. The bite articulation stays.
- Nothing waits for the beat except the answer and the kit entry. Food, visuals and input are never delayed.
- Priority when sounds collide: life and death, then bite, then transition impact, then music. Use short selective ducks, not whole-mix dips.

### 2.7 Anticipation and last life

Anticipation by beats since the last bite: zero for 4 beats; rises to 1 by beat 12; falls to 0.35 by beat 16; from then on a gentle swell to at most 0.6 every 8 beats. LCD gets none, Abyss half.

- It tightens percussion and opens the gesture's filter. A short noise lift is allowed in the last beat of a bar, 20 dB under the mix. The mix low-pass does not close.
- Subtraction: at a phrase end with anticipation at 0.6 or more, drop one kick so the next downbeat lands harder.
- A bite resets anticipation.

Last life:

- Remove the global detune.
- Heartbeat once per bar, placed between kicks, at least 12 dB under the kick, with enough body around 150 to 200 Hz to be heard on small speakers.
- One dedicated unstable voice (the "nerve"): two quiet beating sines in the mid register, gated to the phrase.
- Respawn wait: muffled and reduced to pulse and anchor. Resumption: the existing thud, the filter open within 50 ms, the full arrangement from the next grid step with an accented kick.

### 2.8 Motif and worlds

The fingerprint, as a starting point: hits on sixteenth steps `0 3 6 | 8 11 14`, contour in mode degrees `1 3 2 | 5 3 1`. Half a bar already carries it, so a world entered mid-bar is recognisable. Each world plays it through its own mode and voice and may keep only the rhythm or only the contour.

| World | Pulse | Anchor | Gesture | Danger speaks as |
|---|---|---|---|---|
| `lcd` | beat clicks | none | none (clicks only) | nothing |
| `arcade` | square kick, tick | square bass on the motif rhythm | square lead, full motif | arpeggio to sixteenths, lead up an octave |
| `mushroom` | short kick, shuffled feel | bouncing triangle | the answer half of the motif, pentatonic, with grace notes | bounce tightens |
| `bunker` | heavy four-on-the-floor | rumble, off-beat, ducked by the kick | clank on the motif rhythm, no pitch | metal sixteenths, rumble filter opens, clanks thin out |
| `acid` | round kick | 303 line on the motif rhythm, slides and accents | the squelch itself | cutoff and resonance rise |
| `lane` | soft kick, cyclic tabla | pedal drone on A | sitar pluck walking the contour | tabla doubles, drone beats wider |
| `disco` | kick, off-beat open hat, clap | octave bass with a syncopated answer | chopped stab on the motif rhythm | hats to sixteenths, bass pops an octave |
| `kombat` | crushed kick and snare | sparse square | three stabs per bar on motif hits, tom run at phrase ends | toms tighten, stab rubs |
| `court` | deep slow kick, wide room | long triangle notes | motif at half speed: whistle swell and high answer | a low eighth-note ostinato appears |
| `plastic` | soft kick, glass eighths | sine bass with an octave partial | bright staccato bell motif | bells move to off-beats |
| `desktop` | triangle kick, straight ticks | sparse square | one system chime per two bars | ticks double, short error buzz |
| `hangar` | kick on 1 and 3, field snare | slow saw march | brass stab on motif hits, anvil at phrase points | snare ruffs, brass rises a third |
| `abyss` | half-time soft kick | long sine and pad | slow pluck (motif stretched), calls, drips | pad gains a dissonant partial; no drums added |
| `castle` | soft kick in four | waltz bass, 12-step cycle | music box, contour in three | grace notes on the music box |
| `timewarp` | swept kick | whole-tone glide bass | motif backwards, glide targets chosen once per bar | glides widen |
| `wrong` | a kit mixed per bar | from the mix | every borrowed lead plays the motif rhythm | the mix changes every half bar |

- Abyss keeps its own ceiling (no sixteenth hats, no fills, no rolls), but its pluck, call and drip are all reachable below that ceiling.
- Randomness is chosen per bar or per phrase from a seeded generator, not per note.

Harmony. Each world declares one policy:

| Policy | Meaning | Worlds (starting point) |
|---|---|---|
| `parallel` | patterns move with the bar root (A, A, F, G) | arcade, mushroom, castle, desktop, plastic, acid |
| `diatonic` | the bass follows the root; melody notes stay in the A mode and snap to chord tones of the bar | disco, kombat, hangar, court, abyss |
| `pedal` | everything stays on A | lcd, lane, bunker, timewarp |

- Bite notes follow the world's policy: `biteMidi(id, score, bar)`. Keep the rising walk with the score.
- The first-person drone follows the bar root with a short glide and moves up out of the 55 Hz band (see 2.9).
- Write the audit into `notes/audio.md` as a table: world, mode, policy, what the bite does over F and G.

### 2.9 Mix

- Low end, one owner per role: the kick owns the 40 to 60 Hz transient; the bass is ducked by the kick with a fast release; the generic `sub` layer goes, except in worlds whose bass sits high; the bunker rumble moves up to 55 Hz and is ducked hard; the first-person drone moves to 110 to 220 Hz.
- Sine and triangle basses get a quiet octave partial or light saturation so they survive phone speakers.
- Master: gentle bus compression (about −14 dB, 3.5:1, 12 ms attack, 180 ms release), then the soft clipper as protection only. Target in the densest scenario: under 1% of samples above the clipper knee, peak under 0.98.
- One wet return bus for reverb and echo, with envelopes for: LCD entry (cut in 40 ms), stop and pause (fade in about 0.4 s), life lost (follows the muffle).
- On a kit change, sounding music voices with more than about 250 ms left are released quickly. Keep a gain handle per music voice for this.
- Voice budget about 96 at once. Bound every tail.
- Bite, life, death, kick and bass are centred and mono-safe. Panning is for decoration.
- One internal seeded generator for all audio randomness (`opts.seed`), separate from the simulation's generator.

### 2.10 Reduced audio

- New pref `reducedAudio`, default false, with a switch in both settings lists in `index.html`: "Calmer sound — fewer tension effects, music stays".
- The engine is in reduced mode when `reducedAudio`, `reducedFlash` or `reducedMotion` is on. Players who already use the reduced switches keep their calmer sound.
- Reduced mode: no major transitions (they become ordinary changes), danger depth scaled to about a third, no anticipation noise, no nerve voice, no rolls. Music, bites and a soft heartbeat stay.

## 3. Traps

1. `registry.js` drops any audio method that is not in `AUDIO_METHODS`.
2. `safe()` in `audio.js` swallows errors. Check `debug().errors === 0` in every test and scenario, or a broken path looks like silence.
3. A `step` listener runs before `ate` and `shift` of the same tick.
4. `heading` is not the next direction.
5. Cube path projection needs the frame carried step by step.
6. `cancelQueued()` also cancels the pump automation. A held bite must not call it.
7. `planCache` is keyed by stage, world and reduced. The new plan depends on more inputs.
8. Offline rendering needs two engine changes: the beat clock reads context time when a context is passed in, and `tick()` runs when offline. Then the harness can drive the real scheduler with `OfflineAudioContext.suspend()`. That call is for the harness only; the game must not need it.
9. The mock `AudioContext` in `tests/music.test.js` knows a fixed set of nodes and throws on non-finite automation values. Extend it when a new node type is used.
10. Tests and the harness use `_step`, `_dials`, `_plan`, `_tick` and fields of `debug()`. Keep them or change both sides together.
11. `tests/replay.test.js` proves gameplay is unchanged. Do not edit it.

## 4. Proof

### 4.1 Harness

`dev/audio-scenarios.js` holds scripted scenarios as data (time, call, arguments) and one runner. The runner plays a scenario live, or renders it through an `OfflineAudioContext` with a fixed seed, driving the real scheduler.

| # | Scenario |
|---|---|
| 1 | Opening at low score: LCD → Arcade → Reality.exe |
| 2 | Same score and speed: 4 bars safe, 4 bars constrained, 4 bars safe again |
| 3 | Rapid bites across worlds |
| 4 | Held bites in Lane, Mushroom and Castle |
| 5 | Major transitions, entered at four different bar positions |
| 6 | Sustained fast run, 90 seconds |
| 7 | Calm worlds: LCD return from a dense world, Abyss entry |
| 8 | Last life, life gained, life lost, respawn |
| 9 | Pause, resume, restart, mute, context suspend and resume |
| 10 | Reduced audio on, same script as 2 and 5 |
| 11 | Geometry from a real `createSim()` with scripted turns, pressure from `pressureOf()`: wall approach, wall-parallel, corridor, Lane travel, Cube seam |

`dev/audio.html` gains: pace and danger sliders that work independently, the reduced-audio toggle, a button per scenario (live and offline), a plot of raw pressure and smoothed danger over time, and a metrics table.

Metrics per offline render: loudness (K-weighted mean square, gated), peak, crest factor, share of samples above the clipper knee, energy share per band (under 80 Hz, 80 to 250, 250 to 2k, 2k to 6k, above 6k), voices at once (maximum), `debug().errors`.

### 4.2 Before and after

`dev/legacy/audio.legacy.js` is the engine at `184b3c8`, changed only so the same runner can drive it (import path, the two offline hooks from trap 8). An adapter maps `bite` to the old `setScore`, `shift`, `eat`.

`dev/audio-compare.html` renders a scenario with both engines, matches them to the same loudness by turning the louder one down, and offers A/B playback, the metrics side by side and a WAV download for each. No rendered audio is committed.

### 4.3 What must be shown

- `npm test` passes; report the count. `tests/replay.test.js` untouched.
- Every scenario renders offline with zero errors and zero browser console errors.
- Scenario 2: smoothed danger rises within 250 ms of the constraint, and is back under 0.25 within 1.5 s after it clears. The constrained bars differ measurably from the safe bars (hit pattern and spectrum), at nearly the same loudness.
- Scenario 1: by the second bar in Arcade the plan holds pulse, anchor and gesture.
- Scenarios 3 and 4: no gap and no sub drop on held or rapid bites; the kick grid stays unbroken.
- Scenario 5: a major transition is distinguishable from an ordinary change in the render (gap present, impact energy higher), and two majors are never closer than the cooldown.
- Scenario 6: loudness in the last 30 seconds is within 1.5 dB of the first 30; the clipper target of 2.9 holds.
- The real game runs for a few minutes with `?debug&auto` on the synthetic clock with `audio.debug().errors === 0`, and `finish.js audioOrder()` reports no bad calls.
- The settings switch works in both panels and fits at phone width.

### 4.4 Listening

An agent cannot hear. Say so in the handover. Do not describe how anything sounds as if it had been heard. Give the owner a ten-minute listening list: which scenario to play, and what to judge in each. Listening approval stays open until the owner gives it.

## 5. Tests

- `tests/pressure.test.js`: every row of the table in 2.4, in box, lane and cube; tail and growth; hidden body cells; queued turns against `heading`; no allocation growth across many calls is not required, but identical input must give identical output.
- `tests/arrange.test.js`: pace under default and overridden speed ranges (flat ramp, start equal to cap); tempo range; every non-LCD world has pulse, anchor and gesture at level 0; Abyss ceiling and reachable material; level never falls as pace rises; `classifyBite()` for every row of 2.6, the cooldown and reduced mode; anticipation is bounded and settles; danger envelope attack, release and hysteresis; bite notes per harmony policy.
- `tests/music.test.js`: drop the assertions that encode the old ladder, drop, riser, heartbeat rate and detune. Keep and adapt the engine tests: safety without Web Audio and before unlock, muted scheduling nothing, queued notes cancelled on a kit change with the bar position kept, life lost and respawn, LCD arrival silent, every world has a kit and a bite voice. Add: a held bite cancels nothing; `setGameplay` and `bite` are safe with junk input.
- `tests/sim.test.js`: `turns` is frozen, mirrors the queue and empties as turns are used.
- `tests/beat.test.js`: unchanged and passing.

## 6. Build order

Run `npm test` after each step. The game must stay playable after each step.

1. Baseline: copy the legacy engine, add the offline hooks, build the runner, record legacy metrics for scenarios 1, 3 and 6.
2. Plumbing: `turns`, `pressure.js` with tests, `main.js` calls, `registry.js`, the pref and its switch. The engine accepts the new calls and still sounds as before.
3. Arrangement: `arrange.js`, motif, harmony, the new step patterns, pace and tempo. Rewrite the pure tests.
4. Events: `classifyBite()`, the five treatments, cooldown, answers, tail release, the wet bus.
5. Danger, anticipation and last life in the engine.
6. Mix: gain staging, low-end roles, master chain, voice budget. Compare with the legacy metrics.
7. Harness, comparison page, all scenarios, the checks of 4.3.
8. Notes: rewrite `snake-shift/notes/audio.md` (behaviour, interface and call order, tuning table, harmony audit, metrics before and after, listening list). Update the sound lines in `snake-shift/README.md`. Leave `notes/sound-report.md` as it is; it describes the old state.

## 7. Handover

Report: files changed; the new behaviour in a few lines; the tuning parameters and where they live; test count; the metrics table, old against new; which checks of 4.3 passed and which did not; what was not auditioned; known weak spots and anything left undone.
