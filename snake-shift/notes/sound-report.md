# SNAKE//SHIFT sound report

Written 2026-11-17 from the code, as the starting point for a music rework. It describes the sound as it is built today.

The game has no audio files. Everything is synthesised live in the browser by [audio.js](../src/audio.js) as one endless 4/4 track in A. Score decides how many instruments play and how fast, the current level (universe) decides which instruments, and every bite is a small drop.

The build notes say nobody has ever listened to it. It was checked by scheduling tests (50 of 50 pass) and peak measurements only, so tone and balance are untested by ear.

## 1. How it works

- **Sequencer:** a grid of sixteenth notes, 16 per bar. A 25 ms timer schedules notes 120 ms ahead on the audio clock.
- **Visual link:** the same clock drives the beat pulse in the scenery, on every quarter note. Snake movement is not tied to it.
- **Harmony:** root A (110 Hz) with a four-bar loop of bass roots A, A, F, G. There is no chord layer; every pitched part is a fixed interval pattern above the current bar root.
- **Continuity:** the bar position never resets when the level changes; only the instruments swap. It restarts from beat 0 on a new run or after a pause.
- **Sources:** sine, square, saw and triangle oscillators, white noise and filters. A "drive" distortion and a "crush" bit-crusher colour some kits.
- **Effects:** a generated 2.2 s reverb and a dotted-eighth echo that follows the tempo.
- **Mix:** tonal parts pass a sidechain pump, then join the drums on the music bus. The music bus runs through a low-pass, the respawn gain and the drop duck. Bites and other one-shots bypass all of that.
- **Master:** a 20:1 compressor at −10 dB and a soft clipper.

## 2. How it gets more intense

### Stage (long term, from score)

Stage = score ÷ 5, rounded down, capped at 10. Each stage adds 4 BPM, one layer and 0.6 dB of music level (+6 dB in total).

| Stage | Score | BPM | Adds | Where it plays |
|---|---|---|---|---|
| 0 | 0–4 | 112 | Kick and sub | Kick on every beat; 55 Hz sine on every off-beat eighth |
| 1 | 5–9 | 116 | Hat | Off-beat eighths |
| 2 | 10–14 | 120 | Bass line | The kit's 16-step pattern |
| 3 | 15–19 | 124 | Snare or clap | Beats 2 and 4 |
| 4 | 20–24 | 128 | Sixteenth hats | The in-between sixteenths, at 55% level |
| 5 | 25–29 | 132 | Lead | The kit's signature figure |
| 6 | 30–34 | 136 | Second percussion | A syncopated four-hit pattern (kit-specific in some) |
| 7 | 35–39 | 140 | Fills | Last beat of every fourth bar: four rising snare and tom hits |
| 8 | 40–44 | 144 | Pump, open filters | Sidechain depth rises from 12% to 55%; bass filter opens 2.5× |
| 9 | 45–49 | 148 | Rolls and stabs | Three fast kicks ending every second bar; random minor-triad saw stabs |
| 10 | 50+ | 152 | Wild | Crash every four bars, random lead figures borrowed from other kits, zaps, hat ratchets |

With Reduced flash or Reduced motion on, the rolls, stabs and wild layers are left out.

### Hunger (short term, from time since the last bite)

Nothing happens for the first second. From 1 s to 6 s a riser builds:

- A band of noise swells and climbs from 350 Hz to 7 kHz.
- The music low-pass closes from 18 kHz to 3.2 kHz.
- The hats get shorter, down to 45% of their length.

The next bite releases it. 3310 Ghost has no riser; Abyssal Cathedral has half.

### The drop (every bite)

1. The bite voice plays at once (section 3).
2. The music ducks for one sixteenth note (134 ms at stage 0, 107 ms at stage 7), and queued notes of the old kit are cancelled.
3. The impact lands: a sine falling from 110 Hz to 28 Hz plus a noise crash, both slightly louder with each stage. The low-pass snaps open.
4. The new kit enters on the next grid step with the full layer count for the stage.

- **Heavy drop:** when the cut swings between a dark and a bright level, the sub is louder and distorted, the crash doubles, and a crushed saw sweeps down through the gap.
- **Stutter:** from stage 8 the gap shrinks to 78, 51 and 37 ms and is chopped instead of silent. It halves again when bites come less than a bar apart.

### Look and lives

- **3D view:** a whoosh on arrival and some of the music sent into the echo.
- **First person:** more echo, plus a low 55 Hz drone of two detuned saws.
- **Last life:** a double-thump heartbeat every half bar, and all pitched music detuned about 12 cents flat.

## 3. Event sounds

- **Bite:** a note in the level's own voice and scale. Each food steps one scale degree up; it wraps after two octaves.
- **Life lost:** a 0.6 s tape stop bends everything down two octaves. The music then continues muffled (420 Hz low-pass) and quiet until the first key press, when it snaps back with a short thud.
- **Life gained:** a fast rising major-ninth arpeggio from A4, square plus triangle with echo.
- **Game over:** the rhythm stops; two detuned saws fall from 520 Hz to 38 Hz over a second with a noise sweep and a distorted sub.

## 4. The levels

Thirteen levels last exactly one bite. Lane, Mushroom and Castle are held for 4 to 6 bites; Time Warp and Wrong Universe for 1 or 2. The first two shifts are always Arcade, then Reality.exe.

The descriptions of each look come from the build plans and the modules' palettes.

### Opening

**3310 GHOST, 1999 (`lcd`), 2D, calm**
- Look: green-grey phone LCD with pixel-block snake. It never flashes.
- Music: only metronome clicks on each beat, at every stage. No riser, no impact.
- Bite: two dry square ticks and a contact click, very high.
- The game sometimes snaps back here late in a run (a "Total Reset"), and the sudden silence is the joke.

### 2D levels

**ELECTRIC ARCADE, 1986 (`arcade`)**
- Look: black with neon magenta and cyan, scrolling vector floor, yellow sprite snake.
- Drums: short square-wave kick, tiny square tick hat, crushed noise snare.
- Bass: square arpeggio (root, fifth, octave, fifth) on every sixteenth.
- Lead: square major arpeggio on every sixteenth, two octaves up.
- Bite: two square notes, the second an octave higher. Major scale.

**ACID PARADISE, 1968 (`acid`)**
- Look: bright cream, orange and pink psychedelic print with a striped worm and flowers.
- Drums: round sine kick, short noise hat, noise snare, rimshot percussion.
- Bass: resonant saw squelch line in a 303 style with random accents.
- Lead: wobbling sine blips that glide up a fifth, panned at random, with echo.
- Bite: three vibrato blips (root, fifth, octave) over a squelch. Dorian scale.

**PIXEL KOMBAT, 1993 (`kombat`)**
- Look: dark 16-bit fighting-game stage with parallax sky and green block snake.
- Drums: everything bit-crushed; punchy kick, descending toms as percussion.
- Bass: sparse syncopated square.
- Lead: crushed minor-triad stabs with a noise hit, three per bar.
- Bite: square falling a fifth, with a noise hit and a thump. Phrygian scale.

**DESKTOP ERROR, 1995 (`desktop`)**
- Look: grey window chrome on teal, a trail of dragged windows, error dialogs piling up.
- Drums: tiny triangle kick, 15 ms tick hat, short crushed snare, click percussion.
- Bass: sparse square (root, fifth, third).
- Lead: a two-note falling "ding-dong" system chime, twice per bar.
- Bite: square blip, then a sine a fifth above. Only the notes of a major triad.

### Rooms (3D and first person)

**REALITY.EXE, 2088 (`court`)**
- Look: night court with glass-block snake, huge digits on the horizon, pulsing sun.
- Drums: deep slow kick in reverb, airy hat, quiet long clap.
- Bass: three long triangle notes per bar.
- Lead: a whistling resonant noise swell on beat one and one high sine note, both in heavy reverb.
- Bite: triangle, octave sine and ringing noise, all in reverb. Major pentatonic.

**BERLIN BUNKER, 2026, 04:37 (`bunker`)**
- Look: near-black concrete with red strobes, lasers and smoke. The strobe room.
- Drums: the hardest kick (distorted, long), metallic hat, distorted snare, metal clank percussion.
- Bass: distorted saw rumble two octaves down, on the off-beats.
- Lead: metallic hits on every sixteenth at random pitch and pan.
- Bite: distorted kick thump with a metal ring. Locrian scale.

**DISCO INFERNO, 1977 (`disco`)**
- Look: mirror-tile snake, lit floor tiles, sweeping light spots.
- Drums: loud kick, open hat, clap, conga percussion.
- Bass: saw jumping between root and octave on the eighths.
- Lead: tom-like sine hits and a noise swoosh on beat one.
- Bite: two filtered saw notes and a clap. Minor pentatonic.

**PLASTIC INTERNET, 2001 (`plastic`)**
- Look: glossy blue sky, chrome beads, bubbles, lens flares.
- Drums: soft kick, glass-ping hat with echo, clap with echo, bell percussion.
- Bass: sine (root, fifth, octave, major seventh).
- Lead: bell chimes with echo, three per bar, three octaves up.
- Bite: chime in reverb with a high triangle. Lydian scale.

### Levels with both looks

**RED IRON HANGAR, 1957 (`hangar`)**
- Look: aged blueprint in 2D; a vast amber concrete hangar with cranes and tanks in 3D.
- Drums: huge reverberant kick, metallic hat, military field snare with a flam.
- Percussion: anvil hits, two per bar.
- Bass: slow-attack saw in a march pattern.
- Lead: low brass drone swelling each bar, a brass stab, ghost snare taps.
- Bite: anvil strike over a low brass blat. Natural minor.

**ABYSSAL CATHEDRAL, −4000 M (`abyss`), calm**
- Look: stained glass and gold in 2D; a drowned gothic nave with jellyfish in 3D. It never flashes.
- Music: half-time, capped at the stage-4 layers.
- Drums: soft slow kick and a soft noise puff for a snare, both in reverb.
- Replaced layers: the sub is a slow detuned saw pad, the hat is a slow triangle pluck, the sixteenth hats are distant falling "calls".
- Bass: two long sine notes per bar.
- Drop: a soft sub bloom with no crash.
- Bite: a slow pluck in reverb with a rising bubble. Five-note minor scale.

### Special levels (held, the rules change)

**ACID ENDLESS LANE, 1967 (`lane`)**
- Look: endless scrolling lane with no end wall; op-art print in 2D, swirling arches and giant flowers in 3D.
- Drums: round kick, shaker, clap with echo.
- Percussion: tabla, a low hit bending up and a high one, six per bar.
- Bass: acid saw line with a flat second.
- Lead: a sustained three-note drone each bar plus buzzing sitar-like plucks walking a raga-like scale, with echo.
- Bite: squelch, tabla hit and a wobbling high note. Phrygian dominant.

**MUSHROOM LAND, 1991 (`mushroom`)**
- Look: navy pixel board in 2D, terraced voxel hills in 3D. A mushroom item gives an extra life.
- Drums: short square kick, crushed hat and snare, blip percussion.
- Bass: bouncing triangle.
- Lead: bright square chip arpeggio on every sixteenth, jumping an octave every half bar.
- Bite: a four-note rising square arpeggio. Major pentatonic.

**CASTLE CUBE, ONCE (`castle`)**
- Look: watercolour storybook in 2D; a floating cube with six playable faces in a sky kingdom in 3D. No first person.
- Drums: the quietest kit: soft kick, faint glass hat, soft clap, all in reverb.
- Bass: triangle waltz in a 12-step cycle, so it runs three against four over the drums.
- Lead: a 12-note music-box melody with a celesta note on each cycle start; bell percussion.
- Bite: a music-box note with celesta shimmer. Major scale.

### Rare levels

**TIME WARP, ???? (`timewarp`)**
- Look: tunnel of stretched, inverted colours.
- Drums: kick with an extreme pitch sweep, upward-sweeping hat, zap percussion.
- Bass: resonant saw whose notes glide to a random interval, on a whole-tone pattern.
- Lead: a saw riser gliding up two octaves over two beats, once per bar.
- Bite: two saws crossing, one rising and one falling, plus a vibrato sine. Whole-tone scale.

**WRONG UNIVERSE, ERR (`wrong`)**
- Look: a collage where nothing matches.
- Music: no kit of its own. Every bar takes kick, hat, snare, bass, lead and percussion from six random other kits.
- Bite: one or two random bite voices from other levels, slightly out of tune.

## 5. Worth knowing before the rework

- **Kits are barely distinguishable early.** Up to score 9 only the kick, the hat and the bite voice differ between levels. The bass arrives at score 10 and the signature lead at score 25.
- **Each kit is heard for seconds.** With one bite per level, a theme has to land between two bites, or the shared thread (tempo, key, the A–A–F–G loop) has to carry the tune.
- **Modes change on every bite.** Leads mix major, minor, Phrygian, Lydian and whole-tone over the same roots.
- **The bite note ignores the bar.** It stays in A while the bass moves to F and G.
- **Only score drives intensity.** Snake length, danger and speed have no effect. The curves also end at different scores: visual chaos peaks at 25, snake speed at 37, music at 50.
- **Dead parts:** the Abyss drip percussion and Abyss lead can never play because of the stage-4 cap. `setChaos`, `cut` and `setTimeline` are leftovers the game no longer uses.

## 6. Where to change it

Everything is in [audio.js](../src/audio.js). Line numbers are as of this report.

| What | Where |
|---|---|
| Key and bar roots | [line 33](../src/audio.js#L33) |
| Layer order, tempo, loudness per stage | [line 51](../src/audio.js#L51) |
| Riser and drop | [line 107](../src/audio.js#L107) |
| Which step each layer plays on | [line 178](../src/audio.js#L178) |
| Scales, bass patterns, kits | [line 221](../src/audio.js#L221) |
| Lead figures | [line 842](../src/audio.js#L842) |
| Bite voices | [line 1069](../src/audio.js#L1069) |

The game calls the engine from [main.js, line 137](../src/main.js#L137). According to the build notes, [dev/audio.html](../dev/audio.html) is a test bench with a score slider, a level picker and life buttons; it was not opened while writing this report.
