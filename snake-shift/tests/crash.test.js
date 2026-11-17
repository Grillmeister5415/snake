// Desktop Error crash screen: text placement keeps clear of the snake, the dot and the panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crashLayout } from '../src/render/timelines/desktop.js';
import { computeLayout } from '../src/render/flat.js';

// Monospace stub: every character is 0.6 em wide.
const ctx = { font: '', measureText(t) { return { width: t.length * 0.6 * parseFloat(/(\d+)px/.exec(this.font)[1]) }; } };
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const box = (lay) => ({ x: lay.x, y: lay.y, w: Math.max(...lay.lines.map((t) => t.length * 0.6 * lay.fs)), h: lay.lines.length * lay.lh });
const snapAt = (L, alive, more = {}) => ({
  cols: 16, rows: 16, dir: 'right', alive, lives: alive ? 2 : 0, waiting: alive ? 'respawn' : null,
  death: { reason: 'wall', cell: { x: 16, y: 7 } },
  snake: [{ x: 15, y: 7 }, { x: 14, y: 7 }, { x: 13, y: 7 }], food: { x: 3, y: 12 }, ...more,
});
const cellBox = (L, c) => ({ x: L.bx + c.x * L.cell, y: L.by + c.y * L.cell, w: L.cell, h: L.cell });

// [viewport w, h, measured #over rect in the browser at that size]
const SIZES = [
  [534, 383, { x: 16, y: 100, w: 502, h: 182 }],
  [534, 383, { x: 16, y: 87, w: 502, h: 209 }], // as reported by the other session (dpr 2)
  [667, 375, { x: 16, y: 93, w: 635, h: 189 }],
  [844, 390, { x: 32, y: 87, w: 780, h: 216 }],
  [800, 600, { x: 120, y: 157, w: 560, h: 286 }],
  [800, 600, { x: 120, y: 143, w: 560, h: 314 }], // with NEW BEST
  [1024, 768, { x: 232, y: 241, w: 560, h: 286 }],
  [375, 812, { x: 16, y: 298, w: 343, h: 217 }],
];

test('final crash: the text never sits under the game-over panel, and never on the snake or the dot', () => {
  for (const [w, h, panel] of SIZES) {
    const L = computeLayout(w, h, 16, 16);
    const s = snapAt(L, false);
    const lay = crashLayout(ctx, L, s, panel);
    assert.ok(lay, `${w}x${h}: some text fits`);
    const b = box(lay);
    assert.ok(!overlap(b, { x: panel.x - 10, y: panel.y - 10, w: panel.w + 20, h: panel.h + 20 }), `${w}x${h}: clear of the panel`);
    for (const c of [...s.snake, s.food]) assert.ok(!overlap(b, cellBox(L, c)), `${w}x${h}: clear of ${c.x},${c.y}`);
    assert.ok(b.y >= 60 && b.y + b.h <= h, `${w}x${h}: on screen below the HUD`);
    assert.ok(lay.lines.some((t) => t.startsWith('SNAKE.EXE')) && lay.lines.some((t) => t.startsWith('STOP')), `${w}x${h}: header and stop code kept`);
  }
});

test('final crash: no room beside the panel means no text, never text under it', () => {
  const L = computeLayout(400, 300, 16, 16);
  assert.equal(crashLayout(ctx, L, snapAt(L, false), { x: 0, y: 40, w: 400, h: 260 }), null);
});

test('life lost: the text fits at every size, clear of the snake, the cells ahead and the dot', () => {
  for (const [w, h] of SIZES) {
    const L = computeLayout(w, h, 16, 16);
    const s = snapAt(L, true, { snake: [{ x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }] });
    const lay = crashLayout(ctx, L, s);
    const b = box(lay);
    const keep = [...s.snake, s.food, ...[1, 2, 3, 4].map((k) => ({ x: 4 + k, y: 7 }))];
    for (const c of keep) assert.ok(!overlap(b, cellBox(L, c)), `${w}x${h}: clear of ${c.x},${c.y}`);
    assert.ok(b.y >= 104 && b.y + b.h <= h - 56, `${w}x${h}: between the HUD and the hint`);
  }
});
