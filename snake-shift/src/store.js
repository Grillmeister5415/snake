// One JSON value under one localStorage key, with a memory fallback (LEADERBOARD_PLAN A3, A12).
// Private mode, a full quota or blocked site data make localStorage throw or vanish; the game
// must play on, so every read and write here is guarded and the last value is kept in memory.
// Pure apart from the storage it is given: tests pass a fake or a throwing one.

/** The page's localStorage, or null when even touching it throws. */
export function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Some browsers read fine but throw on every write (old private modes): try one tiny write. */
function writable(store) {
  try {
    store.setItem('snake-shift/probe', '1');
    store.removeItem('snake-shift/probe');
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @param {{ storage?: Storage | null }} [opts] storage: null for memory only; default localStorage
 * Returns { read(), write(value), remove(), get persistent() }.
 *   read()  the stored value (parsed), or null; falls back to the last value written in memory
 *   write() returns true when the value reached storage, false when it lives in memory only
 *   persistent  false once storage failed (callers promise nothing then)
 */
export function openStore(key, { storage } = {}) {
  const store = storage !== undefined ? storage : defaultStorage();
  let memory = null; // the last text written or read
  let persistent = !!store && writable(store);

  function read() {
    if (store && persistent) {
      try {
        const text = store.getItem(key);
        if (text !== null) memory = text;
        else if (memory !== null) memory = null; // removed elsewhere (another tab, or the user)
      } catch { persistent = false; }
    }
    if (memory === null) return null;
    try { return JSON.parse(memory); } catch { return null; }
  }

  function write(value) {
    const text = JSON.stringify(value);
    memory = text;
    if (!store) return false;
    try {
      store.setItem(key, text);
      persistent = true;
      return true;
    } catch {
      persistent = false;
      return false;
    }
  }

  function remove() {
    memory = null;
    if (!store) return;
    try { store.removeItem(key); } catch { /* memory is cleared; that is all we can do */ }
  }

  return { read, write, remove, get persistent() { return persistent; } };
}

/** A Map-backed Storage for tests and for memory-only use. `fail` makes every call throw. */
export function memoryStorage({ fail = false } = {}) {
  const m = new Map();
  const guard = () => { if (fail) throw new Error('storage blocked'); };
  return {
    getItem(k) { guard(); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { guard(); m.set(k, String(v)); },
    removeItem(k) { guard(); m.delete(k); },
    get size() { return m.size; },
    dump() { return Object.fromEntries(m); },
  };
}
