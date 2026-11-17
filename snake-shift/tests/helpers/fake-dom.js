// A very small DOM for testing board.js and username.js in Node: elements with text, attributes,
// classes, children, events and focus. Enough for those two modules, nothing more. innerHTML
// throws, so a test proves server text only ever goes in as text.

class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attrs = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this._text = '';
    this._tabIndex = null;
    const cls = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => cls.add(x)),
      remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on = !cls.has(c)) => { if (on) cls.add(c); else cls.delete(c); return on; },
      contains: (c) => cls.has(c),
    };
    Object.defineProperty(this, 'className', { get: () => [...cls].join(' '), set: (v) => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); } });
  }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', v); }
  get tabIndex() { return this._tabIndex ?? (['BUTTON', 'INPUT'].includes(this.tagName) ? 0 : -1); }
  set tabIndex(v) { this._tabIndex = v; this.attrs.set('tabindex', String(v)); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'tabindex') this._tabIndex = Number(v); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(_) { throw new Error('innerHTML is not allowed'); }
  get innerHTML() { throw new Error('innerHTML is not allowed'); }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n;
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, init = {}) {
    const e = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (const fn of this.listeners.get(type) || []) fn(e);
    return e;
  }
  click() { return this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  closest(sel) {
    if (sel !== '[hidden]') return null;
    for (let n = this; n; n = n.parentElement) if (n.hidden) return n;
    return null;
  }
  getClientRects() { return this.closest('[hidden]') ? [] : [{}]; }
  /** Every descendant, depth first. */
  *walk() { for (const c of this.children) { if (c instanceof FakeElement) { yield c; yield* c.walk(); } } }
  querySelectorAll(sel) {
    if (sel === 'button, [tabindex]') return [...this.walk()].filter((n) => n.tagName === 'BUTTON' || n.attrs.has('tabindex'));
    throw new Error(`fake DOM: selector not supported: ${sel}`);
  }
  /** Text of the row cells, for asserting what a person would read (leading zeros dropped). */
  get cellTexts() { return this.children.map((c) => c.textContent); }
}

class FakeText {
  constructor(text) { this._text = String(text); this.parentElement = null; }
  get textContent() { return this._text; }
}

/**
 * Builds a document from a tree spec: [tag, { id, attrs, data, hidden }, ...children].
 * Returns the document with getElementById, querySelectorAll('#board [role="tab"]'), create*.
 */
export function fakeDocument(spec) {
  const byId = new Map();
  const doc = {
    activeElement: null,
    body: null,
    createElement: (tag) => new FakeElement(doc, tag),
    createTextNode: (t) => new FakeText(t),
    getElementById: (id) => byId.get(id) || null,
    querySelectorAll(sel) {
      const m = /^#(\S+) \[role="tab"\]$/.exec(sel);
      if (!m) throw new Error(`fake DOM: selector not supported: ${sel}`);
      const root = byId.get(m[1]);
      return [...root.walk()].filter((n) => n.getAttribute('role') === 'tab');
    },
  };
  function build([tag, props = {}, ...kids]) {
    const el = new FakeElement(doc, tag);
    if (props.id) { el.id = props.id; byId.set(props.id, el); }
    for (const [k, v] of Object.entries(props.attrs || {})) el.setAttribute(k, v);
    Object.assign(el.dataset, props.data || {});
    if (props.hidden) el.hidden = true;
    for (const k of kids) el.append(typeof k === 'string' ? k : build(k));
    return el;
  }
  doc.body = build(['body', {}, ...spec]);
  return doc;
}

/** The board's markup as in index.html (ids and roles only). */
export const BOARD_SPEC = [
  ['section', { id: 'board', hidden: true },
    ['h2', { id: 'board-h', attrs: { tabindex: '-1' } }, 'HALL OF SHIFTERS'],
    ['div', {},
      ['button', { id: 'tab-all-time', attrs: { role: 'tab' }, data: { period: 'all-time' } }, 'ALL TIME'],
      ['button', { id: 'tab-week', attrs: { role: 'tab' }, data: { period: 'week' } }, 'THIS WEEK']],
    ['div', { id: 'board-scroll', attrs: { tabindex: '0' } },
      ['table', {}, ['caption', { id: 'board-caption' }], ['tbody', { id: 'board-rows' }]],
      ['p', { id: 'board-state', hidden: true }]],
    ['p', { id: 'board-more' }],
    ['div', { id: 'board-you', hidden: true }, ['table', {}, ['tbody', {}, ['tr', { id: 'board-you-row' }]]]],
    ['p', { id: 'board-rival', hidden: true }],
    ['p', { id: 'board-note', hidden: true }, ['span', { id: 'board-note-text' }], ['button', { id: 'board-retry', hidden: true }, 'RETRY']],
    ['button', { id: 'board-set-name', hidden: true }, 'SET USERNAME'],
    ['button', { id: 'board-back' }, '[ BACK ]'],
    ['button', { id: 'board-main' }, '[ PLAY AGAIN ]']],
];

/** The USERNAME form's markup as in index.html. */
export const USERNAME_SPEC = [
  ['section', { id: 'username', hidden: true },
    ['form', { id: 'username-form' },
      ['h2', { id: 'username-h', attrs: { tabindex: '-1' } }, 'USERNAME'],
      ['input', { id: 'username-input' }],
      ['button', { id: 'username-shuffle' }],
      ['p', { id: 'username-rule' }],
      ['p', { id: 'username-error', hidden: true }],
      ['p', { id: 'username-note' }],
      ['button', { id: 'username-submit' }],
      ['button', { id: 'username-skip' }, 'SKIP'],
      ['button', { id: 'username-back' }, 'BACK']]],
];
