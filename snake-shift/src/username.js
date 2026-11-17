// The USERNAME panel (LEADERBOARD_PLAN A0, A3, C6): a real form with a visible label, a suggested
// name with a shuffle, the rule beside the field, inline validation, [ LET ME IN ], SKIP and BACK.
// Opened by the first PLAY, and again from "Change" / "Set username" (then [ SAVE ], no SKIP).
//
// The form never navigates: its submit listener always calls preventDefault (the live site's
// content policy has form-action 'none'). Saving is local and instant; the server hears about it
// in the background (identity.js). Escape is handled by the menu navigation (nav.js), like BACK.

import { normaliseHandle, validateHandle, suggestHandle, HANDLE_MIN, HANDLE_MAX } from './handle.js';

/** Inline messages per reason; 'blocked' comes from the server only. */
export const USERNAME_MESSAGES = Object.freeze({
  empty: 'TYPE A USERNAME, OR SKIP.',
  too_short: `AT LEAST ${HANDLE_MIN} CHARACTERS.`,
  too_long: `AT MOST ${HANDLE_MAX} CHARACTERS.`,
  bad_chars: 'ONLY A–Z, 0–9 AND _.',
  blocked: 'THAT USERNAME IS NOT ALLOWED. PICK ANOTHER.',
  invalid: 'THE SERVER DID NOT ACCEPT THAT USERNAME.',
});

/** The rule shown beside the field. */
export const USERNAME_RULE = `${HANDLE_MIN}–${HANDLE_MAX} CHARACTERS: A–Z, 0–9, _`;

/**
 * Checks what is in the field. Pure.
 * Returns { ok, handle, reason, message }: handle is the trimmed upper-case name when ok.
 */
export function checkUsername(raw) {
  const reason = validateHandle(raw);
  if (reason) return { ok: false, handle: null, reason, message: USERNAME_MESSAGES[reason] };
  return { ok: true, handle: normaliseHandle(raw), reason: null, message: '' };
}

/**
 * When to show the message (pure): never while someone is still typing a first attempt; after a
 * submit or after leaving the field with something in it, until the value is valid again.
 * @param {{ value: string, touched: boolean }} s
 * @returns {{ message: string, invalid: boolean }}
 */
export function inlineMessage({ value, touched }) {
  if (!touched) return { message: '', invalid: false };
  const c = checkUsername(value);
  return { message: c.message, invalid: !c.ok };
}

/**
 * @param {{ doc?: Document, rng?: () => number,
 *   onSubmit: (handle: string, mode: 'first'|'change') => void,
 *   onSkip: () => void, onBack: () => void }} deps
 * Returns { open({ mode, current, problem }), close(), get isOpen, get mode, el }.
 */
export function createUsername({ doc = document, rng = Math.random, onSubmit, onSkip, onBack }) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    panel: $('username'), form: $('username-form'), input: $('username-input'), shuffle: $('username-shuffle'),
    rule: $('username-rule'), error: $('username-error'), submit: $('username-submit'),
    skip: $('username-skip'), back: $('username-back'), note: $('username-note'),
  };
  let open = false;
  let mode = 'first';
  let touched = false;
  el.rule.textContent = USERNAME_RULE;

  function show({ message, invalid }) {
    el.error.textContent = message;
    el.error.hidden = !message;
    el.input.setAttribute('aria-invalid', String(invalid));
  }
  const refresh = () => show(inlineMessage({ value: el.input.value, touched }));

  el.form.addEventListener('submit', (e) => {
    e.preventDefault(); // never navigate (form-action 'none' on the live site)
    const c = checkUsername(el.input.value);
    if (!c.ok) {
      touched = true;
      refresh();
      el.input.focus();
      return;
    }
    onSubmit(c.handle, mode);
  });
  el.input.addEventListener('input', () => {
    if (touched) refresh();
    else show({ message: '', invalid: false });
  });
  el.input.addEventListener('blur', () => {
    if (!open) return;
    if (el.input.value.trim()) { touched = true; refresh(); }
  });
  el.shuffle.addEventListener('click', () => {
    el.input.value = suggestHandle(rng);
    touched = false;
    refresh();
  });
  el.skip.addEventListener('click', () => onSkip());
  el.back.addEventListener('click', () => onBack());

  return {
    el,
    get isOpen() { return open; },
    get mode() { return mode; },
    /**
     * mode 'first': a suggestion, [ LET ME IN ] and SKIP. 'change': the current name and [ SAVE ].
     * problem: a reason the server gave for the last name ('blocked'), shown at once.
     */
    open({ mode: m = 'first', current = null, problem = null, focusField = true } = {}) {
      mode = m;
      open = true;
      touched = false;
      el.input.value = current || suggestHandle(rng);
      el.submit.textContent = mode === 'first' ? '[ LET ME IN ]' : '[ SAVE ]';
      el.skip.hidden = mode !== 'first';
      if (problem) show({ message: USERNAME_MESSAGES[problem] || USERNAME_MESSAGES.invalid, invalid: true });
      else show({ message: '', invalid: false });
      el.panel.hidden = false;
      // On a touch screen the heading takes focus, so the keyboard does not cover the panel
      // before the player decides to edit the suggestion.
      if (focusField) {
        el.input.focus({ preventScroll: true });
        try { el.input.select(); } catch { /* not every input can select */ }
      } else {
        $('username-h').focus({ preventScroll: true });
      }
    },
    close() {
      open = false;
      el.panel.hidden = true;
    },
  };
}
