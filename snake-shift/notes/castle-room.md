# castle-room (levels wave 2)

## Done
- `src/render/gl/cube.js` (pure): `cellPose`, `frameDir`, `cubeAdjacent`, `surfaceLerp` (centre to centre over a seam, normal bends at the edge), `surfaceModel` / `basisModel` (meshes on any face), `frameBasis`, quaternions + `slerp`, `cameraFor`, `createCubeCamera`.
- `src/render/gl/rooms/castle.js`: meta `castle` / CASTLE CUBE / ONCE, `views: ['board']`; custom board (`F.custom`, `F.camera`, `surface(d)`, `F.protect` = 6 face quads, `F.floor = false`). Six painted faces (watercolour sheet, faint seams, per-tile shading, own tint each; neon: dark glossy with faint lines). Body from `snap.body` on all faces: ribbon beads glide from body[i + 1] (tail from `prevTail`) over seams; connectors only between cube neighbours on one face. Crowned head points along travel. Berry dot from `snap.foodAt`. Sky kingdom: 36 islands with gardens, towers, flowers, two castles, arched bridges, 72 cloud clusters, moon, waterfalls, sparkles, glowing seams; all blends to neon with `fx.chaos`, hue follows `fx.variant`, glows pulse on `fx.beat`.
- `life(ctx, x, y, size, filled, fx)`: berry with leaf; hollow = dashed outline.
- Camera: eye 50 from the centre on normal + 0.6 travel + 0.4 side (frame coords), up = frame up. Fits the current face plus 5 cells of the face ahead and the side face, re-aimed at their middle. Seam crossing (`space.entered`): basis slerps from what is on screen to the new frame over 300 ms (smoothstep, `fx.now`); cut under `fx.reducedMotion`, on respawn and on arrival.

## Engine (additive)
- `fx.calm` passes through `normFx`; glow uniform `uGCalm` slows and flattens the mode-3 ripple (bite beam, first-person dot beacon). Abyss request done.
- A room whose `glsl.sky` contains `#define SKY_FULL` gets the real sky below the horizon (the sky pass mirrors otherwise). Compile-time, so other rooms compile to the same code.
- `meta.views` is honoured when a room declares it (default still `['board', 'pov']`).
- Verified after the changes: `__ext.check()` all ok, old rooms 32/32 bit-identical to the wave-1 baseline; `__gl.check()` 256/256/19; calm on/off changes beam and beacon frames only when set.

## Verified (`dev/castle.html`, `__castle.check()`, 3 runs in a row, console clean)
- Real `createSim` in cube space, 640×400 and 300×520, chaos 0 and 1: 12 crossings incl. all four seams of face 0 out and back, a corner loop (back on face 0 with rot 1); direction on screen after settling ≤ 14.2°, frame up ≤ 1.2°; during every 300 ms turn the head stays on screen, direction ≤ 24.4°.
- Cells by projection + pixel diff (with vs. without snake and dot, same camera): every camera-facing cell hits, 0 stray pixels; long body (25 cells on 3 faces, dot on a neighbour face) checked from a camera over each face: 25/25; respawn snake (lives 2, 3 cells, waiting): 3/3.
- Reduced motion cuts; `views` = board; a stray `pov` render is harmless; berry icon draws filled and hollow; scenery stays ≥ 58.5 from the centre, camera at 50, so nothing can come between camera and cube.

## Defaults chosen
- Side face shown: the face the dot is on when it is a side neighbour, else the side the head is nearer (hysteresis 2.5 cells); eye glides with a 220 ms time constant.
- The bite ring lands on the cell of `fx.bite` in the frame current when the bite is first seen.
- Face brightness is compensated for the mesh shader's hemisphere light, then shaded by angle to the eye, so the current face is always the brightest.

## Not done / limits
- Most of a long body lies on faces turned away from the camera; that is the cube, not a bug.
- Not seen inside the real game yet (the shell is being rewired). Islands are simple shapes; no flying ribbons.
- Requests: shell: put `calm` into the fx passed to the room renderer; director: `castle` has `views: ['board']` (engine reports it now).
