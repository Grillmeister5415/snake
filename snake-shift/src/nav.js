// Menu overlays and global keys (LEADERBOARD_PLAN A5, A8, Part B 1-2). Pure: no DOM.
//
// The gameplay mode ('title', 'ready', 'playing', 'paused', 'respawn', 'over') and pausedFrom stay
// in main.js, untouched by anything here. On top of a mode, one overlay can be open: the USERNAME
// form or the leaderboard. Overlays stack at most two deep (the board can open the form), and each
// remembers where it was opened from (its origin) and the control that opened it (its opener), so
// closing it goes back exactly there.
//
// routeKey() is the one place a global key is decided. While an overlay is open no gameplay key
// gets through: Escape goes back, everything else keeps its native meaning (typing in the field,
// Tab, Enter on a button, arrows and Page Up/Down scrolling the list).

export const OVERLAYS = Object.freeze(['username', 'board']);
export const ORIGINS = Object.freeze(['title', 'pause', 'over', 'board']);

/**
 * The overlay stack. Returns:
 *   overlay   'none' | 'username' | 'board' (the top one)
 *   top       { kind, origin, opener, gen } or null
 *   depth
 *   open(kind, { origin, opener })  pushes; returns the entry (its gen is new each time)
 *   close()   pops the top; returns it (origin and opener say where to go back), or null
 *   has(kind)
 *   clear()   closes everything; returns the bottom entry (where the first overlay came from)
 */
export function createNav() {
  const stack = [];
  let gen = 0;
  return {
    get overlay() { return stack.length ? stack[stack.length - 1].kind : 'none'; },
    get top() { return stack.length ? stack[stack.length - 1] : null; },
    get depth() { return stack.length; },
    open(kind, { origin, opener = null } = {}) {
      if (!OVERLAYS.includes(kind)) throw new Error(`[nav] unknown overlay '${kind}'`);
      if (!ORIGINS.includes(origin)) throw new Error(`[nav] unknown origin '${origin}'`);
      if (stack.some((e) => e.kind === kind)) throw new Error(`[nav] '${kind}' is already open`);
      const entry = Object.freeze({ kind, origin, opener, gen: ++gen });
      stack.push(entry);
      return entry;
    },
    close() { return stack.pop() || null; },
    has(kind) { return stack.some((e) => e.kind === kind); },
    clear() {
      const first = stack[0] || null;
      stack.length = 0;
      return first;
    },
  };
}

const DIR_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const CONFIRM_CODES = new Set(['Enter', 'NumpadEnter', 'Space']);
const STEERING = new Set(['ready', 'playing', 'respawn']);

/**
 * Decides what a keydown does. Pure.
 * @param {{ code: string, repeat?: boolean, composing?: boolean, ctrl?: boolean, meta?: boolean, alt?: boolean,
 *   editable?: boolean, control?: boolean }} key
 *   composing: IME composition (event.isComposing or keyCode 229)
 *   editable:  the event comes from a text field, textarea, select or contenteditable element
 *   control:   a button, switch or link has focus (it handles Enter and Space itself)
 * @param {{ mode: string, overlay: string }} state
 * @returns {{ action: 'dir'|'pause'|'confirm'|'mute'|'back'|null, prevent: boolean }}
 */
export function routeKey(key, { mode, overlay }) {
  const none = { action: null, prevent: false };
  if (key.composing || key.ctrl || key.meta || key.alt) return none;
  if (overlay && overlay !== 'none') {
    // A menu is open: only Escape is ours. Everything else does what the focused element does.
    if (key.code === 'Escape' && !key.repeat) return { action: 'back', prevent: true };
    return none;
  }
  if (key.editable) return none;
  if (DIR_CODES.has(key.code)) {
    // Arrows only steer while the board is in play; elsewhere they scroll what is focused.
    return STEERING.has(mode) ? { action: 'dir', prevent: true } : none;
  }
  if (key.repeat) return none;
  if (key.code === 'KeyP' || key.code === 'Escape') {
    return mode === 'playing' || mode === 'paused' ? { action: 'pause', prevent: true } : none;
  }
  if (CONFIRM_CODES.has(key.code)) {
    if (key.control) return none; // the focused button or switch activates itself
    return { action: mode === 'title' || mode === 'over' || mode === 'paused' ? 'confirm' : null, prevent: true };
  }
  if (key.code === 'KeyM') return { action: 'mute', prevent: true };
  return none;
}
