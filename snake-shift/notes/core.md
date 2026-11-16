# core stream — notes

## Done
- `sim.js`, `rng.js`, `config.js`, `autopilot.js`: section 3 exactly. `tests/sim.test.js` has 15 tests: queue, reversal, walls, self, vacating tail, speed, exact `advance`, determinism, frozen snapshots, and listener errors that cannot break the sim.
- `director.js`: `buildScenes()` from whatever loaded, scripted opening, wild and reduced-flash modes, chaos, first-person gate (4 clear cells), 12 s timeout, phrase cards, `disable(id)` for broken modules. `tests/director.test.js` has 11 tests, including the section 12 replay test (director forcing every scene and toggling both switches; identical run on every tick).
- `fx.js` builds the 15.3 `fx` each frame (uses `beat.sample()` when present). It also adds `strobe` (0/1), `invert`, `glitch`, `split`, `scene`, `view`, `timeline` and `kind`.
- `prefs.js`, `input.js` (event.code keys, 22 px re-armed swipes), `ui.js`, `index.html`, `style.css`: title with the warning and both switches, HUD themed from `meta.hud` (optional `hud.font`), pause/settings panel, game over with best score saved locally.
- `render/flat.js`: 15.3 layout; scenery, then glitch slices, then strobe (flat scenes only), then board; first-person HUD (minimap and keycaps); phrase cards in the band above the board; veil; DOM inversion overlay (which also carries the strobe in rooms). `render/registry.js` loads modules dynamically, with stubs. `timelines/lcd.js` is calm.
- `main.js`: loop, 100 ms frame clamp, pause when the tab is hidden, the `?debug ?auto ?scene=&lock ?seed= ?nogl ?start=&ramp=&cap=` switches. `?debug` adds `__ss.run(ms)`, a synthetic clock for when the pane is throttled, plus `__ss.cuts` and `__ss.invertFrames`.
- Verified on `ss-core`: `npm test` passes all 38 (beat tests included). Keys: title → ready → play → wall death → REALITY COLLAPSED → Enter → ready. `?auto` and `?nogl` work. The real arcade timeline and the court room (both views) get picked up with no code changes. Wild mode: the first bite cuts to arcade with "TIME BREAK!", and inversions happen. Reduced flash over 240 s: 51 cuts, no gap or swing violations, 0 inversion frames. Checked at phone size (title, first person). `dev/core.html` is a harness with fake timelines; add `?rf`, `?rm` or `?pov`.

## Defaults chosen
- `package.json` test script is `node --test tests/*.test.js`, because Node 22 rejects a bare directory.
- In wild mode the old scene shows inverted for 60–90 ms, then the new one snaps in; `cutAt` is when it appears.
- Strobe bursts happen on the first cut, on a first room entry, on any first-person cut, and on death; otherwise the chance is 8% + 50%·chaos. In flat scenes the strobe sits under the board; in rooms it is the inversion overlay.
- In reduced flash the cut limiter is absolute, so a first-person passage can outlast a bite there, up to its 12 s timeout.
- "WELCOME TO <year>" plays on the first entry to any room, not only court. A first-person scene's weight is 0.45× its room's (at least 0.4).
- `?auto` skips the title gate and restarts on its own. `?seed` fixes every run. Without it, each run gets a new seed.
- Death `cell` is the out-of-grid cell for `wall` and the head for `complete`.
- Audio order on a bite follows the audio notes: setChaos, setTimeline, cut, eat. `start()` runs on the first bite, `stop()` on pause.

## Not done / for integrate
- Missing modules log 404s in the console (dynamic import). That is harmless.
- `kombat`, `desktop` and `timewarp` are not present yet; they will load once their files exist.
- No perspective fallback without WebGL (stage 2). The opening script skips 3D under `?nogl`.
