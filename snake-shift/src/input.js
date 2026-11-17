// Keyboard by physical position (event.code) and swipes on the stage.
// Input only ever reaches the simulation through queueTurn (in main.js).

const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
const SWIPE_PX = 22;
const CHAIN_PX = 34; // a second turn inside the same drag needs a longer, deliberate leg
const TAP_MS = 350; // a touch shorter than this that never became a swipe is a tap
const TAP_PX = 12;

const TURN_LEFT = { up: 'left', left: 'down', down: 'right', right: 'up' };
const TURN_RIGHT = { up: 'right', right: 'down', down: 'left', left: 'up' };

/**
 * Turns a pressed direction into the grid direction to queue.
 * Board views: the keys are grid directions, so left is always screen-left.
 * First person: left and right turn relative to where the snake is heading,
 * so left is always the player's left; up and down do nothing there.
 * `heading` is the snapshot's heading (direction after any queued turns).
 * Returns null when the press should be ignored.
 */
export function steerFor(dir, view, heading) {
  if (view !== 'pov') return dir;
  if (dir === 'left') return TURN_LEFT[heading] || null;
  if (dir === 'right') return TURN_RIGHT[heading] || null;
  return null;
}

export function createInput({ stage, pad = null, onDir, onTap = null, onPause, onConfirm, onMute }) {
  function isControl(el) {
    return el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'LABEL' || el.tagName === 'A');
  }

  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const dir = KEYS[e.code];
    if (dir) {
      e.preventDefault();
      onDir(dir, 'key');
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyP':
      case 'Escape':
        e.preventDefault();
        onPause();
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        // Let a focused button or switch handle its own activation.
        if (isControl(document.activeElement) && document.activeElement !== document.body) return;
        e.preventDefault();
        onConfirm();
        break;
      case 'KeyM':
        e.preventDefault();
        onMute();
        break;
      default:
    }
  }
  window.addEventListener('keydown', keydown);

  // Swipes: 22 px threshold, re-armed mid-gesture so one drag can chain turns (an L-shaped drag).
  // Keeping the finger moving the same way never repeats the direction: in first person a repeat
  // would be a second turn. onDir also gets the gesture's number, so main.js can tell one drag
  // from two swipes.
  // A short touch that stays put is a tap (main.js uses it to turn in first person).
  let active = null;
  let gestures = 0;
  function down(e) {
    if (e.pointerType === 'mouse') return;
    active = { id: e.pointerId, n: ++gestures, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, swiped: false, last: null };
  }
  function move(e) {
    if (!active || e.pointerId !== active.id) return;
    const dx = e.clientX - active.x, dy = e.clientY - active.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < (active.swiped ? CHAIN_PX : SWIPE_PX)) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    active.x = e.clientX;
    active.y = e.clientY;
    active.swiped = true;
    e.preventDefault();
    if (dir === active.last) return;
    active.last = dir;
    onDir(dir, 'swipe', active.n);
  }
  function cancel(e) { if (active && e.pointerId === active.id) active = null; }
  function up(e) {
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    if (!onTap || a.swiped || e.timeStamp - a.t0 > TAP_MS) return;
    if (Math.max(Math.abs(e.clientX - a.x0), Math.abs(e.clientY - a.y0)) > TAP_PX) return;
    onTap(e.clientX, e.clientY);
  }
  stage.addEventListener('pointerdown', down, { passive: true });
  stage.addEventListener('pointermove', move, { passive: false });
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', cancel);
  // Optional on-screen direction buttons: act on press, never take focus.
  if (pad) {
    pad.addEventListener('pointerdown', (e) => {
      const b = e.target.closest && e.target.closest('[data-dir]');
      if (!b) return;
      e.preventDefault();
      onDir(b.dataset.dir, 'button');
    });
    pad.addEventListener('click', (e) => e.preventDefault());
  }
  // Belt and braces for browsers that still scroll on touch.
  stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  return {
    dispose() {
      window.removeEventListener('keydown', keydown);
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', cancel);
    },
  };
}
