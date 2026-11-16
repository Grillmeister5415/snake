# SNAKE//SHIFT

Classic Snake whose rules never change while every dot eaten snaps the visuals to another era:
flat 2D timelines, real WebGL rooms, and now and then a first-person view.
Plain ES modules, no dependencies, no build step, everything generated in code (~150 KB gzipped).

## Run

`npm start` (or `node serve.mjs`), then open <http://localhost:4321/>. Add `--lan` to reach it from a
phone on the same network. Any static server works, but this one sends no-cache headers, so a reload
always shows the latest code. Tests: `npm test` (Node 20+, uses `node --test`).

## Controls

- Arrows or WASD steer (by key position). The first direction starts the run.
- In the first-person view, left and right turn relative to where the snake is heading; up and down do nothing there.
- Swipe on the stage (22 px, chain turns in one drag). Optional on-screen arrows: settings > **Touch buttons**.
- P or Escape pauses (and opens settings), M mutes, Enter or Space confirms.

## The two switches

The title shows a photosensitivity warning on every load. Wild by default: strobes, inversions, violent cuts.

- **Reduced flash**: no strobes or inversions, at most one cut per 3.5 s and one big brightness swing per 5 s (with a soft veil), beat pulse capped at 15%.
- **Reduced motion**: scenery at 15% speed, no camera glides, no first-person view. Defaults to the system setting.

Both are on the title and in settings, and are saved locally.

## Debug URL switches

| Switch | Effect |
|---|---|
| `?debug` | `window.__ss`: sim, director, `run(ms)` synthetic clock, `drive({ swipe, target })`, cut log, quality |
| `?auto` | autopilot plays and restarts on its own |
| `?scene=court-pov&lock` | hold one scene (`lcd arcade acid kombat desktop timewarp wrong court disco plastic bunker`, rooms also `-pov`) |
| `?seed=abc` | fixed run |
| `?nogl` | no WebGL: rooms are drawn in 2D perspective, no first person |
| `?start=150&ramp=1.5&cap=95` | speed: ms per step at start, ms faster per dot, fastest ms |

The server sends no cache headers: after editing, switch between `localhost` and `127.0.0.1` to see fresh code.

## Folder map

```
index.html, style.css      shell: title, HUD, panels, touch pad
src/main.js                loop, wiring, debug switches, quality scaling
src/sim.js rng.js config.js the rules (16x16, one speed curve); never read visuals
src/director.js fx.js      which scene shows when; per-frame effect values; both switches
src/input.js ui.js prefs.js keys, swipes, pad; DOM; saved settings and best score
src/autopilot.js           BFS player for ?auto and tests
src/audio.js beat.js       procedural sound and the beat clock
src/render/flat.js         2D canvas: timelines, glitch, phrase cards, first-person HUD
src/render/registry.js     loads whatever modules exist, with stubs
src/render/timelines/*.js  seven flat eras (lcd, arcade, acid, kombat, desktop, timewarp, wrong)
src/render/gl/             WebGL engine and four rooms (court, disco, plastic, bunker)
src/render/persp.js        Canvas 2D stand-in for the rooms without WebGL
tests/                     sim, director, beat (node --test)
dev/                       harness pages per stream; notes/ build notes per stream
```
