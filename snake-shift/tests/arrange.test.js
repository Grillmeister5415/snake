// Pure music decisions (SOUND_PLAN 2, 5): pace, tempo, level, arrangement, motif and harmony,
// bite classification, anticipation, danger envelope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMELINE_IDS, WORLDS, WRONG_POOL, PROG, MOTIF, DANGER, COOLDOWN, paceOf, tempoOf, levelOf, musicGainOf, arrangement, sectionOf,
  stepHits, gestureIndex, barRoot, chordOf, motifNote, bassNote, biteMidi, classifyBite, anticipationAt,
  smoothDanger, dangerState, universeId,
} from '../src/arrange.js';

const pc = (n) => ((n % 12) + 12) % 12;
function barHits(id, level, o = {}, bars = 2, from = 0) {
  const p = arrangement(id, level, { reduced: !!o.reduced });
  const out = [];
  for (let i = from * 16; i < (from + bars) * 16 * (p.halfTime ? 2 : 1); i++) out.push(...stepHits(i, p, o));
  return out;
}
const count = (arr, name) => arr.filter((h) => h === name).length;

// ---- pace, tempo, level -------------------------------------------------------------------

test('pace follows the step interval inside the configured range', () => {
  const d = { startMs: 150, capMs: 95, length: 3 };
  assert.ok(paceOf({ ...d, stepMs: 150, score: 0 }) < 0.02);
  assert.ok(paceOf({ ...d, stepMs: 95, score: 37 }) >= 0.9);
  const mid = paceOf({ ...d, stepMs: 122.5, score: 18 });
  assert.ok(mid > 0.4 && mid < 0.5, `${mid}`);
  // An overridden range: the same step interval means something else.
  assert.ok(Math.abs(paceOf({ startMs: 300, capMs: 100, stepMs: 200, score: 0, length: 3 }) - (0.45 + 0.0075)) < 1e-9);
  // Start equal to cap (no ramp at all): full speed from the start.
  assert.ok(paceOf({ startMs: 120, capMs: 120, stepMs: 120, score: 0, length: 3 }) >= 0.9);
  // A flat curve (rampMs 0): only then does the score carry the pace.
  assert.ok(paceOf({ startMs: 150, capMs: 95, stepMs: 150, score: 50, length: 3 }) > 0.5);
  assert.ok(paceOf({ startMs: 150, capMs: 95, stepMs: 150, score: 0, length: 3 }) < 0.02);
  // Length lightens slightly after a respawn, at the same speed.
  assert.ok(paceOf({ ...d, stepMs: 95, score: 40, length: 3 }) < paceOf({ ...d, stepMs: 95, score: 40, length: 43 }));
  for (const junk of [undefined, {}, { stepMs: 'x' }, { stepMs: NaN, startMs: null }]) {
    const p = paceOf(junk);
    assert.ok(p >= 0 && p <= 1, `${JSON.stringify(junk)} → ${p}`);
  }
});

test('tempo 118 → 138 BPM; level never falls as pace rises; music level at most +1.5 dB', () => {
  assert.equal(tempoOf(0), 118);
  assert.equal(tempoOf(1), 138);
  assert.equal(tempoOf(7), 138);
  let lv = 0, bpm = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    assert.ok(levelOf(p) >= lv);
    assert.ok(tempoOf(p) >= bpm);
    lv = levelOf(p);
    bpm = tempoOf(p);
  }
  assert.deepEqual([0, 0.2, 0.5, 0.9].map(levelOf), [0, 1, 2, 3]);
  const db = 20 * Math.log10(musicGainOf(1) / musicGainOf(0));
  assert.ok(db > 1.4 && db <= 1.5 + 1e-9);
});

// ---- arrangement --------------------------------------------------------------------------

test('every non-LCD world has pulse, anchor and gesture at level 0', () => {
  for (const id of TIMELINE_IDS) {
    if (id === 'lcd' || id === 'wrong') continue;
    const h = barHits(id, 0, {}, 2);
    assert.ok(count(h, 'kick') > 0, `${id} pulse`);
    assert.ok(count(h, 'bass') + count(h, 'drone') + count(h, 'pad') > 0, `${id} anchor`);
    assert.ok(count(h, 'gesture') > 0, `${id} gesture`);
  }
  for (const id of WRONG_POOL) assert.ok(!['lcd', 'abyss', 'wrong'].includes(id));
  assert.deepEqual([...new Set(barHits('lcd', 3))], ['click']);
  assert.equal(arrangement('wrong', 2).mix, true);
});

test('half a bar carries the motif: a world entered mid-bar is heard within the next half bar', () => {
  for (const id of TIMELINE_IDS) {
    if (['lcd', 'wrong', 'abyss', 'court', 'desktop', 'hangar', 'kombat', 'castle'].includes(id)) continue;
    for (const from of [0, 8]) {
      const p = arrangement(id, 1);
      let n = 0;
      for (let s = from; s <= from + 8; s++) if (gestureIndex(p, s) >= 0) n++;
      assert.ok(n >= 1, `${id} from step ${from}`);
    }
  }
  assert.deepEqual(MOTIF.steps, [0, 3, 6, 8, 11, 14]);
});

test('levels add parts and never take any away (outside the section cycle)', () => {
  for (const id of ['arcade', 'disco', 'bunker', 'lane', 'mushroom']) {
    let prev = 0;
    for (let lv = 0; lv <= 2; lv++) {
      const n = barHits(id, lv, {}, 4).length;
      assert.ok(n >= prev, `${id} level ${lv}`);
      prev = n;
    }
    assert.ok(count(barHits(id, id === 'bunker' ? 2 : 1, {}, 2), 'snare') > 0, `${id}: backbeat from level 1 (Bunker: 2)`);
    assert.ok(count(barHits(id, 2, {}, 2), 'hat16') > 0, `${id}: sixteenths from level 2`);
    assert.equal(count(barHits(id, 2, {}, 4), 'fill'), 0);
    assert.ok(count(barHits(id, 3, {}, 4), 'fill') > 0, `${id}: fills at level 3`);
  }
});

test('section cycle from level 3: full, stripped, full, percussion forward; nothing louder', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((b) => sectionOf(b, 3)), ['full', 'full', 'strip', 'strip', 'full', 'full', 'perc', 'perc', 'full']);
  assert.equal(sectionOf(2, 2), 'full');
  const strip = barHits('disco', 3, {}, 1, 2);
  assert.equal(count(strip, 'snare'), 0);
  assert.equal(count(strip, 'hat16'), 0);
  assert.ok(count(strip, 'bass') > 0 && count(strip, 'kick') === 4 && count(strip, 'gesture') > 0, 'bass exposed, world still known');
});

test('abyss: half-time, its own ceiling, and pluck, call and drip all reachable', () => {
  const p = arrangement('abyss', 3);
  assert.equal(p.level, 2);
  assert.equal(p.halfTime, true);
  const h = barHits('abyss', 3, {}, 4);
  assert.equal(count(h, 'hat16'), 0);
  assert.equal(count(h, 'fill'), 0);
  assert.ok(count(h, 'gesture') > 0, 'pluck');
  assert.ok(count(h, 'orn') > 0, 'call');
  assert.ok(count(h, 'perc') > 0, 'drip');
  assert.ok(count(h, 'pad') > 0);
  // Danger adds no drums in the abyss.
  assert.equal(count(barHits('abyss', 2, { state: 2 }, 4), 'hat16'), 0);
  for (let i = 1; i < 64; i += 2) assert.deepEqual(stepHits(i, p), []);
});

test('danger roles: sixteenths when tense, gesture thins then drops when critical, a rub that resolves', () => {
  const calm = barHits('arcade', 0, { state: 0 });
  const tense = barHits('arcade', 0, { state: 1 });
  const crit = barHits('arcade', 0, { state: 2 });
  assert.equal(count(calm, 'hat16'), 0);
  assert.equal(count(tense, 'hat16'), 16);
  assert.ok(count(tense, 'gesture') > 0 && count(crit, 'gesture') === 0);
  assert.equal(count(crit, 'rub'), 4);
  assert.equal(count(tense, 'rub'), 0);
  assert.equal(count(calm, 'kick'), count(crit, 'kick'), 'the pulse never changes with danger');
  assert.equal(count(barHits('arcade', 2, { state: 1 }), 'orn'), 0, 'no ornaments when tense');
  assert.ok(count(barHits('arcade', 2, { state: 0 }), 'orn') > 0);
  assert.ok(count(barHits('arcade', 0, { resolve: true }), 'resolve') > 0);
  assert.equal(count(barHits('court', 1, { state: 1 }), 'ost') > 0, true, 'court: a low ostinato appears');
  assert.ok(count(barHits('lane', 1, { state: 1 }), 'perc') > count(barHits('lane', 1, { state: 0 }), 'perc'), 'lane: tabla doubles');
});

test('anticipation subtraction: one kick drops at a phrase end, the next downbeat is accented', () => {
  const p = arrangement('disco', 1);
  assert.ok(!stepHits(3 * 16 + 12, p, { antic: 0.8 }).includes('kick'));
  assert.ok(stepHits(3 * 16 + 12, p, { antic: 0.3 }).includes('kick'));
  assert.ok(stepHits(4 * 16, p, { antic: 0.8 }).includes('kickAcc'));
  assert.ok(stepHits(16, p, { accent: true }).includes('kickAcc'));
  assert.ok(stepHits(3 * 16 + 12, p, { antic: 0.6 }).includes('lift'));
  assert.ok(!stepHits(3 * 16 + 12, arrangement('disco', 1, { reduced: true }), { antic: 0.9 }).includes('lift'), 'calmer sound: no lift');
});

test('respawn wait: pulse and anchor only; heartbeat once a bar between kicks', () => {
  const w = barHits('disco', 2, { waiting: true, heart: true }, 2);
  assert.deepEqual([...new Set(w)].sort(), ['bass', 'heart', 'kick']);
  for (const id of ['arcade', 'lcd', 'abyss']) {
    const p = arrangement(id, 1);
    const at = [];
    for (let i = 0; i < 64; i++) if (stepHits(i, p, { heart: true }).includes('heart')) at.push(i % 16);
    assert.deepEqual(at, [14, 14, 14, 14], id);
  }
  assert.deepEqual(stepHits(-1, arrangement('arcade', 1)), []);
  assert.deepEqual(stepHits(0, null), []);
});

test('castle keeps its three-against-four: bass and music box on a 12-step cycle', () => {
  const p = arrangement('castle', 1);
  const at = [];
  for (let i = 0; i < 48; i++) if (stepHits(i, p).includes('bass')) at.push(i);
  assert.deepEqual(at.slice(0, 8), [0, 4, 8, 10, 12, 16, 20, 22]);
  assert.equal(WORLDS.castle.gesture.map.length, 12);
});

// ---- harmony -------------------------------------------------------------------------------

test('harmony policies: parallel moves with the root, pedal stays on A, diatonic lands on chord tones', () => {
  for (const id of TIMELINE_IDS) {
    const w = WORLDS[id];
    for (let bar = 0; bar < 4; bar++) {
      const ch = chordOf(bar, w.third);
      for (let idx = 0; idx < 6; idx++) {
        const n = motifNote(id, idx, bar);
        if (w.policy === 'pedal') assert.equal(n, motifNote(id, idx, 0), `${id} pedal`);
        if (w.policy === 'parallel') assert.equal(n - barRoot(bar, 'parallel'), motifNote(id, idx, 0), `${id} parallel`);
        if (w.policy === 'diatonic') {
          if (idx % 3 === 0) assert.ok(ch.includes(pc(n)), `${id} bar ${bar} strong note ${pc(n)} on the chord ${ch}`);
          if (bar >= 2) for (const c of ch) assert.notEqual(pc(n - c), 1, `${id} bar ${bar}: no minor ninth over F and G`);
        }
      }
    }
  }
  assert.deepEqual(PROG, [0, 0, -4, -2]);
  assert.equal(barRoot(2, 'pedal'), 0);
  assert.equal(barRoot(2, 'diatonic'), -4);
});

test('bite notes: the walk rises with the score; the bar decides by policy', () => {
  for (const id of TIMELINE_IDS) {
    const a = biteMidi(id, 1), b = biteMidi(id, 2), c = biteMidi(id, 3);
    assert.ok(a < b && b < c, id);
  }
  for (let score = 1; score < 30; score++) {
    for (let bar = 0; bar < 4; bar++) {
      assert.equal(biteMidi('lane', score, bar), biteMidi('lane', score, 0), 'pedal');
      assert.equal(biteMidi('arcade', score, bar) - biteMidi('arcade', score, 0), PROG[bar], 'parallel');
      const n = biteMidi('disco', score, bar);
      if (bar >= 2) for (const c of chordOf(bar, WORLDS.disco.third)) assert.notEqual(pc(n - 45 - c), 1, `disco ${score} bar ${bar}`);
      if (bar < 2) assert.equal(n, biteMidi('disco', score, 0), 'over A the mode is the harmony');
      assert.ok(Math.abs(n - biteMidi('disco', score, 0)) <= 1, 'diatonic: at most a semitone of correction');
    }
  }
  // The fixed A is a common tone over F: it stays.
  assert.equal(pc(biteMidi('hangar', 1, 2) - 45), 0);
});

test('diatonic bass: the chord’s own third over F and G, no minor-ninth clashes', () => {
  assert.equal(pc(bassNote('disco', 3, 0)), 3); // over A minor the third is C
  assert.equal(pc(bassNote('disco', 3, 2)), 0); // over F major it is A
  assert.equal(pc(bassNote('disco', 3, 3)), 2); // over G major it is B
  assert.equal(pc(bassNote('disco', 7, 3)), 5); // the fifth over G is D
  for (let bar = 0; bar < 4; bar++) for (const x of [0, 3, 5, 7, 10, 12]) {
    const n = bassNote('kombat', x, bar);
    for (const c of chordOf(bar, 3)) assert.notEqual(pc(n - c), 1, `kombat ${x} bar ${bar}`);
  }
});

// ---- events --------------------------------------------------------------------------------

test('classifyBite: every row of the event table', () => {
  const ctx = { beat: 100, lastBite: 90, lastMajor: 50, reduced: false, level: 1 };
  assert.equal(classifyBite({ from: 'lane', to: 'lane', held: true, swing: true }, ctx).kind, 'held');
  assert.equal(classifyBite({ from: 'castle', to: 'castle' }, ctx).kind, 'held', 'no universe change without the flag either');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', score: 7 }, ctx).kind, 'change');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', score: 7, swing: true }, ctx).kind, 'major');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', score: 7, look: 'pov', prevLook: '2d' }, ctx).kind, 'major', 'first-person arrival');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', score: 7, look: 'pov', prevLook: 'pov' }, ctx).kind, 'change');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', score: 20 }, ctx).kind, 'major', 'a milestone');
  assert.equal(classifyBite({ from: 'disco', to: 'lcd', swing: true, reset: true }, ctx).kind, 'lcd');
  assert.equal(classifyBite({ from: 'lcd', to: 'lcd', reset: true }, ctx).kind, 'lcd');
  assert.equal(classifyBite({ from: 'disco', to: 'abyss', swing: true }, ctx).kind, 'abyss');
  const maj = classifyBite({ from: 'arcade', to: 'disco', swing: true }, { ...ctx, level: 3 });
  assert.equal(maj.gap, 'stutter');
  assert.equal(classifyBite({ from: 'arcade', to: 'disco', swing: true }, ctx).gap, 'vacuum');
  assert.ok(maj.answer && !maj.rapid && maj.weight === 1);
});

test('classifyBite: cooldown, rapid bites and the calmer sound', () => {
  const base = { from: 'arcade', to: 'disco', swing: true };
  assert.equal(COOLDOWN.majorBeats, 16, 'one major per four-bar phrase at most');
  assert.equal(classifyBite(base, { beat: 100, lastBite: 95, lastMajor: 85 }).kind, 'change', 'within the cooldown');
  assert.equal(classifyBite(base, { beat: 100, lastBite: 95, lastMajor: 84 }).kind, 'major', 'exactly at the cooldown');
  const rapid = classifyBite(base, { beat: 100, lastBite: 99, lastMajor: 0 });
  assert.equal(rapid.kind, 'change', 'within 2 beats of the last bite');
  assert.ok(rapid.rapid && !rapid.answer && !rapid.thump);
  let w = 1;
  for (let n = 0; n < 8; n++) {
    const c = classifyBite({ from: 'a', to: 'kombat' }, { beat: 100, lastBite: 99.5, lastMajor: 0, rapidCount: n });
    assert.ok(c.weight <= w && c.weight >= 0.55, 'lighter each time, never gone');
    w = c.weight;
  }
  assert.equal(classifyBite(base, { beat: 100, lastBite: 0, lastMajor: -100, reduced: true }).kind, 'change');
  assert.equal(classifyBite({ from: 'lane', to: 'lane', held: true }, { beat: 1, lastBite: 0.5 }).kind, 'held');
  assert.doesNotThrow(() => classifyBite(null, null));
  assert.equal(universeId(classifyBite(undefined, undefined).to), 'arcade');
});

test('anticipation: bounded, phrase-shaped, settles; none in LCD, half in Abyss', () => {
  assert.equal(anticipationAt(0), 0);
  assert.equal(anticipationAt(3.9), 0);
  assert.ok(Math.abs(anticipationAt(8) - 0.5) < 1e-9);
  assert.ok(Math.abs(anticipationAt(12) - 1) < 1e-9);
  assert.ok(Math.abs(anticipationAt(16) - 0.35) < 1e-9);
  let max = 0, min = 1;
  for (let b = 16; b < 400; b += 0.25) {
    const a = anticipationAt(b);
    max = Math.max(max, a);
    min = Math.min(min, a);
  }
  assert.ok(max <= 0.6 + 1e-9 && max > 0.59, `swells to at most 0.6 (${max})`);
  assert.ok(min >= 0.35 - 1e-9, 'never back to the full rise');
  assert.equal(anticipationAt(12, 'lcd'), 0);
  assert.ok(Math.abs(anticipationAt(12, 'abyss') - 0.5) < 1e-9);
  assert.equal(anticipationAt(NaN), 0);
});

test('danger envelope: fast attack, slower release, hysteresis', () => {
  let d = 0, t = 0;
  while (d < DANGER.tenseOn) { d = smoothDanger(d, 0.68, 0.024); t += 0.024; }
  assert.ok(t <= 0.1, `tense after ${t.toFixed(3)} s`);
  d = 0; t = 0;
  while (d < 0.9 * 0.68) { d = smoothDanger(d, 0.68, 0.024); t += 0.024; }
  assert.ok(t <= 0.25, `90% after ${t.toFixed(3)} s`);
  t = 0;
  while (d >= 0.25) { d = smoothDanger(d, 0, 0.024); t += 0.024; }
  assert.ok(t > 0.3 && t <= 1.5, `released after ${t.toFixed(3)} s`);
  // Hysteresis.
  assert.equal(dangerState(0, 0.39), 0);
  assert.equal(dangerState(0, 0.4), 1);
  assert.equal(dangerState(1, 0.3), 1);
  assert.equal(dangerState(1, 0.24), 0);
  assert.equal(dangerState(1, 0.75), 2);
  assert.equal(dangerState(2, 0.6), 2);
  assert.equal(dangerState(2, 0.54), 1);
  assert.equal(dangerState(2, 0.2), 0);
  assert.equal(dangerState(0, NaN), 0);
});
