# audio — notes (adaptive music rework, SOUND_PLAN.md)

All sound is live Web Audio, no files. This replaces the score ladder of LEVELS_PLAN 7. `notes/sound-report.md` describes the old state.

**Listening:** the owner played it on 17 November 2026, on the Mac and on a phone, and approved it. Before that nobody had listened: every level, timbre and balance below was set from offline renders and scheduling traces, and none of the weak spots at the end was tuned by ear.

## Behaviour

- Three signals. **Pace** (0..1, from the step interval inside the configured speed range) sets tempo and level. **Danger** (0..1, from the board) speaks through a few roles per world. **World** (the universe) picks kit, mode, motif voice and level cap. Anticipation (beats since the last bite) is a small, bounded fourth input.
- Tempo follows pace only: 118 → 138 BPM, smoothed over about 2 s. Danger never moves the tempo.
- Level 0 is already a complete arrangement in every world: pulse, anchor, gesture. Level 1 adds the backbeat and the full bass, level 2 sixteenths and second percussion, level 3 opens filters, deepens the pump, adds fills at phrase ends and an eight-bar section cycle (full, stripped, full, percussion forward). Music level rises at most 1.5 dB with pace.
- One motif in every world: hits on sixteenths `0 3 6 | 8 11 14`, contour in mode steps `0 2 1 | 4 2 0` (degrees 1 3 2 | 5 3 1). Each world plays it in its own voice and mode; some keep only the rhythm (Bunker, Kombat) or stretch it (Reality.exe half speed, Abyss half-time, Castle in three, Time Warp backwards).
- Bites: one `bite()` per food event. The bite voice plays at once. `classifyBite()` picks the treatment:

| Kind | When | Sound |
|---|---|---|
| held | `held`, or same universe without reset | bite voice, tonal bus dips to 0.72 for 35 ms; a look flip adds a soft whoosh; nothing cancelled |
| change | universe changed, not one of the rows below | bite voice, short thump (sine 140→55 Hz, 110 ms), kit swap on the next grid step, old queued notes cancelled, long tails released in about 70 ms, then the motif head in the new voice from the next eighth (the "answer") |
| major | a change with swing, a first-person arrival or score on a multiple of 10; 16 beats since the last major and 2 since the last bite; calmer sound off | a sixteenth of silence (level 3: a chopped stutter of ¾ sixteenth), then sub and crash, then the answer |
| lcd | `to` is lcd | music and wet returns cut within 40 ms; dry LCD bite; clicks at the same bar position |
| abyss | `to` is abyss | soft bloom (sub 0.35, no crash), half-time from the next grid step, earlier tails ring on |

- Bites less than 2 beats apart: lighter each time (×0.85 per bite, floor 0.55), short tails, no thump, no answer. Never a major.
- A life gained on the same bite: the figure plays first, the tonal bus dips about 4 dB under it, the bite voice is lighter and short.
- Anticipation: zero for 4 beats after a bite, up to 1 by beat 12, down to 0.35 by beat 16, then a swell to at most 0.6 every 8 beats. It shortens hats, opens the gesture filter, adds a noise lift in the last beat of a bar (about 20 dB under the mix) and drops the phrase-end kick when ≥ 0.6, so the next downbeat comes accented. LCD none, Abyss half. The mix low-pass never closes.
- Danger roles (each world maps them, see the world table): pulse subdivision (sixteenths), thinning (no ornaments when tense, no gesture when critical), tone (one filter on the anchor or the gesture), rub (critical: a flat-second or tritone ghost on steps 2 and 10 that resolves to the root when danger lets go). Net level change at most +0.75 dB.
- Last life: a heartbeat once a bar on step 14 (between kicks, body at 160–180 Hz, about 13 dB under the kick), and the "nerve": two sines on the fifth above the bar root (E5 over A), 2.3 Hz apart so they beat, one bar in two, about 16 LU under the mix. No global detune.
- Respawn wait: muffled (420 Hz), quiet (×0.38), wet returns muffled too, only pulse, bass and heartbeat. First move: a thud, filters open in 50 ms, the first kick back is accented.
- Calmer sound (`reducedAudio`, or Reduced flash, or Reduced motion): no majors, danger at a third of its depth (it never reaches tense), no lift, no nerve, no fills, a softer heartbeat. Music and bites stay.

## Interface and call order

`createAudio(getPrefs, { context, seed, trace, mute })`. Every method is safe muted, before unlock, without Web Audio and while the context is interrupted.

- `setGameplay({ stepMs, startMs, capMs, score, length, pressure, clear })`: partial objects allowed. `pressure` is the raw estimate, smoothed in the engine. `clear` drops danger to zero at once.
- `bite({ score, kind, from, to, look, prevLook, held, reset, swing, lifeGained })`: one call per food event.
- `shift({ from, to, look })`: a universe change without a bite (debug lock, run reset): kit swap, no bite voice, no impact.
- Unchanged: `unlock setMuted setLives lifeLost lifeGained respawned setLook die start stop debug beat muted`. Kept and harmless: `setScore` (feeds pace), `setTimeline`, `setChaos`, `eat` (a bite voice, no transition), `cut` (does nothing).
- `registry.js` lists `setGameplay`, `bite` and `debug` in `AUDIO_METHODS`.

Calls from `main.js`:

1. Sim reset: `setGameplay({ stepMs, startMs, capMs, score, length, clear: true })`, `shift({ to: universe })` (a reset fires no sim shift), `setLives`.
2. Food event, once universe and look are known: `setGameplay({ stepMs, score, length, clear? })` → if a life was gained: `setLives`, `lifeGained` → `bite({...})`. `clear` is true when the space kind changed.
3. Every frame while playing, after `sim.advance()` and `flushBite()`, only when `snap.tick` or `snap.turns` changed: `setGameplay({ pressure })` from `createPressure().evaluate(snap)`.
4. Life lost: `setGameplay({ clear: true })`, `setLives`, `lifeLost`. First move: `respawned`.
5. Game over: `setGameplay({ clear: true })`, `setLives(0)`, `die`. Pause: `setGameplay({ clear: true })`, `stop`; resume: `start`.
6. Debug-lock shift without a bite: `setGameplay({ clear: true })` if the space kind changed, then `shift`.

`dev/finish.js audioOrder()` checks rule 2 (and flags `eat`, `setScore`, `cut`, `setTimeline` as old calls).

## Danger estimate (`src/pressure.js`)

Pure, reads a snapshot, reuses typed arrays. Projected path: `turns[0] ?? dir`, then `turns[1] ?? the same`, then straight; `heading` is never used. Walls only from `stepIn()`; on the cube the frame is carried step by step. Moving tail: cell i is still there at step k when `i ≤ L − 1 − k + food eaten by step k`; with off-board body cells every visible cell counts.

```
tti   = ahead × stepMs                  (∞ when 6 steps are clear)
close = 1 at tti ≤ 200 ms, 0 at ≥ 560 ms
pPath = certain ? 1 : close × [1, 0.7, 0.36][escape]
pExit = [1, 0.55, 0.1, 0][exits]
pRoom = 0.8 × clamp01(1 − room / min(24, length + 2))      room: cells reachable in 5 steps
danger = max(pPath, pExit, pRoom)
```

Measured through the real sim (scenario 11): wall-parallel 0.10, open wall approach peaks 0.36 (never tense), one-cell corridor 0.55–0.60 (tense), lane travel 0, cube seam 0.

## Tuning table

| What | Value | Where |
|---|---|---|
| Tempo | 118 + 20 × pace BPM | `arrange.js` `TEMPO` |
| Pace | 0.9 × max(speed, 0.6 × score/50) + 0.1 × length/40 | `arrange.js` `paceOf` |
| Pace smoothing | 2 s time constant; tempo moves in steps of ≥ 0.25 BPM | `audio.js` `PACE_TAU`, `applyPace` |
| Level edges | pace 0.15 / 0.45 / 0.80 | `arrange.js` `LEVEL_EDGES` |
| Music level | 0.5, +1.5 dB at pace 1 | `arrange.js` `MUSIC_GAIN` |
| Danger envelope | attack 0.07 s, release 0.5 s | `arrange.js` `DANGER` |
| Danger states | tense on 0.40 / off 0.25, critical on 0.75 / off 0.55 | `arrange.js` `DANGER` |
| Danger level | +0.75 dB at 1; calmer sound depth 0.33 | `arrange.js` `DANGER` |
| Pressure weights | see the formula above | `pressure.js` `PRESSURE` |
| Major cooldown | 16 beats since the last major, 2 since the last bite | `arrange.js` `COOLDOWN` |
| Rapid bite weight | 0.85 per bite in a row, floor 0.55 | `arrange.js` `classifyBite` |
| Anticipation | quiet 4, peak 12, settle 16 (0.35), swell 0.6 every 8 beats | `arrange.js` `ANTIC` |
| Pump depth by level | 0.10 / 0.14 / 0.20 / 0.32 (halved in Abyss) | `audio.js` `PUMP` |
| Bass duck under kick | 0.55 (Bunker 0.85), back in about 45 ms | `audio.js` `duckLow`, `KIT.bunker.lowDuck` |
| Filter opening by level | ×1 / 1 / 1.15 / 1.6 | `audio.js` `OPEN` |
| Kick level | ×0.7 of the kit values | `audio.js` `KICK_G` |
| Role levels per world | bass, gesture, hats, snare, perc in dB | `audio.js` `MIX_DB` |
| World trim | dB per world on the music bus | `audio.js` `TRIM_DB` |
| Master | compressor −14 dB, 3.5:1, knee 8, 12 ms / 180 ms; soft clip knee 0.7 | `audio.js` `build` |
| Wet | reverb return 0.3 (high-pass 200 Hz in), echo 0.32 (high-pass 150 Hz in, feedback 0.34) | `audio.js` `build` |
| Voice budget | 96 at once; beyond it only kick, click, bass, heart | `audio.js` `MAX_ACTIVE` |
| Heartbeat | 0.09 (calmer 0.06), step 14 | `audio.js` `heart`, `arrange.js` `stepHits` |
| Lift | 0.075, about 20 dB under the mix | `audio.js` `lift` |

`MIX_DB` came from solo loudness of each role against the world's kick (targets: bass −5, gesture −9, snare −8, perc −13, hats −15 dB) at level 2, then capped. `TRIM_DB` brings every world to about −21 LUFS at score 30 (Abyss about −24, LCD clicks about −36).

## Worlds as built

| World | Policy | Pulse | Anchor | Gesture (motif) | Danger speaks as |
|---|---|---|---|---|---|
| lcd | pedal | beat clicks | – | – | nothing |
| arcade | parallel | square kick, tick | square bass on the motif rhythm | square lead, full motif; octave echoes at level 2 | arpeggio to sixteenths, lead +12, rub, filter |
| mushroom | parallel, swing 0.3 | short kick | bouncing triangle | the answer half (8 11 14) with grace notes; full from level 2 | bounce to sixteenths, grace, filter |
| bunker | pedal | heavy kick in four | rumble on the off-beats at 55 Hz, ducked hard | metal clank on the motif rhythm, no pitch | metal sixteenths, rumble filter opens, tritone rub, gesture thins |
| acid | parallel | round kick | 303 line on the motif contour, slides, accents on motif steps | sine blips on 3 and 11; full from level 2 | cutoff and resonance rise |
| lane | pedal | soft kick, tabla on a 7-step cycle | drone on A (bar-long); acid line from level 1 | sitar pluck, full motif | tabla doubles, drone beats wider |
| disco | diatonic | kick, off-beat open hat | octave bass with a syncopated answer | chopped chord stab on 3 and 11 (level 1: 3 6 11 14, level 2: all) | sixteenths, the answer pops an octave |
| kombat | diatonic | crushed kick and snare | sparse square (tresillo) | three crushed stabs on 0 6 11; tom run at phrase ends | toms tighten, the stab rubs |
| court | diatonic | deep kick on 1 and 3 (in four from level 1) | long triangle notes | motif at half speed over two bars: sine and whistle swell | a low eighth-note ostinato |
| plastic | parallel | soft kick, glass on the off-beats | sine bass with its octave | bell motif | bells move a sixteenth late |
| desktop | parallel | triangle kick, straight eighth ticks | sparse square | a two-note chime on 11 and 14 every bar | tick sixteenths, error buzz rub |
| hangar | diatonic | kick on 1 and 3, field snare | slow saw march | brass stab on 0 6 11; brass swell, anvil | snare ruffs, brass up a third |
| abyss | diatonic, half-time, cap 2 | soft kick once a bar, soft snare on 3 | pad and long sine | slow pluck (motif stretched); calls and drips at level 2 | the pad gains a flat second; no drums added |
| castle | parallel, swing 0.12 | soft kick in four | triangle waltz, 12-step cycle | music box, the contour in three (12-step cycle) | grace notes |
| timewarp | pedal | swept kick | whole-tone glide bass, glide target per bar | the motif backwards with a reversed envelope | glides widen |
| wrong | – | another world's plan per bar (per half bar when tense) | from that world | that world's gesture | the mix changes every half bar |

Randomness is per bar or per phrase (wrong kit, glide targets) from the engine's own generator (`opts.seed`), never the sim's.

## Harmony audit

Bar roots stay A A F G. Chords: A minor or major (the world's third), F major, G major. "Avoid" means a note a semitone above a chord tone; it falls to that chord tone. Over A the world's mode is the harmony (Kombat's flat second stays). Bite notes keep their rising walk with the score.

| World | Mode | Policy | Bite over F and G | Motif over A / F / G |
|---|---|---|---|---|
| lcd | major pentatonic | pedal | stays (no bass under it) | A C# B F# C# A (all bars) |
| arcade | major | parallel | moves with the bass (F: down a major 3rd, G: down a tone) | A C# B E C# A / F A G C A F / G B A D B G |
| mushroom | major pentatonic | parallel | moves with the bass | A C# B F# C# A / F A G D A F / G B A E B G |
| acid | dorian | parallel | moves with the bass | A C B E C A / F G# G C G# F / G Bb A D Bb G |
| plastic | lydian | parallel | moves with the bass | A C# B E C# A / F A G C A F / G B A D B G |
| desktop | major (bite: triad) | parallel | moves with the bass | as arcade |
| castle | major | parallel | moves with the bass | as arcade |
| disco | aeolian (bite: minor pentatonic) | diatonic | C over G → B; others stay (A is a common tone over F) | A C B E C A / A C B F C A / G B B D B A |
| kombat | phrygian | diatonic | Bb over F → A; C over G → B; Bb stays over A | A C Bb E C A / A C A F C A / G B Bb D B A |
| court | major pentatonic | diatonic | C# over F → C, F# over F → F; G keeps C# (#11) | A C# B E C# A / A C B F C A / G C# B G C# A |
| hangar | aeolian | diatonic | C over G → B | as disco |
| abyss | minor (0 2 3 7 8) | diatonic | C over G → B | A C B E C A / A C B F C A / G B B G B A |
| bunker | locrian | pedal | stays on A | A C Bb Eb C A (all bars) |
| lane | phrygian dominant | pedal | stays on A | A C# Bb E C# A (all bars) |
| timewarp | whole tone | pedal | stays on A | A C# B F C# A (all bars) |
| wrong | mixed | parallel | moves with the bass | – (borrowed per bar) |

- Strong motif hits (index 0 and 3) in diatonic worlds land on chord tones. Over G that turns "1 3 2" into "1 3 3" (C falls to B): the rhythm carries the identity there.
- The first-person drone follows the bar root (A2 = 110 Hz and its root moves) with a 60 ms glide; pedal worlds keep A.
- Diatonic bass uses the chord's own third over F and G and never a minor ninth against the chord.

## Mix

- Low end: the kick owns the transient (kits at ×0.7); bass on its own bus, ducked by every kick and back in about 45 ms; no generic sub layer; Bunker rumble moved up to 55 Hz; the first-person drone is at 110 Hz; Court, Plastic and Castle basses moved up an octave (110 Hz) with an octave partial. Sine and triangle basses carry an octave at 0.45.
- Reverb and echo inputs are high-passed (200 / 150 Hz), so low notes stay dry.
- One wet return with its own envelopes: cut in 40 ms into LCD, back on the next non-LCD bite; fades in about 0.4 s on stop; muffled with the respawn wait.
- Tonal parts pass a sidechain pump, then an event-dip gain (held bite, life figure). Pump automation is never cancelled by a held bite.
- Music voices longer than 150 ms get a release handle; a kit change releases those with more than 250 ms left.

## Metrics, before (commit 184b3c8) and after

Offline renders at 48 kHz, seed 7, same event scripts. LUFS: K-weighted, gated (BS.1770). Bands: share of energy, % (< 80, 80–250, 250–2k, 2k–6k, > 6k Hz). Knee: share of samples above 0.7. Voices: most at once. Errors: `debug().errors`.

| # | Scenario | Engine | LUFS | Peak | Crest dB | > knee % | Bands % | Voices | Errors |
|---|---|---|---|---|---|---|---|---|---|
| 1 | opening LCD → Arcade → Reality.exe | before | −21.5 | 0.64 | 20.7 | 0 | 43 / 39 / 6 / 3.7 / 7.9 | 8 | 0 |
| | | after | −22.9 | 0.62 | 21.2 | 0 | 22 / 59 / 18 / 0.7 / 0.7 | 9 | 0 |
| 2 | safe / constrained / safe | before | −19.7 | 0.62 | 18.5 | 0 | 7.5 / 69 / 1.4 / 4.3 / 17.8 | 7 | 0 |
| | | after | −21.9 | 0.60 | 18.9 | 0 | 7 / 84 / 7.5 / 0.7 / 0.9 | 9 | 0 |
| 3 | rapid bites | before | −16.0 | 0.65 | 13.7 | 0 | 14 / 78 / 4.2 / 1.5 / 2.4 | 16 | 0 |
| | | after | −20.3 | 0.70 | 18.9 | 0 | 14 / 75 / 9.3 / 1.1 / 0.8 | 16 | 0 |
| 4 | held bites | before | −19.5 | 0.65 | 17.6 | 0 | 13 / 74 / 8.4 / 1.6 / 3.3 | 26 | 0 |
| | | after | −21.7 | 0.70 | 20.5 | 0 | 13 / 64 / 20 / 1.9 / 1.2 | 27 | 0 |
| 5 | majors at four bar positions | before | −18.6 | 0.68 | 16.6 | 0 | 22 / 70 / 5.3 / 1.0 / 2.0 | 16 | 0 |
| | | after | −20.0 | 0.80 | 19.7 | 0.002 | 15 / 74 / 9.1 / 1.2 / 1.2 | 17 | 0 |
| 6 | sustained fast run, 90 s | before | −16.9 | 0.67 | 14.9 | 0 | 22 / 72 / 4.9 / 0.7 / 1.4 | 24 | 0 |
| | | after | −19.9 | 0.84 | 20.1 | 0.004 | 16 / 71 / 10 / 1.4 / 1.1 | 22 | 0 |
| 7 | calm worlds | before | −17.4 | 0.63 | 15.6 | 0 | 34 / 59 / 6.0 / 0.3 / 0.5 | 17 | 0 |
| | | after | −21.7 | 0.75 | 21.4 | 0 | 35 / 53 / 11 / 0.8 / 0.6 | 19 | 0 |
| 8 | last life, lives | before | −21.9 | 0.67 | 20.2 | 0 | 35 / 53 / 9.3 / 0.7 / 1.4 | 13 | 0 |
| | | after | −21.6 | 0.78 | 21.8 | 0.001 | 18 / 63 / 17 / 1.2 / 0.8 | 12 | 0 |
| 9 | pause, mute, restart | before | −20.9 | 0.66 | 20.7 | 0 | 24 / 66 / 5.3 / 2.5 / 2.1 | 10 | 0 |
| | | after | −21.0 | 0.80 | 22.1 | 0.001 | 20 / 65 / 11 / 2.9 / 1.0 | 15 | 0 |
| 10a | as 2, calmer sound | after | −22.1 | 0.60 | 19.0 | 0 | 7.6 / 85 / 6.6 / 0.6 / 0.8 | 7 | 0 |
| 10b | as 5, calmer sound | after | −20.9 | 0.76 | 20.1 | 0.003 | 13 / 74 / 11 / 1.4 / 1.2 | 16 | 0 |
| 11 | sim geometry | before | −21.6 | 0.63 | 20.2 | 0 | 11 / 72 / 6.7 / 2.9 / 8.1 | 6 | 0 |
| | | after | −22.6 | 0.61 | 20.1 | 0 | 13 / 68 / 17 / 1.5 / 0.8 | 18 | 0 |

The legacy engine ignores pressure and plays its riser instead, so 10a/10b "before" equal 2 and 5. In short: after is 0.3–4.4 dB quieter, keeps 3–5 dB more crest factor in the busy scenarios (less squashed), roughly doubles the 250–2k share (the motif layer) and carries much less above 6 kHz (no riser).

## Checks (dev/audio.html → RUN ALL CHECKS)

Last run: 38 of 38 passed, 0 console errors.

- Every scenario renders with `errors 0`; most voices at once 27.
- Scenario 2: tense 0.06 s after the constraint; under 0.25 0.54 s after it clears; sixteenths 0 → 24 per 3 bars; 250–2k share 6.7 → 8.9 %, > 6k 0.8 → 1.2 %; loudness −22.2 → −21.5 LUFS (+0.6 dB).
- Scenario 1: the second bar in Arcade holds kick, bass and gesture.
- Scenarios 3 and 4: no vacuum, no major, every kick of each world's own pattern present.
- Scenario 5: music in the gap 24.9 dB lower after a major than after a change (bite voices left out); in the full render the gap window is 2.4 dB *louder* after a major, because the bite voice sits alone in the hole; impact window 6.7 dB louder; majors at least 17.1 beats apart.
- Scenario 6: first 30 s −19.9, last 30 s −19.7 LUFS; 0.004 % above the knee, peak 0.84.
- Scenario 7: music and wet 55 dB down 45 ms after the LCD bite; Abyss entry without a vacuum. Scenario 9: paused and muted stretches below −119 dBFS.
- Scenario 11: see the danger estimate above.
- Game, `?debug&auto` on the synthetic clock, 4 minutes plus 1 with calmer sound: 0 audio errors, 0 console errors, `audioOrder()` no bad calls (209 bites, 3 lives gained, 2 lost). Game over and restart by real keys: 0 errors, call order fine, the new run is back in LCD at 118 BPM.

## Departures from the plan

- Major cooldown 16 beats, not 8. With the autopilot's fast bites (median 2.6 beats apart) about 13% of bites came out major at 8 beats; at a human bite rate most changes would. 16 beats = one per four-bar phrase.
- Open wall approach weight 0.36, not 0.40: at 0.40 the last cell sat exactly on the tense threshold.
- Over the A chord the world's mode is kept for bite and motif notes; only F and G bars snap clashing notes. Snapping over A removed Kombat's flat second, which is its character.
- Acid's gesture is a sine blip lead, not "the squelch itself": the 303 line is the anchor and carries the motif contour, so the roles stay separate.
- Desktop's chime is once a bar, not once per two bars: a one-bite visit is often shorter than two bars.
- Bunker's snare comes at level 2 (four-on-the-floor first).
- `debug` is in `AUDIO_METHODS` so `?debug` checks can read `audio.debug()` in the game.
- Run reset now calls `shift({ to })`: before, a new run after game over kept the last world's kit until the first bite (this was also true of the old engine).
- Landscape phone CSS: the title switches are a little tighter so PLAY stays on screen with the third switch.
- Steps 3 to 6 of the build order were done as one engine rewrite, then measured and tuned; tests ran after it, not after each step.

## Ten-minute listening list (owner)

Open `dev/audio.html` (UNLOCK first) and `dev/audio-compare.html`. Headphones first, then laptop speakers or a phone.

1. **Compare 1 (opening), A/B** — 1 min. Is Arcade musically interesting from its first bar? Does the LCD → Arcade major feel like an event? Is Reality.exe deep, not muddy (its kick sits low)?
2. **Compare 6 (90 s fast run), A/B at matched loudness** — 3 min. Fatigue, repeated effects, the eight-bar section cycle, whether the motif layer is too loud or too quiet against the kick. Note the new one is quieter at the same settings.
3. **Harness scenario 2, live** — 1 min. Do the four constrained bars feel tighter, not just louder? Does it relax after?
4. **Scenario 3 and 4, live** — 1 min. Rapid bites: groove kept, bites still clear? Held bites in Lane, Mushroom, Castle: release without breaking the groove.
5. **Scenario 5, live** — 1 min. Majors at four bar positions: abrupt and special; the stutter at level 3; the answer after the impact.
6. **Scenario 7, live** — 1 min. The LCD cut (is the sudden emptiness striking, are the clicks loud enough?), the Abyss bloom and its calm.
7. **Scenario 8, live** — 1 min. Heartbeat level and placement, the nerve voice (too faint? too sour?), life gained, the respawn snap.
8. **Universe buttons, pace slider at 0 and 1** — 1 min. Each world's identity from two bars; Disco's stab, Lane's sitar and Hangar's brass were raised a lot (`MIX_DB`), check they are not harsh.

## Not done / known

- Set by measurement only: every level, timbre and balance above. The owner's listening (Mac and phone, 17 November 2026) approved the whole; no single world was tuned by ear, and the listening list above was not worked through item by item.
- Band shares stay low-heavy (80–250 Hz is 53–85% of the energy in most renders); Court and Abyss put 35–75% below 80 Hz by design (deep kick, pad). Small speakers will lose most of that; the octave partials are there for this, unverified by ear.
- The full-render vacuum is filled by the bite voice (see scenario 5). If majors do not feel like a vacuum, lower the bite voice under a major.
- Synthetic-clock game runs cannot judge audio timing: the audio clock barely moves inside `__ss.run()`, so bites there look rapid.
- Context suspend/resume and iOS 'interrupted' are covered by the mock in `tests/music.test.js` only, not on a device.
- At 812×375 landscape the keyboard hint line under PLAY needs 8 px of scroll in the title panel.
