# rooms-a stream: notes (wave 2)

## Done
- `rooms/bunker.js`, Berlin Bunker 2026 04:37, board and first-person views. It is a box room: concrete walls with a generated poster sheet stand exactly on the lethal edges (posters sit 0.006 outside the edge). In the board view the near wall is left out and the room opens into a long hall: portal frames with red light tubes, speaker stacks, pipes, a crowd and DJ as merged silhouettes, a booth, `TIME BREAK` banners, smoke and lasers. The score shows as stencil numerals on a far-wall plate, redrawn only when the score changes.
- Snake: red light tiles (0.14 high), head tapered with a white outline. Dot: red sphere with a white-hot core (an additive blob in front of it), so it differs from the snake by shape and brightness.
- Strobe room: the kick strobe is `beat^2.2` scaled by `0.45 + 0.85·chaos`. Below chaos 0.5 it accents every other beat; above 0.55 white strobes come in. It washes the sky, floor, walls, tubes, strobe units and crowd rim. Wall flash on `punch`. Laser count, sweep speed and beat jumps grow with chaos. The beat jumps and the crowd bob are off under reduced motion. Snake, dot, panel and grid never use beat or room light.
- Engine and kit, additive only (court is unchanged): new `boxroom.js` (`kit.boxRoom`, `posterSheet`, `concreteSheet`, `canvas`), `kit.updateTexture`, `geometry.planeUV` and `merge`, `d.beam` (laser, glow mode 4), smoke glow mode 5, `F.povWalls = false`, `F.snake.dotPoolBeat`. The interface comment in `court.js` lists them.
- Harness `dev/rooms-a.html|js`: `__ra.check()` covers every loaded court and bunker case at 1280×760 and 375×812. `__ra.frames(n)`, `__ra.set({frozen, clock, view, chaos, rf, rm})` drive frames by hand when the pane throttles rAF.

## Verified (dev/rooms-a.html, dev/gl.html)
- Cell check, 0 mismatches. Court: board, edges and dot-edge 256/256 at both sizes; first person 19/19 (landscape) and 17/17 + 2 off-screen (portrait). Bunker: the same, run calm and wild (beat 1, chaos 1, punch 1). Board pixels change by Δ0 between calm and wild, so the board never strobes.
- `dev/gl.html` court check 256/256/19 and null path (no canvas, no context, shader failure) still pass.
- Console clean. Bunker costs about 2.5 ms of CPU per frame. Screenshots checked: board and first person, in landscape and portrait, calm and on a strobe hit.

## Defaults chosen
- Box wall height 2.0, so first person sees the hall over the walls. Hall shell 46 high so the portrait board camera (H ≈ 28) stays inside it.
- Lasers in the board view stay behind the board (z ≤ −10). Overhead beams crossing the board are drawn in first person only, at 3 or more cells up, so above every cell.
- The dot's floor pool does not pulse on the beat in the bunker (`dotPoolBeat: 0`).
- My server `ss2-rooms-a` (4182) could not start: the 5-server cap was taken by other chats. I tested through the idle wave-1 `ss-gl` server (4174, same static folder).

## Not done / requests
- `integrate`/`core`: the meta has an extra `clock: '04:37'` field for a subtitle if wanted. Score stencil is in-room; the HUD may still show its own.
- `rooms-b`: the new kit pieces are available. Disco and plastic already load and pass the calm cell check in my harness.
