// DOM interface: title with the photosensitivity warning and both switches,
// HUD themed per timeline, pause/settings panel, game over with best score.
// Menus (LEADERBOARD_PLAN A4, A5): [ LEADERBOARD ] on title, pause and game over, [ MENU ] on game
// over, the "PLAYING AS" line, and the game-over status line, which has a fixed height so a status
// that arrives later never moves [ AGAIN? ]. While a menu overlay is open, everything else is inert.
// Lives (LEVELS_PLAN 4.3): five slots on a small canvas, drawn with the current universe's
// life(ctx, x, y, size, filled, fx) export, falling back to a rounded block in the HUD accent.
// The UI only reads state and calls back into main.js.

const DEFAULT_HUD = { fg: '#f4f4f4', bg: 'rgba(0,0,0,0.72)', accent: '#ff2bd6', panelFg: '#f4f4f4', panelBg: 'rgba(8,6,16,0.94)' };

export function createUI({
  prefs, onPlay, onAgain, onPauseToggle, onMuteToggle, onSettings,
  onBoard = () => {}, onMenu = () => {}, onIdentity = () => {},
}) {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const el = {
    hud: $('hud'), score: $('score'), eraName: $('era-name'), eraYear: $('era-year'),
    pause: $('btn-pause'), mute: $('btn-mute'), settings: $('btn-settings'),
    hint: $('hint'), title: $('title'), paused: $('paused'), over: $('over'),
    play: $('btn-play'), resume: $('btn-resume'), again: $('btn-again'),
    overScore: $('over-score'), overBest: $('over-best'), overNew: $('over-new'),
    loading: $('loading'), dpad: $('dpad'), lives: $('lives'),
    boardTitle: $('btn-board-title'), boardPause: $('btn-board-pause'), boardOver: $('btn-board-over'),
    menu: $('btn-menu'), identity: $('identity'), identityText: $('identity-text'), identityBtn: $('btn-identity'),
    identityPause: $('btn-identity-pause'), status: $('over-status'), statusText: $('over-status-text'),
    wall: $('over-wall'), live: $('live'), stage: $('stage'),
  };
  let inPlay = false; // HUD showing (ready, playing, paused)
  let touchHint = false;
  let hintKind = 'start'; // 'start' | 'respawn'
  const hintText = () => {
    if (hintKind === 'respawn') return prefs.get().dpad ? 'TAP A DIRECTION' : touchHint ? 'SWIPE A DIRECTION' : 'PRESS A DIRECTION';
    return prefs.get().dpad ? 'TAP AN ARROW TO START' : touchHint ? 'SWIPE TO START' : 'PRESS AN ARROW TO START';
  };
  const switches = [...document.querySelectorAll('input[data-pref]')];

  function syncSwitches() {
    const p = prefs.get();
    for (const s of switches) s.checked = !!p[s.dataset.pref];
    el.mute.setAttribute('aria-pressed', String(p.muted));
    el.mute.classList.toggle('off', p.muted);
    el.mute.textContent = p.muted ? '\u{1F507}\u{FE0E}' : '♪';
    root.classList.toggle('reduced-motion', p.reducedMotion);
    root.classList.toggle('reduced-flash', p.reducedFlash);
    el.dpad.hidden = !(p.dpad && inPlay);
    root.classList.toggle('dpad-on', !el.dpad.hidden);
    el.hint.textContent = hintText();
  }
  for (const s of switches) {
    s.addEventListener('change', () => prefs.set(s.dataset.pref, s.checked));
  }
  prefs.on(syncSwitches);
  syncSwitches();

  el.play.addEventListener('click', () => onPlay());
  el.again.addEventListener('click', () => onAgain());
  el.resume.addEventListener('click', () => onPauseToggle());
  el.pause.addEventListener('click', (e) => { e.currentTarget.blur(); onPauseToggle(); });
  el.mute.addEventListener('click', (e) => { e.currentTarget.blur(); onMuteToggle(); });
  el.settings.addEventListener('click', (e) => { e.currentTarget.blur(); onSettings(); });
  el.boardTitle.addEventListener('click', (e) => onBoard('title', e.currentTarget));
  el.boardPause.addEventListener('click', (e) => onBoard('pause', e.currentTarget));
  el.boardOver.addEventListener('click', (e) => onBoard('over', e.currentTarget));
  el.menu.addEventListener('click', () => onMenu());
  el.identityBtn.addEventListener('click', (e) => onIdentity('title', e.currentTarget));
  el.identityPause.addEventListener('click', (e) => onIdentity('pause', e.currentTarget));

  // Everything behind a modal overlay: no focus, no clicks, no screen reader.
  const background = [el.stage, el.hud, el.dpad, el.hint, el.title, el.paused, el.over];

  function show(node, on) { node.hidden = !on; }
  function blurAll() { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }

  // ---------- lives ----------
  const lv = {
    ctx: el.lives ? el.lives.getContext('2d') : null,
    n: 3, max: 5, icon: null, accent: DEFAULT_HUD.accent,
    anim: null,          // { kind: 'loss' | 'gain', slot, at }
    drawnAt: -Infinity, dirty: true, w: 0, h: 0, dpr: 1, broken: new Set(),
  };
  const SLOTS = 5;
  const ANIM_MS = { loss: 520, gain: 380 };

  function fallbackIcon(ctx, x, y, size, filled) {
    const r = size * 0.22, pad = size * 0.1;
    const x0 = x + pad, y0 = y + pad, s = size - pad * 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + s, y0, x0 + s, y0 + s, r);
    ctx.arcTo(x0 + s, y0 + s, x0, y0 + s, r);
    ctx.arcTo(x0, y0 + s, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + s, y0, r);
    ctx.closePath();
    if (filled) { ctx.fillStyle = lv.accent; ctx.fill(); }
    else { ctx.strokeStyle = lv.accent; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(1, size * 0.1); ctx.stroke(); }
    ctx.restore();
  }

  function icon(ctx, x, y, size, filled, fx) {
    const fn = lv.icon;
    if (fn && !lv.broken.has(fn)) {
      ctx.save();
      try { fn(ctx, x, y, size, filled, fx || {}); ctx.restore(); return; } catch (err) {
        ctx.restore();
        lv.broken.add(fn);
        console.warn('[ui] life() icon failed; using the block', err);
      }
    }
    fallbackIcon(ctx, x, y, size, filled);
  }

  function sizeLives() {
    const c = el.lives;
    if (!c) return false;
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return false;
    if (w !== lv.w || h !== lv.h || dpr !== lv.dpr) {
      lv.w = w; lv.h = h; lv.dpr = dpr;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    return true;
  }

  function drawLives(fx, now) {
    const ctx = lv.ctx;
    if (!ctx || !sizeLives()) return;
    const rm = prefs.get().reducedMotion;
    ctx.setTransform(lv.dpr, 0, 0, lv.dpr, 0, 0);
    ctx.clearRect(0, 0, lv.w, lv.h);
    const gap = Math.max(2, Math.round(lv.h * 0.14));
    const size = Math.min(lv.h - 2, (lv.w - gap * (SLOTS - 1)) / SLOTS);
    const y = (lv.h - size) / 2;
    const a = lv.anim;
    const k = a ? Math.min(1, (now - a.at) / ANIM_MS[a.kind]) : 1;
    for (let i = 0; i < SLOTS; i++) {
      const x = i * (size + gap);
      const filled = i < lv.n;
      if (a && a.slot === i && k < 1 && !rm) {
        if (a.kind === 'gain') { // pop: the new icon overshoots and settles
          const sc = 1 + 0.7 * Math.sin(k * Math.PI) * (1 - k * 0.4);
          const cx = x + size / 2, cy = y + size / 2;
          ctx.save();
          ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
          icon(ctx, x, y, size, true, fx);
          ctx.restore();
          continue;
        }
        // loss: the slot visibly breaks; two halves fall apart over the hollow slot
        icon(ctx, x, y, size, false, fx);
        const off = size * 0.45 * k, drop = size * 0.5 * k * k;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.rect(side < 0 ? x - size : x + size / 2, y - size, size * 1.5, size * 3);
          ctx.clip();
          const cx = x + size / 2, cy = y + size / 2;
          ctx.translate(cx + side * off, cy + drop);
          ctx.rotate(side * 0.6 * k);
          ctx.translate(-cx, -cy);
          icon(ctx, x, y, size, true, fx);
          ctx.restore();
        }
        continue;
      }
      icon(ctx, x, y, size, filled, fx);
    }
    if (a && k >= 1) lv.anim = null;
    lv.drawnAt = now;
    lv.dirty = false;
  }

  let lastScore = -1;

  return {
    ready() { show(el.loading, false); el.play.disabled = false; el.play.focus({ preventScroll: true }); },
    showTitle() {
      inPlay = false; syncSwitches();
      show(el.title, true); show(el.hud, false); show(el.hint, false); show(el.paused, false); show(el.over, false);
      el.play.focus({ preventScroll: true });
    },
    showReady(touch) {
      show(el.title, false); show(el.over, false); show(el.paused, false);
      show(el.hud, true); show(el.hint, true);
      inPlay = true; syncSwitches();
      touchHint = !!touch;
      hintKind = 'start';
      el.hint.classList.remove('respawn');
      el.hint.textContent = hintText();
      blurAll();
    },
    /** A life was lost: the short snake waits for the first direction key. */
    showRespawn(touch) {
      show(el.paused, false); show(el.hint, true);
      touchHint = !!touch;
      hintKind = 'respawn';
      el.hint.classList.add('respawn');
      el.hint.textContent = hintText();
      blurAll();
    },
    showPlaying() { show(el.hint, false); show(el.paused, false); blurAll(); },
    showPaused(on) {
      show(el.paused, on);
      el.pause.setAttribute('aria-pressed', String(on));
      if (on) el.resume.focus({ preventScroll: true }); else blurAll();
    },
    showOver({ score, best, isNew, status = null }) {
      el.overScore.textContent = String(score);
      el.overBest.textContent = String(best);
      show(el.overNew, isNew);
      this.setRunStatus(status);
      show(el.hint, false); show(el.paused, false); show(el.over, true);
      inPlay = false; syncSwitches();
      el.again.focus({ preventScroll: true });
    },
    /** The run's save status on game over: { state, text, wall } or null. Never takes focus. */
    setRunStatus(status) {
      el.status.dataset.state = status ? status.state : '';
      el.statusText.textContent = status ? status.text : '';
      el.wall.textContent = status && status.wall ? 'YOU MADE THE WALL.' : '';
    },
    /** The "PLAYING AS" line on the title and the username button in the pause menu. */
    setIdentity({ handle, skipped, problem }) {
      const line = el.identityText;
      line.replaceChildren();
      const b = (t) => { const n = document.createElement('b'); n.textContent = t; return n; };
      if (handle && problem && problem.kind === 'create') line.append(b(handle), ' WAS NOT ACCEPTED');
      else if (handle && problem) line.append('PLAYING AS ', b(handle), ' \u00b7 NEW NAME NOT ACCEPTED');
      else if (handle) line.append('PLAYING AS ', b(handle));
      else if (skipped) line.append('LOCAL RUNS ONLY');
      el.identityBtn.textContent = handle ? 'CHANGE' : 'SET USERNAME';
      el.identityBtn.setAttribute('aria-label', handle ? 'Change username' : 'Set username');
      show(el.identity, !!(handle || skipped));
      el.identityPause.textContent = handle ? 'CHANGE USERNAME' : 'SET USERNAME';
      show(el.identityPause, !!(handle || skipped));
    },
    /** Marks everything but the open overlay inert (and hides the menu panel it came from). */
    setCovered(on) {
      root.classList.toggle('overlay-open', on);
      for (const n of background) {
        if (!n) continue;
        if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
      }
    },
    /** One polite announcement (a finished save, or an error). */
    announce(text) {
      // Cleared first, so the same words twice are still read twice.
      el.live.textContent = '';
      setTimeout(() => { el.live.textContent = text; }, 50);
    },
    hideOver() { show(el.over, false); },
    setScore(n, pop) {
      if (n === lastScore && !pop) return;
      lastScore = n;
      el.score.textContent = String(n).padStart(3, '0');
      if (pop && !prefs.get().reducedMotion) {
        el.score.classList.remove('pop');
        void el.score.offsetWidth; // restart the animation
        el.score.classList.add('pop');
      }
    },
    setScene(info) {
      if (!info) return;
      el.eraName.textContent = info.name || info.timeline || '';
      el.eraYear.textContent = [info.year, info.clock].filter(Boolean).join(' \u00b7 ');
      const h = { ...DEFAULT_HUD, ...(info.hud || {}) };
      root.style.setProperty('--hud-fg', h.fg);
      root.style.setProperty('--hud-bg', h.bg);
      root.style.setProperty('--hud-accent', h.accent);
      root.style.setProperty('--panel-fg', h.panelFg);
      root.style.setProperty('--panel-bg', h.panelBg);
      root.style.setProperty('--hud-font', h.font || 'var(--mono)');
      root.dataset.timeline = info.timeline || '';
      root.dataset.view = info.view || 'board';
      root.dataset.look = info.look || (info.kind === '2d' ? '2d' : info.view === 'pov' ? 'pov' : '3d');
      lv.accent = h.accent;
      lv.dirty = true;
    },
    /** Lives held and the change that caused it: 'loss', 'gain' or null (no animation). */
    setLives(n, max = 5, change = null) {
      const prev = lv.n;
      lv.n = Math.max(0, n | 0);
      lv.max = max;
      if (change === 'loss' && lv.n < prev) {
        lv.anim = { kind: 'loss', slot: Math.min(SLOTS - 1, lv.n), at: performance.now() };
        if (el.lives && !prefs.get().reducedMotion) {
          el.lives.classList.remove('hit');
          void el.lives.offsetWidth;
          el.lives.classList.add('hit');
        }
      } else if (change === 'gain' && lv.n > prev) {
        lv.anim = { kind: 'gain', slot: Math.min(SLOTS - 1, lv.n - 1), at: performance.now() };
      } else if (change === null) {
        lv.anim = null;
      }
      if (el.lives) el.lives.setAttribute('aria-label', `${lv.n} of ${SLOTS} lives`);
      lv.dirty = true;
    },
    /** The current universe's life() function, or null for the fallback block. */
    setLifeIcon(fn) {
      const next = typeof fn === 'function' ? fn : null;
      if (next !== lv.icon) { lv.icon = next; lv.dirty = true; }
    },
    /** Per frame: redraw the slots while animating, on change, and a few times a second. */
    frame(fx) {
      if (el.hud.hidden) return;
      const now = performance.now();
      if (lv.dirty || lv.anim || now - lv.drawnAt > 120) drawLives(fx, now);
    },
    syncSwitches,
    error(msg) { show(el.loading, true); el.loading.textContent = msg; },
  };
}
