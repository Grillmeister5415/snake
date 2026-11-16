# engine-ext stream: notes (levels wave 1)

## New hooks (all optional; full text in the interface comment at the top of `rooms/court.js`)
- `ROOM_IDS` = court, disco, plastic, bunker, lane, hangar, mushroom, castle, abyss. A missing file is skipped.
- Snake: honours `snap.breaks` and adjacency, null `prevTail` = no tail motion, cells exact while `snap.waiting`, no dot when `snap.food` is null.
- `instance.items(d)`: opaque meshes on the board, after snake and dot, both views, never mirrored. Each `d.mesh` here adds its world bounds to the post mask.
- `d.segs = { n, x, z, link }` (smoothed centres, `link[i]` 1 when i joins i + 1), `d.progress`, `d.protectBox(x0, y0, z0, x1, y1, z1)`, `kit.aspect()`.
- Lane (`snap.space.kind === 'lane'`): origin glides `prevY0 → y0` over the tick. `d.lane`, `d.scroll` (smooth origin row), `d.laneZ(Y)` (absolute row → world z), lane-aware `d.cellToWorld`. GLSL `uLaneScroll` = (origin, origin mod 256, 1 in lane, tick fraction) in every room program.
- `F.board.open = true`: strip to the horizon, side bands and curbs only, grid scrolls, side-only first-person walls on absolute rows, whole strip masked. In lane space the dot is drawn from `snap.foodAt`, also beyond the window.
- `F.custom = true` + `instance.surface(d)`: engine draws no board, grid, curb, snake, dot, pools, rings or walls and drops its board volume from the mask.
- `F.camera = { eye, target, up, fovy (deg), near }`, any room, both views. `F.protect = [{ origin, u, v, h } | [p0, p1, p2, p3]]`, max 8 volumes with items. `F.floor = false` skips floor and mirrored props.
- Option `createRoomRenderer(canvas, { roomModules: { id: module } })` injects rooms (harness).

## Verified (localhost:4321)
- `dev/gl.ext.html`, `__ext.check()`: all pass, console clean. Pixel hashes of court, disco, plastic, bunker × board/pov × calm/wild × 640×400 and 300×520: 32/32 bit-identical to a baseline taken before any change (post pass active in the wild frames).
- Layout numbers: no interpolation across a break or a non-adjacent pair, null prevTail, respawn exact, lane origin −39.5 at half tick, body rows offset by exactly −0.5.
- Cells: court broken snake + null food 256/256; strip board 256 + dot 4 rows ahead; strip mid-scroll 255; strip first person (piece ahead, dot ahead); cube top face 256; both sizes.
- Mask Δ0: item pixels on a closed board (206 px, 34 outside the board volume), open strip, first person (10 267 px); strip cells and rows 45 to 80 ahead; cube faces 243 points. Controls: same cube points change without `F.protect`, item tops change without the item.
- Other harnesses unchanged: `__gl.check()` 256/256/19, null path null; `__ra.check()` 0 bad (bunker edges-wild Δ 7/21 as fx-pass documented); `__rb.sweep()` 0 problems; `__fp.check()` 0 problems.

## Defaults chosen
- Snake in the lane uses `snap.snake` (+ y0), not `snap.body`: body cells past the window are not drawn (mostly off-screen anyway).
- `prevTail` is read as board-local to the current `y0`. Bite rings keep the lane row they happened on.
- Protect quads extrude both ways along the normal (h default 0.5), so the face order does not matter.
- `dev/gl.html` now loads only the four built rooms (`?all` for every id), so it stays 404-free.

## Not done / requests
- Pages that load the default `ROOM_IDS` (game, rooms-a/b, fx-pass harnesses) log a 404 per room file that does not exist yet. `lane.js` and `castle.js` arrive in wave 2; coordinator may add `export const meta = null` placeholders to silence them earlier.
- rules: please keep `prevTail` relative to the current `y0`; `breaks` indices as in 3.3.
- Test rooms `xstrip` and `xcube` live in `dev/gl.rooms.js` (throwaway, not in ROOM_IDS).
