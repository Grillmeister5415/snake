# gl stream: notes

## Done
- `src/render/gl/`: `m4.js`, `glutil.js`, `geometry.js`, `shaders.js`, `engine.js`, `rooms/court.js`. Hand-written WebGL 1, no libraries. Four programs: sky, floor, mesh (these three are compiled per room with the room's GLSL) and one shared glow program.
- `createRoomRenderer(canvas, { cols, rows })` follows 15.3. It resolves to null when there is no canvas, no context, or a shader fails. It also exposes a non-contract `debug` object (project, cellToWorld, camera, gl) that the harness uses.
- Court room, both views: violet sky with stars, a nebula and a giant striped sun. The `roomSky` GLSL function is shared by the sky pass, the floor reflection and chrome. A checker floor with a glossy reflection (mirrored props show through it). The board panel, grid and frame band are drawn in the floor shader, plus a low curb. Snake, head (tapered with eyes), gem dot and light pools are separate meshes. Colonnades, spires with rings, wire pyramids, chrome spheres, spinning cubes, stairs and sky rings all sit outside the board.
- Section 6.3 interpolation is implemented exactly, including the `grew` and tick-0/dead cases. Segments are 0.26 high, the head 0.30 plus eyes (0.337 in total), and heights are clamped to 0.34.
- The board camera uses the 6.3 numbers (66°, pitch 24°, near edge 55°, H ≥ 15 solved for 94% width), with no yaw.
- First person (6.4): eye height 0.95, pitch −14°, 90° horizontal FOV, yaw eased with τ = 60 ms (snaps under reduced motion and on entering the view), head hidden, energy walls 2.6 high on the lethal edges, a beam over the dot.
- fx: sun size and horizon glow pulse on `beat`; checker colours swap while `punch > 0.3`; grid, frame, wall and neon colours step with `variant`. `chaos` adds a marching checker, random tile flares on the beat, sky hue jumps per bite, star warp, a rainbow snake, faster spinning props and bouncing rings. A bite shock ring crosses the floor, and the camera punch-zooms when a bite lands and after a cut (not under reduced motion).
- Room interface: documented at the top of `rooms/court.js`. A new room is one file exporting `meta`, `glsl { sky, floor }` and `create(kit) → { frame, props, glows }`.

## Verified (dev/gl.html on ss-gl)
- Cell check (`C` or `__gl.check()`): every cell is projected and its pixel colour classified. Board 256/256 and edge-hugging snake 256/256 at 1280×760 and 375×812; first person 19/19 (landscape) and 17/17 + 2 off-screen (portrait). Negative control: snake cells luminance 147–255, empty cells 4–5.
- Null path: fake canvas, null canvas, forced shader failure → all null. The no-`OES_standard_derivatives` fallback compiles and renders. After context loss, `lost()` is true and `render` is a no-op.
- Console clean on a fresh load (only the harness's own log line). Render costs about 2 ms per frame at 2322×1378 (GPU, synced). The preview pane throttles requestAnimationFrame, so the harness fps readout is not meaningful there.

## Defaults chosen
- Placeholder `rooms/disco.js`, `plastic.js`, `bunker.js` export `meta = null`, so the engine skips them without 404 noise. The rooms stream replaces them.
- A room whose shaders fail is skipped with a warning; null only when no room loads.
- First-person vertical FOV is capped at 100° in portrait, which narrows the horizontal FOV there.
- Backing store scale capped at dpr 2 and 3.2 MP. Context restore is not handled: `lost()` stays true.
- Bite beam and the small ring are skipped when the bite is under the first-person camera.

## Not done / for later
- Box room, poster sheet, disco, plastic, bunker (wave 2 `rooms`). Kit already has `texture(canvas)` and material mode 2 for posters.
- No perspective Canvas 2D fallback (stage 2). No effects stage (6.6).

## Requests
- core: none. Already integrated per core.md. `fx.biteAge` must be Infinity (or the bite null) when there is no bite; the engine tolerates missing fields.
