# integrate (wave 2) — notes

## Done
- `fx.prev` = timeline/room id of the previous scene (`court-pov` reports `court`), from `director.get().prevTimeline` (flat-a request).
- Audio (audio request) confirmed: `play()` calls `audio.unlock()` synchronously inside the PLAY click / Enter handler; on a bite: `setChaos` → `setTimeline` → `cut` → `start` (first bite) → `eat`.
- `fx.biteAge` is Infinity until the first bite of each run, `fx.bite` null, `punch` 0 (gl request; now under test).
- Loading: `wrong` added to `FLAT_IDS`; every flat in the list and every room the engine reports becomes scenes on page load, no edit needed.
- Director: `timewarp`/`wrong` are rare (`RARE` in config): weight 0.7×(0.5+chaos), never in the opening, never before score 4, never back to back, held 1–2 bites in wild (1 under reduced flash). Variety: timelines from the last 3 cuts ×0.4, unseen this run ×1.6. Simulated over 400 runs with all 11 timelines and 4 rooms: rare ≈2.5% of cuts each; no scene over 15%.
- Total Reset: after a room, `timewarp` or `wrong` (outside the opening), chance 0.07 + 0.23×chaos of a silent snap to `lcd`. No impact, inversion, strobe, phrase or `audio.cut()`, so LCD's silent rhythm makes it really silent. Goes through `allowed()`, so the reduced-flash cut and swing limits apply. About 9% of cuts. `lastCut.reset` and `cutLog[].reset` mark it.
- Readability: in first person the minimap is larger in portrait (36% of the width, at least 110 px); keycaps say "swipe ↑" instead of "or W" on touch. Swipe hints come from `(pointer: coarse)` or any touch, including the PLAY tap (before, only stage touches counted, so phones were told to "PRESS AN ARROW").
- `?debug` adds `__ss.drive({ swipe, target, maxMs })`: plays through the real input path (arrow keydowns, or touch PointerEvents on the stage) on the synthetic clock, then reports scenes, phrases and first-person/GL/inversion/strobe frames.
- Tests: 6 new in `tests/director.test.js` (rare rules, rarity, Total Reset + limiter, variety, fx.prev/biteAge). `npm test`: 44/44 pass.

## Verified in the real game (ss2-integrate, :4181)
- Keys: real Enter on PLAY → arrows → 16 bites → wall death → REALITY COLLAPSED (score/best/NEW BEST) → real Enter → ready. The first cut is lcd→arcade with "TIME BREAK!", then "WELCOME TO 2088"; court and court-pov reached, inversions and strobes seen.
- Phone 375×812: real tap on PLAY, then 9 bites by synthetic touch swipes → death; room and first person reached. Screenshot: minimap and keycaps clear.
- Reduced flash, 240 s autopilot: 50 cuts, min gap 3568 ms, 0 swing violations, 0 inversion/strobe/punch/glitch frames, beat ≤ 0.149.
- `?nogl`: 15 bites to death over lcd/arcade/acid/desktop, 0 GL frames.
- Both switches: set from the title and from settings, mirrored in both panels and the `<html>` classes, saved, and still set after a reload; the warning shows on every load.
- HUD plate and panels readable over lcd, arcade, acid, desktop, timewarp, court and court-pov; the pause panel is readable over acid on a phone.

## Not done / still broken
- At the final check `kombat` and `wrong` loaded and played: 180 s autopilot, 118 cuts over 9 scenes, 7 Total Resets, 0 errors. Their HUD readability was not screenshotted. `disco.js` exported `meta` and `glsl` but no `create` yet, and `plastic`/`bunker` were still placeholders, so the engine reported only `court`. These rooms become scenes on the next page load once complete; they are untested in the full game.
- Missing modules still log 404s in the console (harmless).
- Browser cache: python http.server sends no cache headers, so Chrome reuses old modules even after a hard reload. Load `127.0.0.1:<port>` instead of `localhost` (or the other way round) to see fresh code.
- Under reduced flash the cut limiter is absolute, so a rare scene can last longer than 2 bites if bites come faster than one per 3.5 s.
- `persp.js` (perspective fallback, flat-c) is not wired in; that is for wave 3.

## Defaults chosen
- Total Reset counts as a cut (cutCount, recent list) and is allowed in reduced flash only when the limiter allows it.
