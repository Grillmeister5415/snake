// Menus and global keys (LEADERBOARD_PLAN A5, A8, Part B 1-2): the overlay stack, the one key
// router, and input.js reading real-looking key events from text fields, IME and modifiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNav, routeKey } from '../src/nav.js';
import { createInput, describeKey, isEditable } from '../src/input.js';

const key = (code, more = {}) => ({ code, repeat: false, composing: false, ctrl: false, meta: false, alt: false, editable: false, control: false, ...more });
const MODES = ['title', 'ready', 'playing', 'paused', 'respawn', 'over'];
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'KeyM', 'Enter', 'NumpadEnter', 'Space', 'Escape'];

test('nav: the board from title, pause and game over goes back to where it came from, with its opener', () => {
  for (const origin of ['title', 'pause', 'over']) {
    const nav = createNav();
    assert.equal(nav.overlay, 'none');
    const opener = { id: `btn-board-${origin}` };
    const entry = nav.open('board', { origin, opener });
    assert.equal(nav.overlay, 'board');
    assert.deepEqual([entry.kind, entry.origin, entry.opener], ['board', origin, opener]);
    const back = nav.close();
    assert.deepEqual([back.origin, back.opener], [origin, opener]);
    assert.equal(nav.overlay, 'none');
    assert.equal(nav.close(), null, 'closing twice does nothing');
  }
});

test('nav: the board can open the USERNAME form; closing it returns to the board, then to the origin', () => {
  const nav = createNav();
  const a = nav.open('board', { origin: 'pause', opener: 'pause-button' });
  const b = nav.open('username', { origin: 'board', opener: 'set-name' });
  assert.equal(nav.overlay, 'username');
  assert.equal(nav.depth, 2);
  assert.ok(b.gen > a.gen, 'every open is a new generation');
  assert.throws(() => nav.open('board', { origin: 'title' }), /already open/);
  assert.equal(nav.close().origin, 'board');
  assert.equal(nav.overlay, 'board');
  assert.equal(nav.close().origin, 'pause');
  assert.throws(() => nav.open('menu', { origin: 'title' }), /unknown overlay/);
  assert.throws(() => nav.open('board', { origin: 'playing' }), /unknown origin/);
});

test('keys with an overlay open: Escape goes back, nothing else reaches the game or is blocked', () => {
  for (const overlay of ['board', 'username']) {
    for (const mode of ['title', 'paused', 'over']) {
      assert.deepEqual(routeKey(key('Escape'), { mode, overlay }), { action: 'back', prevent: true }, `${overlay} over ${mode}`);
      for (const code of GAME_KEYS.filter((c) => c !== 'Escape')) {
        // Arrows, Page Up/Down and Home/End scroll the list natively; Enter and Space press the
        // focused button; P and M type in the field. None of them does anything else.
        assert.deepEqual(routeKey(key(code), { mode, overlay }), { action: null, prevent: false }, `${code} in ${overlay} over ${mode}`);
      }
      for (const code of ['PageDown', 'PageUp', 'Home', 'End', 'Tab']) {
        assert.deepEqual(routeKey(key(code), { mode, overlay }), { action: null, prevent: false });
      }
    }
  }
  // The board from pause: Escape is "back", never "resume".
  assert.equal(routeKey(key('Escape'), { mode: 'paused', overlay: 'board' }).action, 'back');
  // The board from game over: Enter on the page never starts a run behind it.
  assert.equal(routeKey(key('Enter'), { mode: 'over', overlay: 'board' }).action, null);
  assert.equal(routeKey(key('Space'), { mode: 'over', overlay: 'board' }).action, null);
  // Escape while an IME composes is the IME's.
  assert.equal(routeKey(key('Escape', { composing: true, editable: true }), { mode: 'title', overlay: 'username' }).action, null);
});

test('keys from a text field, during composition or with a modifier are never game input', () => {
  for (const mode of MODES) {
    for (const code of GAME_KEYS) {
      const none = { action: null, prevent: false };
      assert.deepEqual(routeKey(key(code, { editable: true }), { mode, overlay: 'none' }), none, `${code} typed in a field (${mode})`);
      assert.deepEqual(routeKey(key(code, { composing: true }), { mode, overlay: 'none' }), none, `${code} composing (${mode})`);
      for (const m of ['ctrl', 'meta', 'alt']) {
        assert.deepEqual(routeKey(key(code, { [m]: true }), { mode, overlay: 'none' }), none, `${m}+${code}`);
      }
    }
  }
});

test('keys in play keep their old meaning', () => {
  const r = (code, mode, more) => routeKey(key(code, more), { mode, overlay: 'none' });
  for (const mode of ['ready', 'playing', 'respawn']) {
    for (const code of ['ArrowUp', 'KeyW', 'KeyA', 'ArrowRight']) assert.deepEqual(r(code, mode), { action: 'dir', prevent: true });
  }
  // Arrows outside play scroll whatever is focused (the title on a short screen); no steering.
  for (const mode of ['title', 'paused', 'over']) assert.deepEqual(r('ArrowDown', mode), { action: null, prevent: false });
  assert.equal(r('ArrowUp', 'playing', { repeat: true }).action, 'dir', 'held arrows still steer');
  assert.deepEqual(r('KeyP', 'playing'), { action: 'pause', prevent: true });
  assert.deepEqual(r('Escape', 'paused'), { action: 'pause', prevent: true });
  assert.equal(r('Escape', 'title').action, null);
  assert.equal(r('Escape', 'over').action, null);
  assert.equal(r('KeyP', 'playing', { repeat: true }).action, null);
  assert.deepEqual(r('Enter', 'title'), { action: 'confirm', prevent: true });
  assert.deepEqual(r('Space', 'over'), { action: 'confirm', prevent: true }, 'instant retry, also in the death delay');
  assert.deepEqual(r('Enter', 'paused'), { action: 'confirm', prevent: true });
  assert.deepEqual(r('Enter', 'over', { control: true }), { action: null, prevent: false }, 'a focused button presses itself');
  assert.deepEqual(r('Space', 'playing'), { action: null, prevent: true });
  assert.deepEqual(r('KeyM', 'over'), { action: 'mute', prevent: true });
});

test('isEditable: text fields, textarea, select and contenteditable; not checkboxes or buttons', () => {
  assert.equal(isEditable({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isEditable({ tagName: 'input', type: 'search' }), true);
  assert.equal(isEditable({ tagName: 'INPUT' }), true, 'no type is text');
  assert.equal(isEditable({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditable({ tagName: 'SELECT' }), true);
  assert.equal(isEditable({ tagName: 'DIV', isContentEditable: true }), true);
  for (const type of ['checkbox', 'radio', 'button', 'submit', 'range']) assert.equal(isEditable({ tagName: 'INPUT', type }), false, type);
  assert.equal(isEditable({ tagName: 'BUTTON' }), false);
  assert.equal(isEditable(null), false);
});

test('describeKey: reads composition from isComposing and keyCode 229, and the focused element', () => {
  const field = { tagName: 'INPUT', type: 'text' };
  assert.equal(describeKey({ code: 'KeyW', target: field }, field).editable, true);
  assert.equal(describeKey({ code: 'KeyA', isComposing: true }, null).composing, true);
  assert.equal(describeKey({ code: 'KeyA', keyCode: 229 }, null).composing, true);
  assert.equal(describeKey({ code: 'Enter' }, { tagName: 'BUTTON' }).control, true);
  assert.equal(describeKey({ code: 'Enter', shiftKey: true }, null).ctrl, false);
});

test('createInput: typed W, A, S, D, P, M in the username field never reach the game; Escape closes the form', () => {
  let keydown = null;
  const before = { window: globalThis.window, document: globalThis.document };
  const field = { tagName: 'INPUT', type: 'text' };
  globalThis.window = { addEventListener: (t, fn) => { if (t === 'keydown') keydown = fn; }, removeEventListener() {} };
  globalThis.document = { activeElement: field, body: {} };
  const got = [];
  try {
    let state = { mode: 'title', overlay: 'username' };
    createInput({
      stage: { addEventListener() {}, removeEventListener() {} },
      onDir: (d) => got.push(`dir ${d}`), onPause: () => got.push('pause'), onConfirm: () => got.push('confirm'),
      onMute: () => got.push('mute'), onBack: () => got.push('back'), state: () => state,
    });
    const press = (code, more = {}) => {
      const e = { code, target: field, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...more };
      keydown(e);
      return e.defaultPrevented;
    };
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'KeyM', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter']) {
      assert.equal(press(code), false, `${code} keeps its default (typing, caret, submit)`);
    }
    assert.deepEqual(got, []);
    assert.equal(press('Escape', { isComposing: true }), false);
    assert.deepEqual(got, [], 'the IME takes its Escape');
    assert.equal(press('Escape'), true);
    assert.deepEqual(got, ['back']);
    // Even if a field kept focus after the overlay closed, typing in it never steers.
    state = { mode: 'playing', overlay: 'none' };
    got.length = 0;
    for (const code of ['KeyW', 'ArrowUp', 'KeyP', 'KeyM']) press(code);
    assert.deepEqual(got, []);
    // With focus back on the page, the same keys play.
    globalThis.document.activeElement = globalThis.document.body;
    for (const code of ['KeyW', 'KeyP', 'KeyM']) keydown({ code, target: globalThis.document.body, preventDefault() {} });
    assert.deepEqual(got, ['dir up', 'pause', 'mute']);
  } finally {
    globalThis.window = before.window;
    globalThis.document = before.document;
  }
});
