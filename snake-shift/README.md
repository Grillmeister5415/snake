# SNAKE//SHIFT

Snake where every dot eaten snaps the game to another universe: sixteen of them, shown as flat 2D
boards, real WebGL rooms, and now and then a first-person view. The game picks the universe and its
look at random; the player never chooses. Three rare special universes change the rules and are held
for four to six bites, cutting between their 2D and 3D look on each bite; about one shift in ten
goes to one of them (`SPECIAL.weight` in `src/rules-config.js`).
Plain ES modules, no dependencies, no build step, everything generated in code (~285 KB gzipped,
~225 KB with brotli; 943 KB raw).

## Run

`npm start` (or `node serve.mjs`), then open <http://localhost:4321/>. Add `--lan` to reach it from a
phone on the same network. Any static server works, but this one sends no-cache headers, so a reload
always shows the latest code. Tests: `npm test` (Node 20+, uses `node --test`).

## Controls

- Arrows or WASD steer (by key position). The first direction starts the run, and after a lost life the first direction resumes it.
- In the first-person view, left and right turn relative to where the snake is heading; up and down do nothing there.
- Swipe on the stage (22 px, chain turns in one drag). Optional on-screen arrows: settings > **Touch buttons**.
- P or Escape pauses (and opens settings), M mutes, Enter or Space confirms.

## Lives

Every run starts with 3 lives, at most 5, shown as five slots beside the score in the current
universe's own icon. A collision costs one: the snake respawns short at a safe spot in board view
with score and universe intact, and breathes gently while it waits for a direction. Zero lives ends the run. In Mushroom Land
a mushroom (beside the dot, gone after 80 steps) is food and adds a life.

## Music

One procedural track that never stops (Web Audio, no files). The snake's speed sets the tempo (118 to
138 BPM) and how full the arrangement is; every universe plays one shared motif in its own voice from
its first bar. A tight spot on the board tightens the music (faster hats, thinner melody) and lets go
when it clears; the tempo never jumps. A bite in the same universe is a small accent, a change swaps
the kit on the same bar position, and a few brightness swings or milestones get a vacuum and an impact.
3310 Ghost is only clicks, Abyssal Cathedral plays half-time. A lost life tape-stops and muffles the mix
until you move; the last life adds a quiet heartbeat. *Calmer sound* keeps the music and drops the
tension effects. Mute with M; nothing sounds before the first click. Details: `notes/audio.md`;
test bench `dev/audio.html`, before and after `dev/audio-compare.html`.

## Universes

| id | Look | Rules |
|---|---|---|
| `lcd` (opening), `arcade`, `acid`, `kombat`, `desktop`, `timewarp`, `wrong` | 2D | box |
| `court`, `bunker`, `disco`, `plastic` | room, first person | box |
| `hangar`, `abyss` | 2D, room, first person | box |
| `mushroom` | 2D, room, first person | box + mushrooms, held |
| `lane` | 2D, room, first person | endless lane (no end wall), held |
| `castle` | 2D, room | cube (six faces, seams connect), held |

A universe is `src/render/timelines/<id>.js` (2D) and/or `src/render/gl/rooms/<id>.js` (room); whatever
loads is used. 3310 Ghost and Abyssal Cathedral are calm: no inversion, strobe or glitch while they show.

## The switches

The title shows a photosensitivity warning on every load. Wild by default: strobes, inversions, violent cuts.

- **Reduced flash**: no strobes or inversions; every shift still happens on time (it can change the rules) but as a 450 ms veiled fade, and when shifts come less than 3.5 s apart the veil stays partly up between them. Beat pulse capped at 15%.
- **Reduced motion**: scenery at 15% speed, no camera glides, no first-person view. Defaults to the system setting.
- **Calmer sound**: no vacuum transitions, a third of the music's tension response, no anticipation noise or nerve voice on the last life. The music stays. Either switch above also gives the calmer sound.

All three are on the title and in settings, and are saved locally.

## Debug URL switches

| Switch | Effect |
|---|---|
| `?debug` | `window.__ss`: sim, director, `run(ms)` synthetic clock, `drive({ swipe, target })`, `lock(id)`, `look(l)`, `seenLooks()`, cut and event logs |
| `?auto` | autopilot plays, resumes after a lost life and restarts on its own |
| `?debug&universe=hangar&lock` | hold one universe (every bite then flips its look); `?scene=` still works as an alias |
| `?debug&look=2d\|3d\|pov` | hold a look wherever the universe has it |
| `?debug&score=20` | start runs at that food total |
| `?debug&lives=5` | starting lives (1 to 5) |
| `?seed=abc` | fixed run |
| `?nogl` | no WebGL: the four built rooms are drawn in 2D perspective, new universes in 2D, no first person |
| `?start=150&ramp=1.5&cap=95` | speed: ms per step at start, ms faster per dot, fastest ms |

The universe, look, score and lives switches work only together with `?debug`, so a player cannot use them to choose.
`dev/finish.js` holds the whole-game browser checks: load `?debug&auto`, then
`const F = await import('/dev/finish.js'); F.hook(); F.sweep()` (also `flow`, `frames`, `space`, `crash`, `offBoard`, `audioOrder`).

## Folder map

```
index.html, style.css      shell: title, HUD, panels, touch pad
src/main.js                loop, wiring, debug switches, quality scaling
src/sim.js space.js flow.js rules-config.js
                           the rules: lives, items, box/lane/cube spaces, the universe sequence
src/config.js rng.js       speed curve, presentation constants, URL switches; seeded generator
src/director.js fx.js      universe table, which look shows and how hard a cut hits; per-frame effects
src/input.js ui.js prefs.js keys, swipes, pad; DOM; saved settings and best score
src/autopilot.js           BFS player for ?auto and tests
src/audio.js beat.js       procedural sound and the beat clock
src/arrange.js pressure.js music decisions (pace, world, motif, harmony, bites); board pressure for the music
src/render/flat.js         2D canvas: timelines, glitch, phrase cards, first-person HUD
src/render/registry.js     loads whatever modules exist, with stubs
src/render/timelines/*.js  2D looks (and life() icons)
src/render/gl/             WebGL engine and the rooms (3D looks, life() icons)
src/render/persp.js        Canvas 2D stand-in for the rooms without WebGL
tests/                     rules, lives, spaces, flow, director, music, arrange, pressure, beat, replay (node --test)
dev/                       harness pages per stream; notes/ build notes per stream
```
