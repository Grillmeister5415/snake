// A short list of words no handle may contain (LEADERBOARD_PLAN A0, A13). Deliberately short and
// obvious: slurs, the worst swear words, Nazi references, in English and German. It is matched
// inside longer handles too, with underscores ignored and common digit stand-ins read as letters
// (0 O, 1 I or L, 3 E, 4 A, 5 S, 7 T, 8 B). It will miss creative spellings; the admin script can
// rename or hide a player for those (server/admin.mjs).

import { normaliseHandle, validateHandle } from '../src/handle.js';

const WORDS = Object.freeze([
  'FUCK', 'SHIT', 'CUNT', 'BITCH', 'WHORE', 'SLUT', 'PUSSY', 'PENIS', 'PORN', 'ASSHOLE', 'WANKER',
  'NIGGER', 'NIGGA', 'FAGGOT', 'RETARD', 'RAPIST',
  'NAZI', 'HITLER', 'SIEGHEIL', 'KKK',
  'FOTZE', 'WICHSER', 'NUTTE', 'HURENSOHN', 'SCHWUCHTEL', 'KANAKE',
]);

const DIGITS_I = { 0: 'O', 1: 'I', 3: 'E', 4: 'A', 5: 'S', 7: 'T', 8: 'B' };
const DIGITS_L = { ...DIGITS_I, 1: 'L' };
const swap = (s, map) => s.replace(/[0-9]/g, (d) => map[d] || d);

/** The readings of a handle that are checked against the list. */
function readings(handle) {
  const bare = normaliseHandle(handle).replace(/_/g, '');
  return [bare, swap(bare, DIGITS_I), swap(bare, DIGITS_L)];
}

/** True when the handle contains a blocked word in any reading. */
export function isBlocked(handle) {
  return readings(handle).some((r) => WORDS.some((w) => r.includes(w)));
}

/**
 * The server's handle check: the shared rule (src/handle.js) and then the blocklist.
 * Returns null when the handle may be used, otherwise a reason code (see validateHandle, plus 'blocked').
 */
export function handleProblem(raw) {
  return validateHandle(raw) || (isBlocked(raw) ? 'blocked' : null);
}
