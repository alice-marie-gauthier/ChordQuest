import { GameLoop, clamp } from "./engine.js";
import { Runner } from "./runner.js";
import { Obstacle } from "./obstacle.js";
import { ParticleSystem } from "./particles.js";
import { Palette } from "./palette.js";

const START_X_PADDING = 120;
const MISS_ZONE = { near: 86, far: 40 };
const SPEED_TO_PX_PER_SEC = 62.5; // keeps the 0.5-7 speed slider feeling the same as before
const NOTE_GLYPHS = ["♪", "♫", "♩"];
const KEY_WIDTH = 22;

/**
 * Composes the runner, the arriving obstacle, particle effects and a
 * parallax ground into one canvas scene, driven by a single fixed-timestep
 * GameLoop. The scene owns no game/network logic: it reads game state
 * through the `hooks` callbacks (wired up once via `configure`) and reports
 * a miss through `onMiss`, leaving scoring, prompts and the API calls to
 * the caller.
 */
export class RunnerScene {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element to render into.
   * @param {object} [options]
   * @param {HTMLElement} [options.arrivalMeterEl] - Element whose width
   *   style is driven to reflect the obstacle's approach progress (0-100%).
   * @param {string} [options.headImageSrc] - URL of a photo to use as the
   *   runner's head; see Runner.
   */
  constructor(canvas, { arrivalMeterEl, headImageSrc } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.arrivalMeterEl = arrivalMeterEl;
    this.groundY = canvas.height - 58;

    this.runner = new Runner({ x: 46, groundY: this.groundY, headImageSrc });
    this.obstacle = new Obstacle({ x: canvas.width + START_X_PADDING });
    this.particles = new ParticleSystem();

    this.runner.onLand = (x, y) => this.particles.dust(x, y);
    this.runner.onJumpStart = (x, y) => this.particles.dust(x, y, { count: 6 });

    this.hooks = {
      isRunning: () => false,
      isResolving: () => false,
      getSpeed: () => 0,
      getLabel: () => "Chord",
      getStatusLabel: () => "Press Start game"
    };

    this.onMiss = null;
    this.missedThisRound = false;
    // Three independent scroll offsets for a cheap sense of depth: distant
    // notes drift slowest, near notes faster, and the piano-key ground
    // band scrolls fastest of all (tied to the obstacle's own speed).
    this.parallax = { notesBack: 0, notesFront: 0, ground: 0 };

    this.loop = new GameLoop({
      update: (dt) => this._update(dt),
      render: () => this._render()
    });
  }

  /**
   * Wire up (or update) the callbacks the scene reads game state through.
   * @param {object} hooks - Any subset of: isRunning(), isResolving(),
   *   getSpeed(), getLabel(), getStatusLabel() — see the defaults set in
   *   the constructor for each one's contract.
   */
  configure(hooks) {
    Object.assign(this.hooks, hooks);
  }

  /** Called once at page load; renders the idle scene even before a game starts. */
  begin() {
    this.loop.start();
  }

  /** Called when "Start game" is clicked. */
  start() {
    this.runner.run();
    this.nextRound();
  }

  /** Called when "Stop game" is clicked. */
  stop() {
    this.runner.idle();
    this.nextRound();
  }

  /** Positions the obstacle back at the start of the track for a fresh prompt. */
  nextRound() {
    this.obstacle.reset(this.canvas.width + START_X_PADDING);
    this.missedThisRound = false;
    if (this.arrivalMeterEl) {
      this.arrivalMeterEl.style.width = "0%";
    }
  }

  /** Play the runner's jump + a confetti burst; called when a chord was answered correctly. */
  playCorrectAnswer() {
    this.runner.jump();
    this.particles.burst(this.runner.x + 23, this.groundY - 40);
  }

  /**
   * Advance the whole scene by one fixed timestep: parallax scroll, the
   * runner, particles, and (while actively running) the obstacle,
   * including its own miss detection.
   * @param {number} dt - Elapsed time in seconds.
   */
  _update(dt) {
    const running = this.hooks.isRunning();
    const resolving = this.hooks.isResolving();
    const speed = this.hooks.getSpeed();

    this.parallax.notesBack -= speed * 8 * dt;
    this.parallax.notesFront -= speed * 20 * dt;
    this.parallax.ground -= speed * 42 * dt;

    this.runner.update(dt, { speed, running });
    this.particles.update(dt);

    if (running && !resolving) {
      this.obstacle.speed = speed * SPEED_TO_PX_PER_SEC;
      this.obstacle.update(dt, { moving: true });

      const start = this.canvas.width + START_X_PADDING;
      const end = 64;
      const progress = clamp((start - this.obstacle.x) / (start - end), 0, 1);
      if (this.arrivalMeterEl) {
        this.arrivalMeterEl.style.width = `${progress * 100}%`;
      }

      const { x } = this.obstacle;
      if (!this.missedThisRound && x < MISS_ZONE.near && x > MISS_ZONE.far) {
        this.missedThisRound = true;
        this.runner.hit();
        this.particles.dust(this.runner.x + 20, this.groundY, { count: 10 });
        this.onMiss?.();
      }
    } else {
      this.obstacle.update(dt, { moving: false });
      if (!running && this.arrivalMeterEl) {
        this.arrivalMeterEl.style.width = "0%";
      }
    }
  }

  /** Draw the full scene: sky, staff lines, parallax notes, ground, piano-key band, obstacle, runner, particles, and the status line. */
  _render() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, this.groundY);
    sky.addColorStop(0, Palette.paper);
    sky.addColorStop(1, Palette.paperChip);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    this._drawStaffLines(ctx, width);
    this._drawNoteBand(ctx, width, this.parallax.notesBack, {
      y: 54,
      size: 20,
      tile: 210,
      alpha: 0.16,
      color: Palette.inkSoft
    });
    this._drawNoteBand(ctx, width, this.parallax.notesFront, {
      y: 96,
      size: 15,
      tile: 140,
      alpha: 0.22,
      color: Palette.brassDeep
    });

    ctx.fillStyle = Palette.paperCard;
    ctx.fillRect(0, this.groundY, width, height - this.groundY);
    ctx.strokeStyle = Palette.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(width, this.groundY);
    ctx.stroke();

    this._drawPianoKeyBand(ctx, width);

    const start = this.canvas.width + START_X_PADDING;
    const end = 64;
    const proximity = clamp((start - this.obstacle.x) / (start - end), 0, 1);

    this.obstacle.setLabel(this.hooks.getLabel());
    this.obstacle.render(ctx, this.groundY, proximity);
    this.runner.render(ctx);
    this.particles.render(ctx);

    ctx.fillStyle = Palette.ink;
    ctx.font = "700 18px system-ui";
    ctx.fillText(this.hooks.getStatusLabel(), 24, 34);
  }

  /**
   * A faint five-line musical staff across the top of the scene.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} width - Canvas width in pixels.
   */
  _drawStaffLines(ctx, width) {
    ctx.strokeStyle = Palette.line;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = 14 + i * 7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  /**
   * A row of drifting note glyphs at one parallax depth.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} width - Canvas width in pixels.
   * @param {number} offset - Current scroll offset for this band, in
   *   pixels (from this.parallax).
   * @param {object} band
   * @param {number} band.y - Vertical position of the glyph baseline.
   * @param {number} band.size - Font size in pixels.
   * @param {number} band.tile - Horizontal spacing between glyphs.
   * @param {number} band.alpha - Opacity (0..1).
   * @param {string} band.color - Fill color.
   */
  _drawNoteBand(ctx, width, offset, { y, size, tile, alpha, color }) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `${size}px system-ui`;
    ctx.textAlign = "center";
    const scrolled = ((offset % tile) + tile) % tile;
    let glyphIndex = 0;
    for (let x = -scrolled; x < width + tile; x += tile) {
      ctx.fillText(NOTE_GLYPHS[glyphIndex % NOTE_GLYPHS.length], x, y);
      glyphIndex += 1;
    }
    ctx.restore();
  }

  /**
   * Alternating ivory/ebony keys along the front edge of the ground, like a keybed.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} width - Canvas width in pixels.
   */
  _drawPianoKeyBand(ctx, width) {
    const bandY = this.groundY + 6;
    const bandHeight = 12;
    const scrolled = ((this.parallax.ground % (KEY_WIDTH * 2)) + KEY_WIDTH * 2) % (KEY_WIDTH * 2);

    for (let x = -scrolled; x < width + KEY_WIDTH; x += KEY_WIDTH) {
      const keyIndex = Math.round((x + scrolled) / KEY_WIDTH);
      ctx.fillStyle = keyIndex % 2 === 0 ? Palette.ivory : Palette.ebony;
      ctx.fillRect(x, bandY, KEY_WIDTH - 2, bandHeight);
    }

    ctx.strokeStyle = Palette.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, bandY, width, bandHeight);
  }
}
