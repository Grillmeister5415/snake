# mushroom (levels wave 1): MUSHROOM LAND, 1991

## Done
- `src/render/timelines/mushroom.js`: meta, scenery, board, life. The board is drawn at 10 px per cell into a small buffer and upscaled nearest-neighbour; cells are exact. Coral/cream checker snake (notched head with eyes, smaller tail, bridges only between joined neighbours), magenta spore-orb dot, cream brick rail as the lethal edge. Scenery is drawn at about 1/4 resolution: banded sky, pixel sun, clouds, terraced cubic hills with moss and waterfalls, stepped giant toadstools, a fern-and-toadstool frame and spores. Own 16-colour palette (4 variants) → neon (2 variants) by `neonMix(chaos)`.
- `src/render/gl/rooms/mushroom.js`: meta, glsl (pixelated banded sky, sun that turns synth-sliced, blocky clouds, dome grid at neon; navy lake floor with pixel ripples and a neon grid), create → { frame, props, items, glows }, life. It has voxel hills with world-unit UVs, so `lines` draws cube seams that are ink at chaos 0 and glowing at chaos 1. Waterfalls cascade down each terrace. It also has giant stepped toadstools, voxel clouds, ferns, small toadstools and spore cubes, all outside the board.
- Life mushroom: a bell cap with gold rim, mint, gold, mint and a gold tip, on a cream stem, with no face and no spots. Flat: a 10×10 sprite with a 1-px hop and rising spore pixels. Room: `items(d)` rocks it gently; in first person it adds a mint beacon. Both fade without blinking (to 30%) over the last 20 ticks.
- `life(ctx, x, y, size, filled, fx)` in both files (the room re-exports the flat one): an 8×8 bell toadstool, filled in mint and gold or hollow (outline). **(x, y) = top-left of the size×size slot.**
- Harness `dev/mushroom.html`. Cases: moving, broken (with an adjacent-but-broken pair), respawn (3 cells, prevTail null) and dead, each with and without the mushroom. Also: bite, chaos 0/0.5/1, both switches, 2d/3d/pov, landscape 1280×720 and portrait 390×844, render on demand (`__mush.render/advance/check`).
- Result: `__mush.check()` gives **76/76 pass, 0 console errors**. That covers flat cells, mushroom/dot identity, flat joints (bridged exactly where joined, never across `breaks`), room board view in every case, and first person.

## Defaults chosen
- Mushroom age: the snapshot has none. `mushroomLeft(snap)` uses `mushroom.ttl | .left | .ticksLeft`, `snap.mushroomLeft` or `mushroom.expires` if present. Otherwise it tracks first sight by `snap.tick` (80-tick life). The room imports this tracker from the timeline, so whichever look is showing keeps one clock.
- Room heights are kept low because the board camera sees far rows at about 30°. Anything taller covers the cell behind it. Body 0.24, head 0.24, dot 0.28. The life mushroom is about 0.41 tall (squat) in board view and a full 0.98 tall bell in first person.
- `items()` fallback: until the engine calls `items(d)`, `glows(d)` draws the mushroom first, using `d.mesh` (it switches program). Once the engine calls `items` (non-mirror pass) the fallback switches itself off. In that fallback the post-effects mask does not cover the mushroom.
- meta: `weight: 0.9, rules: 'box', mushrooms: true` (hints only; flow owns weights).
- The room check uses `progress: 1`. Mid-tick interpolation and gap-safety for the 3D snake belong to the engine (`engine-ext`, §5.2).

## Requests
- rules: please expose the mushroom's remaining ticks as `snap.mushroom.ttl`, so the fade survives look changes exactly.
- engine-ext: none. The engine now calls `items(d)` in the opaque pass, and the final 76/76 run went through that hook; the glows fallback stays dormant.
- shell: the flat `scenery()` paints the whole canvas; `life()` restores ctx state.
