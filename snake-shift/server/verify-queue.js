// Replay verification without blocking the server (LEADERBOARD_PLAN A11). Node runs JavaScript on
// one thread, so a long replay is verified in slices of `sliceTicks` ticks with a pause in between,
// in which other requests are answered. At most `concurrency` replays are in progress and at most
// `maxQueued` wait; past that the answer is "busy, try again" (BusyError, HTTP 503), which the
// browser treats as a passing problem. The work per replay is bounded by REPLAY_LIMITS.maxTicks.

import { createVerifier } from '../src/replay.js';

export class BusyError extends Error {
  constructor(message = 'verification queue is full') {
    super(message);
    this.name = 'BusyError';
  }
}

/**
 * @param {{ concurrency?: number, maxQueued?: number, sliceTicks?: number,
 *   pause?: (fn: () => void) => void, verifier?: typeof createVerifier }} [opts]
 *   pause schedules the next slice (setImmediate: after waiting I/O has been handled).
 */
export function createVerifyQueue({
  concurrency = 2, maxQueued = 16, sliceTicks = 1000, pause = setImmediate, verifier = createVerifier,
} = {}) {
  const waiting = [];
  let active = 0;
  let closed = false;
  let idle = null; // resolves when nothing is active or waiting

  function next() {
    while (active < concurrency && waiting.length) {
      const job = waiting.shift();
      active += 1;
      work(job);
    }
    if (!active && !waiting.length && idle) { idle.resolve(); idle = null; }
  }

  function work(job) {
    let v;
    try {
      v = verifier(job.args);
    } catch (err) {
      finish(job, null, err);
      return;
    }
    const slice = () => {
      let r;
      try {
        r = v.run(sliceTicks);
      } catch (err) {
        finish(job, null, err);
        return;
      }
      if (r) finish(job, r, null);
      else pause(slice);
    };
    slice();
  }

  function finish(job, result, err) {
    active -= 1;
    if (err) job.reject(err); else job.resolve(result);
    next();
  }

  return {
    /**
     * Verifies one replay (createVerifier arguments). Resolves with the verifier's result; rejects
     * with BusyError at once when the queue is full or closed.
     */
    run(args) {
      if (closed) return Promise.reject(new BusyError('the server is shutting down'));
      if (active >= concurrency && waiting.length >= maxQueued) return Promise.reject(new BusyError());
      return new Promise((resolve, reject) => {
        waiting.push({ args, resolve, reject });
        next();
      });
    },
    get active() { return active; },
    get queued() { return waiting.length; },
    /** Takes no new work; resolves when the work in hand is done or after `timeoutMs`. */
    close(timeoutMs = 10000) {
      closed = true;
      if (!active && !waiting.length) return Promise.resolve();
      if (!idle) {
        let resolve;
        const promise = new Promise((r) => { resolve = r; });
        idle = { promise, resolve };
      }
      return Promise.race([idle.promise, new Promise((r) => setTimeout(r, timeoutMs).unref())]);
    },
  };
}
