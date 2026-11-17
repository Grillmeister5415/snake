# audit stream: notes (levels wave 2)

Harness: `dev/audit.html` on localhost:4321. Reload, then `__audit.check()` → 992/992 pass, console clean (17 s).
`check({ bare: true })` also runs wrong.js's own fallback board (1032/1032; logs one expected 404 for `?only=none`).
`__audit.quick('<regex>')` checks one universe; `__audit.render(case, fx)` draws the gallery and icons on demand.
Cases: normal, broken (breaks [3, 6]: one adjacent split pair, one far jump; length 16, prevTail null, progress 0.5),
one visible cell (length 9), three cells waiting 'respawn' and 'start', dead. fx: calm, wild, bite on the head. 1280×720@1, 390×844@2.
Flat check: board() vs the same board with no snake/dot. Snake/dot cells drawn, empty centres untouched, no strong mark
across a split adjacent pair, ends at a break not shrunk like a tail, waiting snake still (no flashing).
Rooms via `createRoomRenderer`, board view: Δ vs the snake parked in a corner, exact pass at progress 1 plus a mid-tick
pass where gaps must stay empty; pov and wild render every case without errors.
Looks as before: `dev/audit.baseline.json` hashes normal + dead (2D calm/wild/bite, 3D board/pov) taken before any edit;
all 100 identical. Court pov hashes re-taken mid-run because another stream changed `engine.js` glow (not my files).

## Per file
- `lcd.js`: no throw on an empty snake (head and bite split into helpers); small tail block only when the real tail is on the board (`length <= snake.length`). `life()`: LCD pixel block, solid / outlined over a ghost cell.
- `arcade.js`: `headDir` ignores the neck across a break at 0 (fixes `kit.headDir` for timewarp and the death mark too); tail inset only for the real tail. `life()`: sprite head with eyes / dim outline.
- `acid.js`: `joined()` helper; stripe orientation from a joined neighbour (ahead, else behind, else heading); small tail sprite only for the real tail; `headDir` as arcade. `life()`: six-petal flower / petal outline.
- `kombat.js`: no bridge across an index in `breaks`; `headDir` as arcade. `life()`: slanted fight-bar pip / empty pip over a dark well.
- `desktop.js`: drag outline at `prevTail` only while moving (`!waiting`), with no off-board cells, and adjacent to the last cell; `headDir` as arcade. `life()`: tiny window / dotted drag outline.
- `timewarp.js`: own portal skin's tail block only for the real tail; borrowed arcade/acid skins fixed at source and checked as `timewarp<arcade|acid`. `life()`: hourglass / empty glass.
- `wrong.js`: boards are the siblings' (every owner checked as `wrong>id`); own fallback board was already per cell. `life()`: cracked glass block / broken outline.
- Rooms `court`, `bunker`, `disco`, `plastic`: no change needed for safety (they only colour segments through `F.snake.segment`; the engine draws the snake gap-safely; dot code already null-guarded). Each got a plain Canvas 2D `life()` appended: glass block (rim goes neon with chaos), caged red lamp, mirror tile, chrome bead. `court.js` interface comment untouched.

## life() contract as built (for shell)
- `life(ctx, x, y, size, filled, fx)`: (x, y) is the slot's top-left, `size` its side; stays inside the box; saves and restores all context state; `fx` optional (reads `chaos`, desktop reads `variant`).
- Hollow centres are see-through, so the HUD background shows; each icon was drawn on its universe's `meta.hud.bg`.

## Defaults chosen
- "Real tail on board" = `!(snap.length > snap.snake.length)`; when cells are off the board the last visible cell is plain body.
- Waiting: the snake is simply still (none of the eleven animates body cells); head details like tongues keep their beat.
- A faint per-cell glow (arcade) that touches a neighbour is not a link; links are judged on strong marks only.

## Left / notes
- disco and plastic keep animation state across renders: pixel hashes only compare on a fresh page (check() does baseline first).
- Not covered here: lane/cube-specific visuals (`space`, `foodAt`) — these eleven only see the board-local snapshot.
