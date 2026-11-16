import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBeat } from '../src/beat.js';
import { createAudio } from '../src/audio.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

function fakeClock(start = 0) {
  const c = { t: start };
  c.fn = () => c.t;
  return c;
}

test('defaults: 132 BPM, idle until started', () => {
  const b = createBeat();
  assert.equal(b.bpm, 132);
  near(b.period, 60 / 132);
  assert.equal(b.running, false);
  assert.equal(b.index(), 0);
  assert.equal(b.phase(), 0);
  assert.equal(b.pulse(), 0);
});

test('index and phase follow the time source', () => {
  const c = fakeClock(10);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  assert.equal(b.running, true);
  assert.equal(b.index(), 0);
  assert.equal(b.phase(), 0);
  assert.equal(b.pulse(), 1);
  c.t = 10 + b.period * 3.25;
  assert.equal(b.index(), 3);
  near(b.phase(), 0.25, 1e-9);
  c.t = 10 + b.period * 100.5;
  assert.equal(b.index(), 100);
  near(b.phase(), 0.5, 1e-6);
});

test('pulse is 1 on the beat and decays through it', () => {
  const c = fakeClock(0);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  let prev = Infinity;
  for (let i = 0; i < 20; i++) {
    c.t = (b.period * i) / 20;
    const p = b.pulse();
    assert.ok(p <= 1 && p >= 0);
    assert.ok(p < prev, 'decays monotonically');
    prev = p;
  }
  c.t = b.period * 0.999;
  assert.ok(b.pulse() < 0.01, 'nearly gone before the next beat');
  c.t = b.period * 7;
  assert.equal(b.pulse(), 1, 'back to 1 on the next beat');
});

test('custom bpm', () => {
  const c = fakeClock(0);
  const b = createBeat({ bpm: 120 });
  b.setTimeSource(c.fn);
  b.start();
  c.t = 5; // 10 beats at 120 BPM
  assert.equal(b.index(), 10);
  const bad = createBeat({ bpm: -3 });
  assert.equal(bad.bpm, 132);
});

test('switching time source while running keeps the position', () => {
  const frame = fakeClock(100);
  const audio = fakeClock(3);
  const b = createBeat();
  b.setTimeSource(frame.fn);
  b.start();
  frame.t = 100 + b.period * 5.4;
  const before = b.position();
  b.setTimeSource(audio.fn);
  near(b.position(), before, 1e-9);
  audio.t += b.period;
  near(b.position(), before + 1, 1e-9);
  assert.equal(b.index(), 6);
});

test('small backward jitter is held, never goes back', () => {
  const c = fakeClock(0);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  c.t = 1.0;
  const p1 = b.position();
  c.t = 0.95;
  assert.equal(b.position(), p1);
  c.t = 1.1;
  assert.ok(b.position() > p1);
});

test('big backward jump (resumed audio clock) rebases and continues', () => {
  const c = fakeClock(0);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  c.t = 8;
  const p1 = b.position();
  c.t = 2; // context was suspended for 6 s
  near(b.position(), p1, 1e-9);
  c.t = 2 + b.period;
  near(b.position(), p1 + 1, 1e-9);
});

test('broken source falls back to the frame clock without throwing', () => {
  const b = createBeat();
  let broken = false;
  b.setTimeSource(() => {
    if (broken) throw new Error('gone');
    return performance.now() / 1000;
  });
  b.start();
  broken = true;
  assert.doesNotThrow(() => b.pulse());
  assert.ok(Number.isFinite(b.position()));
  b.setTimeSource(() => NaN);
  assert.ok(Number.isFinite(b.phase()));
  b.setTimeSource('not a function');
  assert.ok(Number.isFinite(b.index()));
});

test('start is idempotent, stop resets, restart begins at beat 0', () => {
  const c = fakeClock(0);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  c.t = b.period * 4.5;
  b.start();
  assert.equal(b.index(), 4, 'second start does not reset');
  b.stop();
  assert.equal(b.running, false);
  assert.equal(b.pulse(), 0);
  assert.equal(b.index(), 0);
  c.t = 50;
  b.start();
  assert.equal(b.index(), 0);
  assert.equal(b.pulse(), 1);
});

test('timeAt and position agree', () => {
  const c = fakeClock(20);
  const b = createBeat();
  b.setTimeSource(c.fn);
  b.start();
  near(b.timeAt(0), 20);
  near(b.timeAt(8), 20 + 8 * b.period);
  near(b.position(b.timeAt(3.5)), 3.5, 1e-9);
});

test('default frame clock runs', async () => {
  const b = createBeat();
  b.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(b.position() > 0);
  b.stop();
});

test('audio.js: every method is safe without Web Audio', async () => {
  const a = createAudio(() => ({ reducedFlash: false, reducedMotion: false }));
  assert.equal(await a.unlock(), false);
  a.setMuted(true);
  a.setMuted(false);
  for (const id of ['lcd', 'acid', 'disco', 'arcade', 'kombat', 'plastic', 'bunker', 'court', 'timewarp', 'wrong', 'desktop', 'court-pov', 'nope', null]) {
    a.setTimeline(id);
    a.eat(3);
  }
  a.setChaos(2);
  a.setChaos(NaN);
  a.cut({ swing: true });
  a.cut();
  a.start();
  assert.equal(a.beat.running, true, 'beat follows the frame clock without audio');
  assert.ok(a.beat.pulse() > 0);
  a.die();
  assert.equal(a.beat.running, false);
  a.start();
  a.stop();
  const b = createAudio(() => {
    throw new Error('prefs broken');
  });
  b.eat(1);
  b.start();
  b.stop();
  const c = createAudio();
  c.cut();
  c.stop();
});
