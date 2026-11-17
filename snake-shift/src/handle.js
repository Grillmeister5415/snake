// Usernames (LEADERBOARD_PLAN A3). Pure: no DOM, no Node built-ins; the form and the server use the
// same rule. A handle is a display name only, never a login: duplicates are allowed.
//
// Rule: trimmed, upper case, 3 to 12 characters from A-Z, 0-9 and underscore.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 12;
const ALLOWED = /^[A-Za-z0-9_]+$/; // lower case is fine as typed; it is stored upper-cased

/** Trim and upper-case. Anything that is not a string becomes ''. */
export function normaliseHandle(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

/**
 * Checks a handle as typed (it is normalised first).
 * Returns null when it is fine, otherwise 'empty' | 'too_short' | 'too_long' | 'bad_chars'.
 * The server adds 'blocked' (server/blocklist.js).
 */
export function validateHandle(raw) {
  // A huge string is too long before it is worth trimming.
  if (typeof raw === 'string' && raw.length > 64) return 'too_long';
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return 'empty';
  // Checked before upper-casing: 'ß' would otherwise turn into 'SS' and 'ı' into 'I'.
  if (!ALLOWED.test(t)) return 'bad_chars';
  if (t.length < HANDLE_MIN) return 'too_short';
  if (t.length > HANDLE_MAX) return 'too_long';
  return null;
}

// At most 5 + 1 + 6 characters, so every pair fits in HANDLE_MAX.
const FIRST = Object.freeze(['DOT', 'NEON', 'BYTE', 'PIXEL', 'TURBO', 'RETRO', 'VOID', 'ACID', 'LASER', 'GHOST', 'CRT', 'MEGA', 'HYPER', 'LUCKY', 'SNEAK']);
const SECOND = Object.freeze(['GOBLIN', 'VIPER', 'COMET', 'NOMAD', 'RONIN', 'WIZARD', 'TIGER', 'SPARK', 'ROGUE', 'PILOT', 'SHIFT', 'LOOP', 'BANDIT', 'COBRA', 'MOTH']);

/**
 * A ready-made handle such as DOT_GOBLIN, always valid.
 * @param {(() => number) | { next: () => number }} [rng] a source of numbers in [0, 1); Math.random by default
 */
export function suggestHandle(rng = Math.random) {
  const r = typeof rng === 'function' ? rng : () => rng.next();
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  return `${pick(FIRST)}_${pick(SECOND)}`;
}

/** Every suggestion the lists can make (for tests). */
export function allSuggestions() {
  const out = [];
  for (const a of FIRST) for (const b of SECOND) out.push(`${a}_${b}`);
  return out;
}
