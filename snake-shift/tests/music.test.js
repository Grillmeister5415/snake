// The audio engine against a minimal mock AudioContext (SOUND_PLAN 5): what it schedules, what it
// cancels, and that every method stays safe. The pure decisions are in tests/arrange.test.js.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, TIMELINE_IDS, NEW_IDS, LIFE_FIGURE, universeId, lookPlan, lifeFigure, tempoOf, paceOf } from '../src/audio.js';

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

// Every engine is stopped at the end, so a failed assertion never leaves its timer running.
const engines = [];
after(() => engines.forEach((a) => a.stop()));
async function engine(prefs = {}, seed = 5) {
  const ctx = mockContext();
  const trace = [];
  const a = createAudio(() => prefs, { context: ctx, seed, trace });
  engines.push(a);
  assert.equal(await a.unlock(), true);
  return { a, ctx, trace };
}
// Advance the mock clock, running the scheduler like the 25 ms timer would.
function run(a, ctx, to, dt = 0.025) {
  for (let t = ctx.currentTime; t < to; t += dt) {
    ctx.currentTime = t;
    a._tick();
  }
  ctx.currentTime = to;
  a._tick();
}
const GAME = (score) => ({ stepMs: Math.max(95, 150 - 1.5 * score), startMs: 150, capMs: 95, score, length: 3 + score });
const hitsOf = (trace, t0, t1 = Infinity) => trace.filter((e) => e.hits && e.t >= t0 && e.t < t1);
const has = (trace, name, t0 = 0, t1 = Infinity) => hitsOf(trace, t0, t1).filter((e) => e.hits.split(' ').includes(name)).length;

test('the pure API stays reachable through audio.js', () => {
  assert.equal(TIMELINE_IDS.length, 16);
  for (const id of NEW_IDS) assert.ok(TIMELINE_IDS.includes(id), id);
  assert.equal(universeId('court-pov'), 'court');
  assert.equal(universeId('nope'), 'arcade');
  assert.deepEqual(lookPlan('2d'), { look: '2d', send: 0, drone: 0, whoosh: false });
  assert.ok(lookPlan('pov').send > lookPlan('3d').send && lookPlan('pov').drone > 0);
});

test('life-gained figure is its own: short, strictly rising, not the familiar jingle', () => {
  const f = lifeFigure();
  assert.equal(f.length, LIFE_FIGURE.length);
  for (let i = 1; i < f.length; i++) {
    assert.ok(f[i].semi > f[i - 1].semi);
    assert.ok(f[i].at > f[i - 1].at);
  }
  const last = f.at(-1);
  assert.ok(last.at + last.dur < 0.8);
  assert.notDeepEqual(f.slice(1).map((n, i) => n.semi - f[i].semi).slice(0, 5), [3, 9, -4, 2, 5]);
});

test('pace: setGameplay sets tempo and level, snaps before the run, glides during it; danger never moves the tempo', async () => {
  const { a, ctx } = await engine();
  a.setTimeline('arcade');
  a.setGameplay(GAME(0));
  assert.ok(Math.abs(a.beat.bpm - tempoOf(paceOf(GAME(0)))) < 0.01);
  assert.equal(a.debug().level, 0);
  a.setGameplay(GAME(37));
  assert.ok(a.beat.bpm > 136, `snapped before the run: ${a.beat.bpm}`);
  assert.equal(a.debug().level, 3);
  a.start();
  a.setGameplay(GAME(0));
  run(a, ctx, 0.3);
  assert.ok(a.beat.bpm > 130, `glides, no jump: ${a.beat.bpm}`);
  run(a, ctx, 12);
  assert.ok(a.beat.bpm < 119.5, `settles: ${a.beat.bpm}`);
  const bpm = a.beat.bpm;
  a.setGameplay({ pressure: 1 });
  run(a, ctx, 14);
  assert.equal(a.beat.bpm, bpm, 'danger leaves the tempo alone');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('danger: fast attack and slower release on the audio clock, hysteresis, clear', async () => {
  const { a, ctx } = await engine();
  a.setGameplay(GAME(15));
  a.start();
  run(a, ctx, 1);
  a.setGameplay({ pressure: 0.7 });
  run(a, ctx, 1.2);
  assert.equal(a.debug().dangerState, 1, `tense within 200 ms (${a.debug().danger})`);
  a.setGameplay({ pressure: 0 });
  run(a, ctx, 1.4);
  assert.equal(a.debug().dangerState, 1, 'hysteresis holds it a moment');
  run(a, ctx, 2.6);
  assert.ok(a.debug().danger < 0.25 && a.debug().dangerState === 0, `released within 1.4 s (${a.debug().danger})`);
  a.setGameplay({ pressure: 0.95 });
  run(a, ctx, 3);
  assert.equal(a.debug().dangerState, 2);
  a.setGameplay({ clear: true });
  assert.equal(a.debug().danger, 0);
  assert.equal(a.debug().dangerState, 0);
  a.setGameplay({ pressure: 0.95 });
  a.bite({ score: 16, from: 'disco', to: 'disco', held: true });
  run(a, ctx, 3.3);
  assert.equal(a.debug().dangerState, 2, 'a bite never resets danger');
  a.stop();
  assert.equal(a.debug().danger, 0, 'stop clears it');
  const r = await engine({ reducedAudio: true });
  r.a.setGameplay(GAME(15));
  r.a.start();
  r.a.setGameplay({ pressure: 0.95 });
  run(r.a, r.ctx, 2);
  assert.ok(r.a.debug().danger < 0.33, 'calmer sound: a third of the depth');
  assert.equal(r.a.debug().dangerState, 0);
  r.a.stop();
});

test('every universe has a kit, a gesture and a bite voice', async () => {
  for (const id of TIMELINE_IDS) {
    const { a, ctx, trace } = await engine();
    a.setGameplay(GAME(12));
    a.start();
    run(a, ctx, 0.5);
    const v0 = a.debug().voices;
    a.bite({ score: 13, from: 'acid', to: id, look: '2d', prevLook: '2d' });
    assert.ok(a.debug().voices > v0, `${id} bite voice`);
    assert.equal(a.debug().timeline, id);
    run(a, ctx, 5);
    const after = hitsOf(trace, 0.6);
    assert.ok(after.length > 0, id);
    if (id === 'lcd') assert.ok(after.every((e) => e.hits === 'click'), 'lcd: clicks only');
    else if (id !== 'wrong') {
      assert.ok(after.every((e) => e.id === id), `${id}: the new kit only`);
      assert.ok(has(trace, 'gesture', 0.6) > 0, `${id} gesture`);
      assert.ok(has(trace, 'kick', 0.6) + has(trace, 'kickAcc', 0.6) > 0, `${id} pulse`);
    }
    assert.equal(a.debug().errors, 0, id);
    a.stop();
  }
});

test('a held bite cancels nothing, leaves no gap and keeps the kick grid', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(30));
  a.start();
  a.shift({ from: 'lcd', to: 'disco', look: '3d' });
  run(a, ctx, 2);
  const c0 = a.debug().cancelled;
  const g0 = a.debug().gaps;
  const queued = ctx.started.filter((s) => s.t > 2);
  a.bite({ score: 31, from: 'disco', to: 'disco', held: true, look: '3d', prevLook: '3d' });
  assert.equal(a.debug().cancelled, c0);
  assert.equal(a.debug().gaps, g0);
  assert.equal(a.debug().lastBite.kind, 'held');
  for (const s of queued) assert.ok(!(s.stopAt <= s.t), 'queued notes still play');
  run(a, ctx, 6);
  const beatSec = 60 / a.beat.bpm;
  const kicks = hitsOf(trace, 1, 6).filter((e) => /kick/.test(e.hits)).map((e) => e.t);
  for (let i = 1; i < kicks.length; i++) assert.ok(Math.abs(kicks[i] - kicks[i - 1] - beatSec) < 0.02, `kick grid at ${kicks[i]}`);
  a.stop();
});

test('a change swaps the kit on the next grid step, keeps the bar position, answers with the motif', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(30));
  a.start();
  a.shift({ from: 'lcd', to: 'disco', look: '3d' });
  run(a, ctx, 2);
  const pos = a.beat.position(2) * 4;
  const queued = ctx.started.filter((s) => s.t > 2.004);
  assert.ok(queued.length > 0);
  const mark = trace.length;
  a.bite({ score: 31, from: 'disco', to: 'castle', look: '3d', prevLook: '3d' });
  assert.equal(a.debug().lastBite.kind, 'change');
  for (const s of queued) assert.ok(s.stopAt <= s.t, 'old-kit notes stopped before they start');
  assert.ok(a.debug().nextStep >= Math.ceil(pos - 1e-6) && a.debug().nextStep <= Math.ceil(pos) + 1, 'the bar position carries on');
  assert.equal(a.debug().answers, 1);
  run(a, ctx, 4);
  const after = trace.slice(mark).filter((e) => e.hits);
  assert.ok(after.length && after.every((e) => e.id === 'castle'), 'scheduled after the bite: the new kit only');
  const steps = after.map((e) => e.step);
  assert.equal(new Set(steps).size, steps.length, 'no duplicate steps');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('major: a vacuum then the impact; the cooldown keeps majors apart; rapid bites get lighter', async () => {
  const { a, ctx } = await engine();
  a.setGameplay(GAME(12));
  a.start();
  a.shift({ from: 'lcd', to: 'arcade' });
  run(a, ctx, 3);
  a.bite({ score: 13, from: 'arcade', to: 'disco', swing: true, look: '3d', prevLook: '2d' });
  const b = a.debug().lastBite;
  assert.equal(b.kind, 'major');
  assert.equal(a.debug().gaps, 1);
  const v = a.debug().voices;
  a._step(9999, b.at + 0.01);
  assert.equal(a.debug().voices, v, 'nothing plays inside the vacuum');
  ctx.currentTime += 0.3;
  a.bite({ score: 14, from: 'disco', to: 'kombat', swing: true });
  assert.equal(a.debug().lastBite.kind, 'change', 'too soon for another major');
  assert.equal(a.debug().lastBite.rapid, true);
  const w1 = a.debug().lastBite.weight;
  ctx.currentTime += 0.3;
  a.bite({ score: 15, from: 'kombat', to: 'acid' });
  assert.ok(a.debug().lastBite.weight < w1, 'lighter again');
  const answers = a.debug().answers;
  assert.equal(answers, 1, 'rapid bites get no answer');
  run(a, ctx, ctx.currentTime + (60 / a.beat.bpm) * 17);
  a.bite({ score: 17, from: 'acid', to: 'plastic', swing: true });
  assert.equal(a.debug().lastBite.kind, 'major');
  assert.equal(a.debug().majors, 2);
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('pause and resume: the beat restarts, and nothing from before blocks gestures or majors', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(20));
  a.start();
  a.shift({ from: 'lcd', to: 'arcade' });
  run(a, ctx, 30);
  a.bite({ score: 21, from: 'arcade', to: 'disco', swing: true });
  assert.equal(a.debug().lastBite.kind, 'major');
  run(a, ctx, 30.5);
  a.setGameplay({ clear: true });
  a.stop();
  ctx.currentTime = 33;
  a.start();
  const mark = trace.length;
  run(a, ctx, 37);
  assert.ok(trace.slice(mark).some((e) => e.hits && e.hits.includes('gesture')), 'gestures play after the resume');
  a.bite({ score: 22, from: 'disco', to: 'kombat', swing: true });
  assert.equal(a.debug().lastBite.kind, 'major', 'no cooldown left over from the old beat');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('LCD: a hard stop with no impact, then clicks at the same bar position', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(40));
  a.start();
  a.shift({ from: 'lcd', to: 'bunker', look: '3d' });
  run(a, ctx, 3);
  const n0 = ctx.started.length;
  const mark = trace.length;
  a.bite({ score: 41, from: 'bunker', to: 'lcd', reset: true, swing: true, look: '2d', prevLook: '3d' });
  assert.equal(a.debug().lastBite.kind, 'lcd');
  const fresh = ctx.started.slice(n0);
  assert.ok(fresh.every((s) => s.kind === 'buf' || s.type === 'square'), 'only the dry LCD bite and clicks: no impact, no crash');
  assert.equal(a.debug().gaps, 0);
  run(a, ctx, 5);
  const after = trace.slice(mark).filter((e) => e.hits);
  assert.ok(after.length >= 3 && after.every((e) => e.hits === 'click'));
  for (const e of after) assert.equal(e.step % 4, 0, 'clicks on the beat');
  a.stop();
});

test('Abyss: a soft bloom into half-time, no crash, no vacuum', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(30));
  a.start();
  a.shift({ from: 'lcd', to: 'disco' });
  run(a, ctx, 2);
  a.bite({ score: 31, from: 'disco', to: 'abyss', swing: true, look: '3d', prevLook: '3d' });
  assert.equal(a.debug().lastBite.kind, 'abyss');
  assert.equal(a.debug().gaps, 0);
  run(a, ctx, 8);
  const after = hitsOf(trace, 2.01);
  assert.ok(after.length > 0 && after.every((e) => e.step % 2 === 0), 'half-time grid');
  assert.equal(has(trace, 'hat16', 2.01), 0);
  a.stop();
});

test('life lost: tape stop, a muffled wait with pulse and anchor only, a decisive respawn', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(20));
  a.setLives(2);
  a.start();
  a.shift({ from: 'lcd', to: 'hangar', look: '3d' });
  run(a, ctx, 2);
  a.setGameplay({ pressure: 0.9 });
  run(a, ctx, 2.5);
  a.setGameplay({ clear: true });
  a.setLives(1);
  a.lifeLost();
  assert.equal(a.debug().waiting, true);
  assert.equal(a.debug().danger, 0);
  run(a, ctx, 6);
  const wait = hitsOf(trace, 3.2, 6);
  assert.ok(wait.length > 0);
  for (const e of wait) for (const h of e.hits.split(' ')) assert.ok(['kick', 'bass', 'heart'].includes(h), `waiting plays ${h}`);
  a.respawned();
  assert.equal(a.debug().waiting, false);
  run(a, ctx, 7);
  assert.ok(has(trace, 'kickAcc', 6) >= 1, 'the first kick back is accented');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('last life: a heartbeat once a bar and the nerve voice; no global detune', async () => {
  const { a, ctx, trace } = await engine();
  a.setGameplay(GAME(10));
  a.setLives(3);
  a.start();
  a.shift({ from: 'lcd', to: 'acid' });
  run(a, ctx, 2);
  assert.equal(a.debug().hearts, 0);
  a.setLives(1);
  const bar = (4 * 60) / a.beat.bpm;
  run(a, ctx, 2 + bar * 4);
  assert.ok(a.debug().hearts >= 3 && a.debug().hearts <= 5, `${a.debug().hearts} hearts in four bars`);
  assert.ok(has(trace, 'nerve', 2) >= 1);
  const sour = ctx.started.filter((s) => s.kind === 'osc' && s._det <= -10);
  assert.equal(sour.length, 0, 'no last-life detune');
  a.stop();
  const r = await engine({ reducedFlash: true });
  r.a.setGameplay(GAME(10));
  r.a.setLives(1);
  r.a.start();
  run(r.a, r.ctx, 6);
  assert.ok(r.a.debug().hearts > 0, 'a soft heartbeat stays');
  assert.equal(has(r.trace, 'nerve'), 0, 'reduced: no nerve');
  r.a.stop();
});

test('life gained on a bite: the figure plays, the bite voice is lighter, nothing breaks', async () => {
  const { a, ctx } = await engine();
  a.setGameplay(GAME(20));
  a.start();
  a.shift({ from: 'lcd', to: 'mushroom', look: '3d' });
  run(a, ctx, 2);
  const v0 = a.debug().voices;
  a.setLives(4);
  a.lifeGained();
  assert.equal(a.debug().voices - v0, LIFE_FIGURE.length * 2);
  a.bite({ score: 21, kind: 'mushroom', from: 'mushroom', to: 'mushroom', held: true, lifeGained: true });
  assert.equal(a.debug().lastBite.kind, 'held');
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('muted schedules nothing new; every method stays safe', async () => {
  const { a } = await engine({ muted: true });
  assert.equal(a.muted, true);
  a.setGameplay(GAME(50));
  a.start();
  const v0 = a.debug().voices;
  a.bite({ score: 51, from: 'lcd', to: 'disco', look: 'pov', swing: true });
  a.shift({ from: 'disco', to: 'acid' });
  a.lifeLost();
  a.respawned();
  a.lifeGained();
  a.eat(50);
  a.cut({ swing: true });
  a._step(0, 1);
  assert.equal(a.debug().voices, v0);
  a.setMuted(false);
  a.bite({ score: 52, from: 'acid', to: 'arcade' });
  assert.ok(a.debug().voices > v0);
  a.die();
  assert.equal(a.debug().errors, 0);
});

test('an interrupted context schedules nothing, and start() asks it to resume', async () => {
  const { a, ctx } = await engine();
  let resumed = 0;
  ctx.resume = () => { resumed++; ctx.state = 'running'; return Promise.resolve(); };
  a.setGameplay(GAME(10));
  a.start();
  run(a, ctx, 1);
  ctx.state = 'interrupted';
  const v0 = a.debug().voices;
  run(a, ctx, 2);
  a.bite({ score: 11, from: 'arcade', to: 'disco' });
  a.setGameplay({ pressure: 0.5 });
  assert.equal(a.debug().voices, v0, 'nothing while interrupted');
  a.stop();
  a.start();
  assert.equal(resumed, 1);
  assert.equal(ctx.state, 'running');
  run(a, ctx, 3);
  assert.ok(a.debug().voices > v0);
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('the voice budget holds in a dense run', async () => {
  const { a, ctx } = await engine();
  a.setGameplay(GAME(60));
  a.setLives(1);
  a.start();
  a.setGameplay({ pressure: 0.9 });
  const worlds = ['bunker', 'hangar', 'castle', 'plastic', 'lane', 'abyss', 'disco', 'wrong'];
  for (let i = 0; i < 40; i++) {
    a.bite({ score: 61 + i, from: worlds[i % 8], to: worlds[(i + 1) % 8], swing: i % 3 === 0, look: i % 2 ? 'pov' : '3d', prevLook: '2d' });
    run(a, ctx, ctx.currentTime + 0.35);
  }
  assert.ok(a.debug().maxActive <= 96 + 8, `${a.debug().maxActive}`);
  assert.equal(a.debug().errors, 0);
  a.stop();
});

test('new and old methods are safe without Web Audio, before unlock and with junk', async () => {
  const a = createAudio(() => ({ reducedFlash: true }));
  engines.push(a);
  const junk = [undefined, null, 42, 'x', [], { stepMs: 'fast', pressure: 'high', clear: 'yes' }, { score: NaN, from: {}, to: 7, look: null }];
  for (const j of junk) {
    assert.doesNotThrow(() => a.setGameplay(j));
    assert.doesNotThrow(() => a.bite(j));
    assert.doesNotThrow(() => a.shift(j));
  }
  for (const fn of [() => a.setScore(33), () => a.setScore('junk'), () => a.setLives(1), () => a.setLives(), () => a.lifeLost(), () => a.respawned(), () => a.lifeGained(), () => a.setLook('3d'), () => a.setLook(42), () => a.setTimeline('castle'), () => a.eat(3), () => a.cut(), () => a.setChaos(9)]) {
    assert.doesNotThrow(fn);
  }
  assert.equal(a.debug().timeline, 'castle');
  assert.equal(a.debug().errors, 0);
  assert.equal(await a.unlock(), false);
  a.setGameplay(GAME(37));
  a.start();
  assert.equal(a.beat.running, true);
  assert.ok(a.beat.bpm > 136, 'tempo follows pace without audio too');
  a.bite({ score: 38, from: 'castle', to: 'abyss', look: '2d' });
  a.die();
  assert.equal(a.beat.running, false);
  const b = createAudio(() => {
    throw new Error('prefs broken');
  });
  b.setGameplay(GAME(9));
  b.bite({ to: 'lane' });
  b.lifeLost();
  b.respawned();
  b.stop();
  assert.equal(b.debug().errors, 0);
});
