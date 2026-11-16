# rooms-b stream: notes

## Done
- `src/render/gl/rooms/disco.js` — DISCO INFERNO 1977. Amber/violet dome with mirror-ball light rays, sweeping reflection spots, glitter and a chasing marquee-bulb ring. Giant faceted mirror ball behind the far edge (flat-shaded facets so it really glints); its spin drives the spots on the dome and floor. Light-up dance-floor tiles (1 cell, aligned to the grid) step on `fx.beatIndex` in 4 patterns (random, rings rolling out, diagonals, checker) chosen by `variant`. Also warm rainbow arches, mirror pillars, gold/pink star prisms, stage and speakers, light beams from the ball to the side floors, roaming floor spots, glitter crosses. Snake: blocks tiled 3×3 with mirror tiles, each tilted slightly so they glitter, plus random tile flashes. Head: tapered with gold edges and eyes. Dot: tiny gold faceted mirror ball with a glint.
- `src/render/gl/rooms/plastic.js` — PLASTIC INTERNET 2001. Blue-violet sky, soft fbm clouds, a low sun with lens-flare ghosts in the sky. Endless glossy water with travelling ripples, a square ripple on every beat, a round ripple from each bite, and an iridescent sheen. Chrome spheres dipping into the water, chrome and inflatable tori, glass-looking aqua and pink slabs, iridescent pyramids, glass arches, a wire globe with an orbit ring, a halo ring on the horizon, two fake 2001 interface windows (canvas textures) far behind the board, iridescent ring bubbles with highlights. Snake: chrome beads. Head: chrome droplet with eyes. Dot: glossy yellow bead with a gold floor ring.
- How fx drives them. beat: tiles, rays, arches, stars, bubbles, ripples and hops. punch: tile palette swap and a floor/sky flash. chaos: lit fraction, ball spin, spot density, glitter count, palette swaps on the beat; in plastic, sky hue cycle speed, bubble count (16 → 86, plus a burst of 24 after a bite), waves, spin. variant: board grid and frame colours, tile palette and pattern, sky mood. Under reduced flash the tiles step every 4 beats and the twinkles are dimmer; positional motion is dropped under reduced motion.
- All set dressing sits at |x| > cols/2 + 0.5 or z < −rows/2 − 0.5 (margins checked for spin, pulse and billboard width). Segments are 0.26–0.30 tall, the dot 0.34, so all are ≤ 0.34.
- `dev/rooms-b.html` / `.js`: harness. `?room=disco|plastic`, V/R/B/C keys, `__rb.sweep()` (both rooms × board, edges and first person × calm and wild), `__rb.run(n, dt)` drives frames by hand.

## Verified
- Both rooms load through `createRoomRenderer` (rooms: court, disco, plastic).
- Sweep: 0 problems at 2322×1378 (landscape 1280×760 @2x) and 750×1624 (portrait 375×812 @2x). Board 256/256, edges 256/256, first person 19/19 (portrait 17 + 2 off-screen, same as court). The calm run checks identity. The wild run (chaos 1, beat 1) checks that no prop or glow covers an empty cell. Repeated 6× at different hue phases.
- No console errors and no GL errors in the board/first-person × reduced-flash+motion / wild+punch+bite / dead cases. At most about 2 ms per frame, GPU synced.

## Defaults chosen
- Could not start my own dev server `ss2-rooms-b`: the app's 5-servers-per-folder limit was used by other sessions. I used the already-running static server on port 4190 (same `snake-shift/` folder, read-only use).
- Plastic's sky hue swings ±1.1 rad (plus ±0.3 per bite at chaos) instead of a full cycle, so the chrome beads never mirror a yellow sky and look like the dot.
- The harness has per-room colour classes. Plastic's snake class allows pinkish chrome (b ≥ 0.6 r).
- In plastic the energy walls are deep and dark (grid × 0.35), because additive walls washed out the bright sky.
- In first person facing south nothing stands ahead, because the board-view wedge rule keeps that area empty. Side props are visible.
- Negative `lineColor` values are used as dark grout on the mirror ball, tiles and dot. The mesh shader adds the line colour, so this works without engine changes.

## Requests
- rooms-a: none needed. Possible additive kit extras for later: a `facetSphere` and a `star` geometry in `geometry.js`. Both currently live inside `disco.js`.
- integrate: `meta.hud` is set for both rooms. Audio ids `disco` and `plastic` match.
