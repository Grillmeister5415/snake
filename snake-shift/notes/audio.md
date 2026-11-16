# audio stream — notes (wave 1, LEVELS_PLAN 7)

## Done
- `src/beat.js`: `beat.setBpm(bpm)` keeps index and phase continuous (no tempo map: ask about now/future). `bpm`/`period` are getters. Invalid values ignored, clamped 20..400.
- `src/audio.js`: one continuous track. Stage `min(10, floor(score/5))` → tempo `112 + 4·stage` and layers kick, sub → +hat → +bass → +snare → +16th hats → +lead → +perc2 → +fills (every 4th bar) → +pump/open filters → +rolls/stabs → +wild. Kit = universe; the bar position carries across shifts (queued old-kit steps are cancelled, the new kit enters on the next grid step). Hunger riser (starts after 1 s, full at 6 s: noise swell, master low-pass to 3.2 kHz, tighter hats), released by the bite. Drop: a sixteenth of silence then sub + crash; from stage 8 a chopped stutter (0.75 / 0.5 / 0.375 sixteenth, halved when bites come faster than a bar). Tape stop → muffled (420 Hz, −8 dB) wait → snap back. Last life: heartbeat every half bar (not muffled) + −12 ct detune. Original rising maj9 life figure. `lcd`: clicks only at every stage, silent drop. `abyss`: half-time, soft, capped at stage-4 layers, no crash. New kits and bite voices: lane, hangar, mushroom, castle (12-step music box over 4/4), abyss. Music level +6 dB stage 0→10.
- Pure, exported and tested: `stageOf stageBpm musicGain musicPlan hungerAt riserPlan dropPlan impactPlan pumpDepth filterScale lookPlan lifeFigure stepHits universeId`. `tests/music.test.js` (32) includes a mock AudioContext that checks what the engine schedules; `node --test tests/beat.test.js tests/music.test.js` → 50/50.
- `dev/audio.html`: score slider, bite (new path), held bite, 16-universe picker, look 2d/3d/pov, legacy path toggle, life buttons, schedule check, offline peak render, BPM measure. All controls run, zero console errors. Schedule check 99 cases (9 universes × 11 stages) all right. Busiest render (stage 10, 4 kits stacked, last life, full riser, pov drone, heavy drop, all bite voices) peaks 0.717, 0% samples > 0.8. Measured 152.0 BPM at stage 10. Not listened to.

## Interface (all safe before unlock, muted, without Web Audio)
Kept: `unlock setMuted setTimeline setChaos eat cut die start stop beat muted debug`. `eat(score)` also sets the stage, so the current shell already gets tempo/layers. `setChaos` no longer sets layers.
New: `setScore(n)`, `shift({ from, to, look, swing })`, `setLook(look)`, `setLives(n)`, `lifeLost()`, `respawned()`, `lifeGained()`, `beat.setBpm(bpm)`. Exports `TIMELINE_IDS` (16), `NEW_IDS`.

## Exact calls for the shell (wave 2), in order
1. PLAY click: `audio.unlock()` (user gesture), `audio.setMuted(prefs.muted)`.
2. Run reset: `setScore(0)`, `setLives(snap.lives)`. First direction key (waiting 'start'): `audio.start()` — the run opens on lcd clicks.
3. Food tick (`ate`, then maybe `shift`): after the sim step, in this order:
   `setScore(ate.score)` → if `ate.lifeGained`: `setLives(snap.lives)`, `lifeGained()` →
   `shift({ from, to, look, swing })` with the director's new look (held bite: `from === to`, the flipped look) → `eat(ate.score)`.
   Total Reset to lcd is the same call (its drop is silent by design). No more `cut()`/`setTimeline()`.
4. Look change without a bite (12 s first-person fallback): `setLook('3d')`.
5. `lifeLost`: `setLives(e.lives)`, `lifeLost()`. Do NOT call `stop()` for the respawn wait.
6. First direction key while waiting 'respawn': `respawned()` (same moment the sim resumes).
7. `died`: `setLives(0)`, `die()` (stops beat and rhythm).
8. User pause: `stop()`, resume: `start()` as today (restart begins at beat 0).
9. `fx.beat`/`fx.beatIndex` from `audio.beat.sample()`; the director caps the pulse at 15% in lcd/abyss.

## Defaults chosen
- Riser starts after 1 s without a bite (bites 1–2 s apart stay clean). Reduced flash/motion: no rolls/stabs/wild, no heavy drop.
- Unknown ids → arcade; `-pov`/`-3d`/`-2d` suffixes stripped. `wrong` mixes all kits except abyss.
- Arriving in 3d/pov whooshes on every shift (also held flips); pov adds a 55 Hz drone into the music low-pass.
