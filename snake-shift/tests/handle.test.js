// Usernames (LEADERBOARD_PLAN A3): the shared rule the form and the server both apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseHandle, validateHandle, suggestHandle, allSuggestions, HANDLE_MIN, HANDLE_MAX } from '../src/handle.js';
import { createRng } from '../src/rng.js';

test('handles are trimmed and upper-cased', () => {
  assert.equal(normaliseHandle('  dot_goblin '), 'DOT_GOBLIN');
  assert.equal(normaliseHandle('Trubel'), 'TRUBEL');
  assert.equal(normaliseHandle(42), '');
  assert.equal(normaliseHandle(null), '');
});

test('the rule: 3 to 12 of A-Z, 0-9 and underscore', () => {
  assert.equal(HANDLE_MIN, 3);
  assert.equal(HANDLE_MAX, 12);
  for (const ok of ['ABC', 'trubel', 'N0_FUTURE', '  x_1  ', 'ABCDEFGHIJKL', '___', '123']) {
    assert.equal(validateHandle(ok), null, ok);
  }
  const bad = [
    ['', 'empty'], ['   ', 'empty'], [undefined, 'empty'], [7, 'empty'],
    ['AB', 'too_short'], [' ab ', 'too_short'], ['ABCDEFGHIJKLM', 'too_long'], ['x'.repeat(65), 'too_long'],
    ['DOT GOBLIN', 'bad_chars'], ['DOT-GOBLIN', 'bad_chars'], ['ÄRGER', 'bad_chars'], ['straße', 'bad_chars'],
    ['<b>HI</b>', 'bad_chars'], ['😀😀😀', 'bad_chars'], ['A\u0000B', 'bad_chars'], ['TAB\tX', 'bad_chars'],
    // Letters that upper-case into ASCII are still refused, so the stored name is what was typed.
    ['ıdea', 'bad_chars'], ['ﬀox', 'bad_chars'], ['ſnake', 'bad_chars'],
  ];
  for (const [h, want] of bad) assert.equal(validateHandle(h), want, JSON.stringify(h));
});

test('suggestions are always valid handles and vary', () => {
  for (const h of allSuggestions()) assert.equal(validateHandle(h), null, h);
  const rng = createRng(5);
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(suggestHandle(rng));
  assert.ok(seen.size > 20);
  assert.match(suggestHandle(() => 0), /^[A-Z]+_[A-Z]+$/);
  assert.match(suggestHandle(() => 0.999999), /^[A-Z]+_[A-Z]+$/);
  assert.equal(validateHandle(suggestHandle()), null);
});
