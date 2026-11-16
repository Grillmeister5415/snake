# rules (wave 1)

Done: `src/space.js`, `src/flow.js`, `src/rules-config.js`, `src/sim.js`, `src/autopilot.js`; tests `space` (12), `flow` (13), `sim` (27), `lives` (9), `steer` (8): 69 pass in about 2 s.
Soak: 3 autopilot runs of 2,000 food events over random universes: 0 moved cells, 0 bad visible cells, lives max 5, special share 0.093 / 0.102 / 0.110 of shifts.

## Exports of `space.js`
- Constants: `SIZE` (16), `DIRS`, `OPPOSITE`, `DIR_ORDER` (['up','right','down','left']), `CUBE_FACES` ([{ normal, right, down }] per face, world vectors).
- Cube (3.4): `cubeNeighbour(f, u, v, dir) -> { f, u, v, dir }` (dir canonical, on arrival); `cubeCellToWorld(f, u, v) -> { pos: [x,y,z], normal: [x,y,z] }` (edge 16, centred); `faceFrame(f, rot) -> { right, up, normal }` (arrays; right x up = normal); `cubeNet(face, rot) -> [{ f, gx, gy, rot }] x6` (vertical cross 3x4, centre at gx 1, gy 1; draw cell (u,v) at gx*16+x, gy*16+y with canonToLocal(u, v, rot)).
- Frames: `localToCanon(x, y, rot) -> { u, v }`, `canonToLocal(u, v, rot) -> { x, y }`, `localDirToCanon(dir, rot)`, `canonDirToLocal(dir, rot)`, `cubeStep(f, u, v, rot, dir) -> { f, u, v, rot, crossed }`, `cubeFaceNeighbours(f) -> [up, right, down, left]`.
- Spaces: `createSpace(kind)`, `stepIn(space, cell, dir) -> null (wall) | { cell, face, rot, crossed }`, `toBoard(space, cell) -> {x,y} | null`, `fromBoard(space, x, y)`, `leaveToBox(space, cell)`, `enterFromBox(kind, cell)`, `laneFollow(space, head)`, `sameCell(a, b)`, `cellKey(kind, cell)`.
- Search: `spaceGraph(space) -> { kind, size, nb, index(cell), cell(i) }`, `bfs(graph, blocked, start) -> Int16Array` (-1 unreachable).
- Canonical faces: 0 front (+z), 1 right (+x), 2 back (-z), 3 left (-x), 4 top (+y), 5 bottom (-y); u = right, v = down on each face. `rot`: canonical dir index = (local index + rot) % 4.

## Other exports
- `sim.js`: `createSim`, `stepMsFor`, `DIRS`, `OPPOSITE` (re-exported). `sim.universes` = the normalised table.
- `flow.js`: `createFlow`, `isSpecial(u)`, `normaliseUniverses`. `rules-config.js`: `BOARD, LIVES, MUSHROOM, LANE, CUBE, SPECIAL, FLOW, UNIVERSES`.
- `autopilot.js`: `chooseDir(snap)`, `createAutopilot(sim)` (uses only `snapshot()` and `queueTurn()`).

## Deviations from section 3
None. Additions only (no field renamed or changed in meaning):
- Events carry extra fields: `ate.held` (true when no shift follows) and `ate.tick`, `shift.reset` (Total Reset to lcd), `died.tick`.
- `death.reason` may also be `'complete'` (no free cell for a dot; box only, practically never), as in the old sim.

## Readings and defaults (where section 3 left a choice)
- `universe.index` = number of shifts this run (0 for the opening universe); `shift.index` is the same counter.
- `holdLeft` = held food events still to come; specials arrive with 3..5 (lasting 4..6 food events), rare ones with 0..1.
- `body` lists the real cells of the lane or cube, head first; off-board cells (from an earlier space) are left out, so `body.length <= length`.
- Snapshot inside an `ate` listener shows the old universe; on a shifting bite `food` is null there until `shift`.
- Lane: after arrival the window catches up at most 2 rows a tick (the head may sit outside rows 5..10 for a few ticks, because the shift itself never moves a cell); afterwards it scrolls 1 row a tick.
- Respawn: preferred heading is the heading at the crash (lane: up); the brute-force test pins "nearest the centre". Respawn emits `step` then `lifeLost`, like death did.
- Mushroom spawns: on the tick after arrival; the every-second-food spawn happens on that food tick. Spawn needs Manhattan and path distance >= 4 from the head.
- Special weight tuned 0.9 -> 0.85 (`SPECIAL.weight`): about 10.8% of shifts in 30-60 food runs, 9.8% over 2,000.
- Selection constants copied from config.js `DIRECTOR` into `FLOW`; the shell can drop them from config.js.
- `lockUniverse(id)` switches at once (emits `shift`) and survives `reset()`; while locked every bite is a held bite.

## For other streams
- shell: resume with `setPaused(false)` on the first direction key for `waiting` 'start' and 'respawn'; a lock is `sim.lockUniverse(id)`.
- overlay / castle-room: use `cubeNet(snap.space.face, snap.space.rot)` for the map and `faceFrame` for the camera; both match `canonToLocal`.
