# flat-b (wave 2) — Pixel Kombat 1993 and Desktop Error 1995

## Done
- `src/render/timelines/desktop.js`: meta/scenery/board per §15.3 (luma 0.45, year 1995). The board is the client area of a bevelled SNAKE.EXE window. The lethal edge is a red and white marching-ants rectangle. Each body cell is a small inset window with a title bar. The head is a full-cell window with a close box, a white client area with a facing chevron, and a drag cursor. The dot is a yellow folder icon with a clock. A bite plays the 90s window-zoom outlines. Scenery: a teal dithered desktop with generic icons and a taskbar ("RUN", tasks, a clock starting at 04:37 that races with chaos, and a red LED score counter). Error dialogs pile up outside the window rect: 2 to 26 of them, rising with chaos and variant. The headline "Time is not responding." is always on top and fully on screen. Some dialogs leave the stuck-redraw smear trail. Also: wait cursors and hourglasses, beat brightening, horizontal tear slices, and a blue "TIME FAULT" screen on `fx.punch`.
- `src/render/timelines/kombat.js`: meta/scenery/board (luma 0.20, year 1993). The scenery is drawn into a low-res buffer (scale P = 2–4) and upscaled nearest-neighbour: banded sky with a moon, far skyline, brick wall with abstract graffiti, a shutter and pipes, flickering neon signs (one shows "1993") that step colour on the beat under chaos, a two-row bobbing crowd that raises its arms on a bite, a wet street with neon reflections, rain that grows with chaos, lightning on the beat when chaos > 0.5, and parallax camera sway. On top of that come the screen shake and a white or red hit flash from `punch`, scanlines, a fight HUD ("SNAKE" vs "TIME" bars, with the score in the round box), and pop words on a bite.
  Two original fighters are built from rotated blocks (no pixel maps):
  - A: lanky, teal mohawk, orange bomber jacket, chrome forearm, purple pants.
  - B: stocky, yellow rain hood and coat, cyan goggles, big blue mitts.
  They idle on the beat and blend into a pose (upper, kick, jab or flex, chosen by variant) for about 650 ms after each bite, with fist sparks. They stand beside the board when it leaves at least 3 cells of room, otherwise in the band above it (portrait). They never stand on the board.
  The board is a steel frame with inward spikes as the lethal edge and a dark checker mat. The snake is bevelled green blocks joined by bridges. The head is a full block with eyes looking ahead, a mouth with fangs and a tongue flick on the beat. The dot is a red orb with a beat ring. A bite draws a jagged hit spark and debris. Dead state: grey-green blocks and X eyes, no flashing.
- Extra exports for reuse (e.g. by timewarp or wrong): both modules export `drawSnake(ctx, L, snap, fx)`. `desktop` also exports `windowRect(L)`; `kombat` also exports `stage(L)`.
- `dev/flat-b.html` and `.js`: copy of the flat-a harness. It adds dynamic, cache-busted imports, `__flatB.drive(n, dt)` for manual frames, and `__flatB.still(id, [w, h], fxOver, snapOver)` for still frames.

## Verified (in the browser)
- Cell check: 8/8 pass, for desktop and kombat × 1280×720 and 390×844 × alive and dead, also with a 24-cell snake.
- Fuzz: 120 frames across 5 sizes (320×568 to 1920×1080), dead snake, no food, rf/rm, punch and bites. No exceptions, no transform or alpha leaks.
- Cost: scenery 0.4–2 ms, board ≤ 0.1 ms per frame (harness, dpr 2).
- Looked at landscape and portrait stills for both, with a bite, chaos 0.9 and punch.

## Defaults chosen (owner may override)
- Wording: dialog texts, pop words (BITE! / COMBO xN / TIME HIT! / PERFECT! / SNAKE WINS / CHAIN BITE), HUD labels SNAKE vs TIME, taskbar "RUN". No real OS names or logos, and no fighter, stage or move names from existing games.
- Reduced flash: no hit flash, blue fault screen or lightning (these come from punch and beat, which core already scales). Desktop tear slices are off under reduced flash or reduced motion. The hit spark drops to 30% alpha.

## Not done / notes
- Dev server `ss2-flat-b` could not start: the app caps dev servers at 5 per folder, and other chats held all 5. I used the already-running static server on port 4175 (`ss-flat-a`, same `snake-shift/` folder, read only) for all browser checks.
- Kombat draws its own fight HUD across the top of the screen (about 8–45 px). Request to `integrate`: if the DOM HUD sits over the same strip, hide its top row for kombat, or tell me to add a `meta.ownHud` flag.
- The desktop tear effect reads back `ctx.canvas` with `drawImage`. That is fine for same-origin canvases.
