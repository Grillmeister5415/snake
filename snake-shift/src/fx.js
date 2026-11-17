// Builds the `fx` object of plan 15.3 once per frame. Pure: no DOM.
// The switches are applied here, so renderers rarely need to branch.

import { FX } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Fallback beat clock (frame clock) used when beat.js is missing. Same shape as createBeat(). */
export function createFallbackBeat({ bpm = 132 } = {}) {
  let source = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  let t0 = 0;
  let running = false;
  let period = 60 / bpm;
  const beat = {
    get bpm() { return 60 / period; },
    setBpm(v) { if (v > 0 && Number.isFinite(v)) period = 60 / Math.max(20, Math.min(400, v)); },
    get running() { return running; },
    setTimeSource(fn) { if (typeof fn === 'function') source = fn; },
    start() { if (!running) { running = true; t0 = source(); } },
    stop() { running = false; },
    index() { return running ? Math.floor((source() - t0) / period) : 0; },
    phase() { return running ? ((source() - t0) / period) % 1 : 0; },
    pulse() { return running ? Math.exp(-beat.phase() * 6) : 0; },
  };
  return beat;
}

/**
 * createFx() -> { frame({ now, director, beat, prefs, snap }) -> fx }
 *   director: director.get() result; beat: createBeat()-like object; prefs: { reducedFlash, reducedMotion }
 *   snap: the simulation snapshot (lives, universe, rules)
 * Extra fields beyond 15.3 (additive): strobe, invert, glitch, split, scene, prev, view, timeline, kind.
 * LEVELS_PLAN 4.2: lives, maxLives, universe, look, calm, rules, waiting. Crash screen: crashAge, panel.
 * Calm universes (lcd, abyss): no strobe, inversion, glitch or colour split; beat pulse capped at 15%.
 */
export function createFx() {
  let lastNow = null;
  let time = 0;

  function frame({ now, director: d, beat, prefs, snap = null, panel = null }) {
    const rf = !!prefs.reducedFlash;
    const calm = !!(d && d.calm);
    const rm = !!prefs.reducedMotion;
    const dt = lastNow === null ? 0 : Math.max(0, Math.min(100, now - lastNow));
    lastNow = now;
    time += (dt / 1000) * (rm ? FX.reducedMotionTime : 1);

    const running = !!(beat && beat.running);
    let pulse = 0, beatIndex = 0;
    if (running) {
      try {
        if (typeof beat.sample === 'function') {
          const s = beat.sample(); // one clock read
          pulse = clamp01(s.pulse);
          beatIndex = s.index | 0;
        } else {
          pulse = clamp01(beat.pulse());
          beatIndex = beat.index() | 0;
        }
      } catch { pulse = 0; }
    }
    if (rf) pulse = Math.min(pulse * FX.reducedFlashBeat, FX.reducedFlashBeat);
    if (calm) pulse = Math.min(pulse, FX.calmBeat);

    const biteAge = d && Number.isFinite(d.biteAt) ? Math.max(0, now - d.biteAt) : Infinity;
    const cutAge = d ? Math.max(0, now - d.cutAt) : Infinity;
    const chaos = d ? d.chaos : 0;
    const punch = rf || !Number.isFinite(biteAge) ? 0 : Math.pow(clamp01(1 - biteAge / FX.punchMs), 2);

    let strobe = 0;
    if (!rf && !calm && d && d.strobe) {
      const s = d.strobe;
      const t = now - s.at;
      if (t >= 0 && t < s.dur) {
        const half = s.dur / (s.count * 2);
        strobe = Math.floor(t / half) % 2 === 0 ? 1 : 0;
      }
    }
    const invert = !rf && !calm && !!d && now < d.invertUntil;
    const cutKick = clamp01(1 - cutAge / 350);
    const glitch = rf || calm ? 0 : clamp01(chaos * (0.22 + 0.78 * Math.max(punch, cutKick, pulse * 0.45)));
    const split = rf || calm ? 0 : chaos * 7 * (0.3 + 0.7 * Math.max(punch, pulse));

    return {
      now,
      time,
      beat: pulse,
      beatIndex,
      chaos,
      punch,
      variant: d ? d.variant : 0,
      bite: d ? d.bite : null,
      biteAge,
      cutAge,
      reducedFlash: rf,
      reducedMotion: rm,
      // additive extras
      strobe, invert, glitch, split,
      scene: d ? d.showing : null,
      prev: d ? (d.prevTimeline ?? null) : null, // previous timeline or room id (flat-a request)
      view: d ? d.view : 'board',
      timeline: d ? d.timeline : null,
      kind: d ? d.kind : '2d',
      // LEVELS_PLAN 4.2
      lives: snap ? snap.lives : 0,
      maxLives: snap ? snap.maxLives : 5,
      universe: snap && snap.universe ? snap.universe.id : (d ? d.timeline : null),
      look: d ? (d.look || (d.kind === '2d' ? '2d' : d.view === 'pov' ? 'pov' : '3d')) : '2d',
      calm,
      rules: snap && snap.universe ? snap.universe.rules : 'box',
      waiting: snap ? snap.waiting || null : null,
      // ms since the director recorded a crash-screen crash (Infinity when none since the reset)
      crashAge: d && Number.isFinite(d.crashAt) ? Math.max(0, now - d.crashAt) : Infinity,
      // the game-over panel's rectangle { x, y, w, h } in stage px while a crash screen awaits it
      panel: panel || null,
    };
  }

  return { frame, reset() { lastNow = null; } };
}

/**
 * Quality scaling: feed real frame intervals; when the smoothed interval stays above `slowMs`
 * for `holdMs`, step down one level (lower canvas resolution). Throttled or hidden-tab gaps
 * (over `ignoreMs`) are ignored. Returns true from sample() when the level changed.
 */
export function createQuality({ levels = [1, 0.75, 0.5], slowMs = 28, holdMs = 2000, ignoreMs = 250 } = {}) {
  let level = 0, ema = 16.7, slowFor = 0, cooldown = 0;
  return {
    get level() { return level; },
    get scale() { return levels[level]; },
    sample(dt) {
      if (!(dt > 0) || dt > ignoreMs) { slowFor = 0; return false; }
      ema += (dt - ema) * 0.1;
      if (cooldown > 0) { cooldown -= dt; return false; }
      slowFor = ema > slowMs ? slowFor + dt : 0;
      if (slowFor < holdMs || level >= levels.length - 1) return false;
      level++;
      slowFor = 0;
      ema = 16.7;
      cooldown = 1000; // let the new size settle before judging again
      return true;
    },
  };
}
