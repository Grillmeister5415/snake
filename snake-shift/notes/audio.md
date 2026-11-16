# audio stream — notes

## Done
- `src/beat.js`: `createBeat({ bpm = 132 })` per 15.3, plus extras `period`, `now()`, `position(t?)`, `timeAt(beat)`, `sample()` → `{ index, phase, pulse }` from one clock read (use this for `fx`). Pulse = `exp(-5.5·phase)`. Source switch rebases (no jump); small backward jitter held, big rewinds rebased; broken source falls back to the frame clock.
- `src/audio.js`: `createAudio(getPrefs)` per 15.3, plus `muted` getter, `debug()`, `TIMELINE_IDS`, `biteMidi()`. Web Audio only. Bite note walks up each timeline's scale (2 octaves, then wraps). Eleven bite voices, nine rhythm kits (`lcd` silent, `wrong` mixes kits per bar and voices per bite). Cut = band-passed noise sweep + sub drop; `swing: true` adds drive, a crushed saw dive and a deeper duck. Death = two falling saws, noise crash, sub. Rhythm: 16th steps scheduled 120 ms ahead from the beat clock; layers by chaos: kick → offbeat hat 0.12 → bass 0.28 → snare 0.45 → 16th hats 0.62 → era extras 0.75 → rolls and random stabs 0.9 (wild only). Master: compressor (−10 dB, 20:1) → soft-clip ceiling 0.97.
- `tests/beat.test.js`: 12 tests, all pass (`node --test tests/beat.test.js`), incl. every audio method without Web Audio.
- `dev/audio.html` on `ss-audio`: every control exercised, zero console errors. Measured 132.0 BPM; clock = audio after unlock; mute → master gain 0 and no new voices; all 10 voiced timelines schedule rhythm, `lcd` schedules none; offline worst-case stack peaks at 0.58 (no clipping). Not listened to.

## Defaults chosen
- `start()` starts the beat (if idle) and the rhythm; `stop()` and `die()` stop both and fade queued notes. Restart begins at beat 0.
- Unknown timeline ids map to `arcade`; a `-pov` suffix is stripped (`court-pov` → `court`).
- `reducedFlash` or `reducedMotion` → rhythm chaos ×0.6, no wild fills, `swing` cut plays as a normal cut, `wrong` bites single-voiced.
- Initial mute comes from `getPrefs().muted` if present; `setMuted` wins after that.
- When muted, nothing is synthesised (master gain also ramps to 0 in 30 ms).
- Chord loop A–A–F–G under bass/extras; root A2.

## Requests for core / integrate
- Call `audio.unlock()` inside the PLAY click handler (it creates the context; must be a user gesture). It returns a Promise that never rejects.
- Call `audio.start()` on the first bite of each run, `audio.stop()` on reset/pause if wanted; `die()` already stops.
- Build `fx.beat` / `fx.beatIndex` from `audio.beat.sample()` (scale `pulse` to ≤15% under reduced flash). Do not call `audio.beat.setTimeSource()`; it is wired to the latency-corrected audio clock after unlock and the frame clock before.
- Order on a bite: `setChaos(chaos)`, `setTimeline(newId)`, `cut({ swing })`, `eat(score)` — the bite voice uses the new timeline.
- `getPrefs()` should return `{ reducedFlash, reducedMotion, muted }`.
