import { clamp } from "./engine.js";
import { Palette } from "./palette.js";

/**
 * The arriving chord, rendered as a brown-trimmed plaque with a musical
 * note glyph — a nameplate rather than a plain warning block — that glows
 * more urgently the closer it gets (`proximity`, a 0..1 value the scene
 * computes from its position).
 */
export class Obstacle {
  /**
   * @param {object} [options]
   * @param {number} [options.x] - Initial x position, in canvas coordinates.
   * @param {number} [options.speed] - Horizontal approach speed in px/s.
   * @param {string} [options.label] - Chord symbol to display, e.g. "Dm7".
   */
  constructor({ x = 0, speed = 0, label = "Chord" } = {}) {
    this.x = x;
    this.speed = speed;
    this.label = label;
    this.width = 110;
    this.height = 58;
  }

  /**
   * Move the obstacle back to the start of the track for a new round.
   * @param {number} x - New x position, in canvas coordinates.
   */
  reset(x) {
    this.x = x;
  }

  /**
   * Update the chord symbol shown on the plaque.
   * @param {string} label - Chord symbol to display; falls back to
   *   "Chord" if falsy.
   */
  setLabel(label) {
    this.label = label || "Chord";
  }

  /**
   * Advance the obstacle's position.
   * @param {number} dt - Elapsed time in seconds.
   * @param {object} [options]
   * @param {boolean} [options.moving] - Whether it should actually move
   *   this tick (false freezes it in place, e.g. while a miss/correct
   *   answer is resolving).
   */
  update(dt, { moving = true } = {}) {
    if (moving) {
      this.x -= this.speed * dt;
    }
  }

  /**
   * Draw the plaque.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} groundY - Y coordinate of the ground line.
   * @param {number} proximity - 0..1 value, how close the obstacle is to
   *   the runner; higher values intensify the glow.
   */
  render(ctx, groundY, proximity) {
    const displayText = `♪ ${this.label}`;
    // Canvas text can't resolve CSS custom properties (no var()), so this
    // mirrors --font-sans from styles.css literally.
    ctx.font = "800 20px system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    const width = Math.max(104, ctx.measureText(displayText).width + 36);
    this.width = width;
    const height = this.height;
    const y = groundY - height;
    const glow = clamp(proximity, 0, 1);

    ctx.save();
    if (glow > 0.5) {
      ctx.shadowColor = "rgba(124, 45, 58, 0.65)";
      ctx.shadowBlur = 8 + glow * 20;
    }

    const gradient = ctx.createLinearGradient(this.x, y, this.x, y + height);
    gradient.addColorStop(0, Palette.wine);
    gradient.addColorStop(1, Palette.wineDeep);
    ctx.fillStyle = gradient;
    roundRect(ctx, this.x, y, width, height, 12);
    ctx.fill();
    ctx.restore();

    // A thin frame, like an engraved instrument nameplate.
    ctx.strokeStyle = Palette.brownSoft;
    ctx.lineWidth = 2;
    roundRect(ctx, this.x + 3, y + 3, width - 6, height - 6, 9);
    ctx.stroke();

    ctx.fillStyle = Palette.ivory;
    ctx.textAlign = "center";
    ctx.fillText(displayText, this.x + width / 2, y + 36);
    ctx.textAlign = "start";

    // The hanging string above the plaque.
    ctx.fillStyle = Palette.brownDeep;
    roundRect(ctx, this.x + 12, y - 14, width - 24, 14, 5);
    ctx.fill();
  }
}

/**
 * Trace a rounded-rectangle path (canvas 2D has no built-in primitive for
 * this in every supported browser, so it's hand-rolled with arcTo).
 * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
 * @param {number} x - Top-left x.
 * @param {number} y - Top-left y.
 * @param {number} width - Rectangle width.
 * @param {number} height - Rectangle height.
 * @param {number} radius - Corner radius.
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
