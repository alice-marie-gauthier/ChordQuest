import { clamp } from "./engine.js";
import { Palette } from "./palette.js";

// A minimal pooled-array particle system: no classes-per-particle, just
// plain objects updated in place with simple projectile motion. Good
// enough for confetti bursts and dust puffs without pulling in a library.
export class ParticleSystem {
  /** Creates an empty particle system. */
  constructor() {
    this.particles = [];
  }

  /**
   * Spawn a radial confetti-style burst (used on a correct answer).
   * @param {number} x - Spawn point x, in canvas coordinates.
   * @param {number} y - Spawn point y, in canvas coordinates.
   * @param {object} [options]
   * @param {number} [options.count] - Number of particles to spawn.
   * @param {string[]} [options.colors] - Fill colors to pick from at random.
   * @param {number} [options.speed] - Base launch speed in px/s.
   * @param {number} [options.spread] - Angular spread of the burst, in
   *   radians (2*PI = full circle).
   * @param {number} [options.gravity] - Downward acceleration in px/s^2.
   * @param {number} [options.life] - Lifetime per particle, in seconds.
   */
  burst(x, y, options = {}) {
    const {
      count = 14,
      colors = [Palette.brown, Palette.forest, Palette.wine],
      speed = 220,
      spread = Math.PI * 2,
      gravity = 480,
      life = 0.6
    } = options;

    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const velocity = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity,
        life,
        age: 0,
        size: 3 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  /**
   * Spawn a low, backward-drifting dust puff (used on a jump takeoff,
   * landing, or a miss).
   * @param {number} x - Spawn point x, in canvas coordinates.
   * @param {number} y - Spawn point y, in canvas coordinates.
   * @param {object} [options]
   * @param {number} [options.count] - Number of particles to spawn.
   * @param {string} [options.color] - Fill color for every particle in
   *   this puff.
   */
  dust(x, y, options = {}) {
    const { count = 8, color = "rgba(107, 90, 69, 0.5)" } = options;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.6;
      const velocity = 50 + Math.random() * 70;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 30,
        gravity: 260,
        life: 0.4,
        age: 0,
        size: 4 + Math.random() * 4,
        color
      });
    }
  }

  /**
   * Advance every particle's projectile motion and drop expired ones.
   * @param {number} dt - Elapsed time in seconds.
   */
  update(dt) {
    if (!this.particles.length) {
      return;
    }

    this.particles = this.particles.filter((particle) => particle.age < particle.life);
    this.particles.forEach((particle) => {
      particle.age += dt;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    });
  }

  /**
   * Draw every live particle, fading and shrinking it as it ages.
   * @param {CanvasRenderingContext2D} ctx - Canvas context to draw into.
   */
  render(ctx) {
    if (!this.particles.length) {
      return;
    }

    this.particles.forEach((particle) => {
      const t = clamp(particle.age / particle.life, 0, 1);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /** Remove every particle immediately. */
  clear() {
    this.particles.length = 0;
  }
}
