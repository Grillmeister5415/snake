// Director (LEVELS_PLAN 4.1): the simulation picks the universe; the director picks only the
// look (2d, 3d or pov) of each arrival, at random, and how hard the cut hits. Pure: no DOM,
// own seeded generator (presentation only, so it never changes a run). It listens to the
// simulation's `shift`, held `ate`, `lifeLost` and `died` events through main.js.

import { createRng } from './rng.js';
import { DIRECTOR as D, LUMA, PHRASES, CALM, NO_POV, OLD_ROOMS } from './config.js';
import { UNIVERSES } from './rules-config.js';
import { DIRS } from './sim.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const LOOK_ORDER = ['2d', '3d', 'pov'];

/** Scene id of a look: the universe id for its main look, '<id>-3d' / '<id>-pov' otherwise. */
export function sceneId(id, look, has2d) {
  if (look === 'pov') return `${id}-pov`;
  if (look === '3d' && has2d) return `${id}-3d`;
  return id;
}

/**
 * Build the universe table of LEVELS_PLAN 2.1 from what loaded.
 *   flats:      { [id]: meta } of the flat timelines (2D looks) that loaded
 *   rooms:      { [id]: meta } of the room modules that loaded (no WebGL needed)
 *   glRooms:    engine.rooms ({ [id]: meta with views }) or null without WebGL
 *   perspRooms: { [id]: meta } the 2D perspective stand-in can draw (no WebGL), or null
 * A flat timeline and a room with the same id are one universe. A universe with no look is left
 * out. Returns [{ id, rules, mushrooms, rare, room, weight, calm, looks, gl, persp, info }] in the
 * order of rules-config UNIVERSES (unknown ids after them); `info[look]` is the scene info.
 */
export function buildUniverses({ flats = {}, rooms = {}, glRooms = null, perspRooms = null, base = UNIVERSES } = {}) {
  const baseById = new Map(base.map((u) => [u.id, u]));
  const ids = [...base.map((u) => u.id)];
  for (const id of [...Object.keys(flats), ...Object.keys(rooms), ...Object.keys(glRooms || {})]) {
    if (!ids.includes(id)) ids.push(id);
  }
  const out = [];
  for (const id of ids) {
    const flat = flats[id] || null;
    const roomMeta = rooms[id] || (glRooms && glRooms[id]) || (perspRooms && perspRooms[id]) || null;
    const gl = !!(glRooms && glRooms[id]);
    const persp = !gl && !!(perspRooms && perspRooms[id]) && OLD_ROOMS.includes(id);
    const looks = [];
    if (flat) looks.push('2d');
    if (gl || persp) looks.push('3d');
    const views = gl && Array.isArray(glRooms[id].views) ? glRooms[id].views : ['board'];
    if (gl && views.includes('pov') && !NO_POV.includes(id)) looks.push('pov');
    if (!looks.length) continue;
    const b = baseById.get(id) || {};
    const anyMeta = roomMeta || flat || {};
    const calm = CALM.includes(id) || !!(anyMeta.calm || (flat && flat.calm));
    const info = {};
    for (const look of looks) {
      const meta = (look === '2d' ? flat : roomMeta) || anyMeta;
      info[look] = Object.freeze({
        id: sceneId(id, look, !!flat),
        timeline: id,
        universe: id,
        look,
        kind: look === '2d' ? '2d' : '3d',
        view: look === 'pov' ? 'pov' : 'board',
        name: meta.name || id.toUpperCase(),
        year: meta.year != null ? String(meta.year) : '',
        clock: meta.clock ? String(meta.clock) : '',
        luma: typeof meta.luma === 'number' ? meta.luma : (LUMA[id] ?? 0.4),
        veil: meta.veil || '#000000',
        hud: meta.hud || null,
        rare: !!b.rare,
        calm,
        // The look paints its own crash screen for a wall or self crash (Desktop Error): the
        // director then skips the life-lost / death inversion, strobe, veil and phrase.
        crashScreen: !!meta.crashScreen,
      });
    }
    const weight = (roomMeta && roomMeta.weight) || (flat && flat.weight) || b.weight || 1;
    out.push(Object.freeze({
      id,
      rules: b.rules || anyMeta.rules || 'box',
      mushrooms: !!(b.mushrooms ?? anyMeta.mushrooms),
      rare: !!b.rare,
      // From the plan's table, not from WebGL, so a seed gives the same run on every device.
      room: b.room != null ? !!b.room : !!roomMeta,
      weight,
      calm, looks: Object.freeze(looks), gl, persp, info: Object.freeze(info),
    }));
  }
  return out;
}

/** The table createSim takes (LEVELS_PLAN 3.2). */
export function simUniverses(list) {
  return list.map(({ id, rules, mushrooms, rare, room, weight }) => ({ id, rules, mushrooms, rare, room, weight }));
}

/** True when `n` cells straight ahead of the head are on the board and free of the body. */
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

/** Crash reasons that show a crash screen; `complete` (board full) is a win and never does. */
const CRASH_REASONS = new Set(['wall', 'self']);

/**
 * createDirector({ universes, seed, prefs, hasGL, first, phrases })
 *   universes: buildUniverses() result
 *   prefs: () => ({ reducedFlash, reducedMotion }); hasGL: () => WebGL present and not lost
 * Inputs (main.js calls these from the simulation's events, `now` in ms):
 *   reset(now, snap)  onShift(e, snap, now)  onAte(e, snap, now)  onLifeLost(e, snap, now)
 *   onDeath(snap, now)  update(snap, now)  resumed(now)
 * onShift / onAte / onLifeLost / update return a cut { from, to, look, prevLook, swing, impact,
 * held, reset } when the look or universe changed, else null. get() is the read-only view `d`.
 */
export function createDirector({
  universes = [],
  seed = 7,
  prefs = () => ({ reducedFlash: false, reducedMotion: false }),
  hasGL = () => true,
  first = 'lcd',
  phrases = PHRASES,
} = {}) {
  const rng = createRng(seed);
  const byId = new Map(universes.map((u) => [u.id, u]));
  const disabled = new Set(); // '<id>:<look>'
  let lookLock = null;        // debug: ?look=
  let st = null;

  const home = () => (byId.has(first) ? first : (universes[0] ? universes[0].id : first));

  function usable(u, look) {
    if (!u || !u.looks.includes(look) || disabled.has(`${u.id}:${look}`)) return false;
    if (look === '2d') return true;
    if (look === '3d') return (u.gl && hasGL()) || u.persp;
    return u.gl && hasGL(); // pov
  }

  function povGate(snap, p) {
    if (p.reducedMotion) return false;
    if (!snap || !snap.alive || snap.waiting) return false;
    if ((snap.score | 0) < D.povMinScore) return false;
    return clearAhead(snap);
  }

  /** Room look by today's weighting: first person about 0.45 of the board view, when allowed. */
  function roomLook(u, snap, p) {
    const has3d = usable(u, '3d');
    const pov = usable(u, 'pov') && povGate(snap, p);
    if (pov && (!has3d || rng.next() < D.povWeightFactor / (1 + D.povWeightFactor))) return 'pov';
    return has3d ? '3d' : null;
  }

  /** Look on arrival (4.1). */
  function arrivalLook(u, snap, p) {
    if (lookLock && usable(u, lookLock) && !(lookLock === 'pov' && p.reducedMotion)) return lookLock;
    const can2d = usable(u, '2d');
    const room = usable(u, '3d') || usable(u, 'pov');
    if (can2d && !room) return '2d';
    if (!can2d) return roomLook(u, snap, p) || u.looks[0];
    // A universe with both looks: 2D 40% of the time, else a room look. The four built rooms
    // have no 2D look and never reach here.
    if (rng.next() < D.flatChance) return '2d';
    return roomLook(u, snap, p) || '2d';
  }

  /** A held bite flips to a different look of the same universe (castle: 2d <-> 3d). */
  function flipLook(u, snap, p) {
    if (lookLock && usable(u, lookLock)) return lookLock;
    const cands = [];
    for (const look of LOOK_ORDER) {
      if (look === st.look || !usable(u, look)) continue;
      if (look === 'pov' && !povGate(snap, p)) continue;
      cands.push(look);
    }
    if (!cands.length) return st.look;
    const w = (l) => (l === 'pov' ? D.povWeightFactor : 1);
    let r = rng.next() * cands.reduce((s, l) => s + w(l), 0);
    for (const l of cands) { r -= w(l); if (r <= 0) return l; }
    return cands[cands.length - 1];
  }

  /** Board look of the current universe (never pov). */
  function boardLook(u) {
    if (st.look !== 'pov' && usable(u, st.look)) return st.look;
    if (usable(u, '3d')) return '3d';
    if (usable(u, '2d')) return '2d';
    return null;
  }

  const infoOf = (uid, look) => {
    const u = byId.get(uid);
    return (u && u.info[look]) || null;
  };
  const curInfo = () => infoOf(st.universe, st.look) || fallbackInfo();
  function fallbackInfo() {
    const h = byId.get(home());
    return (h && (h.info['2d'] || h.info[h.looks[0]])) || null;
  }

  const sceneById = new Map();
  for (const u of universes) for (const look of u.looks) sceneById.set(u.info[look].id, u.info[look]);
  const special = (u) => !!u && (u.rules !== 'box' || u.mushrooms);

  function reset(now = 0, snap = null) {
    const uid = snap && snap.universe && byId.has(snap.universe.id) ? snap.universe.id : home();
    const u = byId.get(uid);
    const locked = st ? st.locked : false;
    st = {
      universe: uid, look: '2d', scene: uid, showing: uid, prev: uid, prevTimeline: uid, prevUntil: -Infinity,
      cutAt: now, lastCutAt: -Infinity, cutCount: 0, povAt: -Infinity,
      visited: new Set([uid]), roomVisited: new Set(),
      chaos: 0, score: snap ? snap.score | 0 : 0, variant: 0, bite: null, biteAt: -Infinity,
      invertUntil: -Infinity, strobe: null, phrase: null, veil: null, veilState: null,
      dead: false, locked, lastCut: null, resets: 0, crash: false, crashAt: -Infinity,
    };
    st.chaos = clamp01(st.score / D.chaosScore);
    if (u) {
      st.look = arrivalLook(u, snap, prefs());
      if (st.look !== '2d') st.roomVisited.add(uid);
      st.scene = st.showing = st.prev = u.info[st.look].id;
    }
  }

  /** Reduced flash: a veil that fades in 450 ms, and stays partly up while shifts come fast. */
  function startVeil(color, now) {
    const gap = now - st.lastCutAt;
    const vs = st.veilState;
    const rapid = gap < D.veilGapMs;
    st.veilState = {
      color: rapid && vs ? vs.color : color,
      t0: now,
      peak: D.veilFrom,
      hold: rapid ? D.veilHold : 0,
    };
    st.veil = { color: st.veilState.color, at: now, dur: D.veilMs, from: D.veilFrom };
  }

  function veilAlpha(now) {
    const v = st.veilState;
    if (!v) return 0;
    const t = now - v.t0;
    if (t < 0) return v.peak;
    const fade = v.peak * (1 - t / D.veilMs);
    const floor = v.hold * clamp01(1 - t / D.veilGapMs);
    return Math.max(0, fade, floor);
  }

  function cut(uid, look, now, { impact = false, held = false, totalReset = false, big = false } = {}) {
    const fromInfo = curInfo();
    const toInfo = infoOf(uid, look) || fallbackInfo();
    if (!toInfo) return null;
    const p = prefs();
    const wild = !p.reducedFlash;
    const swing = !!fromInfo && Math.abs(toInfo.luma - fromInfo.luma) > D.swingLuma;
    const fromUid = st.universe, prevLook = st.look;
    st.prev = st.scene;
    if (uid !== st.universe) st.prevTimeline = st.universe;
    st.universe = uid;
    st.look = look;
    st.scene = toInfo.id;
    st.cutCount += 1;

    let showAt = now;
    st.invertUntil = -Infinity;
    st.strobe = null;
    st.prevUntil = -Infinity;
    if (!wild) startVeil((fromInfo && fromInfo.veil) || '#000000', now);
    st.lastCutAt = now;
    // Calm universes never flash: no inversion into them; leaving one inverts the new scene.
    const calmTo = !!toInfo.calm, calmFrom = !!(fromInfo && fromInfo.calm);
    if (wild && impact && !calmTo) {
      const inv = D.invertMinMs + rng.next() * (D.invertMaxMs - D.invertMinMs);
      st.invertUntil = now + inv;
      if (!calmFrom) { showAt = now + inv; st.prevUntil = showAt; }
    }
    const firstRoom = look !== '2d' && !st.roomVisited.has(uid);
    const bigEvent = big || st.cutCount === 1 || firstRoom || look === 'pov';
    if (wild && impact && !calmTo && (bigEvent || rng.next() < D.strobeBase + D.strobeChaos * st.chaos)) {
      const count = D.strobeMin + rng.int(D.strobeMax - D.strobeMin + 1);
      st.strobe = { at: showAt, count, dur: D.strobeWindowMs };
    }

    st.phrase = null;
    if (impact && look !== 'pov' && uid !== home()) {
      let text = null;
      if (st.cutCount === 1 && !held) text = 'TIME BREAK!';
      else if (firstRoom && toInfo.year) text = `WELCOME TO ${toInfo.year}`;
      else if (rng.next() < 0.3 + 0.5 * st.chaos) {
        const pool = phrases.filter((t) => t !== 'TIME BREAK!' || st.chaos > 0.3);
        text = rng.pick(pool.length ? pool : phrases);
      }
      if (text) st.phrase = { text, at: showAt, dur: D.phraseMs, seed: rng.int(1 << 30) };
    }
    st.visited.add(uid);
    if (look !== '2d') st.roomVisited.add(uid);
    if (look === 'pov') st.povAt = showAt;
    if (totalReset) st.resets += 1;
    st.cutAt = showAt;
    st.showing = showAt > now ? st.prev : st.scene;
    st.lastCut = Object.freeze({
      from: fromUid, to: uid, look, prevLook, fromScene: st.prev, toScene: st.scene,
      swing, impact, held, reset: totalReset, at: now,
    });
    return st.lastCut;
  }

  /** The simulation shifted (snapshot already shows the new universe). */
  function onShift(e, snap, now) {
    st.dead = false;
    const u = byId.get(e.to);
    if (!u) { // no look loaded for it (main never passes one): keep the current look
      st.universe = e.to;
      return null;
    }
    const p = prefs();
    let look;
    if (e.reset && usable(u, '2d')) look = '2d';
    else look = arrivalLook(u, snap, p);
    return cut(u.id, look, now, { impact: !e.reset, totalReset: !!e.reset });
  }

  /**
   * A food event. Every bite punches (fx.punch). A held bite inside a special universe (or a
   * debug-locked one) cuts to a different look of the same universe with a shift's impact.
   */
  function onAte(e, snap, now) {
    st.variant += 1;
    st.score = e && Number.isFinite(e.score) ? e.score : st.score + 1;
    st.chaos = clamp01(st.score / D.chaosScore);
    const head = snap && snap.snake && snap.snake[0];
    st.bite = e && e.cell ? { x: e.cell.x, y: e.cell.y } : head ? { x: head.x, y: head.y } : null;
    st.biteAt = now;
    if (!e || !e.held) return null; // the shift follows
    const u = byId.get(st.universe);
    if (!u || !(special(u) || st.locked)) return null; // held rare universe: local changes only, as built
    return cut(u.id, flipLook(u, snap, prefs()), now, { impact: true, held: true });
  }

  /** A life was lost: impact, strobe burst, phrase; the board look is forced (never pov). */
  function onLifeLost(e, snap, now) {
    const u = byId.get(st.universe);
    let res = null;
    if (st.look === 'pov' && u) {
      const bl = boardLook(u);
      if (bl) res = cut(u.id, bl, now, { impact: false });
    }
    const p = prefs();
    const info = curInfo();
    st.invertUntil = -Infinity;
    st.strobe = null;
    st.prevUntil = -Infinity;
    st.showing = st.scene;
    const lives = e && Number.isFinite(e.lives) ? e.lives : 0;
    if (crashScreen(info, (e && e.death) || (snap && snap.death), now)) {
      // The look's own crash screen is the impact. The phrase still takes its draw, so the
      // looks picked after this crash are the same as without the crash screen.
      rng.int(1 << 30);
      st.phrase = null;
      st.biteAt = now;
      return res;
    }
    if (!p.reducedFlash && !(info && info.calm)) {
      st.invertUntil = now + D.lifeLostInvertMs;
      st.strobe = { at: now + D.lifeLostInvertMs, count: D.strobeMin + 1, dur: D.strobeWindowMs };
    } else if (p.reducedFlash) {
      startVeil((info && info.veil) || '#000000', now);
    }
    st.phrase = { text: lives === 1 ? 'LAST LIFE' : 'LIFE LOST', at: now, dur: D.phraseMs * 1.4, seed: rng.int(1 << 30) };
    st.biteAt = now;
    return res;
  }

  /** True (and the crash recorded) when the scene paints its own crash screen for this death. */
  function crashScreen(info, death, now) {
    st.crash = !!(info && info.crashScreen && death && CRASH_REASONS.has(death.reason));
    if (st.crash) st.crashAt = now;
    return st.crash;
  }

  function onDeath(snap, now) {
    st.dead = true;
    const p = prefs();
    const info = curInfo();
    if (crashScreen(info, snap && snap.death, now)) return;
    if (!p.reducedFlash && !st.locked && !(info && info.calm)) {
      st.invertUntil = now + D.invertMaxMs;
      st.strobe = { at: now + D.invertMaxMs, count: D.strobeMin, dur: D.strobeWindowMs * 0.75 };
    }
  }

  /** Per frame: first-person timeout, preference changes, lost WebGL, impact timing, veil. */
  function update(snap, now) {
    const p = prefs();
    const u = byId.get(st.universe);
    let res = null;
    if (u && !usable(u, st.look)) {
      const alt = ['3d', '2d'].find((l) => l !== st.look && usable(u, l));
      if (alt) res = cut(u.id, alt, now);
      else if (st.look !== '2d') { st.look = '2d'; st.scene = st.showing = (fallbackInfo() || { id: home() }).id; }
    } else if (u && st.look === 'pov' && lookLock !== 'pov') {
      const waiting = !!(snap && snap.waiting);
      if (p.reducedMotion || waiting || (!st.dead && now - st.povAt >= D.povTimeoutMs)) {
        const bl = boardLook(u);
        if (bl) res = cut(u.id, bl, now);
      }
    }
    if (p.reducedFlash) {
      st.invertUntil = -Infinity;
      st.strobe = null;
      st.prevUntil = -Infinity;
      const a = veilAlpha(now);
      st.veil = a > 0.002 ? { color: st.veilState.color, at: now, dur: 1e9, from: a } : null;
      if (!st.veil) st.veilState = null;
    } else {
      st.veilState = null;
      if (st.veil && now - st.veil.at >= st.veil.dur) st.veil = null;
    }
    st.showing = now < st.prevUntil ? st.prev : st.scene;
    return res;
  }

  function disable(id, now = 0, kind = null) {
    const u = byId.get(id);
    if (!u) return;
    for (const look of u.looks) {
      if (!kind || (kind === '2d' ? look === '2d' : look !== '2d')) disabled.add(`${id}:${look}`);
    }
    if (st.universe === id) update(null, now);
  }

  /** Debug: hold one look (?look=), or null to release. Cuts to it at once when it is usable. */
  function setLook(look, now = 0) {
    lookLock = look || null;
    const u = byId.get(st.universe);
    if (lookLock && u && usable(u, lookLock) && st.look !== lookLock) return cut(u.id, lookLock, now);
    return null;
  }

  /** Read-only view `d` for main, renderers and UI (field names fixed by LEVELS_PLAN 8.2). */
  function get() {
    const info = sceneById.get(st.showing) || curInfo();
    return Object.freeze({
      scene: st.scene, showing: info ? info.id : st.showing, prev: st.prev, sceneInfo: info,
      prevTimeline: st.prevTimeline, resets: st.resets,
      view: info ? info.view : 'board', kind: info ? info.kind : '2d', timeline: info ? info.timeline : st.universe,
      look: info ? info.look : '2d', universe: st.universe, calm: !!(info && info.calm),
      cutAt: st.cutAt, lastCutAt: st.lastCutAt, cutCount: st.cutCount,
      chaos: st.chaos, score: st.score, variant: st.variant, bite: st.bite, biteAt: st.biteAt,
      invertUntil: st.invertUntil, strobe: st.strobe, phrase: st.phrase, veil: st.veil,
      locked: st.locked, lastCut: st.lastCut,
      crash: st.crash, crashAt: st.crashAt,
    });
  }

  reset(0);

  return {
    universes,
    reset, onShift, onAte, onLifeLost, onDeath, update, disable, setLook, get,
    /** The simulation holds one universe (debug lock): every bite flips the look. */
    lock(on = true) { st.locked = !!on; },
    has(id, look) { const u = byId.get(id); return !!u && (look ? usable(u, look) : u.looks.some((l) => usable(u, l))); },
    get lookLock() { return lookLock; },
  };
}
