// Director: decides which scene shows, how hard a cut hits, and when the
// first-person view runs. Pure: no DOM, own seeded generator. It reads
// snapshots and never touches the simulation.

import { createRng } from './rng.js';
import { DIRECTOR as D, LUMA, OPENING, PHRASES, RARE } from './config.js';
import { DIRS } from './sim.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Build the scene table from whatever loaded.
 * flats: { [id]: meta } for flat timelines; rooms: { [id]: meta } from the 3D engine.
 */
export function buildScenes({ flats = {}, rooms = {} } = {}) {
  const list = [];
  const base = (id, meta, kind) => ({
    timeline: id,
    kind,
    name: meta.name || id.toUpperCase(),
    year: meta.year != null ? String(meta.year) : '',
    clock: meta.clock ? String(meta.clock) : '',
    luma: typeof meta.luma === 'number' ? meta.luma : (LUMA[id] ?? 0.4),
    veil: meta.veil || '#000000',
    hud: meta.hud || null,
    rare: RARE.includes(id),
  });
  for (const [id, meta] of Object.entries(flats)) {
    list.push({ id, view: 'board', weight: meta.weight ?? 1, ...base(id, meta || {}, '2d') });
  }
  for (const [id, meta0] of Object.entries(rooms)) {
    const meta = meta0 || {};
    const w = meta.weight ?? 2;
    list.push({ id, view: 'board', weight: w, ...base(id, meta, '3d') });
    const views = Array.isArray(meta.views) ? meta.views : ['board', 'pov'];
    if (views.includes('pov')) {
      list.push({ id: `${id}-pov`, view: 'pov', weight: Math.max(0.4, w * D.povWeightFactor), ...base(id, meta, '3d') });
    }
  }
  return list;
}

/** True when `n` cells straight ahead of the head are inside the grid and free of the body. */
export function clearAhead(snap, n = D.povClearCells) {
  if (!snap || !snap.snake || !snap.snake.length) return false;
  const d = DIRS[snap.dir];
  if (!d) return false;
  const h = snap.snake[0];
  for (let k = 1; k <= n; k++) {
    const x = h.x + d.x * k, y = h.y + d.y * k;
    if (x < 0 || y < 0 || x >= snap.cols || y >= snap.rows) return false;
    for (const c of snap.snake) if (c.x === x && c.y === y) return false;
  }
  return true;
}

/**
 * createDirector({ scenes, seed, prefs, hasGL, script, first })
 *   prefs: () => ({ reducedFlash, reducedMotion })
 *   hasGL: () => boolean (WebGL present and not lost)
 */
export function createDirector({
  scenes = [],
  seed = 7,
  prefs = () => ({ reducedFlash: false, reducedMotion: false }),
  hasGL = () => true,
  script = OPENING,
  first = 'lcd',
  phrases = PHRASES,
} = {}) {
  const rng = createRng(seed);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const disabled = new Set();
  let st;

  function firstScene() {
    if (byId.has(first)) return first;
    const flat = scenes.find((s) => s.kind === '2d');
    return (flat || scenes[0] || { id: first }).id;
  }

  function reset(now = 0) {
    const id = firstScene();
    st = {
      scene: id, showing: id, prev: id,
      cutAt: now, lastCutAt: -Infinity, lastSwingAt: -Infinity,
      cutCount: 0, scriptIndex: 0, visited: new Set([byId.get(id)?.timeline]),
      chaos: 0, score: 0, variant: 0, bite: null, biteAt: -Infinity,
      invertUntil: -Infinity, strobe: null, phrase: null, veil: null,
      dead: false, locked: st ? st.locked : false, lastCut: null,
      holdLeft: 0, recent: [], resets: 0,
    };
  }

  const cur = () => byId.get(st.scene);

  function usable(s) {
    if (!s || disabled.has(s.id)) return false;
    if (s.kind === '3d' && !hasGL()) return false;
    return true;
  }

  function allowed(id, snap, now, p) {
    const s = byId.get(id);
    if (!usable(s) || id === st.scene) return false;
    if (s.view === 'pov') {
      if (p.reducedMotion) return false;
      if (!snap || !snap.alive || !clearAhead(snap)) return false;
    }
    if (p.reducedFlash && now - st.lastSwingAt < D.swingGapMs) {
      const c = cur();
      if (c && Math.abs(s.luma - c.luma) > D.swingLuma) return false;
    }
    return true;
  }

  const opening = () => st.scriptIndex < script.length;

  /** Pick weight: rare scenes stay rare; recently shown timelines sink, unseen ones rise. */
  function weightOf(s) {
    let w = s.rare ? D.rareWeight * (0.5 + st.chaos) : Math.max(0.01, s.weight);
    if (st.recent.includes(s.timeline)) w *= D.recentFactor;
    else if (!s.rare && !st.visited.has(s.timeline)) w *= D.freshFactor;
    return w;
  }

  function pickRandom(snap, now, p) {
    const all = scenes.filter((s) => allowed(s.id, snap, now, p));
    if (!all.length) return null;
    // Rare scenes: never in the opening, never early, never straight after another rare one.
    const c = cur();
    const noRare = opening() || st.score < D.rareMinScore || (c && c.rare);
    const strict = noRare ? all.filter((s) => !s.rare) : all;
    const pool = strict.length ? strict : all;
    let total = 0;
    for (const s of pool) total += weightOf(s);
    let r = rng.next() * total;
    for (const s of pool) {
      r -= weightOf(s);
      if (r <= 0) return s.id;
    }
    return pool[pool.length - 1].id;
  }

  function pickNext(snap, now, p) {
    while (st.scriptIndex < script.length) {
      const id = script[st.scriptIndex];
      const s = byId.get(id);
      const skip = !usable(s) || id === st.scene || (s.view === 'pov' && p.reducedMotion);
      if (skip) { st.scriptIndex++; continue; }
      if (allowed(id, snap, now, p)) { st.scriptIndex++; return id; }
      // Blocked first person or a swing held back by the limiter: keep it for the next bite.
      return pickRandom(snap, now, p);
    }
    return pickRandom(snap, now, p);
  }

  function cut(id, now, { impact = false, big = false, totalReset = false } = {}) {
    const from = cur();
    const to = byId.get(id);
    if (!to) return null;
    const p = prefs();
    const wild = !p.reducedFlash;
    const swing = !!from && Math.abs(to.luma - from.luma) > D.swingLuma;
    st.prev = st.scene;
    st.scene = id;
    st.lastCutAt = now;
    st.cutCount += 1;
    if (swing) st.lastSwingAt = now;

    let showAt = now;
    st.invertUntil = -Infinity;
    st.strobe = null;
    st.veil = null;
    if (wild && impact) {
      const inv = D.invertMinMs + rng.next() * (D.invertMaxMs - D.invertMinMs);
      st.invertUntil = now + inv;
      showAt = now + inv;
    }
    if (!wild && swing) {
      st.veil = { color: from.veil, at: now, dur: D.veilMs, from: D.veilFrom };
    }
    const firstVisit = !st.visited.has(to.timeline);
    const bigEvent = big || st.cutCount === 1 || (to.kind === '3d' && firstVisit) || to.view === 'pov';
    if (wild && impact && (bigEvent || rng.next() < 0.08 + 0.5 * st.chaos)) {
      const count = D.strobeMin + rng.int(D.strobeMax - D.strobeMin + 1);
      st.strobe = { at: showAt, count, dur: D.strobeWindowMs };
    }

    st.phrase = null;
    if (impact && to.view !== 'pov' && to.id !== firstScene()) {
      let text = null;
      if (st.cutCount === 1) text = 'TIME BREAK!';
      else if (to.kind === '3d' && firstVisit && to.year) text = `WELCOME TO ${to.year}`;
      else if (rng.next() < 0.3 + 0.5 * st.chaos) {
        const pool = phrases.filter((t) => t !== 'TIME BREAK!' || st.chaos > 0.3);
        text = rng.pick(pool.length ? pool : phrases);
      }
      if (text) st.phrase = { text, at: showAt, dur: D.phraseMs, seed: rng.int(1 << 30) };
    }
    st.visited.add(to.timeline);
    st.recent.push(to.timeline);
    if (st.recent.length > D.recentLen) st.recent.shift();
    // Rare scenes are held for one or two bites (one under reduced flash).
    st.holdLeft = to.rare && wild ? rng.int(Math.max(1, D.rareHoldMax)) : 0;
    if (totalReset) st.resets += 1;
    st.cutAt = showAt;
    st.lastCut = { from: from ? from.id : null, to: id, swing, impact, reset: totalReset, at: now };
    st.showing = showAt > now ? st.prev : id;
    return st.lastCut;
  }

  /** A dot was eaten. `snap` is taken right after the bite. Returns the cut, or null for local changes only. */
  function onBite(snap, now) {
    st.variant += 1;
    st.score = snap ? snap.score : st.score + 1;
    st.chaos = clamp01(st.score / D.chaosScore);
    st.bite = snap && snap.snake && snap.snake[0] ? { x: snap.snake[0].x, y: snap.snake[0].y } : null;
    st.biteAt = now;
    if (st.locked) return null;
    const p = prefs();
    const c = cur();
    // Reduced flash: the cut limiter is absolute, so bites in between are local changes only
    // (a first-person passage then runs on until the next allowed cut or its timeout).
    if (p.reducedFlash && now - st.lastCutAt < D.reducedCutGapMs) return null;
    // A rare scene still being held: local changes only.
    if (c && c.rare && st.holdLeft > 0) { st.holdLeft -= 1; return null; }
    // Total Reset: after a room, timewarp or wrong, an occasional silent snap back to LCD.
    if (!opening() && c && (c.kind === '3d' || c.rare)) {
      const home = firstScene();
      const h = byId.get(home);
      if (h && h.kind === '2d' && allowed(home, snap, now, p) && rng.next() < D.resetBase + D.resetChaos * st.chaos) {
        return cut(home, now, { totalReset: true });
      }
    }
    const next = pickNext(snap, now, p);
    if (!next) {
      if (c && c.view === 'pov' && usable(byId.get(c.timeline))) return cut(c.timeline, now);
      return null;
    }
    return cut(next, now, { impact: true });
  }

  function onDeath(snap, now) {
    st.dead = true;
    const p = prefs();
    if (!p.reducedFlash && !st.locked) {
      st.invertUntil = now + D.invertMaxMs;
      st.strobe = { at: now + D.invertMaxMs, count: D.strobeMin, dur: D.strobeWindowMs * 0.75 };
    }
  }

  /** Per frame: first-person timeout, preference changes, lost WebGL, impact timing. */
  function update(snap, now) {
    const p = prefs();
    const c = cur();
    if (c && !usable(c)) {
      const flat = scenes.find((s) => s.kind === '2d' && s.id === firstScene()) || scenes.find((s) => s.kind === '2d' && usable(s));
      if (flat) cut(flat.id, now);
    } else if (c && c.view === 'pov' && !st.locked) {
      if (p.reducedMotion || (!st.dead && now - st.cutAt >= D.povTimeoutMs)) {
        if (usable(byId.get(c.timeline))) cut(c.timeline, now);
      }
    }
    if (p.reducedFlash) { st.invertUntil = -Infinity; st.strobe = null; }
    st.showing = now < st.invertUntil ? st.prev : st.scene;
  }

  /** Debug and tests: cut straight to a scene, bypassing the gates. */
  function force(id, now, impact = true) {
    if (!byId.has(id)) return null;
    if (id === st.scene) return null;
    return cut(id, now, { impact });
  }

  function disable(id, now = 0) {
    for (const s of scenes) if (s.id === id || s.timeline === id) disabled.add(s.id);
    if (disabled.has(st.scene)) update(null, now);
  }

  /** Read-only view for main, renderers and UI. */
  function get() {
    const s = byId.get(st.showing) || byId.get(st.scene) || null;
    const pv = byId.get(st.prev);
    return Object.freeze({
      scene: st.scene, showing: st.showing, prev: st.prev, sceneInfo: s,
      prevTimeline: pv ? pv.timeline : st.prev, holdLeft: st.holdLeft, resets: st.resets,
      view: s ? s.view : 'board', kind: s ? s.kind : '2d', timeline: s ? s.timeline : st.showing,
      cutAt: st.cutAt, lastCutAt: st.lastCutAt, lastSwingAt: st.lastSwingAt, cutCount: st.cutCount,
      chaos: st.chaos, score: st.score, variant: st.variant, bite: st.bite, biteAt: st.biteAt,
      invertUntil: st.invertUntil, strobe: st.strobe, phrase: st.phrase, veil: st.veil,
      locked: st.locked, lastCut: st.lastCut,
    });
  }

  reset(0);

  return {
    scenes,
    reset, onBite, onDeath, update, force, disable, get,
    lock(on = true) { st.locked = !!on; },
    has(id) { return byId.has(id) && usable(byId.get(id)); },
  };
}
