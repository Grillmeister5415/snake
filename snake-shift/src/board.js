// HALL OF SHIFTERS, the leaderboard panel (LEADERBOARD_PLAN A2, A5 to A8, C4). Opened on purpose
// from a menu; it never interrupts play. Header (title, tabs) / one scrolling list / footer (your
// position, next rival, note, actions). Handles are server text and go in with textContent only.
//
// Every load is tied to its tab and a request number, and the panel to an open generation, so a
// late answer for the other tab, or for a panel since closed, never shows. Answers are cached on
// this browser per tab; offline, the cache shows with "Offline — showing saved scores".
// No polling: a load happens on opening, on a tab switch, on Retry, and after a save while open.

import { openStore } from './store.js';

export const BOARD_CACHE_KEY = 'snake-shift/board/v1';
export const PERIODS = Object.freeze(['all-time', 'week']);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

/**
 * The next-rival line from the selected board's data (A2). Pure.
 * @param {{ entries: Array<{rank:number}>, you: {rank:number}|null, rival: {handle:string, need:number}|null }} data
 * @param {{ hasUsername: boolean }} ctx
 */
export function rivalLine(data, { hasUsername }) {
  if (!data) return '';
  if (!hasUsername) return 'SET A USERNAME TO JOIN THE WALL.';
  const { entries = [], you = null, rival = null } = data;
  if (you && you.rank === 1) return 'YOU HOLD FIRST PLACE.';
  if (you && rival) return `${plural(rival.need, 'POINT')} TO OVERTAKE ${rival.handle}.`;
  if (!you && rival) return `${plural(rival.need, 'POINT')} TO MAKE THE WALL.`;
  if (!you && entries.length) return 'ONE POINT PUTS YOU ON THE WALL.';
  return '';
}

/** True when the own row must show separately: the player has a rank but no row in the list. */
export function needsOwnRow(data) {
  return !!(data && data.you && !(data.entries || []).some((e) => e.you));
}

/** Leading zeros as their own (dimmed, unread) part: 7 -> ['00', '7']. */
export function padParts(n, width) {
  const s = String(n);
  return [s.length < width ? '0'.repeat(width - s.length) : '', s];
}

/** The cached answer for display: someone else's own-row data is never shown. Pure. */
export function cachedView(entry, playerId) {
  if (!entry || !entry.data) return null;
  const d = entry.data;
  if (entry.playerId && entry.playerId === playerId) return d;
  return { ...d, entries: (d.entries || []).map((e) => ({ ...e, you: false })), you: null, rival: null };
}

/** "MONDAY 00:00 UTC" style reset note for the week tab, from the server's period end. */
export function weekNote(to) {
  const t = Date.parse(to);
  if (!Number.isFinite(t)) return 'WEEK RUNS MONDAY TO MONDAY, 00:00 UTC.';
  const day = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(t).getUTCDay()];
  return `NEW WEEK ${day} 00:00 UTC.`;
}

const MAIN_LABEL = Object.freeze({ title: '[ PLAY ]', pause: '[ BACK TO MENU ]', over: '[ PLAY AGAIN ]' });

/**
 * @param {{ doc?: Document, api: ReturnType<import('./api.js').createApi>, storage?: Storage|null,
 *   who: () => { playerId: string|null, hasUsername: boolean },
 *   onBack: () => void, onMain: (origin: string) => void, onSetUsername: (opener: Element) => void,
 *   announce?: (text: string) => void }} deps
 * Returns { open({ origin }), close(), refresh(), focusFirst(), get isOpen, get period, el }.
 */
export function createBoard({ doc = document, api, storage, who, onBack, onMain, onSetUsername, announce = () => {} }) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    panel: $('board'), heading: $('board-h'), scroll: $('board-scroll'), rows: $('board-rows'),
    caption: $('board-caption'), state: $('board-state'), more: $('board-more'),
    you: $('board-you'), youRow: $('board-you-row'), rival: $('board-rival'), note: $('board-note'),
    noteText: $('board-note-text'), retry: $('board-retry'), setName: $('board-set-name'),
    back: $('board-back'), main: $('board-main'),
    tabs: [...doc.querySelectorAll('#board [role="tab"]')],
  };
  const cache = openStore(BOARD_CACHE_KEY, { storage });
  let open = false;
  let gen = 0;          // bumped on every open and close
  let origin = 'title';
  let period = 'all-time';
  let seq = 0;
  const latest = { 'all-time': 0, week: 0 };
  const shown = { 'all-time': null, week: null }; // { status, data, fromCache }

  // ---------------------------------------------------------------- cache

  function readCache(p) {
    const c = cache.read();
    return c && c.v === 1 && c.periods && c.periods[p] ? c.periods[p] : null;
  }
  function writeCache(p, data, playerId) {
    const c = cache.read();
    const periods = c && c.v === 1 && c.periods ? { ...c.periods } : {};
    periods[p] = { data, playerId };
    cache.write({ v: 1, periods });
  }

  // ---------------------------------------------------------------- rendering

  function cell(tag, cls) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /** Text with its leading zeros in a dimmed span that screen readers skip. */
  function padded(node, n, width) {
    const [zeros, digits] = padParts(n, width);
    if (zeros) {
      const z = cell('span', 'pad');
      z.setAttribute('aria-hidden', 'true');
      z.textContent = zeros;
      node.append(z);
    }
    node.append(doc.createTextNode(digits));
  }

  function fillRow(tr, e, { you }) {
    tr.replaceChildren();
    tr.className = you ? 'is-you' : '';
    const rank = cell('td', 'rank');
    padded(rank, e.rank, 2);
    if (e.rank === 1) {
      const crown = cell('span', 'crown');
      crown.setAttribute('role', 'img');
      crown.setAttribute('aria-label', 'first place');
      rank.append(crown);
    }
    const name = cell('td', 'name');
    const handle = cell('span', 'handle');
    handle.textContent = String(e.handle || '');
    name.append(handle);
    if (you) {
      const badge = cell('span', 'you-badge');
      badge.textContent = 'YOU';
      name.append(badge);
    }
    const score = cell('td', 'score');
    padded(score, e.score, 3);
    tr.append(rank, name, score);
  }

  function setNote(text, { retry = false } = {}) {
    el.noteText.textContent = text;
    el.retry.hidden = !retry;
    el.note.hidden = !text && !retry;
  }

  function render() {
    const view = shown[period];
    const ident = who();
    const label = period === 'week' ? 'this week' : 'all time';
    el.caption.textContent = `Top ten, ${label}`;
    el.scroll.setAttribute('aria-label', `Scores, ${label}`);
    el.panel.setAttribute('aria-busy', String(!!(view && view.status === 'loading')));
    const data = view ? view.data : null;
    const entries = data ? data.entries || [] : [];

    el.rows.replaceChildren();
    for (const e of entries) {
      const tr = cell('tr');
      fillRow(tr, e, { you: !!e.you });
      el.rows.append(tr);
    }

    let stateText = '';
    if (!data) {
      if (!view || view.status === 'loading') stateText = 'LOADING SCORES…';
      else if (view.status === 'offline') stateText = 'OFFLINE. NO SAVED SCORES YET.';
      else stateText = 'THE SCORES COULD NOT BE LOADED.';
    } else if (!entries.length) stateText = 'THE WALL IS EMPTY. MAKE SOME HISTORY.';
    el.state.textContent = stateText;
    el.state.hidden = !stateText;
    el.state.classList.toggle('is-empty', !!data && !entries.length);

    if (needsOwnRow(data)) {
      fillRow(el.youRow, data.you, { you: true });
      el.you.hidden = false;
    } else {
      el.you.hidden = true;
      el.youRow.replaceChildren();
    }

    const line = data ? rivalLine(data, { hasUsername: ident.hasUsername }) : '';
    el.rival.textContent = line;
    el.rival.hidden = !line;
    el.setName.hidden = ident.hasUsername;

    if (view && view.status === 'offline') setNote(data ? 'Offline — showing saved scores' : 'Offline', { retry: true });
    else if (view && view.status === 'error') setNote(data ? 'Not updated — showing saved scores' : 'Something went wrong', { retry: true });
    else if (view && view.status === 'loading' && data) setNote('Updating…');
    else if (period === 'week' && data) setNote(weekNote(data.to));
    else setNote('');

    for (const t of el.tabs) {
      const on = t.dataset.period === period;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) el.scroll.setAttribute('aria-labelledby', t.id);
    }
    updateMore();
  }

  function updateMore() {
    const s = el.scroll;
    const rest = s.scrollHeight - s.clientHeight - s.scrollTop;
    el.more.classList.toggle('is-on', rest > 4);
    // The own row in the footer lines up with the list, whatever the scrollbar takes.
    if (el.panel.style) el.panel.style.setProperty('--board-sb', `${Math.max(0, s.offsetWidth - s.clientWidth) || 0}px`);
  }

  // ---------------------------------------------------------------- loading

  async function load(p) {
    const mySeq = ++seq;
    latest[p] = mySeq;
    const myGen = gen;
    const prev = shown[p];
    const cached = prev && prev.data ? prev.data : cachedView(readCache(p), who().playerId);
    shown[p] = { status: 'loading', data: cached };
    if (p === period) render();
    let next;
    try {
      const data = await api.leaderboard(p);
      if (latest[p] !== mySeq) return; // a newer load of this tab is on its way
      writeCache(p, data, who().playerId);
      next = { status: 'ready', data };
    } catch (err) {
      if (latest[p] !== mySeq) return;
      const offline = !err || err.kind === 'offline';
      next = { status: offline ? 'offline' : 'error', data: cached };
      if (open && myGen === gen && p === period) announce(offline ? 'Offline. Scores not updated.' : 'Scores could not be loaded.');
    }
    shown[p] = next;
    // Shown only if this panel is still the one open and this tab is still the one selected.
    if (open && myGen === gen && p === period) render();
  }

  function select(p, { focus = false } = {}) {
    if (!PERIODS.includes(p)) return;
    const changed = p !== period;
    period = p;
    if (changed) el.scroll.scrollTop = 0;
    render();
    if (focus) {
      const t = el.tabs.find((x) => x.dataset.period === p);
      if (t) t.focus();
    }
    if (changed) load(p);
  }

  // ---------------------------------------------------------------- wiring

  for (const t of el.tabs) {
    t.addEventListener('click', () => select(t.dataset.period));
    t.addEventListener('keydown', (e) => {
      // Tabs pattern: arrows and Home/End move between the two tabs (and select).
      const i = el.tabs.indexOf(t);
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % el.tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + el.tabs.length) % el.tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = el.tabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      select(el.tabs[j].dataset.period, { focus: true });
    });
  }
  el.scroll.addEventListener('scroll', updateMore, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (open) updateMore(); }).observe(el.scroll);
  el.retry.addEventListener('click', () => load(period));
  el.back.addEventListener('click', () => onBack());
  el.main.addEventListener('click', () => onMain(origin));
  el.setName.addEventListener('click', () => onSetUsername(el.setName));

  // Focus stays inside while the panel is modal: Tab from the last control wraps to the first.
  el.panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const list = [...el.panel.querySelectorAll('button, [tabindex]')].filter((n) => n.tabIndex >= 0 && !n.disabled
      && !n.closest('[hidden]') && n.getClientRects().length);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (doc.activeElement === first || doc.activeElement === el.heading)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return {
    el,
    get isOpen() { return open; },
    get period() { return period; },
    /** Shows the panel for this origin ('title' | 'pause' | 'over') and loads the selected tab. */
    open({ origin: from }) {
      origin = from;
      open = true;
      gen++;
      el.main.textContent = MAIN_LABEL[origin] || '[ BACK ]';
      el.main.classList.toggle('primary', origin !== 'pause');
      el.back.hidden = origin === 'pause'; // from pause the main action already goes back
      el.panel.hidden = false;
      el.scroll.scrollTop = 0;
      render();
      el.heading.focus({ preventScroll: true });
      load(period);
    },
    close() {
      open = false;
      gen++;
      el.panel.hidden = true;
    },
    /** Loads the selected tab again (after a save while open). */
    refresh() { if (open) load(period); },
    /** Drops what this page has shown (the player changed): the next view starts from the cache. */
    forget() { shown['all-time'] = null; shown.week = null; },
    /** Re-renders with the current identity (after a username was set from the board). */
    rerender() { if (open) render(); },
    focusHeading() { el.heading.focus({ preventScroll: true }); },
  };
}
