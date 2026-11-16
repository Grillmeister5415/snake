# flat-a — notes

## Done
- `src/render/timelines/arcade.js` — ELECTRIC ARCADE 1986 (luma .08). Void sky, scrolling striped sun (RGB-split at chaos), vector mountains, scrolling perspective floor (wobbles at chaos > .45), twinkling 4-point stars, original wireframe cabinets when the side margin is > 150 px (screens pulse on the beat), wireframe debris (chaos), punch rays, a bezel whose colour steps every beat, cached CRT scanlines + rolling band. Snake: chunky yellow blocks, a rounded head with eyes, a smaller tail. Dot: a smaller striped red square with glints. Lethal edge: a neon double rail with corner brackets.
- `acid.js` — ACID PARADISE 1968 (luma .70). Colour-cycling wavy bands flowing from the board (on beat steps when chaos > .35), warped checker sheets, concentric targets, 4 big flowers, fractal crack (chaos ≥ .2 or on a bite), grain. Misregistered ink layers jump on every beat. Snake: a striped worm (cached segment sprites), an eye and a flicking tongue, tapered tail. Dot: a sunburst flower. Lethal edge: a scalloped plum band with lemon ric-rac.
- `timewarp.js` — TIME WARP (luma .45, year '????', weight 1). Half-res tunnel buffer: 30 rings + polar checker wedges flowing out from the board; shape per bite (circle spiral / square / hex), palette per bite; inversion bursts on a bite and every 8th beat (wild mode only), colour split, punch zoom+roll, orbiting folded checker sheets, stretched era years, pixel fragments. Board: black portal plate, checker rim, red lethal rail, navy panel. Dot: a spinning portal seed.
- All three are `meta`/`scenery`/`board` per §15.3, pure apart from module caches. They read `fx` only and never write to `snap` or `fx`. Animation runs from `fx.time`; `fx.biteAge` drives bite bursts. Static layers (board plate+grid, back/front scenery, scanlines, sprites) are cached offscreen, keyed by size and dpr (from `ctx.getTransform()`).
- Board rules: board() paints its own opaque plate first, and patterns never cross cells. Head, body, tail and dot differ by shape. Bite bursts are clipped to the board and drawn under the snake. When dead, the snake turns grey or sepia with X eyes and a static red X sits on the crash boundary. No flashing.
- Reduced flash: no inversion, no colour split, the beat-stepped colours hold for 8 beats, misregistration is fixed and small, and timewarp's contrast is lowered by a veil. Reduced motion: bite bursts become a static fading outline, and everything else slows via `fx.time`.
- Harness `dev/flat-a.html` + `dev/flat-a.js` (server `ss-flat-a`). It fakes a snapshot and fx with the §15.3 layout and runs a Hamiltonian-cycle fake snake. Keys: timeline 1-3, B bite, A auto-bite, P pause, K kill, R reset, L long snake, F/M switches, C chaos, 7-9 size (fit / 1280×720 / 390×844), X cell check, H hide. URL `?tl=&size=&rf&rm&auto`. `__flatA` is exposed.

## Verified (in-app browser)
- Cell check (`__flatA.check()`): draws board() alone and checks every cell centre against the snapshot. It covers 3 timelines (timewarp with 3 skins), 2 sizes, alive and dead, with snakes of 10 and 140 cells: 60/60 runs pass. The first run failed every dead case because the death marker used a non-adjacent `death.cell`; it now only uses an adjacent cell.
- Screenshots: all three at 1280×720 and 390×844, at chaos 0/0.7/1, at a bite, and dead with both switches on. No console errors from the harness.
- CPU time per frame (command recording, steady, 1280×720 at dpr 2, chaos 1): arcade ~0.2 ms, acid ~0.15 ms, timewarp ~0.5 ms, board ~0.03 ms. The harness runs at 120 fps. GPU raster is not included in these numbers.
- Core's registry already loads all three: "scenes: lcd, arcade, acid, timewarp, court, court-pov".

## Defaults chosen
- Timewarp's snake is "the previous timeline's snake": it reads `fx.prev` (or `fx.prevTimeline` / `fx.from`). For 'arcade' or 'acid' it reuses those skins, and for anything else it draws its own neon portal skin.
- Timewarp year shows as '????'. Polygon tunnels do not twist per ring, because twisted squares shattered into shards and lost the tunnel look.
- Wild-mode inversion in timewarp only lasts while the beat pulse is above 0.6 (about 100 ms), so it comes in bursts rather than a constant strobe.
- Score numerals (hi-score font, bubble, stretched) are left to core's HUD; nothing is drawn in the free band above the board except scenery.

## Requests
- core/integrate: please add `fx.prev` = id of the previous timeline or room (e.g. 'arcade', 'acid', 'court'). Without it, timewarp falls back to its portal skin.
- core: `arcade.js` exports `kit` + `drawSnake`; `acid.js` exports `drawSnake`, `checkerSprite`, `warpSheet` (used by timewarp). These are not timelines; the registry can ignore them.
