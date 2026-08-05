import { Easing, clamp, lerp } from "./engine.js";
import { Palette } from "./palette.js";

export const RunnerState = Object.freeze({
  IDLE: "idle",
  RUN: "run",
  JUMP: "jump",
  HIT: "hit"
});

const GRAVITY = 1800; // px/s^2
const JUMP_VELOCITY = -620; // px/s, tuned against GRAVITY for a snappy arc
const RUN_CYCLE_RATE = 9; // radians per (speed unit * second)
const RECOVERY_TIME = 0.4; // seconds for the hit-reaction to settle

const FALLBACK_HEAD_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect width="100%" height="100%" rx="8" fill="none"/>
    <circle cx="24" cy="18" r="12" fill="#f0b37e" stroke="#17211c" stroke-width="2"/>
    <circle cx="19" cy="16" r="2" fill="#17211c"/>
    <circle cx="29" cy="16" r="2" fill="#17211c"/>
    <path d="M18 24 Q24 30 30 24" stroke="#17211c" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>
`;

/**
 * The runner character: a small state machine (idle / run / jump / hit)
 * driving a procedurally animated skeleton (two legs, two arms, torso,
 * head) instead of a static stick figure. Legs and arms swing from a
 * running-cycle phase accumulator, jumps use squash-and-stretch scaling
 * driven by vertical velocity, and misses trigger a recoil + camera-shake
 * reaction — all computed each frame, no sprite sheets required.
 */
export class Runner {
  /**
   * @param {object} [options]
   * @param {number} [options.x] - Fixed x position, in canvas coordinates
   *   (the runner doesn't move horizontally; the obstacle comes to it).
   * @param {number} [options.groundY] - Y coordinate of the ground line.
   * @param {string} [options.headImageSrc] - URL of a photo to use as the
   *   head; falls back to a built-in placeholder SVG if it fails to load.
   */
  constructor({ x = 46, groundY = 0, headImageSrc } = {}) {
    this.x = x;
    this.groundY = groundY;

    this.state = RunnerState.IDLE;
    this.stateT = 0;
    this.runPhase = 0;
    this.velocityY = 0;
    this.offsetY = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.tilt = 0;
    this.shakeT = 0;

    // Presentation hooks the scene wires up for particle effects; the
    // runner itself has no notion of a particle system.
    this.onLand = null;
    this.onJumpStart = null;

    this.headReady = false;
    this.headImage = new Image();
    this.headImage.onload = () => {
      this.headReady = true;
    };
    this.headImage.onerror = () => {
      try {
        this.headImage.src = `data:image/svg+xml;utf8,${encodeURIComponent(FALLBACK_HEAD_SVG)}`;
      } catch (error) {
        this.headReady = false;
      }
    };
    if (headImageSrc) {
      this.headImage.src = headImageSrc;
    }
  }

  /**
   * Update the ground line the runner stands on (e.g. after a canvas resize).
   * @param {number} groundY - New Y coordinate of the ground line.
   */
  setGround(groundY) {
    this.groundY = groundY;
  }

  /**
   * Switch to a new state, resetting the per-state timer; a no-op if
   * already in that state.
   * @param {string} state - One of the RunnerState values.
   */
  _setState(state) {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.stateT = 0;
  }

  /** Switch to the running state (idle/run transitions are otherwise automatic). */
  run() {
    this._setState(RunnerState.RUN);
  }

  /** Switch to the idle state (idle/run transitions are otherwise automatic). */
  idle() {
    this._setState(RunnerState.IDLE);
  }

  /** Launch a jump (used to celebrate a correct answer): sets the initial upward velocity and fires onJumpStart. */
  jump() {
    this._setState(RunnerState.JUMP);
    this.velocityY = JUMP_VELOCITY;
    this.onJumpStart?.(this.x + 23, this.groundY);
  }

  /** Trigger the hit/recoil reaction (used on a miss), including a brief camera shake. */
  hit() {
    this._setState(RunnerState.HIT);
    this.shakeT = 0.35;
  }

  /**
   * Advance the state machine and its procedural animation parameters by
   * one fixed timestep.
   * @param {number} dt - Elapsed time in seconds.
   * @param {object} [options]
   * @param {number} [options.speed] - Current gameplay speed (drives the
   *   run-cycle rate); 0 or omitted holds the idle sway rate instead.
   * @param {boolean} [options.running] - Whether the game is actively
   *   running (vs. paused/stopped); determines whether idle/jump/hit
   *   states settle back into "run" or "idle".
   */
  update(dt, { speed = 0, running = false } = {}) {
    this.stateT += dt;

    if (this.state === RunnerState.IDLE || this.state === RunnerState.RUN) {
      this._setState(running && speed > 0 ? RunnerState.RUN : RunnerState.IDLE);
      const cycleSpeed = this.state === RunnerState.RUN ? Math.max(speed, 1.2) : 0.35;
      this.runPhase += cycleSpeed * RUN_CYCLE_RATE * dt;
      this.offsetY = 0;
      this.scaleX = lerp(this.scaleX, 1, dt * 10);
      this.scaleY = lerp(this.scaleY, 1, dt * 10);
      this.tilt = lerp(this.tilt, this.state === RunnerState.RUN ? 0.05 : 0, dt * 6);
    }

    if (this.state === RunnerState.JUMP) {
      this.velocityY += GRAVITY * dt;
      this.offsetY += this.velocityY * dt;
      this.runPhase += Math.max(speed, 1) * RUN_CYCLE_RATE * dt * 0.35;

      // Stretch while moving fast (up or down), squash near the peak and
      // on touchdown — classic squash-and-stretch.
      const stretch = clamp(-this.velocityY / JUMP_VELOCITY, -1, 1);
      this.scaleY = lerp(this.scaleY, 1 + stretch * 0.22, dt * 14);
      this.scaleX = lerp(this.scaleX, 1 - stretch * 0.14, dt * 14);
      this.tilt = lerp(this.tilt, clamp(-this.velocityY / 3000, -0.35, 0.35), dt * 10);

      if (this.offsetY >= 0) {
        this.offsetY = 0;
        this.velocityY = 0;
        this.onLand?.(this.x + 23, this.groundY);
        this.scaleX = 1.18;
        this.scaleY = 0.82;
        this._setState(running ? RunnerState.RUN : RunnerState.IDLE);
      }
    }

    if (this.state === RunnerState.HIT) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const t = clamp(this.stateT / RECOVERY_TIME, 0, 1);
      const eased = Easing.easeOutBack(t);
      this.tilt = lerp(-0.5, 0, eased);
      this.scaleX = lerp(1.2, 1, t);
      this.scaleY = lerp(0.75, 1, t);
      this.runPhase += Math.max(speed, 1) * RUN_CYCLE_RATE * dt * 0.12;

      if (t >= 1) {
        this._setState(running ? RunnerState.RUN : RunnerState.IDLE);
      }
    }
  }

  /**
   * Draw the runner: torso, back/front limbs, and head, transformed by the
   * current position, tilt, squash/stretch scale, and hit-shake offset.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   */
  render(ctx) {
    const shakeAmount = this.shakeT > 0 ? this.shakeT / 0.35 : 0;
    const shakeX = shakeAmount ? (Math.random() - 0.5) * 6 * shakeAmount : 0;
    const shakeY = shakeAmount ? (Math.random() - 0.5) * 4 * shakeAmount : 0;

    const hipX = this.x + 23 + shakeX;
    const bob = this.state === RunnerState.RUN ? Math.abs(Math.sin(this.runPhase)) * 4 : 0;
    const hipY = this.groundY - 36 + this.offsetY + shakeY - bob;

    const amplitude = this.state === RunnerState.JUMP ? 0.35 : this.state === RunnerState.HIT ? 0.08 : 0.85;
    const legSwingA = Math.sin(this.runPhase) * amplitude;
    const legSwingB = Math.sin(this.runPhase + Math.PI) * amplitude;
    const armSwingA = -legSwingA * 0.8;
    const armSwingB = -legSwingB * 0.8;

    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(this.tilt);
    ctx.scale(this.scaleX, this.scaleY);

    ctx.strokeStyle = Palette.ink;
    ctx.lineCap = "round";
    ctx.lineWidth = 4;

    // Back limbs first so the front ones draw on top.
    this._drawLeg(ctx, legSwingB, -1);
    this._drawArm(ctx, armSwingB, -1);

    ctx.fillStyle = Palette.forest;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.lineTo(7, -34);
    ctx.lineTo(-7, -34);
    ctx.closePath();
    ctx.fill();

    this._drawLeg(ctx, legSwingA, 1);
    this._drawArm(ctx, armSwingA, 1);
    this._drawHead(ctx);

    ctx.restore();
  }

  /**
   * Draw one leg as a two-segment curve from hip to foot.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} swing - Current swing angle for this leg, in radians.
   * @param {1|-1} side - 1 for the near/right leg, -1 for the far/left leg.
   */
  _drawLeg(ctx, swing, side) {
    const hipOffsetX = 4 * side;
    const kneeX = hipOffsetX + Math.sin(swing) * 14;
    const kneeY = 20 + Math.cos(swing) * 6;
    const footX = hipOffsetX + Math.sin(swing) * 20;
    const footY = 40;

    ctx.beginPath();
    ctx.moveTo(hipOffsetX, 0);
    ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
    ctx.stroke();
  }

  /**
   * Draw one arm as a curve from shoulder to hand.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} swing - Current swing angle for this arm, in radians.
   * @param {1|-1} side - 1 for the near/right arm, -1 for the far/left arm.
   */
  _drawArm(ctx, swing, side) {
    const shoulderX = 6 * side;
    const handX = shoulderX + Math.sin(swing) * 16;
    const handY = -12 + Math.cos(swing) * 14;

    ctx.beginPath();
    ctx.moveTo(shoulderX, -30);
    ctx.quadraticCurveTo(shoulderX + Math.sin(swing) * 8, -18, handX, handY);
    ctx.stroke();
  }

  /**
   * Draw the head: the loaded photo clipped to a circle if ready, else a
   * plain skin-toned circle.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   */
  _drawHead(ctx) {
    const headY = -46;
    const radius = 15;

    if (this.headReady) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, headY, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(this.headImage, -radius, headY - radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, headY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#f0b37e";
      ctx.beginPath();
      ctx.arc(0, headY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
