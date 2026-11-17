// finish stream: browser checks for the real game. Load under ?debug with
//   const F = await import('/dev/finish.js?' + Date.now()); F.hook();
export const errs = [];
export function hook() {
  if (window.__finHooked) return errs;
  window.__finHooked = true;
  const wrap = (k, tag) => { const o = console[k].bind(console); console[k] = (...a) => { errs.push(tag + ' ' + a.map(String).join(' ').slice(0, 240)); o(...a); }; };
  wrap('error', 'E'); wrap('warn', 'W');
  addEventListener('error', (e) => errs.push('X ' + e.message));
  addEventListener('unhandledrejection', (e) => errs.push('R ' + (e.reason && e.reason.message || e.reason)));
  return errs;
}
/** Distinct coarse colours in a canvas (1 = blank). */
export function colors(c, n = 64) {
  const x = document.createElement('canvas'); x.width = n; x.height = n;
  const g = x.getContext('2d'); g.drawImage(c, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data; const set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4);
  return set.size;
}
const $ = (id) => document.getElementById(id);
/** Every universe in every look it has, held with the debug lock. */
export function sweep(ms = 5000, only = null) {
  const S = window.__ss, out = [];
  for (const u of S.universes) {
    if (only && !only.includes(u.id)) continue;
    for (const l of [...(u.looks || [])]) {
      errs.length = 0; S.lock(u.id); S.look(l);
      const s0 = S.snap.score, t0 = S.snap.tick, r = S.run(ms), d = S.d, s = S.snap;
      const glv = $('gl').style.visibility === 'visible';
      out.push([u.id, l, d.timeline === u.id && d.look === l ? 'ok' : `SHOWN ${d.timeline}/${d.look}`, d.view,
        'flat:' + colors($('flat')), 'gl:' + (glv ? colors($('gl')) : '-'), 'ticks:' + (s.tick - t0),
        'score:' + s0 + '>' + s.score, r.mode, 'errs:' + errs.length + (errs[0] ? ' ' + errs[0] : '')].join(' '));
    }
  }
  S.lock(null); S.look(null);
  return out.join('\n');
}
const SPECIAL = new Set(['lane', 'mushroom', 'castle']);
/** Long unlocked autopilot run; records every bite and shift with the director's answer. */
export function flow(ms = 300000) {
  const S = window.__ss, sim = S.sim, rec = [];
  const now = () => S.d.cutAt;
  const note = (type, e) => {
    const d = S.d, s = sim.snapshot();
    rec.push({ type, from: e.from, to: e.to, held: e.held, kind: e.kind, reset: e.reset, u: s.universe.id, hold: s.universe.holdLeft,
      look: d.lastCut ? d.lastCut.look : d.look, view: d.view, inv: d.invertUntil - d.lastCutAt, strobe: d.strobe, veil: d.veil, calm: S.fx && S.fx.calm, score: s.score, lifeGained: e.lifeGained, lives: s.lives, lc: d.lastCut, at: S.d.lastCutAt });
  };
  const offA = sim.on('ate', (e) => note('ate', e)), offS = sim.on('shift', (e) => note('shift', e));
  const offL = sim.on('lifeLost', (e) => rec.push({ type: 'lifeLost', lives: e.lives })), offD = sim.on('died', () => rec.push({ type: 'died' }));
  errs.length = 0;
  window.__rec = rec;
  return more(ms);
}
/** Continue a flow() run for `ms` more synthetic ms (keeps each browser call short). */
export function more(ms) {
  for (let t = 0; t < ms; t += 5000) window.__ss.run(5000);
  return summary(window.__rec);
}
export function summary(rec) {
  const shifts = rec.filter((r) => r.type === 'shift');
  const spec = shifts.filter((r) => SPECIAL.has(r.to));
  let b2b = 0, holds = [], flipsSame = 0, flips = 0, cur = null, n = 0, lastLook = null, noImpact = 0;
  for (let i = 0; i < rec.length; i++) {
    const r = rec[i];
    if (r.type === 'died') { cur = null; continue; }
    if (r.type === 'shift') {
      if (SPECIAL.has(r.from) && SPECIAL.has(r.to)) b2b++;
      if (cur && !r.reset) holds.push(cur + ':' + (n + 0));
      cur = SPECIAL.has(r.to) ? r.to : null; n = 0; lastLook = r.look;
      continue;
    }
    if (r.type === 'ate') {
      if (cur) n++;
      if (r.held && SPECIAL.has(r.u)) { flips++; if (!r.lc || !r.lc.held || r.lc.look === r.lc.prevLook) flipsSame++; lastLook = r.look; }
    }
  }
  // impact: an ate that is held, or a shift; default mode expects inversion unless calm
  for (const r of rec) if ((r.type === 'shift' || (r.type === 'ate' && r.held)) && !(r.inv > 0) && !r.strobe && !['lcd', 'abyss'].includes(r.u)) noImpact++;
  const by = {}; for (const r of shifts) by[r.to] = (by[r.to] || 0) + 1;
  return { shifts: shifts.length, special: spec.length, pct: +(100 * spec.length / Math.max(1, shifts.length)).toFixed(1), b2b, holds: holds.join(' '),
    heldFlips: flips, sameLookFlips: flipsSame, noImpact, lifeGains: rec.filter((r) => r.lifeGained).length, lifeLost: rec.filter((r) => r.type === 'lifeLost').length,
    died: rec.filter((r) => r.type === 'died').length, by, errs: errs.slice(0, 5) };
}
/** Hold a special universe in one look and watch its space for `ms`. */
export function space(id, look, ms = 60000) {
  const S = window.__ss, sim = S.sim;
  S.lock(id); S.look(look); errs.length = 0;
  const o = { ate: 0, lost: [], yMin: Infinity, yMax: -Infinity, maxScroll: 0, offBoardFood: 0, faces: new Set(), entered: 0, rotChanges: 0, maxLen: 0 };
  const offA = sim.on('ate', () => o.ate++), offL = sim.on('lifeLost', (e) => o.lost.push(e.death && e.death.reason));
  let lastTick = -1, lastRot = null;
  for (let t = 0; t < ms; t += 16) {
    S.run(16);
    const s = sim.snapshot();
    if (s.tick === lastTick) continue;
    lastTick = s.tick;
    o.maxLen = Math.max(o.maxLen, s.length);
    const sp = s.space;
    if (sp.kind === 'lane' && s.body) {
      o.yMin = Math.min(o.yMin, s.body[0].y); o.yMax = Math.max(o.yMax, s.body[0].y);
      o.maxScroll = Math.max(o.maxScroll, Math.abs(sp.y0 - sp.prevY0));
    }
    if (sp.kind === 'cube') { o.faces.add(sp.face); if (sp.entered) o.entered++; if (lastRot !== null && sp.rot !== lastRot) o.rotChanges++; lastRot = sp.rot; }
    if (!s.food && s.foodAt) o.offBoardFood++;
  }
  [offA, offL].forEach((f) => typeof f === 'function' && f());
  o.faces = [...o.faces].join(','); o.errs = errs.slice(0, 3); o.kind = sim.snapshot().space.kind;
  return o;
}
/** Yellow arrow pixels (#ffd400) on the flat overlay canvas. */
export function yellow() {
  const c = document.getElementById('flat'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 195 && d[i + 1] < 225 && d[i + 2] < 30) n++;
  return n;
}
/** Run until the dot is off the active board (arrow case), then count arrow pixels; also with the dot on board. */
export function arrowCheck(id, look, tries = 3) {
  const S = window.__ss; S.lock(id); S.look(look); const out = [];
  for (let k = 0; k < tries; k++) {
    let n = 0; while (n++ < 2000 && !(!S.snap.food && S.snap.foodAt)) S.run(16);
    S.run(16); const off = { off: !S.snap.food && !!S.snap.foodAt, px: yellow() };
    n = 0; while (n++ < 2000 && !S.snap.food) S.run(16);
    S.run(16); out.push(`off:${off.off}/${off.px} on:${!!S.snap.food}/${yellow()}`);
  }
  return out.join(' ');
}
export const key = (d) => dispatchEvent(new KeyboardEvent('keydown', { code: 'Arrow' + d[0].toUpperCase() + d.slice(1), bubbles: true }));
let ap = null;
/** Eat with a private autopilot until the snake is `len` long (only queueTurn, like a player). */
export async function grow(len, maxMs = 120000) {
  const S = window.__ss;
  if (!ap) ap = (await import('/src/autopilot.js')).createAutopilot(S.sim);
  for (let t = 0; t < maxMs && S.snap.length < len && S.mode === 'playing'; t += 16) { ap.update(); S.run(16); }
  return S.snap.length;
}
const TURN_R = { up: 'right', right: 'down', down: 'left', left: 'up' };
/**
 * Crash by real key presses in the current universe: box and lane steer into a side wall, the cube
 * curls into itself. Returns what the respawn looks like, then resumes with a key.
 */
export function crash() {
  const S = window.__ss, s0 = S.snap, kind = s0.space.kind, before = { score: s0.score, u: s0.universe.id, lives: s0.lives, view: S.d.view };
  let n = 0;
  const pov = () => S.d.view === 'pov';
  if (kind === 'cube') { // curl: four right turns in a row
    for (let i = 0; i < 6 && S.mode === 'playing'; i++) { const s = S.snap; key(pov() ? 'right' : TURN_R[s.dir]); const tk = s.tick; while (S.snap.tick === tk && n++ < 200) S.run(16); }
  } else if (kind === 'lane') key('left');
  while (S.mode === 'playing' && n++ < 3000) S.run(16);
  S.run(300);
  const s = S.snap, d = S.d;
  const r = { kind, mode: S.mode, waiting: s.waiting, len: s.length, lives: `${before.lives}>${s.lives}`, score: before.score === s.score, universe: before.u === s.universe.id,
    viewBefore: before.view, viewAfter: d.view, look: d.look, space: s.space.kind, hint: document.getElementById('hint').hidden ? '' : document.getElementById('hint').textContent,
    death: s.death && s.death.reason, aria: document.getElementById('lives').getAttribute('aria-label') };
  const tk = s.tick; S.run(2000); r.stillWaiting = S.snap.tick === tk && S.snap.waiting === 'respawn';
  if (S.mode === 'respawn') { key(s.dir === 'down' ? 'left' : 'up'); S.run(400); r.resumed = S.mode === 'playing' && S.snap.tick > tk; }
  return r;
}
/** Fraction of sampled pixels that differ between two moments `ms` apart while nothing moves. */
export function pulseDiff(canvasId, ms = 300) {
  const S = window.__ss, c = document.getElementById(canvasId);
  const grab = () => { const x = document.createElement('canvas'); x.width = 160; x.height = 90; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
  const tk = S.snap.tick; S.run(16); const a = grab(); S.run(ms); const b = grab();
  let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
  return { still: S.snap.tick === tk, diffPct: +(100 * n / (a.length / 4)).toFixed(2) };
}
/** Grow in `from`, then shift to a box universe and watch the off-board body get used up. */
export async function offBoard(from, look, to, len = 24) {
  const S = window.__ss; S.lock(from); S.look(look); S.run(600);
  await grow(len);
  // move on a while so the body spreads over the lane window or several faces
  for (let i = 0; i < 400; i++) { ap.update(); S.run(16); }
  const lost0 = S.events.filter((e) => e.type === 'lifeLost').length;
  S.lock(to); S.run(16);
  const s = S.snap, r = { length: s.length, onBoard: s.snake.length, breaks: (s.breaks || []).length, trace: [] };
  for (let i = 0; i < 400 && S.snap.length > S.snap.snake.length; i++) { ap.update(); S.run(16); if (i % 40 === 0) r.trace.push(S.snap.length - S.snap.snake.length); }
  r.offAfter = S.snap.length - S.snap.snake.length; r.lengthAfter = S.snap.length;
  r.lost = S.events.filter((e) => e.type === 'lifeLost').length - lost0; r.trace = r.trace.join(',');
  return r;
}
/** A small hash of the HUD lives canvas. */
export function livesHash() { const c = document.getElementById('lives'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; }
/** Frame-by-frame flash audit over `ms` of autopilot play (needs ?auto). */
export function frames(ms = 60000) {
  const S = window.__ss, inv = document.getElementById('invert');
  const o = { frames: 0, invert: 0, strobe: 0, glitch: 0, calmFrames: 0, calmFlash: 0, calmBeatMax: 0, veilFrames: 0, veilMax: 0, pov: 0, slides: 0, maxStep: 0 };
  let lastV = null;
  for (let t = 0; t < ms; t += 16) {
    S.run(16); o.frames++;
    const fx = S.fx, d = S.d, isInv = inv.style.display === 'block';
    if (isInv) o.invert++;
    if (fx.strobe) o.strobe++;
    if (fx.glitch > 0.01) o.glitch++;
    if (d.view === 'pov') o.pov++;
    if (fx.calm) { o.calmFrames++; if (isInv || fx.strobe || fx.glitch > 0.01 || fx.split > 0.01) o.calmFlash++; o.calmBeatMax = Math.max(o.calmBeatMax, fx.beat); }
    const v = d.veil ? d.veil.from * Math.max(0, 1 - (fx.now - d.veil.at) / d.veil.dur) : 0;
    if (v > 0.001) { o.veilFrames++; o.veilMax = Math.max(o.veilMax, v); }
    if (lastV !== null) o.maxStep = Math.max(o.maxStep, Math.abs(v - lastV));
    lastV = v;
  }
  o.errs = errs.slice(0, 3); o.prefs = JSON.stringify(S.prefs.get()); o.cuts = S.cuts.length;
  return o;
}
/** Record every audio call by name (wraps the live audio object in place). */
export function spyAudio() {
  const a = window.__ss.audio, log = window.__alog = [];
  for (const k of Object.keys(a)) if (typeof a[k] === 'function') { const f = a[k].bind(a); a[k] = (...args) => { log.push(k); return f(...args); }; }
  return Object.keys(a).filter((k) => typeof a[k] === 'function');
}
/** Check the recorded calls against notes/audio.md: food ticks, life lost, respawn, death. */
export function audioOrder() {
  const L = window.__alog.filter((k) => !['beat', 'debug', 'setChaos', 'muted', 'setMuted'].includes(k)), bad = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i] === 'bite') { // ... setGameplay [setLives lifeGained] bite
      const j = L[i - 1] === 'lifeGained' ? i - 3 : i - 1;
      if (L[i - 1] === 'lifeGained' && L[i - 2] !== 'setLives') bad.push(i + ': lifeGained without setLives');
      if (L[j] !== 'setGameplay') bad.push(i + ': no setGameplay before bite (' + L.slice(Math.max(0, i - 4), i + 1) + ')');
    }
    if (L[i] === 'lifeLost' && L[i - 1] !== 'setLives') bad.push(i + ': lifeLost after ' + L[i - 1]);
    if (L[i] === 'die' && L[i - 1] !== 'setLives') bad.push(i + ': die after ' + L[i - 1]);
    if (['cut', 'setTimeline', 'eat', 'setScore'].includes(L[i])) bad.push(i + ': old call ' + L[i]);
  }
  const count = {}; for (const k of L) count[k] = (count[k] || 0) + 1;
  return { calls: L.length, count, bad: bad.slice(0, 8), firstCalls: L.slice(0, 8).join(' ') };
}
