# overlay (wave 2)

Owns `src/render/flat.js`, `src/render/persp.js`, `dev/overlay.*`. Call unchanged:
`flat.render({ snap, fx, d, timelines, glActive, persp, touch, padSide })`; all old exports kept.

## Done
- Safety (3.3): minimap and stand-in draw each cell where it is, never joined; null `food`, null
  `prevTail`, 1- and 3-cell snakes, `waiting` all safe. Stand-in: head direction ignores the neck across
  a break (uses `snap.dir`); the last cell before a break is a low tail block; `waiting === 'respawn'`
  makes the short snake breathe (not under Reduced motion).
- Cube map (4.5): `snap.space.kind === 'cube'` draws an unfolded cross from `cubeNet(face, rot)` in the
  minimap corner (left when `padSide`), centre face upright and outlined, whole `snap.body`, dot from
  `snap.foodAt`, the dot's face tinted. 2D look: sized to sit beside or above the board and clear of the
  arrow; near-square windows have no free corner, so a small see-through map sits over the board's
  corner on the side that keeps head and dot clear (alpha 0.25 if neither side does). 3D looks: pov size.
- Dot arrow: `dotHeading(snap)` (exported) -> `{ dir, at, dist }` when `food` is null and `foodAt` is
  set. Cube: the seam that starts a shortest route (BFS over 1536 cells, cached per dot; ties prefer the
  travel direction); `at` is the edge cell where that route leaves. Lane: up (down if the dot is behind).
  2D: yellow arrow just outside that board edge at that cell, lying on the edge if there is no room.
  3D board view and stand-in: at the screen edge, clear of the map. First person: screen edge relative
  to the heading; side arrows sit below the minimap and above the keycaps.
- Seam slide (2D, cube only): each 2D cube frame copies the finished board; on a tick with
  `space.entered`, that copy slides out and the new board (clipped, translated) slides in along the
  travel direction over 140 ms, ease-out. Cut when `fx.reducedMotion`, when the previous frame was not a
  2D cube frame of the same universe and layout, or on resize. Exact again at 140 ms.

## Verified (dev/overlay.html, `await H.checks()`, landscape 1280x800, portrait 390x844, square 700x700)
- 75-step cube walk over 7 seams: head, arrow position, route (vs. independent BFS), map head and dot,
  net joins at seams: all pass. Slide: head visible at 20/70/120 ms, board exact after 140 ms, cut under
  Reduced motion. Lane ahead/behind, lane 3D, lane first person (heading left -> right edge), cube 3D.
- Broken body, adjacent-but-broken cells, one cell, respawn: 2D and stand-in cell colours all correct.
- Regression: HEAD copies (`dev/overlay.old*.js`) vs new, 7 old timelines + pov HUD + stand-in, plain /
  wild (glitch, strobe, invert, phrase) / veil, 2 sizes: 54/54 pixel-identical (one later run: 53 + 1
  skipped because `wrong.js` itself rendered differently twice in a row). Console clean; 70-step live play.

## Defaults chosen
- Arrow: yellow `#ffd400`, black outline (like the minimap dot), bobs unless Reduced motion. Mid-slide the
  old image still shows the old head (it is the previous frame). Additive: `renderer.cubeMapRect(...)`.
- For shell / castle-room / lane-room: nothing new to pass; `fx.now` drives the slide (else
  `performance.now()`); flat.js draws the 3D-look arrow and map over the WebGL canvas.
