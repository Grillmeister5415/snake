# castle-2d (levels wave 3)

Owns `src/render/timelines/castle.js` (560 lines) and `dev/castle-2d.{html,js}`. **Ready.**

## Done
- Flat timeline `castle` (CASTLE CUBE / ONCE, kind `2d`, luma 0.78, veil `#e9dcef`, weight 1, pastel HUD with rose accent): `meta`, `scenery`, `board`, `life`.
- Board = the current cube face only. Cached watercolour panel per face (pigment blooms, paper grain, per-tile radial shading = barely visible seams, no grid lines). Each of the six faces has its own wash, tint, ink and a faint painted emblem (heart, leaf, moon, star, crown, swirl), so arriving on a new face reads at once.
- Four edges are open doorways, never walls: light in the *neighbouring* face's tint spills out through each edge with an arch of light, a soft dashed stitch marks the fold, flowering garlands swag outside, small towers stand only at the corners. The edge the snake arrived through (`space.entered`) flashes white and fades over the tick. Neighbour faces come from `space.js` `cubeFaceNeighbours` (dynamic import with a fixed fallback; `(d + rot) & 3` maps board-local to canonical).
- Serpent: satin ribbon band with hem, satin stripe, alternating flowers and leaves; teardrop head with a neck bow, crown flower, eyes and blush; swallowtail end only when the real tail is on the board (`length === snake.length`). Strips are drawn only to joined neighbours (adjacent and not in `breaks`), so cut bodies and 1- or 3-cell visible snakes draw correctly. Ribbon palette rotates with `fx.variant` and skips the one matching its face (lilac/violet, peach/coral).
- Dead: faded linen colours, X eyes, no flashing. `snap.waiting`: rotating dashed ring around the head.
- Dot: bramble berry (drupelet cluster, leaves, blossom), bounces on `fx.beat`; draws nothing when `snap.food` is null. No cube map, arrow or slide (flat.js owns those).
- Bite: crisp petal ring inside the bitten cell on the board; in the scenery a petal ring bursts out of the board, a pink flash (`fx.punch`), sun rays jump.
- Scenery: sky gradient blending pastel → glossy neon with `fx.chaos`, rotating sun, a rainbow above chaos 0.2, cached drifting clouds, three floating garden islands with towers, pennants, vines and a waterfall (two in portrait), rolling hills with an arched bridge and swaying flowers, drifting petals (more with chaos). Board gets a neon glaze and moving gloss sheen with chaos.
- `life()`: filled berry, hollow = drupelet outlines.
- Cost at 1280×720 dpr 2: scenery ~1.5 ms, board ~0.9 ms.

## Verified
- `dev/castle-2d.html`, `__c2.check()`: **122/122 pass, console clean**. 15 cases (arrival across each of the 4 seams with one visible cell, all 6 faces, three-cell, broken with `breaks`, edges with a break, respawn waiting, dead, dot on another face) × 4 fx (chaos 0, chaos 1, wild beat+punch, bite) × landscape 1280×720 and portrait 390×844; ribbon shown across a joined edge and absent across a break; life icons filled vs hollow; context state restored. Empty-cell spread ≤ 51 of the 60 threshold on every face.
- Real game `/?debug&universe=castle&lock&look=2d&auto`: ~50 s via `__ss.run`, score 21, all six faces visited, seams crossed, no console errors; HUD shows the berry lives.

## Defaults chosen
- No imports at load except the tolerant dynamic import of `../../space.js`.
- Body flowers spin slowly with `fx.time` (stop when dead); board itself never moves cells.

## Requests
- None.
