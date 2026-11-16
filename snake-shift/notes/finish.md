# finish (wave 3) — notes

## Done
- Step 1: all 15 scenes held with `?scene=<id>&lock&auto&debug` at 1280×720 on port 4190 (ss3-finish could not start: 5-server cap): lcd, arcade, acid, kombat, desktop, timewarp, wrong, court, court-pov, disco, disco-pov, plastic, plastic-pov, bunker, bunker-pov. Each played 5 s on the synthetic clock (score 1–6), GL canvas visible exactly for rooms, 0 console errors.
- Step 2: HUD plate and panels readable over every scene (backing plate). Pixel Kombat: its fight bar fills the top ~8–50 px, so under `data-timeline="kombat"` the buttons drop to 54 px and the score plate moves to the bottom-left margin (style.css); checked at 1280×720 and 390×844. Scenes now carry `clock` from meta; the Bunker HUD reads "2026 · 04:37".
- Step 3: `persp.js` wired. When the engine is null (`?nogl` or no WebGL) `registry.loadPersp()` imports persp.js and each `gl/rooms/<id>.js` for its meta only (they import nothing), falling back to FALLBACK_ROOMS; rooms get `views: ['board']`, so no first person without WebGL. `flat.render` draws them via persp; strobes go through the inversion overlay as in rooms. `?nogl` 60 s autopilot: 40 cuts over 9 scenes incl. court/disco/plastic/bunker, 3 Total Resets, 0 errors.
- Step 4: free runs, 300 s synthetic autopilot each at 1280×720 with GL. Wild (seed free1): 211 cuts over all 15 scenes, timewarp 5 + wrong 6 (5%), 23 Total Resets, 4 deaths, inversion on 9% and strobe on 6.5% of frames, 0 errors. Reduced flash (seed free2): 60 cuts over all 15 scenes, min cut gap 3520 ms, 0 swing violations, 0 inversion/strobe/punch/glitch frames, beat ≤ 0.150, 7 Total Resets, 0 errors. Tests: 5 new in `tests/director.test.js` using the real metas of all 11 timelines (15 scenes; mix, rarity, rare-after-rare, resets land on LCD, reduced-flash limits, reduced motion, no-GL) and `loadPersp()`; `npm test` 49/49.
- Step 5, master prompt §13 checks (browser runs on the synthetic clock, plus `npm test`):
  1. Controls: `__ss.drive` with real arrow keydowns, 45 bites: 127 turns, each applied on the next tick, in 13 scenes incl. all four `-pov` (an earlier drive also passed timewarp and wrong); swipes were verified by integrate.
  2. One segment + one point: an `ate` listener saw length = 3 + score on all 90 bites of two runs; sim tests check it over long autopilot runs.
  3. Collisions: both drives ended in a `wall` death outside LCD; sim tests cover all four walls (no wrap), self, vacating tail.
  4. Grid: every screenshot shows one north-up 16×16 grid; rooms keep screen-up = grid-up, first person has a north-up minimap; nothing writes the sim (frozen snapshots, replay test).
  5. Shifts preserve state: seed `same`, 40 s autopilot with WebGL in wild mode (26 cuts, reduced motion toggled mid-run) and with `?nogl` + reduced flash (10 cuts): identical hash over all 307 ticks, score 26 both. The replay test forces every scene and view on each bite.
  6. Effects: flat scenes draw glitch and strobe before the board; rooms and persp strobe through the `difference` overlay, which inverts but never hides; phrase cards sit in the band above the board; Kombat HUD moved off its fight bar. The sim tick never sees the renderers (replay test).
  7. Muted + `?nogl`: PLAY click, 20 bites by keys over 9 scenes (rooms via persp), 0 GL frames, wall death, REALITY COLLAPSED shown, 0 errors.
- Step 6, phone 390×844: title fits with no scroll; real taps on PLAY, settings, the new switch and RESUME; a 14-bite swipe run through court-pov to a wall death and REALITY COLLAPSED; first person screenshotted. New: **Touch buttons** switch in settings (`prefs.dpad`, off by default): a 4-way pad sized by main.js to the margin the board leaves (under it in portrait, 58 px keys at 390×844; beside it in landscape), real taps steer the sim; hint becomes "TAP AN ARROW TO START" and moves to the top; first-person keycaps say "tap ←", and in landscape the map moves left and the pad replaces the keycaps. Settings now also opens before the first move (it did nothing in the ready state). **Quality scaling** (`createQuality` in fx.js): smoothed frame interval over 28 ms for 2 s steps the canvas resolution ×0.75, then ×0.5; gaps over 250 ms and hidden tabs are ignored. Unit-tested; not observable live here because the hidden pane runs no animation frames.
- Step 7: a clean load of `index.html` logs nothing (the scene list is `?debug` only). audio.js: oscillator frequencies clamped to 20 kHz (smallest fix) after "outside nominal range" warnings in play; a 40-bite run with live audio through all 15 scenes then logged nothing.
- Step 8: `README.md` (57 lines). Size: `index.html` + `style.css` + `src/` = 149 KB gzipped (464 KB raw). `npm test` 50/50. Final sweep with fx-pass's latest GL code: 15/15 scenes render, 0 errors.

## Not done / known issues
- Quality scaling not seen live (hidden pane: no animation frames); logic unit-tested only. Not tried on a real phone.
- No first person without WebGL (persp has board view only). If the WebGL context is lost mid-run, rooms stop (persp loads only when the engine is missing at start).
- Kombat's round box shows score % 100; the DOM score plate (bottom-left in kombat) shows the full score. Inside `wrong`, a torn kombat region can put its fight bar under the DOM HUD for a moment.
- Room readability at phone size was checked for court-pov only; other rooms were screenshotted at 1280×720.

## Defaults chosen
- Touch buttons off by default, only in the settings panel (not on the title, which keeps just the two switches).
- Quality: 28 ms smoothed frame time for 2 s → ×0.75, then ×0.5 resolution; never back up during a session.

## Morning checklist for the owner
1. Play by keys and on a phone; settle speed: `?start=150&ramp=1.5&cap=95` are still the plan defaults (try `?start=140&ramp=2&cap=85` for a faster feel).
2. Plan §13 open questions, all still on defaults: opening label "LCD Ghost, 1999" (brief says "Nokia Ghost"); wild strobe bursts up to ~0.4 s; first person skipped under reduced motion; Desktop Error included as the eleventh timeline; no Six Finger Punch branding.
3. Watch one wild run with sound for taste: inversion ~9% and strobe ~6.5% of frames over 5 min.
