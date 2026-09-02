import { clamp } from "./engine.js";
import { CANDY_PALETTE } from "./palette.js";

/**
 * The arriving chord, rendered as a racing pennant: a slim pole planted on
 * the track with a triangular flag flying from it, gently bowed (drawn
 * with curves rather than straight edges) as if catching the wind while
 * it approaches — matching the runner's own "reaching a checkpoint" idea
 * better than a plain plaque would. The flag's fill/outline/text all
 * share the same dark tone on a pastel body (no separate light-on-dark
 * block), and it glows more urgently the closer it gets (`proximity`, a
 * 0..1 value the scene computes from its position). Its hue is picked
 * deterministically from the chord symbol itself (see hashLabel), so
 * different chords fly a varied, colorful set of flags instead of one
 * repeated block.
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
    this.height = 90;
  }

  /**
   * Move the obstacle back to the start of the track for a new round.
   * @param {number} x - New x position, in canvas coordinates.
   */
  reset(x) {
    this.x = x;
  }

  /**
   * Update the chord symbol shown on the flag.
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
   * Draw the pennant. The bounding box used for collision (this.x/width/
   * height, set here and read by the scene) stays the pole-to-flag-tip
   * rectangle; the flag's own gentle bow (drawn past its straight edges
   * by a few px) is a cosmetic-only overhang that never affects hit
   * detection.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   * @param {number} groundY - Y coordinate of the ground line.
   * @param {number} proximity - 0..1 value, how close the obstacle is to
   *   the runner; higher values intensify the glow.
   */
  render(ctx, groundY, proximity) {
    const displayText = this.label;
    // Canvas text can't resolve CSS custom properties (no var()), so this
    // mirrors --font-sans from styles.css literally.
    ctx.font = "800 20px system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    const flagWidth = Math.max(100, ctx.measureText(displayText).width * 1.3 + 34);
    const flagHeight = 46;
    const poleHeight = 90;
    this.width = flagWidth + 6;
    this.height = poleHeight;
    const glow = clamp(proximity, 0, 1);

    const hash = hashLabel(displayText);
    const candy = CANDY_PALETTE[hash % CANDY_PALETTE.length];

    const poleX = this.x;
    const poleTop = groundY - poleHeight;
    const flagTop = poleTop + 3;
    const flagBottom = flagTop + flagHeight;
    const flagMidY = (flagTop + flagBottom) / 2;
    // How far the flag's top/bottom edges bow outward mid-length, like
    // cloth caught in a light breeze.
    const wave = 5;

    ctx.save();

    // The pole: a slim flagpole planted at the ground, with a small round
    // finial on top.
    ctx.fillStyle = candy.deep;
    ctx.fillRect(poleX - 2, poleTop, 4, poleHeight);
    ctx.beginPath();
    ctx.arc(poleX, poleTop, 4, 0, Math.PI * 2);
    ctx.fill();

    // The pennant: a triangle (flat edge on the pole, point trailing to
    // the right) with its top/bottom edges bowed via quadratic curves
    // rather than dead straight.
    ctx.beginPath();
    ctx.moveTo(poleX, flagTop);
    ctx.quadraticCurveTo(poleX + flagWidth * 0.55, flagTop - wave, poleX + flagWidth, flagMidY);
    ctx.quadraticCurveTo(poleX + flagWidth * 0.55, flagBottom + wave, poleX, flagBottom);
    ctx.closePath();

    if (glow > 0.5) {
      ctx.save();
      ctx.shadowColor = hexToRgba(candy.deep, 0.4);
      ctx.shadowBlur = 6 + glow * 18;
      ctx.fillStyle = candy.soft;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = candy.soft;
      ctx.fill();
    }

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = candy.deep;
    ctx.stroke();

    // Left-aligned rather than centered: the triangle is at its widest
    // right at the pole, so the label sits in that full-height band
    // instead of drifting toward the narrowing point.
    ctx.fillStyle = candy.deep;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, poleX + 14, flagMidY + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    ctx.restore();
  }
}

/**
 * A tiny deterministic string hash (Java's String.hashCode algorithm),
 * used to pick a stable candy color per chord symbol without needing any
 * extra state on the obstacle itself.
 * @param {string} text - Text to hash, e.g. a chord symbol like "Dm7".
 * @returns {number} A non-negative integer hash.
 */
function hashLabel(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Convert a "#rrggbb" hex color to an "rgba(...)" string at the given
 * alpha — canvas fillStyle/shadowColor can't take a hex color plus a
 * separate globalAlpha scoped to just one shape, so this is the simplest
 * way to get a translucent version of a Palette color.
 * @param {string} hex - A "#rrggbb" color string.
 * @param {number} alpha - Opacity, 0..1.
 * @returns {string} An "rgba(r, g, b, a)" string.
 */
function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
