// Small, dependency-free primitives shared by every game entity: numeric
// helpers, a handful of easing curves for procedural animation, and a
// fixed-timestep loop so physics stay stable no matter the monitor's
// refresh rate.

/**
 * Restrict a number to a closed range.
 * @param {number} value - The number to clamp.
 * @param {number} min - Lower bound (inclusive).
 * @param {number} max - Upper bound (inclusive).
 * @returns {number} `value` clamped to [min, max].
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Linearly interpolate between two numbers.
 * @param {number} a - Value at t=0.
 * @param {number} b - Value at t=1.
 * @param {number} t - Interpolation factor, typically 0..1.
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Named easing curves, each mapping a normalized time `t` (0..1) to a
 * progress value (usually 0..1, though easeOutBack briefly overshoots 1).
 */
export const Easing = {
  linear: (t) => t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInQuad: (t) => t * t,
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  // Overshoots past 1 before settling, good for a "landed with a thump"
  // squash-and-stretch recovery.
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  }
};

/**
 * A fixed-update game loop: simulation runs in constant-size steps (so
 * physics/animation never depend on frame rate) while rendering happens
 * once per animation frame, interpolating between steps if needed.
 */
export class GameLoop {
  /**
   * @param {object} options
   * @param {(dt: number) => void} options.update - Called once per fixed
   *   step with the step duration in seconds.
   * @param {(alpha: number) => void} options.render - Called once per
   *   animation frame with the leftover fraction of a step (0..1), for
   *   interpolated rendering.
   * @param {number} [options.step] - Fixed simulation step in
   *   milliseconds (default ~16.67ms, i.e. 60Hz).
   * @param {number} [options.maxFrameMs] - Upper bound on how much wall
   *   time a single frame can contribute, so a long stall (e.g. a
   *   backgrounded tab) doesn't trigger a huge catch-up burst of updates.
   */
  constructor({ update, render, step = 1000 / 60, maxFrameMs = 250 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxFrameMs = maxFrameMs;
    this._accumulator = 0;
    this._lastTime = 0;
    this._running = false;
    this._frameHandle = null;
    this._tick = this._tick.bind(this);
  }

  /** Start (or resume) the loop; a no-op if it's already running. */
  start() {
    if (this._running) {
      return;
    }
    this._running = true;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._frameHandle = requestAnimationFrame(this._tick);
  }

  /** Stop the loop; cancels the pending animation frame, if any. */
  stop() {
    this._running = false;
    if (this._frameHandle !== null) {
      cancelAnimationFrame(this._frameHandle);
      this._frameHandle = null;
    }
  }

  /**
   * Internal requestAnimationFrame callback: advances the fixed-step
   * simulation by as many steps as the elapsed wall time covers, then
   * renders once and reschedules itself.
   * @param {number} now - Timestamp supplied by requestAnimationFrame.
   */
  _tick(now) {
    if (!this._running) {
      return;
    }

    const frameMs = Math.min(this.maxFrameMs, now - this._lastTime);
    this._lastTime = now;
    this._accumulator += frameMs;

    while (this._accumulator >= this.step) {
      this.update(this.step / 1000);
      this._accumulator -= this.step;
    }

    this.render(this._accumulator / this.step);
    this._frameHandle = requestAnimationFrame(this._tick);
  }
}
