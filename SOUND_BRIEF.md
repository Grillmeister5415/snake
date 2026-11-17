# SNAKE//SHIFT — adaptive audio brief (the owner's text)

This is the owner's brief of 2026-11-17, kept word for word. `SOUND_PLAN.md` turns it into decisions and a build order. Where the plan is silent, this brief decides.

Act as a game audio director, electronic music producer, and experienced Web Audio engineer. Rework the existing SNAKE//SHIFT sound system so playing feels propulsive, tense, satisfying, and immersive. Implement the changes in the existing project, then validate them technically and through listening. Do not stop at a design proposal.

## Creative direction

The player should feel: "I'm locked into the rhythm. The space is tightening. That bite released the pressure—and now I want the next one."

Give the game a compelling musical pulse that survives its violent jumps between decades and dimensions. Think underground Berlin techno colliding with psychedelic 1960s electronics, 1970s disco, and 1990s arcade energy. Preserve the strange, playful personality of each universe.

Make tension come from rhythm, anticipation, repetition, selective instability, and release. Keep the player able to concentrate. Avoid treating excitement as a permanent increase in volume, noise, or the number of simultaneous sounds. A good result should remain exciting at a comfortable listening level.

## 1. Inspect the current implementation

Repository: https://github.com/Grillmeister5415/snake

This brief was grounded in the supplied sound-report.md and GitHub main at commit d3cb4c78ffe7c3dfd97189af51f9fe4771001fd1, inspected on 17 November 2026. Recheck the current checkout before editing. The supplied report is from a local worktree and was not present in the inspected GitHub tree; use it if attached, but do not depend on that file existing in the repository.

Read these files first, relative to snake-shift/:

- src/audio.js: synthesis, kits, scheduling, drops, harmony, mixing, and pure music-plan functions.
- src/main.js: finishBite(), pending bite handling, simulation events, and lifecycle.
- src/sim.js, src/space.js, src/flow.js, src/config.js: snapshots, collision semantics, speed, and universe transitions.
- src/beat.js: the shared, phase-continuous music/visual clock.
- src/render/registry.js: audio method allowlist, wrappers, and silent fallback.
- src/prefs.js, dev/audio.html, and tests/music.test.js.

The inspected code has several useful starting points:

- Bass arrives at score 10 and the signature lead at 25. Early universes therefore share much of their musical content.
- finishBite() calls audio.shift() before audio.eat() for every bite. shift() runs a drop even when from === to, including held universes.
- The hunger riser reaches maximum after six seconds without a bite and closes the music low-pass. This measures elapsed time, not actual danger.
- Speed reaches its default cap around score 37; visual chaos caps at 25; the music ladder finishes at 50.
- snapshot() already exposes stepMs, length, dir, heading, space, body, snake, lives, and lifecycle state.
- heading is the direction after all queued turns, not necessarily the next movement direction.
- The master has strong compression and a soft clipper. Peaks alone cannot establish whether the mix has punch or becomes tiring.

Treat these as design hypotheses to audition, not proof that every existing sound is bad. Preserve useful voices and infrastructure.

## 2. Establish the groove early

Keep the opening LCD world spare and recognisable. Once the player enters Arcade, establish a satisfying rhythmic and tonal identity within the first few seconds. Do not require score 25 before the soundtrack becomes musically interesting.

Give each normal universe a minimal complete arrangement: a pulse, a bass or tonal anchor, and one characteristic rhythmic or melodic gesture. Low intensity means fewer notes and more space; the identity should still be present.

Create a short original musical motif or rhythmic fingerprint that can transform across worlds. It might become a square-wave figure in Arcade, a clipped metallic pattern in Bunker, or a syncopated bass answer in Disco. Preserve its recognisable contour or rhythm where that serves the world; do not force identical instrumentation or major/minor harmony everywhere.

Build momentum through deliberate accents, rests, bass articulation, and complementary kick/bass envelopes. Reserve ornamental fills for phrase endings or meaningful events. Random high-register activity must not obscure the rhythmic centre.

Use a continuous phrase position across shifts. Because many universes last only one bite, their identity must work as a brief fragment and when entered halfway through a bar. Longer-held worlds can develop fuller phrases. Do not solve this by changing universe durations or selection rules.

## 3. Separate pace, danger, and world character

Replace the single cumulative score ladder with a compact adaptive arrangement model. Prefer pure, testable decisions feeding the existing engine over a large framework.

**Pace:** Use the actual movement interval (stepMs) as the principal long-term pacing signal, with score and snake length as supporting context. Smooth changes. Derive normalisation from the configured speed range, including debug overrides, rather than duplicating fixed score thresholds. Music should reach its main driving state around the game's sustained fast phase, then continue varying without endlessly getting louder or busier.

**Danger:** Derive a conservative short-term pressure value from the current playable situation: restricted legal exits, obstacles in the projected path, or limited nearby manoeuvring space. Distance from a wall alone is insufficient: travelling safely alongside a wall should not sound like an emergency.

**World character:** Apply the universe's instruments, rhythm, mode, space, and intensity limits to that underlying state. Danger should be expressed in the world's own musical language.

Use fast but controlled attack and a more gradual release for danger, plus hysteresis to prevent flickering between states. A starting point is a rise over roughly 100–250 ms and a release over 0.5–1.5 seconds; tune by playing at actual speeds. Modulate a small number of parameters with clear roles. At high danger, consider thinning decorative parts so a tighter pulse becomes more exposed.

Do not accelerate the whole track whenever danger changes. Keep tempo stable over short interactions; use subdivisions, articulation, register, filter movement, and restrained dissonance to convey urgency.

## 4. Make danger estimation correct and inexpensive

Keep the simulation authoritative and audio observational. Calculate pressure after state updates, using immutable snapshots or a small read-only helper. Reuse stepIn(), sameCell(), and existing space semantics. autopilot.js is a useful reference for collision-aware snapshot analysis, not a reason to add expensive pathfinding every frame.

- Box worlds have four walls. Lane has side walls but no front/end wall. Cube seams lead to another face and are not walls.
- Use full space coordinates and body data in Lane and Cube; the rendered board contains only a partial view.
- Respect the moving tail and growth rules. A tail cell can be safe when it vacates; eating changes that calculation. Handle off-board body segments conservatively.
- Do not treat heading as the next queued turn. If precise prediction needs queue information, expose a minimal immutable next-direction/queue view without changing input processing. Otherwise avoid presenting uncertain prediction as imminent collision.
- Evaluate at simulation cadence or another bounded rate, reuse allocations where practical, and smooth the resulting audio control separately.
- Clear stale danger on reset, respawn, pause, game over, and topology changes.

This is a musical pressure estimate, not a navigation assistant: avoid directional warning beeps and promises of guaranteed safety. Do not introduce scoring incentives, combos, or altered movement rules.

## 5. Recompose bites and transitions

Every bite should have a precise, satisfying immediate response. Every world change should retain its abrupt personality. Give those events different musical weights.

| Event | Intended response |
|---|---|
| Bite while the same universe is held | Short tactile bite accent and a brief sense of release; preserve the groove. |
| Ordinary universe change | Immediate bite feedback and a sharp change of musical colour; retain the underlying pulse and phase. |
| Selected major contrast or milestone | A larger vacuum, impact, or stutter, with enough spacing to remain special. |
| Return to LCD | Preserve the sudden reduction to dry clicks and space. |
| Entry to Abyss | Preserve the soft, spacious transition and half-time character. |

Keep immediate feedback independent of quantised arrangement changes. Never delay food collection, visuals, or input to await a beat. Optional musical answers can land on the next useful subdivision, without restarting the bar.

Distinguish bite, universe change, and look-only change explicitly in the integration. Preserve existing event order so a bite gets the correct destination voice. Retain event information such as held status, reset, and life gain where needed; do not infer everything from a brightness swing or from === to alone.

Give major interruptions a cooldown or phrase budget. Rapid consecutive bites should feel increasingly fluid, rather than repeatedly cancelling the groove. Keep their articulation clear without stacking sub drops, crashes, and long tails.

Pressure relief should depend on what actually changed. A bite may release anticipation, but it should not erase a genuine ongoing collision risk.

## 6. Replace the permanent riser with shaped anticipation

Time since the last bite can provide secondary anticipation, but a safe six-second route must not automatically become an endless maximum-intensity noise sweep.

Make anticipation bounded and phrase-shaped. Use a short repeating figure, tightening percussion, a restrained filter opening, or a brief rising texture when musically justified. Allow it to settle or breathe if the player takes longer. Avoid leaving the whole groove permanently muffled while a high-frequency riser dominates.

Use subtraction for contrast: a momentary missing kick, a brief exposed bass figure, or a smaller gap can make the next accent effective. Reserve the most dramatic interruption for selected moments. At high speed, prefer brief textural breathing room that retains propulsion.

Last-life pressure should be recognisable but controlled. Rework the existing heartbeat and global detune if they obscure the groove. Test a sparse heartbeat and a dedicated unstable texture instead of continuously detuning every pitched layer. Keep the respawn waiting state restrained and make movement resumption feel decisive.

## 7. Preserve and sharpen each universe

Use these as creative targets, adapting existing synthesis wherever possible:

| Universe | Musical target |
|---|---|
| LCD | Dry, fragile phone-clock precision. Its emptiness makes the return from a dense world striking. |
| Arcade / Mushroom | Catchy chip articulation, compact original motifs, and forward-moving rhythm; distinct from each other. |
| Bunker | Weighty kick, controlled rumble, insistent syncopation, and sparse metallic punctuation. Keep the groove legible. |
| Acid Paradise / Endless Lane | Resonant acid motion and psychedelic instability. Give Lane its own hypnotic cyclic percussion and drone. |
| Disco | Active octave bass, clap, and syncopation with a buoyant physical groove. |
| Kombat | Punchy compressed percussion, disciplined tom movement, and brief confrontational stabs. |
| Reality.exe / Plastic Internet | Spacious propulsion; separate Reality's depth from Plastic's glossy, bright articulation. |
| Desktop Error | Clipped mechanical rhythm and concise system-like gestures, without repetitive notification clutter. |
| Hangar | Heavy industrial march and deliberate brass/metal accents with room for transients. |
| Abyss | Spacious half-time tension. Make its characteristic material reachable without defeating its calm arrangement cap. |
| Castle | Music-box fragility and elegant rhythmic play. Keep its three-against-four character intelligible. |
| Time Warp / Wrong Universe | Brief, composed destabilisation. Bound randomness so the time-travel effect still has rhythmic purpose. |

Audit harmony between the moving A–A–F–G roots, universe modes, leads, drones, and bite notes. Use deliberate relationships and voice-leading. The fixed A bite is not automatically wrong over F or G; decide where it is an intentional common tone and where a chord-relative or mode-relative note works better. Keep dissonance expressive and give it a destination.

## 8. Give the mix space and impact

Rebalance the voices before adding more layers. Establish a priority system so life/death feedback and bite articulation remain clear during dense music.

- Separate kick, sub, rumble, and first-person drone so they do not all occupy the same role.
- Give important bass gestures enough upper harmonics to remain audible on laptop and phone speakers.
- Control bright hats, resonant sweeps, metallic leads, and crash tails through listening.
- Use selective ducking and short event envelopes instead of repeatedly suppressing the whole mix.
- Review the +6 dB score gain ramp and heavy master compression. Keep useful loudness contrast and transient punch. Retain final peak protection, but do not use it to conceal upstream overload.
- Audit reverb and echo returns: in the inspected graph they return to master independently of the main music duck/fade. Ensure transitions and lifecycle changes have intentional tail behaviour.
- Keep essential feedback readable in mono; stereo width and motion are decoration.

Compare old and new at approximately matched perceived loudness. An automatically louder redesign is not sufficient evidence of improvement.

## 9. Preserve lightweight integration

Keep live browser synthesis and the existing lightweight architecture. Avoid large audio assets, additional audio frameworks, or a wholesale rewrite unless a specific limitation requires it.

Preserve the audio clock, lookahead scheduling, visual beat relationship, and independence of snake movement. Handle queued notes correctly when tempo or kits change: no duplicate steps, old-kit bursts, or audible discontinuities from abrupt parameter changes. Use audio-clock envelopes for musical timing.

If adding a method such as setGameplayState() or setPressure(), wire it through src/render/registry.js's AUDIO_METHODS, safe wrapper, and silent fallback as well as main.js. The game must work muted, before audio unlock, without Web Audio, and after audio-context interruption.

Bound voices, effect tails, and event density. Preserve existing reduced-flash/reduced-motion sound reductions. Add a simple separate reduced-audio-intensity preference if practical, so players can reduce tension effects while keeping the music. Do not silently restore intense audio for existing reduced-mode users.

Keep all existing gameplay, scoring, universe rules, controls, and visual design intact. Audio randomisation must never consume the simulation's seeded random stream or alter a replay.

## 10. Validate what the player actually hears

Extend dev/audio.html with independently controllable pace and danger, plus repeatable event sequences. Build listening scenarios for:

- The opening LCD → Arcade → Reality.exe sequence at low score.
- Safe movement and a constrained passage at the same score and speed.
- Rapid bites, held-universe bites, and major transitions.
- Box wall approaches, safe wall-parallel movement, Lane travel, and safe Cube seam crossings.
- Last life, life gain, life loss, respawn, pause/resume, and restart.
- A sustained fast run, all calm worlds, reduced intensity, mute, and audio interruption.

Use the existing OfflineAudioContext hooks for reproducible recordings and level checks. Make the audio fixture deterministic where practical, separately from gameplay randomness. Run npm test inside snake-shift/; update assertions that intentionally encode the old score ladder or drop policy, and retain meaningful lifecycle, timing, fallback, and gameplay-regression coverage. Add focused tests for danger geometry and event classification.

Play and listen to the result, including transitions at different positions in a bar. Assess headphones and small-speaker playback where available. Listen long enough to judge fatigue and repeated effects, not only a five-second peak render. Automated tests cannot establish musical quality. If your environment cannot audition audio, state that clearly, provide reproducible recordings, and leave listening approval explicitly unverified.

## Acceptance criteria and handover

The implementation is successful when the following are demonstrable:

- The music becomes engaging in the opening playable worlds without a high score requirement.
- Universes are identifiable from short fragments while the run retains a coherent pulse.
- At the same score, a constrained situation sounds tenser than safe movement, and tension relaxes after the situation clears.
- Frequent bites feel satisfying without repeatedly draining momentum.
- Major transitions retain their abrupt character and sound meaningfully different from ordinary bites.
- Late-game energy remains clear and tolerable over sustained play, with useful contrast and calm exceptions.
- Gameplay outcomes and input timing remain unchanged; audio remains reliable through lifecycle changes.

Prioritise early musical identity, continuous propulsion, correct danger response, bite/transition hierarchy, and mix clarity before adding decorative effects.

Deliver the implemented changes, a concise explanation of the new behaviour, the main tuning parameters, test results, and a clear account of what was actually auditioned. Provide a simple way to compare representative before/after audio at matched listening levels. Make a deliberate musical judgment and iterate; the goal is a soundtrack that pulls the player into the run.
