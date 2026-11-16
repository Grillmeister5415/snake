# hangar stream (wave 1) — RED IRON HANGAR, 1957

## Done
- `src/render/timelines/hangar.js` (`meta`, `scenery`, `board`, `life`): aged drafting sheet (stains,
  creases, zone frame, crane truss, title block, invented boxy tank elevation, no markings). Wild
  margins: meshing gears with a ratchet kick per beat, swinging crane hook, sparks, caged lamps, light
  shafts, shock rings, a slammed inspection stamp and a sheet jolt per bite. Chaos 0 sepia ink ->
  chaos 1 night blueprint (ink colour by `fx.variant`, red strobing lamps, neon frame on the beat).
- 2D board: cream plate, red riveted iron band = lethal edge, brass riveted plates, arrow-nosed head,
  round red enamel rivet dot. Hinges only between adjacent cells not split by `breaks`; the bite
  burst sits on grid lines and crossings only. Dead = rusted plates, X eyes, static red cross.
- `src/render/gl/rooms/hangar.js` (`meta`, `glsl`, `create`, `life`): concrete hall with arched
  window walls, pilasters, gantry runways, two travelling crane bridges (hook on chains, a tank in a
  four-chain sling), parked invented tanks whose turrets traverse on each bite, pipes, valve wheels,
  crates, pendant lamps with light cones, window shafts, smoke, wet floor with puddles and a painted
  safety stripe, red rail posts beside the lethal edges (only |x| > 8.5 or z < -8.5). Chaos 1: red
  lamps and beacons strobing, cyan floor and vault grid, neon edges on all machines (accent by
  variant). Snake = brass plate mesh with domed rivets, arrow head, dot = red lamp + white core.
- `life(ctx, x, y, size, filled, fx)` in both files: rivet, filled = domed brass, hollow = empty
  hole. (x, y) = top-left of a size x size slot (same as mushroom); ctx state restored.
- Harness `dev/hangar.html|js`: three looks; cases live (autopilot, lives, respawn, death), moving,
  edges, broken (3 breaks, one between adjacent cells, prevTail null), respawn, dead, dotEdge;
  1280x720 / 390x844; bite, chaos, switches. Console: `__hg.check()`, `__hg.frames(n)`.

## Verified (http://localhost:4321/dev/hangar.html)
- `__hg.check()` 174/174, console clean. 2D: 6 cases x 6 fx (chaos 0/1, wild, switches, bite 60 and
  300 ms) x 2 sizes + hinge present/absent across a break + life icons. 3D through
  `createRoomRenderer(canvas, { roomIds: ['hangar'] })`: board and pov x 6 cases x 4 fx x 2 sizes, plus
  a progress-0.5 check that nothing is drawn between split pieces. Live run 4500 frames, no errors.
- 2D costs about 0.2 ms CPU per frame at 1920x1080.

## Defaults chosen
- "Aged blueprint" = sepia drafting sheet with faded ink (mood board), burning to a cyan night print.
- 3D check fx use `bite: null` with punch 1: the engine's own bite ring crosses cells on purpose.
  The bite path renders in both views without error. Pov skips cells behind a plate or the dot
  beacon and under 1.6 units from the eye; the `edges` case faces off the board in pov (0 cells).
- Blocky strip under the board at mid chaos = engine post-pass glitch, not this room.

## Requests
- shell: lives via `life()` with top-left slot; 2D `meta.hud` is dark ink on paper.
