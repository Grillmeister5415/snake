# lane-2d — ACID ENDLESS LANE, 2D look

Owns `src/render/timelines/lane.js`, `dev/lane-2d.html`, `dev/lane-2d.js`. Status: done.

## What is in lane.js
- Flat timeline (`meta.id = 'lane'`, `kind: '2d'`, weight 1), exports `meta`, `scenery`, `board`, `life`,
  plus `scrollRows(snap)` (the smooth window position in rows: prevY0 → y0 over `snap.progress`;
  a jump of more than 2 rows, such as entering the lane, does not slide).
- Scenery: wavy screen-print bands and giant daisies, both anchored to lane rows, so they scroll
  with the window. Warm inks at chaos 0 blend to acid neon at chaos 1 (wider waves, faster spin).
  The beat swells the flowers, a bite blooms a big daisy, and `punch` fans an op-art sunburst from the
  bitten cell (off under reduced flash).
- Board: a cream paper panel with world-anchored grain, an orange grid that misregisters in a second
  ink as chaos and the beat rise, and mustard centre dashes on the middle grid line that scroll smoothly.
  Side rails (plum bar, inner stripe, a cream bolt per lane row, scrolling) are the lethal edge; a wall
  death leaves a still red star on the rail. Top and bottom have no rail: the lane, its grid and
  dashes run on for up to 3.4 cells and fade out, with chevrons marching outward.
- Worm: rounded printed segments, each with a ring and an outlined daisy, joined by plum collars only
  between adjacent cells not split by `breaks`; the tail tapers. The head is a round face in a petal
  ruff with googly eyes and a forked tongue (at most 0.3 cell past its edge). Dead: sepia inks, X eyes,
  no tongue, no flashing. `waiting`: a dotted halo turning around the head.
- Dot: a spinning swirl disc; nothing is drawn when `snap.food` is null.
- Bite sparks on the board run along grid lines only, so cell centres stay clean.
- `life()`: a flower disc; filled = orange petals with a mustard centre, hollow = plum petal outline.

## Verification
- Harness `dev/lane-2d.html`: a fake lane simulation (travels up with y0 advancing and the dot
  coming into view, U-turns and travels down, eats and respawns dots 2–8 rows past the top), plus
  static cases up, upFar (food null), down, broken, one cell, three cells, respawn (waiting), dead,
  and edges. `__l2.check()`: 120/120 pass with a clean console. It covers 9 cases × 6 fx sets
  (chaos 0, chaos 1, wild, switches, bite 60 ms, bite 300 ms) × 1280×720 and 390×844, cells fixed at
  every progress, hinge present / absent across a break (compared with an empty board), scroll
  continuity over 160 ticks, the dot null then in view, life icons, and the context restored.
  A full frame takes about 0.5 ms.
- Real game `/?debug&universe=lane&lock&look=2d&auto`: ran 38 s in the lane (score 21, y0 down to −201,
  lives shown as flower discs) with no console errors.

## Defaults chosen
- Rail width is 0.42 cell, outside the board, matching where the lethal edge is.
- The fade zones are painted by `board()` above and below the panel, clamped to the space available.
