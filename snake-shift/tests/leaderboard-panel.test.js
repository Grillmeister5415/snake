// The HALL OF SHIFTERS panel (LEADERBOARD_PLAN A2, A6): the rival line in every case, the own
// row, the cache, and in a small fake DOM: origins and their actions, a tab switch that never
// shows the other tab's late answer, a closed panel that never renders, loading, empty and
// offline states, and handles written as text only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rivalLine, needsOwnRow, cachedView, padParts, weekNote, createBoard, BOARD_CACHE_KEY } from '../src/board.js';
import { ApiError } from '../src/api.js';
import { memoryStorage } from '../src/store.js';
import { fakeDocument, BOARD_SPEC } from './helpers/fake-dom.js';
import { deferred, settle } from './helpers/client-kit.js';

const e = (rank, handle, score, you = false) => ({ rank, handle, score, you });
const TOP10 = Array.from({ length: 10 }, (_, i) => e(i + 1, `P${i + 1}`, 100 - i * 5));

// ---------------------------------------------------------------- the rival line (A2)

test('rival line: points to overtake, a tie needs one more, first place, unranked, no username, empty', () => {
  const me = { hasUsername: true };
  // 68 against 72 needs 5 (the server counts `need`; the line says it).
  assert.equal(rivalLine({ entries: [e(1, 'N0_FUTURE', 72), e(2, 'TRUBEL', 68, true)], you: e(2, 'TRUBEL', 68), rival: { rank: 1, handle: 'N0_FUTURE', score: 72, need: 5 } }, me),
    '5 POINTS TO OVERTAKE N0_FUTURE.');
  assert.equal(rivalLine({ entries: [], you: { rank: 2 }, rival: { handle: 'N0_FUTURE', need: 1 } }, me), '1 POINT TO OVERTAKE N0_FUTURE.', 'a tie');
  assert.equal(rivalLine({ entries: [e(1, 'TRUBEL', 80, true)], you: { rank: 1 }, rival: null }, me), 'YOU HOLD FIRST PLACE.');
  assert.equal(rivalLine({ entries: TOP10, you: null, rival: { rank: 10, handle: 'P10', score: 55, need: 56 } }, me), '56 POINTS TO MAKE THE WALL.', 'unranked, full board');
  assert.equal(rivalLine({ entries: TOP10.slice(0, 4), you: null, rival: null }, me), 'ONE POINT PUTS YOU ON THE WALL.', 'unranked, room left');
  assert.equal(rivalLine({ entries: [], you: null, rival: null }, me), '', 'empty: the empty state speaks');
  assert.equal(rivalLine({ entries: TOP10, you: null, rival: { need: 56, handle: 'P10' } }, { hasUsername: false }), 'SET A USERNAME TO JOIN THE WALL.');
  assert.equal(rivalLine(null, me), '');
});

test('own row: separate only when the player is ranked but not in the list, never twice', () => {
  assert.equal(needsOwnRow({ entries: TOP10, you: e(12, 'TRUBEL', 3) }), true);
  assert.equal(needsOwnRow({ entries: [...TOP10.slice(0, 9), e(10, 'TRUBEL', 55, true)], you: e(10, 'TRUBEL', 55) }), false);
  assert.equal(needsOwnRow({ entries: TOP10, you: null }), false);
  assert.deepEqual(padParts(7, 3), ['00', '7']);
  assert.deepEqual(padParts(1234, 3), ['', '1234']);
  assert.equal(weekNote('2026-11-23T00:00:00.000Z'), 'NEW WEEK MONDAY 00:00 UTC.');
});

test('cache: another player\'s own-row data is never shown', () => {
  const data = { entries: [e(1, 'A', 9, true)], you: e(1, 'A', 9), rival: null };
  assert.equal(cachedView({ data, playerId: 'P1' }, 'P1'), data);
  const other = cachedView({ data, playerId: 'P1' }, 'P2');
  assert.deepEqual([other.entries[0].you, other.you, other.rival], [false, null, null]);
  assert.equal(cachedView(null, 'P1'), null);
});

// ---------------------------------------------------------------- the panel in a fake DOM

function setup({ storage = memoryStorage(), who = { playerId: 'P1', hasUsername: true } } = {}) {
  const doc = fakeDocument(BOARD_SPEC);
  const calls = [];
  const api = { leaderboard(period) { const d = deferred(); calls.push({ period, ...d }); return d.promise; } };
  const log = [];
  const board = createBoard({
    doc, api, storage, who: () => who,
    onBack: () => log.push('back'), onMain: (o) => log.push(`main ${o}`), onSetUsername: () => log.push('set'),
    announce: (t) => log.push(`say ${t}`),
  });
  const $ = (id) => doc.getElementById(id);
  const rows = () => $('board-rows').children.map((tr) => tr.children.map((td) => td.textContent));
  return { doc, board, calls, log, $, rows, storage };
}
const answer = (period, entries, more = {}) => ({ period, from: null, to: period === 'week' ? '2026-11-23T00:00:00.000Z' : null, generatedAt: 'x', entries, you: null, rival: null, ...more });

test('panel: each origin has its main action; Back is hidden from pause (its main action is back)', () => {
  const { board, $, log } = setup();
  for (const [origin, label, back] of [['title', '[ PLAY ]', false], ['pause', '[ BACK TO MENU ]', true], ['over', '[ PLAY AGAIN ]', false]]) {
    board.open({ origin });
    assert.equal($('board-main').textContent, label);
    assert.equal($('board-back').hidden, back, origin);
    assert.equal($('board').hidden, false);
    $('board-main').click();
    board.close();
    assert.equal($('board').hidden, true);
  }
  assert.deepEqual(log, ['main title', 'main pause', 'main over']);
  board.open({ origin: 'over' });
  assert.equal(board.el.heading, board.el.heading.ownerDocument.activeElement, 'focus moves to the heading');
  $('board-back').click();
  assert.equal(log.at(-1), 'back');
});

test('panel: loading keeps everything in place; then rows, the crown, YOU, padded numbers read plainly', async () => {
  const { board, calls, $, rows } = setup();
  board.open({ origin: 'title' });
  assert.equal($('board-state').textContent, 'LOADING SCORES…');
  assert.equal($('board-state').hidden, false);
  assert.equal($('board-main').hidden, false);
  assert.equal(calls.length, 1);
  calls[0].resolve(answer('all-time', [e(1, 'ACID_GRANNY', 84), e(2, 'TRUBEL', 68, true)], { you: e(2, 'TRUBEL', 68), rival: { rank: 1, handle: 'ACID_GRANNY', score: 84, need: 17 } }));
  await settle();
  assert.deepEqual(rows(), [['01', 'ACID_GRANNY', '084'], ['02', 'TRUBELYOU', '068']]);
  const first = $('board-rows').children[0];
  assert.equal(first.children[0].children.at(-1).className, 'crown');
  assert.equal($('board-rows').children[1].className, 'is-you');
  assert.equal($('board-you').hidden, true, 'in the list: no separate row');
  assert.equal($('board-rival').textContent, '17 POINTS TO OVERTAKE ACID_GRANNY.');
  assert.equal($('board-state').hidden, true);
});

test('panel: a tab switch never shows the other tab\'s late answer; a closed panel never renders', async () => {
  const { board, calls, rows, doc } = setup();
  board.open({ origin: 'over' });
  doc.getElementById('tab-week').click(); // before ALL TIME answered
  assert.equal(board.period, 'week');
  assert.deepEqual(calls.map((c) => c.period), ['all-time', 'week']);
  calls[1].resolve(answer('week', [e(1, 'WEEKLY', 9)]));
  await settle();
  assert.deepEqual(rows(), [['01', 'WEEKLY', '009']]);
  calls[0].resolve(answer('all-time', [e(1, 'ALLTIMER', 99)])); // late
  await settle();
  assert.deepEqual(rows(), [['01', 'WEEKLY', '009']], 'still the week');
  assert.equal(doc.getElementById('board-note-text').textContent, 'NEW WEEK MONDAY 00:00 UTC.', 'the reset basis, quietly');
  doc.getElementById('tab-all-time').click();
  assert.deepEqual(rows(), [['01', 'ALLTIMER', '099']], 'the late answer was kept for its own tab');
  // Two loads of one tab: only the newest counts.
  doc.getElementById('board-retry').click();
  calls[3].resolve(answer('all-time', [e(1, 'NEWEST', 50)]));
  await settle();
  calls[2].resolve(answer('all-time', [e(1, 'OLDER', 40)]));
  await settle();
  assert.deepEqual(rows(), [['01', 'NEWEST', '050']]);
  // Closed before the answer: nothing renders, and the next open starts from what is known.
  board.refresh();
  board.close();
  calls[4].resolve(answer('all-time', [e(1, 'AFTER_CLOSE', 7)]));
  await settle();
  assert.deepEqual(rows(), [['01', 'NEWEST', '050']]);
});

test('panel: own row outside the top ten, empty wall, and handles only ever as text', async () => {
  const { board, calls, $, rows } = setup();
  board.open({ origin: 'pause' });
  const evil = '<img src=x onerror=alert(1)>';
  calls[0].resolve(answer('all-time', [...TOP10.slice(0, 9), e(10, evil, 55)], { you: e(13, 'TRUBEL', 4), rival: { rank: 12, handle: 'P12', score: 5, need: 2 } }));
  await settle();
  assert.equal(rows()[9][1], evil, 'shown as the characters it is (innerHTML would have thrown)');
  assert.equal($('board-you').hidden, false);
  assert.deepEqual($('board-you-row').children.map((td) => td.textContent), ['13', 'TRUBELYOU', '004']);
  assert.equal($('board-rival').textContent, '2 POINTS TO OVERTAKE P12.');
  board.refresh();
  calls[1].resolve(answer('all-time', []));
  await settle();
  assert.deepEqual(rows(), []);
  assert.equal($('board-state').textContent, 'THE WALL IS EMPTY. MAKE SOME HISTORY.');
  assert.equal($('board-rival').hidden, true);
});

test('panel: offline shows saved scores (marked), or an honest empty offline state; Retry loads again', async () => {
  const storage = memoryStorage();
  const a = setup({ storage });
  a.board.open({ origin: 'title' });
  a.calls[0].resolve(answer('all-time', [e(1, 'CACHED', 30)]));
  await settle();
  assert.ok(storage.getItem(BOARD_CACHE_KEY));
  // A later page, offline.
  const b = setup({ storage });
  b.board.open({ origin: 'title' });
  assert.deepEqual(b.rows(), [['01', 'CACHED', '030']], 'the saved scores show while loading');
  assert.equal(b.$('board-note-text').textContent, 'Updating…');
  b.calls[0].reject(new ApiError('offline'));
  await settle();
  assert.deepEqual(b.rows(), [['01', 'CACHED', '030']]);
  assert.equal(b.$('board-note-text').textContent, 'Offline — showing saved scores');
  assert.equal(b.$('board-retry').hidden, false);
  assert.ok(b.log.includes('say Offline. Scores not updated.'), 'one polite announcement');
  // No cache at all.
  const c = setup();
  c.board.open({ origin: 'over' });
  c.calls[0].reject(new ApiError('offline'));
  await settle();
  assert.equal(c.$('board-state').textContent, 'OFFLINE. NO SAVED SCORES YET.');
  assert.equal(c.$('board-main').hidden, false, 'going back to the game always works');
  c.$('board-retry').click();
  assert.equal(c.calls.length, 2);
  // A server error (not offline) also offers Retry.
  c.calls[1].reject(new ApiError('transient', { status: 500 }));
  await settle();
  assert.equal(c.$('board-state').textContent, 'THE SCORES COULD NOT BE LOADED.');
  assert.equal(c.$('board-retry').hidden, false);
});

test('panel: no username: the rival line invites one and SET USERNAME is offered', async () => {
  const { board, calls, $, log } = setup({ who: { playerId: null, hasUsername: false } });
  board.open({ origin: 'title' });
  calls[0].resolve(answer('all-time', TOP10, { rival: { rank: 10, handle: 'P10', score: 55, need: 56 } }));
  await settle();
  assert.equal($('board-rival').textContent, 'SET A USERNAME TO JOIN THE WALL.');
  assert.equal($('board-set-name').hidden, false);
  $('board-set-name').click();
  assert.deepEqual(log, ['set']);
});

test('panel: the "more below" cue shows only while rows remain below', async () => {
  const { board, calls, $ } = setup();
  board.open({ origin: 'title' });
  const s = $('board-scroll');
  Object.assign(s, { scrollHeight: 400, clientHeight: 250, scrollTop: 0 });
  calls[0].resolve(answer('all-time', TOP10));
  await settle();
  assert.equal($('board-more').classList.contains('is-on'), true);
  s.scrollTop = 100;
  s.dispatch('scroll');
  assert.equal($('board-more').classList.contains('is-on'), true, '50 px left');
  s.scrollTop = 150;
  s.dispatch('scroll');
  assert.equal($('board-more').classList.contains('is-on'), false, 'at the end');
  Object.assign(s, { scrollHeight: 250, scrollTop: 0 });
  s.dispatch('scroll');
  assert.equal($('board-more').classList.contains('is-on'), false, 'everything fits: no cue, no forced scrollbar');
});
