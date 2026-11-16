# SNAKE//SHIFT
## EAT THE DOT. BREAK TIME.

### Master creative and game-building prompt

You are an experimental game designer, creative coder, visual artist, sound designer, and expert browser-game developer.

Build a complete, lightweight, playable browser game called **SNAKE//SHIFT**. It begins with the unmistakable simplicity of classic Nokia Snake. Every time the snake eats a dot, the visual world ruptures and jumps to a different era, art style, or reality.

The game should feel like a familiar arcade toy trapped inside an unstable time machine: Berlin warehouse techno, 1960s psychedelia, 1970s disco, 1980s vector arcades, 1990s pixel fighting-game spectacle, Y2K digital optimism, impossible 3D rooms, and timeline collisions. Make it bright, strange, funny, risky, and visually explosive.

**The world may change completely. The game rules may not.**

---

## 1. Non-negotiable gameplay contract

The classic Snake simulation stays exactly the same through every visual shift. Treat this as a hard technical boundary, not a theme suggestion.

- Use one flat rectangular logical grid for the entire run. Keep its dimensions, cell coordinates, and orientation unchanged.
- The snake moves continuously, one grid cell at a time, in exactly four cardinal directions: up, down, left, and right.
- Support arrow keys and WASD. On touch screens, map swipes to those same four directions.
- Reject an immediate 180-degree reversal, as in familiar Snake.
- The snake grows by one segment when it eats one food dot. Increase the score by one and spawn the next dot in an unoccupied cell.
- Self-collision and boundary collision end the run. The outer edges are lethal; the board never wraps.
- Keep the same speed progression for every timeline. If a reference version is not specified, choose one familiar, modest classic Snake speed curve at the start and apply it consistently for the entire run.
- Preserve the exact snake cells, body length, direction, score, food-spawn rules, tick timing, and collision rules when moving between visuals.
- Do not add vertical movement, diagonal controls, special abilities, obstacles, power-ups, enemies, lives, shields, wall crawling, board rotation, wrapping, new board shapes, or alternate collision rules.
- A timeline shift must not speed up, slow down, pause, teleport, protect, or otherwise affect the simulation. The grid continues ticking normally during visual transitions.
- Game over remains game over on the same collision. Restart starts a fresh classic run.

If there is ever tension between a visual effect and gameplay clarity or these invariants, preserve the gameplay and simplify the effect.

---

## 2. Make the 3D room a real visual mode

Sometimes the snake must appear to enter a genuine 3D room. Make this a major visual event, not just a flat background or a color filter.

In a 3D-room timeline:

- Render an actual 3D environment with depth, perspective, architectural walls, lighting, and large objects.
- Place the unchanged square Snake grid as a clearly visible horizontal floor or floating platform inside that room.
- Render the snake itself as a tactile, segmented 3D object occupying the same logical cells as the 2D snake. It can look like glowing glass, chrome, arcade blocks, or a luminous creature.
- Render the food at the same logical cell as the current food dot.
- Let the player feel that the snake has entered and is moving through the room, while it still travels only across the flat grid plane.
- Keep the lattice visible enough that the next move, food position, snake body, and lethal edges remain easy to read.
- Add depth through room architecture, shadows, reflections, scale, parallax, and lighting. Set dressing must never become collision geometry.
- Keep camera orientation stable while playing. Do not rotate the board, change which direction a key means, or use camera-relative controls. A short cinematic camera move may accompany a transition, but it must settle before it can confuse steering.
- Make abrupt transitions between the room and flat 2D looks: a flat LCD board can snap into the room, and a 3D snake can snap back into a tiny pixel grid. Preserve the exact game state in both directions.

This is a visual dimensional shift, not a new topology or a second control scheme. The snake can be physically rendered in a 3D scene while its movement and collisions remain on the original 2D grid.

### Occasional first-person POV: become the snake

Occasionally move the camera into the snake's head and let the player experience the world from inside the creature. Make this a rare, memorable view shift, triggered by selected food events or temporal anomalies. Most play stays in a clear external board view.

- Place the camera at the snake's head, looking forward along its current heading. Do not show a separate hero snake in front of the camera.
- Let the player see the next few grid cells rushing toward them. Keep the food dot clearly visible ahead and show the snake's own luminous segments trailing at the lower edges of the frame, in reflections, or as a segmented tunnel behind.
- In 3D rooms, make the architecture tower over the player. In a tunnel, make the grid feel like a path through space. The grid remains a flat plane with the same rectangular boundaries.
- Hold the POV long enough to feel immersive, usually until the next food event or a short planned passage, then cut to another view or timeline.
- Keep the exact same arrow/WASD and swipe controls, turn queue, no-reversal rule, grid tick, speed, growth, food, and collisions. Do not add gaze, tilt, or camera-steering controls.
- Camera tracking is visual only. Turns still map to the same four logical grid directions. Keep a small stable direction cue and enough grid context to understand the next move.
- Do not add camera roll, heavy shake, acceleration, or a zoom pulse that makes the player lose track of a cell. Reduced-motion settings must also reduce POV camera movement.

Use POV as a deliberate punctuation mark: the familiar board view is the anchor, then the player suddenly becomes the snake for a brief run through the room.

---

## 3. The central experience: time is broken

Open in a stripped-back Nokia-era LCD world: monochrome, pixelated, quiet, and immediately recognizable. The player starts moving. On the first food dot, make reality tear open.

Every dot triggers a new visual state. Sometimes it jumps backward in time; sometimes it leaps forward; sometimes two eras collide; sometimes the game returns with absurd calm to the original Nokia look. Avoid repeating the same world twice in a row when possible. Use weighted randomness so each run feels surprising without requiring a level-select menu.

The first ten seconds must be understandable without a tutorial. Players should know how to steer, eat, grow, and survive before the visual chaos escalates.

---

## 4. Art direction: beautiful chaos, controlled readability

Build the visual identity around brutal contrasts:

- Minimal LCD calm against dense rave maximalism.
- Flat pixel art against real 3D architecture.
- Hand-printed 1960s patterns against glossy Y2K chrome.
- Warm disco color against a stark red Berlin bunker.
- Cute segmented Snake against vast, intimidating rooms.
- A clean grid against visual fragments from several clashing timelines.

Use acid color, kinetic composition, oversized shapes, optical patterns, dramatic typography, visual distortion, and abrupt hard cuts. Do not make every scene blend elegantly into the next. Sometimes the scene should vanish and return in a completely different visual language.

Push intensity through saturated palettes, dense but layered imagery, sudden scene changes, perspective, moving light sweeps, parallax, color clashes, texture, and scale. Avoid rapid full-screen strobing or repeated high-contrast flashes. Make a cut feel shocking through composition and contrast, then let the new scene hold long enough to read. Provide a reduced-flash and reduced-motion option.

Use the accompanying reference images as visual direction, not literal assets or layouts. Reinterpret them into an original game identity.

### Creative reference: Tennis by Six Finger Punch

Study the user's reference at https://tennis.sixfingerpunch.com/. Its useful visual lesson is the scale jump: a stripped-back black-and-white Pong screen can open into a monumental WebGL synthwave arena. Borrow the feeling of a vast vanishing-point court, receding checkerboard floor, giant horizon sun, deep violet sky, bright wireframe frame, hot pink and cyan light, and oversized score typography around a tiny central game. Translate those ideas into Snake's own 3D night court and time-warp rooms. Do not copy the app's interface, artwork, or game elements. The Snake board remains its flat grid plane; only the rendered room and snake material become fully 3D.

---

## 5. Timeline library

Implement a strong selection of distinct timelines. Each should change the rendering style, palette, background, snake material, food treatment, typography, and sound character, while preserving the same board and rules.

### 00 — Nokia Ghost, 1999

A palm-sized monochrome LCD memory: muted green-gray pixels, spare border, tiny pixel snake, one dot, mechanical button-like sounds, almost no decoration. This is the opening state. Let it return unexpectedly after a maximalist sequence for a funny, unnerving reset.

### 01 — Acid Paradise, 1968

A living psychedelic poster: oversized flowers, warped checkerboards, concentric rings, hand-printed texture, imperfect ink registration, burnt orange, hot pink, violet, cream, lemon, and electric turquoise. The snake can look like an illustrated segmented worm. Keep optical patterns around or behind the board, never over the snake or food.

### 02 — Disco Inferno, 1977

A ridiculous, glamorous dance-floor universe: amber and violet gradients, mirror-ball glints, stars, glitter, geometric light, vintage disco lettering, and a bright floor plane. The snake becomes a glittering disco chain. Make the board feel like a stage in an enormous club.

### 03 — Electric Arcade, 1986

A dark vector arcade void with fluorescent cyan, magenta, yellow, and red lines; CRT texture; pixel bursts; geometric stars; cabinet-like framing; and loud arcade typography. The snake is a sharply defined chunky sprite.

### 04 — Pixel Kombat, 1993

A fictional 16-bit fighting-game arena with a graffiti-covered street, industrial rooftops, neon signs, distant crowds, and dramatic parallax. Add two original background fighters who pose, celebrate, or react when food is eaten. They are atmosphere only: the Snake is the sole playable character. Use original designs and do not copy recognizable characters, names, stages, or assets from existing games.

### 05 — Plastic Internet, 2001

An obsolete vision of the future: chrome spheres, translucent aqua plastic, metallic gradients, glossy buttons, bubbly shapes, primitive 3D objects, and bright digital optimism. The snake can look like a reflective segmented tube. Fake interface fragments may float far behind the board, but must not cover play.

### 06 — Berlin Bunker, 2026, 04:37 AM

An underground industrial techno room: brutalist concrete, wet black floors, deep red light, smoke, metal, speaker stacks, hard laser lines, and stark white-red typography. The board is a luminous plane on the floor. Use an original synthetic kick, distorted bass pulse, metallic percussion, and industrial echoes. The attitude should feel raw and underground, not like generic cyberpunk.

### 07 — Reality.exe, 2088

A genuine impossible 3D room or floating architectural chamber. Use translucent walls, giant geometric sculptures, glowing grids, impossible scale, electric magenta and cyan, and a strong sense of depth. Create a signature night-court variation with a huge horizon sun, violet star field, receding checkerboard floor, neon wireframe frame, and monumental vanishing point around the much smaller Snake board. This is the signature moment where the snake is visibly rendered as a 3D object inside a 3D environment, traveling on its unchanged gridded floor plane. Occasionally shift into a head-mounted first-person view through the same room, with food ahead and the body trailing in the periphery. Also use this world to stage clear 3D-to-2D, 2D-to-3D, and board-view-to-POV snap transitions.

### 08 — Time Warp / Optical Panic

A transit state between eras: concentric rings, folded perspective, warped checkerboards, stretched grid motifs, color inversions, pixel fragments, and the feeling of being pulled through time. It can be a brief transition or a complete held timeline. Keep the playable board and snake easy to locate.

### 09 — The Wrong Universe

A deliberately broken hybrid assembled from elements of other timelines: a 1960s flower in a Berlin bunker, a pixel fighter in a chrome room, disco lights on an LCD screen, hand-drawn shapes over a vector grid. It should feel as if the time machine has forgotten the decade. The grid remains whole and legible.

---

## 6. Timeline collisions, nested realities, and corruption

Do not keep all eras isolated. Rarely combine two or more visual identities into a temporary hybrid called a **Temporal Collision**. Examples:

- Disco × Berlin: a mirror-ball dance floor appears inside the concrete bunker.
- 1968 × 2088: flat flowers grow across the surfaces of the 3D room.
- Pixel Kombat × Plastic Internet: a pixel fighter appears reflected in a chrome sphere.
- Nokia Ghost × Reality.exe: a tiny LCD screen floats inside the immense room, then becomes the room's floor.

Use **nested realities** as a visual joke or transition: the board appears on a screen inside the room, then the camera reveals that screen inside another world. There is still only one active board and one snake.

Use **timeline corruption** to mix palettes, rendering styles, props, typography, and background fragments. Corruption may distort the scenery, duplicate decorative silhouettes, or split the image around the edges. It must never change the actual snake coordinates, food location, collision field, controls, grid, or movement rate.

Occasionally make a **Total Reset**: after a spectacular 3D scene or temporal collision, snap back to the calm Nokia Ghost look without explanation. The next food dot can break reality again.

---

## 7. Food-triggered visual transitions

Every food dot causes the current scene to shift. Keep transitions short and varied; most should be an abrupt visual cut rather than a long animation.

Possible transition gestures:

- The board folds into a cube and opens as a room, while its cells remain the same.
- A screen-wide poster tear reveals another era.
- The food dot expands into a tunnel and the next world appears beyond it.
- Pixel blocks burst outward and settle into a 3D scene.
- Chrome reflections swallow the image, then resolve into a flat LCD screen.
- A timeline collision appears as two art styles occupy opposite halves before one wins.
- A single oversized phrase interrupts the scene for a moment: “TIME BREAK!”, “REALITY ERROR”, “WRONG DECADE”, “WELCOME TO 2088”, “NO EXIT”, or “INSERT COIN”.

Use strong contrast and occasional silence or sonic impact. Do not rely on rapid full-screen flashing. Keep the transition on top of, or around, the continuing grid simulation; never hide a lethal move or make the player miss an input.

---

## 8. The snake, food, and board

The snake should visually belong to each timeline: LCD blocks, illustrated worm, disco chain, vector line, 16-bit sprite, chrome tube, red industrial light, or modeled 3D segments.

The rendered snake must always map cell-for-cell to the single logical snake. Its head direction, body order, length, and location must remain obvious. Decorations, glow, shadows, and motion trails must not create ambiguous extra heads or bodies.

The food dot should remain conspicuous and easy to distinguish from scenery. It may become a flower, star, arcade energy orb, disco light, chrome bead, or portal seed, but it occupies exactly one ordinary grid cell and triggers the same one-segment growth and score increment.

Never put decorative objects on a cell in a way that hides the snake, food, or a boundary. No added hazards or collectibles.

---

## 9. Sound

Generate compact sound procedurally with the Web Audio API. Do not require large audio files.

- Play a satisfying electronic note on food.
- Give each timeline a distinct sonic color: LCD clicks, psychedelic blips, disco percussion, arcade tones, glossy digital chimes, industrial bass, or airy 3D-room resonance.
- Let the transition have a short sweep, impact, pitch bend, or filtered-noise burst.
- Build a minimal, optional rhythm that responds to the score without obscuring the game.
- Start audio only after user interaction and provide a visible mute control.
- Respect reduced-motion and reduced-sensory preferences; visual intensity must not depend on loudness or rapid flashing.

---

## 10. Lightweight browser implementation

Build for current desktop and mobile browsers. Prioritize small code, fast startup, and smooth play.

- Prefer vanilla JavaScript or TypeScript with a small modular structure.
- Use Canvas 2D for flat pixel, poster, and vector timelines.
- Use a small custom WebGL renderer for the real 3D room if available; avoid a large framework or remote asset dependency.
- Keep a Canvas 2D fallback so the game remains playable if WebGL is unavailable.
- Generate geometry, patterns, lighting tricks, particles, typography, and sound procedurally where practical.
- Do not download large images, fonts, audio, or models at runtime. Reference images are for development direction, not game payload.
- Separate the fixed-tick Snake simulation from visual rendering. Rendering effects may never mutate game state.
- Adapt resolution and effect density for smaller or slower devices.
- Aim for a tiny initial compressed bundle, ideally under 250 KB before optional assets, without compromising the actual game.
- A PWA is optional only if it adds little code and complexity.

---

## 11. Interface and controls

Keep the interface sparse and expressive.

Opening screen:

**SNAKE//SHIFT**  
**EAT THE DOT. BREAK TIME.**  
**[ PLAY ]**

During play, show only the score, current timeline name/year, pause, mute, and optional reduced-flash/reduced-motion controls. Keep these readable in every art style and away from active grid cells.

Desktop: arrows and WASD.  
Mobile: clear swipe controls; optional directional buttons with generous touch targets. Prevent page scrolling while the player is steering.

Game over:

**REALITY COLLAPSED**  
Score and locally stored best score  
**[ AGAIN? ]**

Make restart immediate. Do not add accounts, tutorials, online ranking, level select, or other systems that distract from a one-button-to-understand arcade loop.

---

## 12. Accessibility and visual intensity

Make the art loud, bright, dense, and surprising without using hazardous flicker.

- Avoid repeated rapid full-screen light-dark alternation and strobing.
- Use hard scene cuts, sustained saturated colors, moving shapes, perspective, and scale to create intensity.
- Include reduced-flash and reduced-motion settings, plus a mute toggle.
- Keep grid lines, head, body, food, and lethal edges distinguishable in all themes.
- Respect the system's reduced-motion preference where available.
- Do not make essential gameplay depend on color alone.

The game should feel extreme because the art direction is fearless, not because the display flickers continuously.

---

## 13. Build and delivery expectations

Build the actual playable game, not just a mockup or concept document.

Implement the classic Snake simulation first, then layer the timeline renderer on top of the unchanged state. Include at least one convincing 2D timeline, one true 3D room in which the snake itself is a 3D object on the flat grid floor, and reliable shifts between 2D and 3D. Add the remaining timelines, collisions, procedural sound, mobile support, reduced-flash controls, and polish.

Before calling the game complete, verify that:

1. The same four-direction controls work in every visual state.
2. Every food dot adds exactly one segment and one point.
3. Walls and the snake's body collide exactly as they did in the opening state.
4. No timeline wraps, rotates, or replaces the flat logical grid.
5. 2D-to-3D and 3D-to-2D shifts preserve every snake cell, direction, score, speed, and food rule.
6. Timeline effects never obscure an imminent move or change the simulation tick.
7. The game remains playable without sound or WebGL.

Make strong creative decisions without asking about every detail. Make it weird, vivid, high-energy, and unmistakably Snake.

**The visual universe can go completely off the rails. The gameplay stays beautifully familiar.**