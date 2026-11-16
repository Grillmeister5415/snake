// Music intensity progression (LEVELS_PLAN 7): the pure scheduling decisions, and
// what the engine actually schedules against a minimal mock AudioContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAudio, TIMELINE_IDS, NEW_IDS, LAYER_ORDER, ABYSS_CAP, LIFE_FIGURE,
  universeId, stageOf, stageBpm, musicGain, musicPlan, hungerAt, riserPlan, dropPlan,
  impactPlan, pumpDepth, filterScale, lookPlan, lifeFigure, stepHits, biteMidi,
} from '../src/audio.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const never = () => 0.99; // rnd that never fires a random hit

// ---- pure: stage, tempo, layers ------------------------------------------------

test('stage = min(10, floor(score / 5)), robust to junk', () => {
  const cases = [[0, 0], [4, 0], [5, 1], [9, 1], [10, 2], [24, 4], [25, 5], [49, 9], [50, 10], [51, 10], [999, 10], [-3, 0], [NaN, 0], [null, 0], ['12', 2], [7.9, 1]];
  for (const [score, st] of cases) assert.equal(stageOf(score), st, `score ${score}`);
});

test('tempo table of 7.2: 112 … 152, +4 per stage, clamped', () => {
  assert.deepEqual(Array.from({ length: 11 }, (_, s) => stageBpm(s)), [112, 116, 120, 124, 128, 132, 136, 140, 144, 148, 152]);
  assert.equal(stageBpm(-1), 112);
  assert.equal(stageBpm(14), 152);
  assert.equal(stageBpm('x'), 112);
});

test('layers are cumulative: stage n plays the first n + 2 of the order', () => {
  assert.deepEqual(LAYER_ORDER, ['kick', 'sub', 'hat', 'bass', 'snare', 'hats16', 'lead', 'perc2', 'fills', 'pump', 'rolls', 'wild']);
  const added = ['hat', 'bass', 'snare', 'hats16', 'lead', 'perc2', 'fills', 'pump', 'rolls', 'wild'];
  for (let s = 0; s <= 10; s++) {
    const p = musicPlan(s, 'arcade');
    assert.equal(p.layers.length, s + 2, `stage ${s}`);
    assert.deepEqual(p.layers, LAYER_ORDER.slice(0, s + 2));
    if (s > 0) assert.equal(p.layers.at(-1), added[s - 1], `stage ${s} adds ${added[s - 1]}`);
    assert.equal(p.halfTime, false);
  }
  assert.deepEqual(musicPlan(0, 'acid').layers, ['kick', 'sub']);
  assert.deepEqual(musicPlan(10, 'disco').layers, LAYER_ORDER);
});

test('calm universes: lcd is clicks at every stage, abyss half-time and capped at stage 4', () => {
  for (let s = 0; s <= 10; s++) {
    const l = musicPlan(s, 'lcd');
    assert.deepEqual(l.layers, ['clicks']);
    assert.equal(l.calm, true);
    const a = musicPlan(s, 'abyss');
    assert.deepEqual(a.layers, musicPlan(Math.min(s, ABYSS_CAP), 'arcade').layers);
    assert.ok(a.layers.length <= 6);
    assert.equal(a.halfTime, true);
    assert.equal(a.soft, true);
  }
  assert.ok(!musicPlan(10, 'abyss').layers.includes('lead'));
});

test('reduced prefs drop rolls, stabs and the wild layer only', () => {
  const p = musicPlan(10, 'kombat', { reduced: true });
  assert.ok(!p.layers.includes('rolls') && !p.layers.includes('wild'));
  assert.ok(p.layers.includes('pump') && p.layers.includes('fills'));
  assert.deepEqual(musicPlan(7, 'kombat', { reduced: true }).layers, musicPlan(7, 'kombat').layers);
});

test('universe ids: sixteen known, suffixes stripped, unknown falls back to arcade', () => {
  assert.equal(TIMELINE_IDS.length, 16);
  for (const id of NEW_IDS) assert.ok(TIMELINE_IDS.includes(id), id);
  assert.equal(universeId('court-pov'), 'court');
  assert.equal(universeId('lane-3d'), 'lane');
  assert.equal(universeId('castle'), 'castle');
  assert.equal(universeId('nope'), 'arcade');
  assert.equal(universeId(undefined), 'arcade');
  assert.equal(musicPlan(3, 'nope').id, 'arcade');
});

test('bite note walks each new universe scale upward from the score', () => {
  for (const id of NEW_IDS) {
    const a = biteMidi(id, 1);
    const b = biteMidi(id, 2);
    const c = biteMidi(id, 3);
    assert.ok(a < b && b < c, id);
  }
});

// ---- pure: hunger, drop, impact -----------------------------------------------

test('hunger: 0 for the first second, linear to 1 at six seconds, then holds', () => {
  assert.equal(hungerAt(0), 0);
  assert.equal(hungerAt(1), 0);
  near(hungerAt(3.5), 0.5);
  assert.equal(hungerAt(6), 1);
  assert.equal(hungerAt(60), 1);
  assert.equal(hungerAt(NaN), 0);
  assert.equal(hungerAt(-5), 0);
  let prev = 0;
  for (let t = 0; t <= 8; t += 0.1) {
    const h = hungerAt(t);
    assert.ok(h >= prev);
    prev = h;
  }
});

test('riser: swells, rises and closes the low-pass with hunger; calm caps it', () => {
  const r0 = riserPlan(0, 'arcade');
  const r1 = riserPlan(1, 'arcade');
  assert.equal(r0.gain, 0);
  assert.ok(r1.gain > 0.1);
  assert.ok(r1.freq > r0.freq * 10);
  assert.ok(r1.lp < r0.lp && r1.lp >= 3000, 'closes a little, not to mud');
  assert.ok(r1.hatDecay < r0.hatDecay, 'hats tighten');
  let prev = riserPlan(0, 'acid');
  for (let h = 0.1; h <= 1; h += 0.1) {
    const r = riserPlan(h, 'acid');
    assert.ok(r.gain >= prev.gain && r.lp <= prev.lp);
    prev = r;
  }
  assert.deepEqual(riserPlan(1, 'lcd'), riserPlan(0, 'lcd'), 'lcd: no riser at all');
  assert.ok(riserPlan(1, 'abyss').gain < r1.gain / 2 + 1e-9);
  assert.ok(riserPlan(1, 'abyss').lp > r1.lp);
});

test('drop gap: one sixteenth to stage 7, shrinking to a stutter from stage 8', () => {
  for (let s = 0; s <= 7; s++) {
    const d = dropPlan(s);
    assert.equal(d.gap, 1);
    assert.equal(d.stutter, false);
    assert.equal(d.chops, 0);
    assert.ok(d.floor < 0.05, 'a real gap');
    assert.deepEqual(dropPlan(s, 0.5), d, 'fast bites do not change it below stage 8');
  }
  let prev = 1;
  for (let s = 8; s <= 10; s++) {
    const d = dropPlan(s);
    assert.ok(d.gap < prev, `stage ${s} shorter`);
    assert.equal(d.stutter, true);
    assert.ok(d.chops > 0 && d.floor >= 0.2, 'chopped, never silent');
    const fast = dropPlan(s, 2);
    assert.ok(fast.gap < d.gap && fast.gap > 0, 'faster than a bar: tighter still');
    assert.equal(dropPlan(s, 4).gap, d.gap);
    prev = d.gap;
  }
});

test('impact: heavier on a swing and with the stage; calm universes never crash', () => {
  const a = impactPlan('acid', 3);
  const sw = impactPlan('acid', 3, { swing: true });
  assert.ok(sw.heavy && sw.sub > a.sub && sw.crash > a.crash);
  assert.ok(impactPlan('acid', 9).sub > a.sub);
  assert.equal(impactPlan('acid', 3, { swing: true, reduced: true }).heavy, false);
  assert.deepEqual(impactPlan('lcd', 10, { swing: true }), { sub: 0, crash: 0, heavy: false, soft: true });
  const ab = impactPlan('abyss', 10, { swing: true });
  assert.equal(ab.crash, 0);
  assert.equal(ab.heavy, false);
  assert.ok(ab.soft);
});

test('loudness rises 6 dB from stage 0 to 10; pump and filters open up from stage 8', () => {
  near(20 * Math.log10(musicGain(10) / musicGain(0)), 6, 1e-9);
  for (let s = 1; s <= 10; s++) assert.ok(musicGain(s) > musicGain(s - 1));
  assert.ok(pumpDepth(musicPlan(8, 'disco')) > 2 * pumpDepth(musicPlan(7, 'disco')));
  assert.equal(pumpDepth(musicPlan(5, 'lcd')), 0);
  assert.equal(filterScale(musicPlan(7, 'disco')), 1);
  assert.ok(filterScale(musicPlan(8, 'disco')) > 1);
});

test('look: whoosh and wider delay in 3D, plus a drone in first person', () => {
  assert.deepEqual(lookPlan('2d'), { look: '2d', send: 0, drone: 0, whoosh: false });
  assert.ok(lookPlan('3d').whoosh && lookPlan('3d').send > 0 && lookPlan('3d').drone === 0);
  assert.ok(lookPlan('pov').send > lookPlan('3d').send && lookPlan('pov').drone > 0);
  assert.equal(lookPlan('weird').look, '2d');
});

test('life-gained figure is its own: short, strictly rising, not the familiar jingle', () => {
  const f = lifeFigure();
  assert.equal(f.length, LIFE_FIGURE.length);
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].semi > f[i - 1].semi, 'rising');
    assert.ok(f[i].at > f[i - 1].at);
  }
  const last = f.at(-1);
  assert.ok(last.at + last.dur < 0.8);
  const steps = f.slice(1).map((n, i) => n.semi - f[i].semi);
  assert.notDeepEqual(steps.slice(0, 5), [3, 9, -4, 2, 5]);
});

// ---- pure: what each step plays -------------------------------------------------

const ARP_PAT = Array(16).fill(0); // a bass note on every step
function barCount(stage, id, name, bar = 0, o = {}) {
  const p = musicPlan(stage, id);
  let n = 0;
  for (let s = bar * 16; s < bar * 16 + 16; s++) n += stepHits(s, p, { bassPat: ARP_PAT, rnd: never, ...o }).filter((h) => h === name).length;
  return n;
}

test('per-bar hits follow the layers of each stage', () => {
  assert.equal(barCount(0, 'arcade', 'kick'), 4);
  assert.equal(barCount(0, 'arcade', 'sub'), 4);
  assert.equal(barCount(0, 'arcade', 'hat'), 0);
  assert.equal(barCount(1, 'arcade', 'hat'), 4);
  assert.equal(barCount(1, 'arcade', 'bass'), 0);
  assert.equal(barCount(2, 'arcade', 'bass'), 16);
  assert.equal(barCount(3, 'arcade', 'snare'), 2);
  assert.equal(barCount(4, 'arcade', 'hat16'), 8);
  assert.equal(barCount(5, 'arcade', 'lead'), 16);
  assert.equal(barCount(6, 'arcade', 'perc'), 4);
  assert.equal(barCount(7, 'arcade', 'fill', 0), 0);
  assert.equal(barCount(7, 'arcade', 'fill', 3), 4, 'fills every fourth bar');
  assert.equal(barCount(7, 'arcade', 'fill', 7), 4);
  assert.equal(barCount(9, 'arcade', 'roll', 0), 0);
  assert.equal(barCount(9, 'arcade', 'roll', 1), 3);
  assert.equal(barCount(10, 'arcade', 'crash', 0), 1);
  assert.equal(barCount(10, 'arcade', 'crash', 1), 0);
  // Total hits per bar never fall as the stage rises.
  let prev = 0;
  for (let s = 0; s <= 10; s++) {
    const p = musicPlan(s, 'arcade');
    let n = 0;
    for (let i = 0; i < 64; i++) n += stepHits(i, p, { bassPat: ARP_PAT, rnd: never }).length;
    assert.ok(n >= prev, `stage ${s}`);
    prev = n;
  }
});

test('random stabs only from the rolls layer, wild stabs only at stage 10', () => {
  const always = () => 0;
  const count = (s, name) => {
    let n = 0;
    for (let i = 0; i < 64; i++) n += stepHits(i, musicPlan(s, 'acid'), { bassPat: ARP_PAT, rnd: always }).filter((h) => h === name).length;
    return n;
  };
  assert.equal(count(8, 'stab'), 0);
  assert.ok(count(9, 'stab') > 0);
  assert.equal(count(9, 'wildstab'), 0);
  assert.ok(count(10, 'wildstab') > 0);
  assert.equal(count(10, 'stab') > 0, true);
});

test('lcd steps are clicks on the beat and nothing else', () => {
  for (const st of [0, 5, 10]) {
    const p = musicPlan(st, 'lcd');
    const all = [];
    for (let i = 0; i < 32; i++) all.push(...stepHits(i, p, { bassPat: ARP_PAT, rnd: () => 0 }));
    assert.deepEqual([...new Set(all)], ['click']);
    assert.equal(all.length, 8);
  }
});

test('abyss plays half-time: kicks every two beats, nothing on odd steps', () => {
  const p = musicPlan(10, 'abyss');
  let kicks = 0;
  for (let i = 0; i < 64; i++) {
    const h = stepHits(i, p, { bassPat: ARP_PAT, rnd: () => 0 });
    if (i % 2) assert.deepEqual(h, []);
    kicks += h.filter((x) => x === 'kick').length;
  }
  assert.equal(kicks, 8, '8 kicks in 4 bars = one every two beats');
});

test('castle bass runs a 12-step cycle (three-four over four-four)', () => {
  const waltz = [0, null, null, null, 7, null, null, null, 12, null, 7, null];
  const p = musicPlan(2, 'castle');
  const at = [];
  for (let i = 0; i < 48; i++) if (stepHits(i, p, { bassPat: waltz, rnd: never }).includes('bass')) at.push(i);
  assert.deepEqual(at.slice(0, 8), [0, 4, 8, 10, 12, 16, 20, 22]);
  assert.equal(at.length, 16);
});

test('heartbeat on the last life: every half bar, also in lcd and abyss', () => {
  for (const id of ['arcade', 'lcd', 'abyss']) {
    let n = 0;
    for (let i = 0; i < 32; i++) n += stepHits(i, musicPlan(3, id), { heart: true, rnd: never }).filter((h) => h === 'heart').length;
    assert.equal(n, 4, id);
  }
  assert.ok(!stepHits(0, musicPlan(3, 'arcade'), { rnd: never }).includes('heart'));
  assert.deepEqual(stepHits(-1, musicPlan(3, 'arcade')), []);
  assert.deepEqual(stepHits(0, null), []);
});

// ---- engine against a mock AudioContext ----------------------------------------

function param(v = 0) {
  const p = { value: v };
  const chk = (x, t) => {
    if (!Number.isFinite(x) || !Number.isFinite(t)) throw new TypeError(`non-finite automation ${x} @ ${t}`);
    return p;
  };
  p.setValueAtTime = (x, t) => ((p.value = x), chk(x, t));
  p.linearRampToValueAtTime = (x, t) => ((p.value = x), chk(x, t));
  p.exponentialRampToValueAtTime = (x, t) => {
    if (!(x > 0)) throw new RangeError(`exponential ramp to ${x}`);
    p.value = x;
    return chk(x, t);
  };
  p.setTargetAtTime = (x, t, c) => {
    if (!(c > 0)) throw new RangeError('time constant');
    p.value = x;
    return chk(x, t);
  };
  p.cancelScheduledValues = (t) => chk(0, t);
  return p;
}

function mockContext() {
  const ctx = { sampleRate: 4000, currentTime: 0, state: 'running', started: [] };
  const node = (extra = {}) => Object.assign({ connect: (n) => n, disconnect() {} }, extra);
  const src = (kind, extra) =>
    node({
      kind,
      onended: null,
      start(t = 0) {
        if (!Number.isFinite(t)) throw new TypeError('start time');
        this.t = t;
        ctx.started.push(this);
      },
      stop(t = 0) {
        if (!Number.isFinite(t)) throw new TypeError('stop time');
        this.stopAt = t;
      },
      ...extra,
    });
  Object.assign(ctx, {
    destination: node(),
    createOscillator: () => src('osc', { type: 'sine', frequency: param(440), detune: param(0) }),
    createBufferSource: () => src('buf', { buffer: null, loop: false, playbackRate: param(1) }),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createConvolver: () => node({ buffer: null }),
    createDelay: () => node({ delayTime: param(0) }),
    createStereoPanner: () => node({ pan: param(0) }),
    createBuffer: (ch, len, sr) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i) => data[i] };
    },
  });
  return ctx;
}

// Seeded Math.random for repeatable counts.
function withSeed(fn, seed = 7) {
  const orig = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

async function engine(prefs = {}) {
  const ctx = mockContext();
  const a = createAudio(() => prefs, { context: ctx });
  assert.equal(await a.unlock(), true);
  return { a, ctx };
}

// Voices created over one bar of steps at time t0.
function barVoices(a, bar = 0, t0 = 1) {
  const v0 = a.debug().voices;
  const P = a.beat.period / 4;
  for (let s = 0; s < 16; s++) a._step(bar * 16 + s, t0 + s * P);
  return a.debug().voices - v0;
}

test('engine: tempo and layer count follow setScore (and eat, for the current shell)', async () => {
  const { a } = await engine();
  assert.equal(a.beat.bpm, 112);
  for (let score = 0; score <= 60; score += 5) {
    a.setScore(score);
    const st = Math.min(10, score / 5);
    assert.equal(a.debug().stage, st);
    assert.equal(a.beat.bpm, stageBpm(st));
    a.setTimeline('disco');
    assert.equal(a.debug().layerCount, st + 2);
    a.setTimeline('lcd');
    assert.equal(a.debug().layerCount, 1);
    a.setTimeline('abyss');
    assert.equal(a.debug().layerCount, Math.min(st, 4) + 2);
  }
  a.setScore(0);
  a.eat(25); // legacy order: setChaos, setTimeline, cut, eat(score)
  assert.equal(a.debug().stage, 5);
  assert.equal(a.beat.bpm, 132);
  assert.equal(a.debug().errors, 0);
});

test('engine: voices per bar grow with the stage; lcd stays at clicks; abyss stops at stage 4', async () => {
  const counts = {};
  for (const id of ['arcade', 'acid', 'lane', 'hangar', 'mushroom', 'castle', 'lcd', 'abyss']) {
    counts[id] = [];
    for (let s = 0; s <= 10; s++) {
      const { a } = await engine();
      a.setScore(s * 5);
      a.setTimeline(id);
      counts[id].push(withSeed(() => barVoices(a, 1) + barVoices(a, 3, 3)));
      assert.equal(a.debug().errors, 0, `${id} stage ${s}`);
    }
  }
  for (const id of ['arcade', 'acid', 'lane', 'hangar', 'mushroom', 'castle']) {
    assert.ok(counts[id][10] > counts[id][0] * 3, `${id}: ${counts[id]}`);
    for (let s = 1; s <= 8; s++) assert.ok(counts[id][s] >= counts[id][s - 1], `${id} stage ${s}: ${counts[id]}`);
  }
  assert.ok(counts.lcd.every((n) => n === counts.lcd[0]), `lcd ${counts.lcd}`);
  assert.equal(counts.lcd[0], 8, 'two bars of four clicks');
  for (let s = 5; s <= 10; s++) assert.equal(counts.abyss[s], counts.abyss[4], `abyss ${counts.abyss}`);
});

test('engine: every universe has a bite voice and a kit, shift() is a drop for each', async () => {
  for (const id of TIMELINE_IDS) {
    const { a, ctx } = await engine();
    a.setScore(12);
    a.start();
    a.shift({ from: 'lcd', to: id, look: '2d' });
    const v0 = a.debug().voices;
    a.eat(12);
    assert.ok(a.debug().voices > v0, `${id} bite voice`);
    assert.equal(a.debug().timeline, id);
    ctx.currentTime = 0.5;
    a._tick();
    assert.equal(a.debug().errors, 0, id);
    a.stop();
  }
});

test('engine: the drop leaves a sixteenth of silence, then the impact', async () => {
  const { a, ctx } = await engine();
  a.setScore(15); // stage 3
  a.setTimeline('disco');
  const v0 = a.debug().voices;
  a.shift({ from: 'disco', to: 'acid', look: '2d', swing: false });
  const d = a.debug().lastDrop;
  assert.equal(d.gapSteps, 1);
  assert.equal(d.stutter, false);
  assert.equal(d.id, 'acid');
  const impactAt = ctx.started.filter((s) => s.t > 0.01);
  assert.ok(impactAt.length >= 2, 'sub and crash after the gap');
  near(Math.min(...impactAt.map((s) => s.t)), d.at + a.beat.period / 4, 1e-6);
  assert.ok(a.debug().voices > v0);
  const inGap = d.at + a.beat.period / 8;
  const before = a.debug().voices;
  a._step(0, inGap);
  assert.equal(a.debug().voices, before, 'kick inside the gap is skipped');
  a._step(0, d.at + a.beat.period / 4 + 0.01);
  assert.ok(a.debug().voices > before, 'kit plays again right after');
});

test('engine: from stage 8 the gap is a stutter and the groove keeps playing', async () => {
  const { a } = await engine();
  a.setScore(40);
  a.setTimeline('kombat');
  a.shift({ from: 'kombat', to: 'bunker', look: '2d' });
  const d = a.debug().lastDrop;
  assert.equal(d.stutter, true);
  assert.equal(d.gapSteps, 0.75);
  const before = a.debug().voices;
  a._step(0, d.at + 0.005);
  assert.ok(a.debug().voices > before, 'not silent');
  a.shift({ from: 'bunker', to: 'arcade', look: '3d' }); // immediately again: faster than a bar
  assert.equal(a.debug().lastDrop.gapSteps, 0.375);
  assert.equal(a.debug().look, '3d');
});

test('engine: a shift cancels the queued old-kit steps and keeps the bar position', async () => {
  const { a, ctx } = await engine();
  a.setScore(30);
  a.setTimeline('disco');
  a.start();
  ctx.currentTime = 0.02;
  for (let s = 0; s < 8; s++) a._step(s, 0.1 + s * 0.1); // as if queued ahead
  const queued = ctx.started.filter((s) => s.t >= 0.1);
  a.shift({ from: 'disco', to: 'castle', look: '2d' });
  assert.ok(a.debug().cancelled >= queued.length);
  for (const s of queued) assert.ok(s.stopAt <= s.t, 'stopped before it starts');
  assert.equal(a.debug().timeline, 'castle');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('engine: life lost = tape stop, muffled wait, snap back on respawned()', async () => {
  const { a, ctx } = await engine();
  a.setScore(20);
  a.setTimeline('hangar');
  a.start();
  ctx.currentTime = 0.4;
  a._step(0, 0.3); // something sounding to bend
  a.setLives(2);
  a.lifeLost();
  assert.equal(a.debug().waiting, true);
  const v = a.debug().voices;
  a._step(4, 0.6); // inside the tape stop
  assert.equal(a.debug().voices, v, 'nothing new during the tape stop');
  a._dials(1.2);
  assert.equal(a.debug().hunger, 0, 'no hunger while waiting');
  ctx.currentTime = 1.2;
  const v2 = a.debug().voices;
  a._step(8, 1.3); // after the tape: plays, muffled
  assert.ok(a.debug().voices > v2);
  a.respawned();
  assert.equal(a.debug().waiting, false);
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('engine: heartbeat and detune only on the last life; heart plays through the wait', async () => {
  const { a, ctx } = await engine();
  a.setScore(10);
  a.setTimeline('acid');
  a.start();
  a.setLives(3);
  for (let s = 0; s < 16; s++) a._step(s, 1 + s * 0.1);
  assert.equal(a.debug().hearts, 0);
  a.setLives(1);
  for (let s = 16; s < 32; s++) a._step(s, 3 + s * 0.1);
  assert.equal(a.debug().hearts, 2);
  const detuned = ctx.started.filter((s) => s.t >= 4.6 && s.kind === 'osc' && s._det !== 0);
  assert.ok(detuned.length > 0, 'music slightly detuned');
  ctx.currentTime = 7;
  a.lifeLost();
  a._step(32, 7.05);
  assert.equal(a.debug().hearts, 3, 'heart keeps beating under the tape stop');
  a.setLives(0);
  a._step(40, 8);
  assert.equal(a.debug().hearts, 3);
  a.setLives(99);
  assert.equal(a.debug().lives, 5);
  a.setLives('x');
  assert.equal(a.debug().lives, 5);
  a.stop();
});

test('engine: hunger builds without a bite and is released by the bite', async () => {
  const { a, ctx } = await engine();
  a.setTimeline('arcade');
  a.start();
  a._dials(0.5);
  assert.equal(a.debug().hunger, 0);
  a._dials(3.5);
  near(a.debug().hunger, 0.5, 0.01);
  a._dials(7);
  assert.equal(a.debug().hunger, 1);
  ctx.currentTime = 7;
  a.shift({ from: 'arcade', to: 'acid', look: '2d' });
  a._dials(7.6);
  assert.equal(a.debug().hunger, 0);
  a.setTimeline('lcd');
  a._dials(20);
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('engine: lcd arrival is a silent drop, life gained plays its figure', async () => {
  const { a } = await engine();
  a.setScore(30);
  a.setTimeline('disco');
  const v0 = a.debug().voices;
  a.shift({ from: 'disco', to: 'lcd', look: '2d', swing: true });
  assert.equal(a.debug().voices, v0, 'no impact into lcd');
  a.lifeGained();
  assert.equal(a.debug().voices - v0, LIFE_FIGURE.length * 2);
  a.setLook('pov');
  assert.equal(a.debug().look, 'pov');
  assert.equal(a.debug().errors, 0);
});

test('engine: muted schedules nothing new; every method stays safe', async () => {
  const { a } = await engine({ muted: true });
  assert.equal(a.muted, true);
  a.setScore(50);
  a.start();
  const v0 = a.debug().voices;
  a.shift({ from: 'lcd', to: 'disco', look: 'pov', swing: true });
  a.eat(50);
  a.lifeLost();
  a.respawned();
  a.lifeGained();
  a.cut({ swing: true });
  a._step(0, 1);
  assert.equal(a.debug().voices, v0);
  a.setMuted(false);
  a.eat(51);
  assert.ok(a.debug().voices > v0);
  a.die();
  assert.equal(a.debug().errors, 0);
});

test('new methods are safe without Web Audio and before unlock', async () => {
  const a = createAudio(() => ({ reducedFlash: true }));
  for (const fn of [() => a.setScore(33), () => a.setScore('junk'), () => a.shift(), () => a.shift({ from: 'x', to: 'castle', look: 'pov', swing: true }), () => a.shift(null), () => a.setLives(1), () => a.setLives(), () => a.lifeLost(), () => a.respawned(), () => a.lifeGained(), () => a.setLook('3d'), () => a.setLook(42)]) {
    assert.doesNotThrow(fn);
  }
  assert.equal(a.debug().stage, 6);
  assert.equal(a.beat.bpm, 136);
  assert.equal(a.debug().timeline, 'castle');
  assert.equal(await a.unlock(), false);
  a.start();
  assert.equal(a.beat.running, true);
  a.shift({ from: 'castle', to: 'abyss', look: '2d' });
  a.die();
  assert.equal(a.beat.running, false);
  const b = createAudio(() => {
    throw new Error('prefs broken');
  });
  b.setScore(9);
  b.shift({ to: 'lane' });
  b.lifeLost();
  b.respawned();
  b.stop();
});
