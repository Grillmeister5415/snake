# shell (levels wave 2)

## Works (checked at localhost:4321, synthetic clock `__ss.run`)
- The game runs on the new rules core. `registry.js` loads 2D timelines, room modules (metas and `life()`, no WebGL needed) and the engine; `director.buildUniverses` joins same-id files into one universe and passes only universes with a look (`simUniverses`) to `createSim`. The rules table never depends on WebGL.
- Director (4.1): picks only the look; impact on every shift; held special bites flip the look (castle 2d<->3d, never pov); 12 s first-person fallback calls `audio.setLook('3d')`; lifeLost forces the board look with LIFE LOST / LAST LIFE, strobe and inversion; calm lcd/abyss never invert or strobe (leaving one inverts the new scene); Reduced flash: veil on every shift, carried partly up when shifts are < 3.5 s apart; Reduced motion: no pov.
- fx (4.2): `lives maxLives universe look calm rules waiting`; calm zeroes glitch/split/strobe/invert, caps the beat at 15%.
- main: `waiting` start/respawn resumed by the first direction key (`steerFor`), audio calls in the order of notes/audio.md, `flat.render` call unchanged, `engine.render(id, view, snap, fx)` only for universes with a GL room.
- HUD: five slots on `#lives` with the current look's `life()` (then the other module's, then an accent block), break on loss (halves fall apart + shake), pop on gain, `aria-label` "n of 5 lives"; hint PRESS A DIRECTION (tap/swipe wording) while respawning.
- `?debug&auto&seed=12`: 170 food, all 16 universes on screen; hangar, abyss and mushroom in 2d and 3d (mushroom and hangar also pov); 3 lives gained from mushrooms; respawns. Keys only (`drive`): start, lifeLost, respawn by key, game over at 0, AGAIN. `?nogl`: 131 food, new universes 2D, old rooms via the stand-in, no errors. Reduced flash 9000 frames: 0 inverted, 0 strobe, 0 glitch frames.
- `npm test`: 135 pass (director.test.js rewritten: 16 tests incl. replay across prefs/WebGL/look locks).
- rules: `snap.mushroom.ttl` added (non-enumerable, so the existing deepEqual tests keep passing).

## Defaults chosen
- All new switches (`universe lock look score lives`) work only with `?debug`; `?scene=` is an alias of `?universe=`.
- Universe weight = room meta weight, else 2D meta weight. The four old rooms lost the separate first-person scene weight they had (board 3 + pov 1.35): they now weigh 3.
- Respawn auto-resumes after 700 ms under `?auto`. Settings opened while waiting return to the wait.
- Title gets one line: "3 LIVES · MUSHROOMS GIVE MORE".

## Not done / for the final wave
- The respawned snake does not pulse: that is a renderer job; `fx.waiting === 'respawn'` is there for flat.js and the engine.
- `lane` and `castle` 2D timelines were not on disk during my checks (rooms were: lane 3d/pov, castle 3d seen). Until both exist, `?nogl` drops lane and castle, so a seed differs between WebGL and `?nogl` devices. Their 404s are the console errors.
- Universes without `life()` (the seven old timelines, four old rooms) draw the fallback block until `audit` adds icons.
- Veil numbers (`DIRECTOR.veilFrom 0.55`, `veilHold 0.35`) and weights want a play-through; audio was not listened to.
