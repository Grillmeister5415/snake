# finish (levels wave 3)

Checked in the real game at localhost:4321, 1280×720, `?debug` synthetic clock (`__ss.run`); helpers in `dev/finish.js`.

## Works (evidence)
- All 16 universes in every look (29 pairs incl. lane 2d/3d/pov, castle 2d/3d) render, play on autopilot, 0 console errors; `?nogl`: all 16 in 2D/stand-in, 0 errors.
- Flow, 540 s autopilot (seed final1): 278 shifts, specials 9% (holds all 4–6), never two in a row, 93 held bites all flip the look (castle alternates 2d/3d), every bite has its impact; the five new universes seen in both looks.
- Lane: head ran from row 1 to −310, no end wall, side walls lethal; 2D board scrolls between ticks; dot ahead reached, arrow shown whenever it is off the board (2d, 3d, pov). Cube: 5 faces, 11 seam crossings, no deaths, camera turns, map + arrow; 2D slides between faces (cut under Reduced motion).
- Mushroom at 5 lives is still food (`lifeGained:false`), below 5 adds a life.
- Lives by real key presses in box (from pov), lane and cube: length 3, waits for a key, board look, score and universe kept, HUD aria "n of 5"; last loss → REALITY COLLAPSED. HUD icons differ per universe (all 16 export `life()`).
- Off-board body after lane→box and cube→box: harmless, used up from the tail (30→0), no life lost.
- Calm: 1150 lcd/abyss frames, 0 inversion/strobe/glitch/split, beat ≤ 0.15; `fx.calm` reaches the room renderer.
- Default: inversion 7.4%, strobe 5.8% of frames. Reduced flash: 0 inversion/strobe/glitch, veil on every shift. Reduced motion: 0 first-person frames in the random flow.
- No choice: without `?debug` the universe/look/score/lives switches are ignored, `__ss` is absent, keys are only steer/pause/mute/confirm, the only inputs are the three switches.
- Sound: unlocked by a real click; 60 bites, 2 gains, 4 losses, game over: call order matches notes/audio.md, 0 errors. **Nobody listened.**
- `npm test`: 136/136, incl. new `tests/replay.test.js` (recorded inputs replayed under 7 director/switch setups, every tick equal, box+lane+cube).
- Size (`index.html`, `style.css`, `src/`): 943 KB raw, 284 KB gzip as one stream, 318 KB gzip per file, 224 KB brotli.

## Changed
- `rules-config.js`: `SPECIAL.weight` 0.85 → 1.2 and the fallback table's weights set to the real metas' (rooms 3 etc.). With the real weights the game had ~8% specials; now ~10% (40–100 foods), ~9.5% over 300+.
- Respawn pulse (`waiting === 'respawn'`): engine `drawSnake` and castle room breathe the snake's width; `flat.js` outlines the snake in 2D looks that do not animate it (all but abyss, mushroom, lane, castle). Off under Reduced motion.
- `tests/director.test.js`: shift-count floor 200 → 120 (run restarts on death; seed-dependent). README: music, size, switches table fixed.

## Not done / known
- Reduced-flash veil numbers kept (from 0.55, hold 0.35): average dimming 16%, median jump at a cut +0.34. Not judged by eye.
- Debug `look=pov` still forces first person under Reduced motion (debug only). Phone size not rechecked this wave.
- Single-seed browser runs vary 7.6–9% specials; seeded flow sim over many seeds gives ~10%.

## Morning checklist
1. Play one wild run with sound by keys; listen to drops, life loss, stage 8+.
2. Look at the lane and castle 2D looks and the waiting outline; try Reduced flash for comfort.
3. Commit wave 3 (new: lane.js, castle.js, replay.test.js, dev/finish.js).
