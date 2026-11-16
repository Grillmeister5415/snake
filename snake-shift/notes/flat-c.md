# flat-c — notes

## Done
- `src/render/timelines/wrong.js` — WRONG UNIVERSE (year 'ERR', luma .40, weight 1), plain §15.3 timeline; also the look of Temporal Collisions. It loads `lcd arcade acid timewarp kombat desktop` by dynamic import and skips any that are missing, broken or invalid (top-level await, capped at 1.5 s; late ones join). A sibling whose scenery() or board() throws is dropped for the session with a console.warn.
- scenery(): renders 1–4 sibling sceneries into offscreen buffers (same `L`, the caller's own `snap`/`fx` objects, never copied or changed; about 1.6 M px per buffer), then composes one of three layouts per `fx.variant`: **tear** (jagged torn-paper regions with shadow and paper edge, anchored in the visible margins), **split** (two eras; the seam wobbles and is shoved on the beat, a band of interleaved slices where they fight; top/bottom in landscape, left/right in portrait so it never hides behind the board), **sheets** (torn posters of other eras taped over a base era). Always on top: a rip seam through the bitten cell that gapes with `fx.punch` and stays as a scar, duplicated offset silhouettes in the margins (original shapes: phone, cabinet, flower, hourglass, hit-spark, cursor, plus intruders from the rooms: mirror ball, speaker stack, chrome sphere), wrong-palette strips (difference/exclusion/hue/colour blend), era tags in mismatched fonts and one phrase ("WRONG DECADE", …). Tears crawl with `fx.time`, faster with chaos; regions swap eras on beats with a chance that rises with chaos; colours step on the beat. Only one era loaded: an "echo" layout (a displaced copy of itself in the wrong palette behind a tear). None loaded: its own void scenery and fallback board.
- board(): exactly one sibling's board() per variant (never the dominant scenery era), drawn whole, and nothing after it.
- Reduced flash: strips use hue/colour at 55% (no difference inversion) and do not hop; swaps are rare; silhouettes hold still. Reduced motion is handled by `fx.time`.
- `src/render/persp.js` — `createPerspRenderer({ cols, rows })` → `{ render(ctx, w, h, roomMeta, view, snap, fx) }`, Canvas 2D stand-in for rooms. Camera copied from `gl/engine.js` boardCamera (66° vfov, 24° pitch, 55° near edge, H ≥ 15 fitting 94% width, punch/cut zoom). Sky and striped sun, floor grid to the horizon, lethal-edge band, panel, grid, cell-exact low blocks (head 0.34 with chevron, X when dead; body 0.26; tail 0.18) painted far→near, gem dot with a glow kept inside its cell, bite ring. All colours from `roomMeta.hud`. `view: 'pov'` falls back to the board view. The call is documented at the top of the file; `FALLBACK_ROOMS` has hud colours for court/disco/plastic/bunker for when no engine loads.
- Harness `dev/flat-c.html` + `.js` (keys in its header; `window.__flatC`). Snap and fx are deep-frozen every frame.

## Verified (in-app browser, server on port 4190: the 5-server cap was full, so `ss2-flat-c` could not start)
- Cell check `__flatC.check({ variants: 60, dprs: [1] })`: 744/744 pass, plus the default sweep at dpr 1 and 2 (228/228). Wrong: in flat regions every cell of the full collage equals the owner's board drawn alone (±2), and every snake/dot cell really changes the board (all six siblings as owner; all siblings, and lcd+arcade only). Persp: every block top has its exact colour at its projected point, every free floor centre shows the panel colour, the dot shows; 4 rooms × 2 sizes × alive/long/dead.
- `wrong.js?only=lcd,arcade` works, and so does `?only=lcd,arcade,nope` (missing file tolerated; the browser logs the 404). Screenshots at 1280×720 and 390×844 for every layout, with chaos 0.3–1, a bite, RF+RM. No console errors apart from that deliberate 404.
- CPU per frame at dpr 2, chaos 1: wrong median 1.7 ms, p90 5 ms (when eras swap and siblings rebuild caches); persp 0.1 ms.

## Findings / defaults
- LCD's own scenery() shifts the antialiased edge pixels of LCD's board strokes by ~11 units (seen without wrong.js too). Harmless; the check therefore compares flat pixels only.
- Silhouettes are generic objects, no people. The fighters in Kombat's scenery are flat-b's own.
- Exports besides the contract (registry ignores them): `ready`, `eras()`, `planFor(fx)`, `boardOwner(fx)`.

## Requests
- integrate/finish: wire `persp.js` when `loadEngine()` returns null (room scenes then exist again in 2D). Room metas: import `gl/rooms/<id>.js` for `meta`, or use `FALLBACK_ROOMS`.
- integrate: `fx.prev` (flat-a's request) also lets a timewarp board inside wrong show the previous snake.
