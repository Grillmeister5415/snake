// The USERNAME form (LEADERBOARD_PLAN A0, A3, C6): the rule, inline validation that waits for a
// submit or for leaving the field, the submit event that never navigates, shuffle, SKIP and the
// change mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUsername, inlineMessage, createUsername, USERNAME_RULE, USERNAME_MESSAGES } from '../src/username.js';
import { allSuggestions } from '../src/handle.js';
import { fakeDocument, USERNAME_SPEC } from './helpers/fake-dom.js';

test('check: trimmed, upper case, 3 to 12 of A-Z, 0-9 and _', () => {
  assert.deepEqual(checkUsername('  dot_goblin '), { ok: true, handle: 'DOT_GOBLIN', reason: null, message: '' });
  assert.equal(checkUsername('abc').handle, 'ABC');
  assert.equal(checkUsername('ABCDEFGHIJKL').ok, true);
  for (const [raw, reason] of [['', 'empty'], ['   ', 'empty'], ['ab', 'too_short'], ['ABCDEFGHIJKLM', 'too_long'], ['dot goblin', 'bad_chars'], ['straße', 'bad_chars'], ['a-b-c', 'bad_chars']]) {
    const c = checkUsername(raw);
    assert.deepEqual([c.ok, c.reason, c.message], [false, reason, USERNAME_MESSAGES[reason]], raw);
  }
  assert.equal(USERNAME_RULE, '3–12 CHARACTERS: A–Z, 0–9, _');
});

test('inline messages: quiet while typing a first attempt, shown after submit or leaving the field, gone once valid', () => {
  assert.deepEqual(inlineMessage({ value: 'a', touched: false }), { message: '', invalid: false });
  assert.deepEqual(inlineMessage({ value: 'a', touched: true }), { message: USERNAME_MESSAGES.too_short, invalid: true });
  assert.deepEqual(inlineMessage({ value: 'abc', touched: true }), { message: '', invalid: false });
});

function setup() {
  const doc = fakeDocument(USERNAME_SPEC);
  const log = [];
  let i = 0;
  const form = createUsername({
    doc, rng: () => ((i++ * 0.37) % 1),
    onSubmit: (h, mode) => log.push(`submit ${h} ${mode}`), onSkip: () => log.push('skip'), onBack: () => log.push('back'),
  });
  return { doc, form, log, $: (id) => doc.getElementById(id) };
}

test('form: first use suggests an editable name; submit is a real submit event that never navigates', () => {
  const { form, log, $, doc } = setup();
  form.open({ mode: 'first' });
  const suggested = $('username-input').value;
  assert.ok(allSuggestions().includes(suggested), suggested);
  assert.equal($('username-submit').textContent, '[ LET ME IN ]');
  assert.equal($('username-skip').hidden, false);
  assert.equal(doc.activeElement, $('username-input'));
  assert.equal($('username-rule').textContent, USERNAME_RULE);
  const e = $('username-form').dispatch('submit');
  assert.equal(e.defaultPrevented, true, 'never navigates (form-action none)');
  assert.deepEqual(log, [`submit ${suggested} first`]);
  // Shuffle makes another valid suggestion.
  $('username-shuffle').click();
  assert.notEqual($('username-input').value, suggested);
  assert.equal(checkUsername($('username-input').value).ok, true);
});

test('form: an invalid name shows its message on submit, keeps the panel, clears as it gets fixed', () => {
  const { form, log, $, doc } = setup();
  form.open({ mode: 'first' });
  $('username-input').value = 'no';
  $('username-input').dispatch('input');
  assert.equal($('username-error').hidden, true, 'not while typing');
  const e = $('username-form').dispatch('submit');
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(log, []);
  assert.equal($('username-error').textContent, USERNAME_MESSAGES.too_short);
  assert.equal($('username-input').getAttribute('aria-invalid'), 'true');
  assert.equal(doc.activeElement, $('username-input'));
  $('username-input').value = 'now';
  $('username-input').dispatch('input');
  assert.equal($('username-error').hidden, true);
  assert.equal($('username-input').getAttribute('aria-invalid'), 'false');
  $('username-form').dispatch('submit');
  assert.deepEqual(log, ['submit NOW first']);
  // Leaving the field with a bad name shows it too.
  form.open({ mode: 'first' });
  $('username-input').value = 'bad name';
  $('username-input').dispatch('blur');
  assert.equal($('username-error').textContent, USERNAME_MESSAGES.bad_chars);
});

test('form: SKIP and BACK; change mode shows the current name, [ SAVE ] and no SKIP; a server refusal shows at once', () => {
  const { form, log, $, doc } = setup();
  form.open({ mode: 'first' });
  $('username-skip').click();
  $('username-back').click();
  assert.deepEqual(log, ['skip', 'back']);
  form.open({ mode: 'change', current: 'TRUBEL', problem: 'blocked' });
  assert.equal($('username-input').value, 'TRUBEL');
  assert.equal($('username-submit').textContent, '[ SAVE ]');
  assert.equal($('username-skip').hidden, true);
  assert.equal($('username-error').textContent, USERNAME_MESSAGES.blocked);
  form.close();
  assert.equal($('username').hidden, true);
  // On a touch screen the heading takes focus, so the keyboard does not pop up over the panel.
  form.open({ mode: 'first', focusField: false });
  assert.equal(doc.activeElement, $('username-h'));
});
