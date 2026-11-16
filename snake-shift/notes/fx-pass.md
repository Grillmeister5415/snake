# fx-pass stream: notes (wave 3)

## Done
- New `src/render/gl/post.js` (3.4 KB gz). The engine (`engine.js`) uses it inside `render()`; the public interface is unchanged. One full-screen shader adds: radial red/green/blue splitting that grows toward the screen edges, a glow on bright areas (8 taps, bright-pass), horizontal glitch slices (coarse displaced bands, blocky resampling, hairline tears, channel swaps), a chromatic kick on a bite, and faint scanlines that come in with chaos.
- Strengths: `fx.split` (CSS px) and `fx.glitch` when present, else the same formulas from `chaos`/`punch`/`beat`; kick = `punch·(4+10·chaos)` px; glow = `chaos·(0.5+0.5·beat)+0.4·punch`. Slices are bursts: band odds are `glitch²·0.55`. Slice pattern steps with `fx.time` (16/s, slowed under reduced motion).
- Board mask is analytic, not an alpha channel: a camera ray per sample is tested against the board volume (lethal edge + 0.62 cells, height 0.46, so frame band, curb, snake ≤0.34 and dot ≤0.40 are inside). Inside it, effects are exactly zero. Samples that land on the board fall back to the undisplaced pixel, so no ghost snake appears in the scenery. This works in both views.
- Two modes (`opts.postMode`, or `renderer.debug.post.mode`):
  - `buffer` (default): the room draws into an offscreen RGBA buffer + depth, the same size as the backing store. The pass then draws it to the screen.
  - `copy`: the room draws to the antialiased screen, which is copied to an RGB texture. The shader discards board pixels, so the board stays bit-identical to the direct render, but it costs about 2.5× more (the mid-frame MSAA resolve).
- Skipped entirely, with no buffer and no cost, under `fx.reducedFlash` or when every strength is zero (no bite yet). A failed program, a texture larger than `MAX_TEXTURE_SIZE`, a texture out of memory, an incomplete framebuffer or a lost context all mean direct rendering, silently. A failed size is not retried until the size changes.
- Harness `dev/fx-pass.html|js`: `__fp.check()`, `__fp.cost(n, mode)`, `__fp.paths()`, `__fp.show(room, view, chaos, post, fxOverrides)`. Non-contract `debug.post` {enabled, mode, zero, active, params} and `debug.postSize()`.

## Verified (served from 4173/4175/4177/4190; my own `ss-gl` could not start, 5-server cap)
- `__fp.check()`: 4 rooms × board/first person × 1280×760 and 375×812 @2x × chaos 0 and 1, with a bite 120 ms old (punch 0.36, beat 0.8, glitch/split as in fx.js). 32/32 ok. In both modes the effects change every cell by exactly 0: buffer mode against a zero-strength buffer pass, copy mode against direct. 256 cells in the board view, 72/40 in first person.
- Wildness, mean |Δ| per channel over the frame: chaos 0 + bite 1–10, chaos 1 + bite 7–38 (court and disco about 35, bunker 22, plastic 18).
- Existing checks with the pass active: `__ra.check()` 0 bad in every case; `__rb.sweep()` 0 problems at 2322×1378 and 750×1624; `__gl.check()` 256/256/19, 0 mismatches; null path still null.
- `__fp.paths()`: calm skips the pass, reduced flash skips it, buffer = 2322×1378 = backing store, the no-buffer fallback draws direct with no GL error, context loss is a silent no-op. Console clean everywhere. `node --test` 50/50.
- Real game, read-only, `?scene=<room>[-pov]&lock&auto&debug` + `__ss.run(12000)`, all 8 scenes (board at 1280×760, first person at 375×812): playing, pass active, no errors.
- Cost at chaos 1 with a bite (render + GPU sync, this Mac):

  | size | rooms, pass off | buffer mode | copy mode |
  |---|---|---|---|
  | 2322×1378 | 2.8–4.5 ms | +0.7–1.05 ms | +2.0–2.3 ms |
  | 750×1624 | 1.5–2.4 ms | +0.15–0.5 ms | +0.8–1.0 ms |

  The shader alone is about 0.25 ms. The copy is the rest of copy mode's cost.

## Defaults chosen / open
- Buffer mode is the default, as the brief describes, because it is cheaper. Its one cost: while the pass is on, the room has no MSAA (a WebGL 1 buffer cannot be multisampled). Board cells classify exactly as before, but edge pixels lose antialiasing: the rooms-a "edges wild" board Δ is 7–21 in buffer mode and 0 in copy mode, as is the gem-dot centre. If that shows on dpr-1 screens, pass `postMode: 'copy'` in `main.js` (finish/core). No other change is needed.
- First person: the mask covers most of the lower screen, so effects show above the board (walls above 0.46, sky, props). This is intended.
- Not done: echo frames, transitions between scenery buffers, and feeding flat timelines through the same pass (rest of 6.6).
