// Seeded random generator (mulberry32). Pure, no globals.
// The simulation and the director each own one, so visuals can never move the dot.

export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed = 1) {
  let state = hashSeed(seed) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** integer in [0, n) */
    int(n) { return Math.floor(next() * n); },
    range(a, b) { return a + next() * (b - a); },
    pick(arr) { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
    chance(p) { return next() < p; },
    get state() { return state; },
    set state(v) { state = v >>> 0; },
  };
}

/** A fresh run seed that does not come from any game state. */
export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
