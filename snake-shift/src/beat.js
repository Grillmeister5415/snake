// SNAKE//SHIFT — beat clock (BUILD_PLAN 4.4, 15.3).
//
// createBeat({ bpm = 132 } = {})
// → { bpm, running, setTimeSource(fn), start(), stop(), index(), phase(), pulse() }
//   plus extras used by audio.js: period, now(), position(t?), timeAt(beat), sample(),
//   setBpm(bpm) (LEVELS_PLAN 7.2: phase-continuous tempo change)
//
// Pure: no DOM, no audio. Time comes from a function returning seconds, so the
// clock can follow the audio clock (audio.js) or the frame clock (default:
// performance.now). It never writes game state.
//
// Robustness:
// - setTimeSource() while running rebases, so the beat position is continuous.
// - A source that runs backwards by a little (jitter) is held; by a lot (audio
//   context resumed after a suspend) it is rebased. Position never goes back.
// - A source that throws or returns a non-number falls back to the frame clock.
// - setBpm() keeps the current position (index and phase) and changes only the
//   rate from now on. No tempo map is kept: position(t) for a t before the last
//   change is extrapolated with the new tempo, so ask about now or the future.

const JUMP = 0.2; // seconds: larger backward steps are rebased, smaller ones held

function perfNow() {
  const p = globalThis.performance;
  return (p && typeof p.now === 'function' ? p.now() : Date.now()) / 1000;
}

function read(fn) {
  try {
    const v = fn();
    return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

const BPM_MIN = 20;
const BPM_MAX = 400;

export function createBeat({ bpm = 132, decay = 5.5 } = {}) {
  bpm = Number.isFinite(bpm) && bpm > 0 ? Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)) : 132;
  let period = 60 / bpm;
  let source = perfNow;
  let t0 = 0; // source time of beat 0
  let last = NaN; // last time handed out, for the monotonic guard
  let running = false;

  // Current source time, guarded.
  function now() {
    let t = read(source);
    if (Number.isNaN(t)) {
      // Source broke: switch to the frame clock, keep the position.
      const pos = Number.isNaN(last) ? 0 : last - t0;
      source = perfNow;
      t = perfNow();
      t0 = t - pos;
      last = t;
      return t;
    }
    if (running && !Number.isNaN(last) && t < last) {
      if (last - t > JUMP) t0 -= last - t; // big rewind: rebase, position continues
      else t = last; // jitter: hold
    }
    last = t;
    return t;
  }

  function position(t) {
    if (!running) return 0;
    const at = typeof t === 'number' && Number.isFinite(t) ? t : now();
    return Math.max(0, (at - t0) / period);
  }

  function sample() {
    if (!running) return { index: 0, phase: 0, pulse: 0 };
    const p = position();
    const index = Math.floor(p);
    const phase = p - index;
    return { index, phase, pulse: Math.exp(-phase * decay) };
  }

  return {
    get bpm() {
      return bpm;
    },
    get period() {
      return period;
    },
    // Phase-continuous tempo change. Invalid values are ignored; returns the bpm in use.
    setBpm(next) {
      const n = Number(next);
      if (!(Number.isFinite(n) && n > 0)) return bpm;
      const b = Math.min(BPM_MAX, Math.max(BPM_MIN, n));
      if (b === bpm) return bpm;
      if (running) {
        const t = now();
        const pos = (t - t0) / period; // beats at the old tempo
        period = 60 / b;
        t0 = t - pos * period;
      } else {
        period = 60 / b;
      }
      bpm = b;
      return bpm;
    },
    get running() {
      return running;
    },
    setTimeSource(fn) {
      const next = typeof fn === 'function' ? fn : perfNow;
      if (!running) {
        source = next;
        last = NaN;
        return;
      }
      const pos = position(); // beats, measured on the old source
      source = next;
      let t = read(next);
      if (Number.isNaN(t)) {
        source = perfNow;
        t = perfNow();
      }
      t0 = t - pos * period;
      last = t;
    },
    start() {
      if (running) return;
      last = NaN;
      const t = now();
      t0 = t;
      running = true;
    },
    stop() {
      running = false;
    },
    now,
    position,
    timeAt(b) {
      return t0 + b * period;
    },
    sample,
    index() {
      return sample().index;
    },
    phase() {
      return sample().phase;
    },
    pulse() {
      return sample().pulse;
    },
  };
}
