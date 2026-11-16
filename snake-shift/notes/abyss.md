# abyss stream (wave 1): ABYSSAL CATHEDRAL, −4000 M

## Done
- `src/render/timelines/abyss.js` (2D): `meta` (kind 2d, `calm: true`), `scenery`, `board`, `drawSnake`, `life`.
  Scenery: a dark stained-glass mosaic, a gothic arcade with lit lancet windows, a rose window sized to the
  free band above the board, branching coral and organ-pipe tubes, slow jellyfish, light shafts, marine snow.
  Board: dark glass tiles in lead, gold-railed band of glass diamonds with medallions and stars (lethal edge).
  Snake: gold-edged scallop-shell tiles oriented toward the next joined cell; lancet-shaped head with pearl eyes.
  Dot: a pearl. Bite: light runs outward through the lead lines only (never across a cell centre).
  chaos 0→1 cross-fades two cached layers (own → neon coral) for scenery, board and shells.
- `src/render/gl/rooms/abyss.js` (room): clustered piers with gold capitals and fluting, pointed arcades,
  clerestory and aisle windows, transverse vault arches past the far edge, a facade with rose window and glowing
  portal, coral reefs with polyp glows, two giant ammonites, a manta, rim-lit jellyfish bells with tentacles,
  light shafts and pools, haze, caustics on the sky and floor, a voronoi stained-glass floor whose lead glows at
  chaos. Window sheets are Canvas 2D textures, rebuilt lazily per chaos seventh and cached.
- `life(ctx, x, y, size, filled, fx)` in both files: (x, y) = top-left of a size × size slot (same as hangar and
  mushroom). Filled = pearl in a gold setting; hollow = the empty setting. Restores ctx state.
- Harness `dev/abyss.html` + `dev/abyss.js`, render on demand (`__ab.run(frames, dt)`), `__ab.checkAll()`.
## Verified (http://localhost:4321/dev/abyss.html)
- `__ab.checkAll()`: 60 runs, 0 problems, 0 console errors. Cases: moving, broken (`breaks` [3, 6], three
  pieces), respawn (3 cells, `prevTail` null, `waiting: 'respawn'`), dead (self), bite (biteAge 250 ms);
  each at chaos 0 and 1, landscape 1280×720 and portrait 390×844, in 2d, board view and first person.
  Life icons of both modules drawn filled and hollow at chaos 0 and 1 without errors.
- 2D cell check as in flat-a (centre vs empty colour, > 60). Room check: 3×3 sample at the projected cell
  centre; calm classes pearl / blue shell / empty (dead: grey and lit); wild classes lit / empty. First person
  tests forward 1–6, lateral ≤ 3, and skips a floor cell hidden right behind a raised shell or the pearl.

## Calm rules followed
- No flashes or strobes of its own. fx.beat is capped at 0.15 here; fx.punch is replaced by a slow swell
  rebuilt from biteAge (peak ~0.6 s, gone by 2.4 s, smaller under reduced flash). Twinkles have periods ≥ 2 s.
- Reduced motion: jellyfish, manta, motes and shaft sway hold still; only colours change.

## Defaults chosen
- Room check uses `progress: 1`, so it measures the room, not the engine's tail interpolation (engine-ext's
  gap-safe `drawSnake` is not assumed). The room draws nothing on the board itself, only materials.
- `F.ring` is dimmed to [0.07, 0.065, 0.045] so the engine's bite ring and beam stay a soft glow in this room.

## Requests
- engine-ext: the bite beam billboard (mode 3) and the pov dot beacon carry fast ripples (`uGTime * 12`). If the
  shell exposes `fx.calm`, consider slowing or dropping them while it is true. Both modules export `meta.calm`.
