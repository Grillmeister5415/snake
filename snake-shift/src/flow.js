// The universe sequence (LEVELS_PLAN 2.2). Pure: no DOM. It draws only from the
// generator it is given (the simulation's), so a seed and the same inputs give the same run.
//
// holdLeft counts the held food events still to come: food events that will NOT shift.
// A standard universe has 0 (the next food shifts away). A special universe arrives with
// holdMin-1 .. holdMax-1, so it lasts 4..6 food events; a rare one arrives with 0 or 1.

import { FLOW, SPECIAL, UNIVERSES } from './rules-config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Special universes change the rules: lane, cube or mushrooms. */
export function isSpecial(u) {
  return !!u && (u.rules === 'lane' || u.rules === 'cube' || !!u.mushrooms);
}

/** Fill in defaults for a caller's universe list. */
export function normaliseUniverses(list = UNIVERSES) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    if (!raw || typeof raw.id !== 'string' || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const rules = raw.rules === 'lane' || raw.rules === 'cube' ? raw.rules : 'box';
    const room = !!raw.room;
    const weight = typeof raw.weight === 'number' && raw.weight > 0 ? raw.weight : (room ? FLOW.roomWeight : FLOW.flatWeight);
    out.push(Object.freeze({ id: raw.id, rules, mushrooms: !!raw.mushrooms, rare: !!raw.rare, room, weight }));
  }
  return Object.freeze(out);
}

/**
 * createFlow({ universes, rng })
 *   reset(startId)           start a run in startId (default: 'lcd')
 *   onFood(score)            a food event happened; score already counts it.
 *                            -> { shift: false } (held) or { shift: true, from, to, index, reset }
 *   held()                   true when the next food event will not shift (draws nothing)
 *   lock(id | null)          debug: hold one universe; switching to it returns a shift, else null
 *   current()                { id, universe, holdLeft, index, locked }
 */
export function createFlow({ universes = UNIVERSES, rng }) {
  const list = normaliseUniverses(universes);
  if (!list.length) throw new Error('[flow] no universes');
  const byId = new Map(list.map((u) => [u.id, u]));
  const home = byId.has(FLOW.home) ? FLOW.home : list[0].id;
  let st;

  const opening = () => st.scriptIndex < FLOW.opening.length;

  function holdFor(u) {
    if (u.rare) return rng.int(Math.max(1, FLOW.rareHoldMax));
    if (isSpecial(u)) return SPECIAL.holdMin - 1 + rng.int(SPECIAL.holdMax - SPECIAL.holdMin + 1);
    return 0;
  }

  function reset(startId) {
    const locked = st ? st.locked : null; // a debug lock survives a new run
    const id = locked || (byId.has(startId) ? startId : home);
    st = { id, holdLeft: 0, index: 0, scriptIndex: 0, visited: new Set([id]), recent: [], locked, resets: 0 };
    st.holdLeft = holdFor(byId.get(id));
  }

  function weightOf(u, chaos) {
    let w = u.rare ? FLOW.rareWeight * (0.5 + chaos) : isSpecial(u) ? SPECIAL.weight : Math.max(0.01, u.weight);
    if (st.recent.includes(u.id)) w *= FLOW.recentFactor;
    else if (!u.rare && !st.visited.has(u.id)) w *= FLOW.freshFactor;
    return w;
  }

  function pickRandom(score, chaos) {
    const cur = byId.get(st.id);
    const all = list.filter((u) => u.id !== st.id);
    if (!all.length) return null;
    // Rare: never in the opening, never early, never straight after another rare one.
    const noRare = opening() || score < FLOW.rareMinScore || cur.rare;
    // Special: never before the fourth food, never two in a row.
    const noSpecial = opening() || score < SPECIAL.minScore || isSpecial(cur);
    let pool = all.filter((u) => !(noRare && u.rare) && !(noSpecial && isSpecial(u)));
    if (!pool.length) pool = all.filter((u) => !(noSpecial && isSpecial(u)));
    if (!pool.length) pool = all;
    let total = 0;
    for (const u of pool) total += weightOf(u, chaos);
    let r = rng.next() * total;
    for (const u of pool) {
      r -= weightOf(u, chaos);
      if (r <= 0) return u.id;
    }
    return pool[pool.length - 1].id;
  }

  function pickNext(score, chaos) {
    while (opening()) {
      const id = FLOW.opening[st.scriptIndex++];
      if (byId.has(id) && id !== st.id) return id;
    }
    return pickRandom(score, chaos);
  }

  function go(id, reset = false) {
    const from = st.id;
    st.id = id;
    st.index += 1;
    st.visited.add(id);
    st.recent.push(id);
    if (st.recent.length > FLOW.recentLen) st.recent.shift();
    st.holdLeft = holdFor(byId.get(id));
    if (reset) st.resets += 1;
    return { shift: true, from, to: id, index: st.index, reset };
  }

  function onFood(score) {
    if (st.locked) return { shift: false };
    if (st.holdLeft > 0) { st.holdLeft -= 1; return { shift: false }; }
    const cur = byId.get(st.id);
    const chaos = clamp01(score / FLOW.chaosScore);
    // Total Reset: after a room or a rare universe, an occasional snap back to lcd.
    if (!opening() && (cur.room || cur.rare) && st.id !== home && rng.next() < FLOW.resetBase + FLOW.resetChaos * chaos) {
      return go(home, true);
    }
    const next = pickNext(score, chaos);
    return next ? go(next) : { shift: false };
  }

  /** True when the next food event will not shift (held or locked). Draws nothing. */
  function held() {
    return !!st.locked || st.holdLeft > 0;
  }

  function lock(id) {
    if (id === null || id === undefined) { st.locked = null; return null; }
    if (!byId.has(id)) return null;
    st.locked = id;
    return id === st.id ? null : go(id);
  }

  function current() {
    return { id: st.id, universe: byId.get(st.id), holdLeft: st.holdLeft, index: st.index, locked: st.locked, resets: st.resets };
  }

  reset(home);
  return { universes: list, home, reset, onFood, held, lock, current, has: (id) => byId.has(id) };
}
