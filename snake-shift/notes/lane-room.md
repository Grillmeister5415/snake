# lane-room stream: notes (levels wave 2)

## Done
- `src/render/gl/rooms/lane.js`: ACID ENDLESS LANE, 1967. Exports `meta`, `glsl`, `create`, `life`. Harness: `dev/lane.html` + `dev/lane.js`.
- Open strip (`F.board.open`, lane space only; a box snapshot gets a closed board). Board blends in three stops: cream + orange lines → deep berry + coral → night + cyan. The engine adds grid to panel, so the room passes `grid = line − panel` (negative at chaos 0). Side bands plum → magenta; own rails (striped posts, two bars) at |x| 9; engine curb off.
- Props on absolute lane rows by modulo of `d.scroll`: arches every 6 rows, toadstools 12, giant flowers 10, domes 36; merged runs of rail posts (2) and verge flowers (3). Range: board view z −175..+26, first person −175..+175 (it can look back down the lane). Props bloom in over 40 units at the open ends (engine fog is ~0 at 170, so they would pop).
- Sky: screen-print swirl bands around a spiral sun at the vanishing point, misregistered plum key line, paper grain → neon streaks, yellow/magenta spiral sun, bubbles. Floor: op-art ripples on absolute rows (16-row period) → glossy checker with mirrored props and a bite wave.
- Snake: scalloped blocks 0.24 tall in cycling inks (orange, mustard, olive, teal, plum → cyan, violet, magenta, blue), turquoise daisy with violet heart on every third block (items), head = pointed bud 0.26 tall, tip kept inside its cell. Dot = pink blossom marble → gold. Gentle pulse while waiting; faded ink when dead.
- Dot ahead (`food` null, `foodAt` beyond the far edge): flower flag on a pole (items), beam and halo pushed behind it, floor ring. The engine's first-person beacon is set to black then (it sat on top of the flag).
- `life()`: eight-petal flower disc; hollow = dashed outline.

## Verified (http://localhost:4321/dev/lane.html)
- `__ln.check()`: 144/144, console clean. Board + first person × up / down / broken / respawn / edges / box / dead × chaos 0, 1, wild, mid (rf + rm), print-wild × 1280×720 and 390×844: 20 215 cells. Far dot marble and flag show in dot ink; no fill across breaks mid-tick.
- `__ln.smooth()`: 8/8. Origin moves ≤ 1/8 row per sub-step; the last frame of a tick and the first frame after `y0` changes are pixel-identical (seam 0.000 in every run). Control: dropping `prevY0` gives 93.
- Cost: 0.3–1.7 ms per frame at 1280×720 (board / first person, chaos 0 / 1).

## Defaults chosen
- Dot flag only while the dot is beyond the far edge, so it never covers the board.
- Wild = scenery only (swirl and sun phases, flower breathing, arch and cap flashes on beat and punch, ink burst on a bite); board colours are fixed per chaos level.
- Under reduced motion: no sway, spin, bob or rising bubbles; swirl slows to a crawl.

## Engine observations (no edits)
- First-person yaw eases from `fx.now`; with a frozen `now` it keeps the previous yaw. The check renders once with `reducedMotion` to settle it.
- At grazing distance the anti-aliased grid lines tint far cell centres; the classifier accepts panel→line blends as empty.

## Not done
- Not seen inside the full game (shell is being rewired in this wave). The 2D look is the `lane-2d` stream's file.
