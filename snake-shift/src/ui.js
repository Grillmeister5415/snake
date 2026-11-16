// DOM interface: title with the photosensitivity warning and both switches,
// HUD themed per timeline, pause/settings panel, game over with best score.
// The UI only reads state and calls back into main.js.

const DEFAULT_HUD = { fg: '#f4f4f4', bg: 'rgba(0,0,0,0.72)', accent: '#ff2bd6', panelFg: '#f4f4f4', panelBg: 'rgba(8,6,16,0.94)' };

export function createUI({ prefs, onPlay, onAgain, onPauseToggle, onMuteToggle, onSettings }) {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const el = {
    hud: $('hud'), score: $('score'), eraName: $('era-name'), eraYear: $('era-year'),
    pause: $('btn-pause'), mute: $('btn-mute'), settings: $('btn-settings'),
    hint: $('hint'), title: $('title'), paused: $('paused'), over: $('over'),
    play: $('btn-play'), resume: $('btn-resume'), again: $('btn-again'),
    overScore: $('over-score'), overBest: $('over-best'), overNew: $('over-new'),
    loading: $('loading'), dpad: $('dpad'),
  };
  let inPlay = false; // HUD showing (ready, playing, paused)
  let touchHint = false;
  const hintText = () => (prefs.get().dpad ? 'TAP AN ARROW TO START' : touchHint ? 'SWIPE TO START' : 'PRESS AN ARROW TO START');
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

  function show(node, on) { node.hidden = !on; }
  function blurAll() { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }

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
      el.hint.textContent = hintText();
      blurAll();
    },
    showPlaying() { show(el.hint, false); show(el.paused, false); blurAll(); },
    showPaused(on) {
      show(el.paused, on);
      el.pause.setAttribute('aria-pressed', String(on));
      if (on) el.resume.focus({ preventScroll: true }); else blurAll();
    },
    showOver({ score, best, isNew }) {
      el.overScore.textContent = String(score);
      el.overBest.textContent = String(best);
      show(el.overNew, isNew);
      show(el.hint, false); show(el.paused, false); show(el.over, true);
      inPlay = false; syncSwitches();
      el.again.focus({ preventScroll: true });
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
    },
    syncSwitches,
    error(msg) { show(el.loading, true); el.loading.textContent = msg; },
  };
}
