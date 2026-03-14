// ── Camera ──
// Smooth-follow camera centered on player car.

import { CONFIG } from './config.js';

const C = CONFIG.CAMERA;
const CW = CONFIG.CANVAS.WIDTH;
const CH = CONFIG.CANVAS.HEIGHT;

export class Camera {
  x: number = 0;
  y: number = 0;

  update(targetX: number, targetY: number, worldW: number, worldH: number): void {
    // Smooth follow
    this.x += (targetX - this.x) * C.SMOOTHING;
    this.y += (targetY - this.y) * C.SMOOTHING;

    // Clamp to world bounds
    this.x = Math.max(CW / 2, Math.min(worldW - CW / 2, this.x));
    this.y = Math.max(CH / 2, Math.min(worldH - CH / 2, this.y));
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx - this.x + CW / 2,
      y: wy - this.y + CH / 2,
    };
  }

  isVisible(wx: number, wy: number, margin: number = 50): boolean {
    const sx = wx - this.x + CW / 2;
    const sy = wy - this.y + CH / 2;
    return sx > -margin && sx < CW + margin && sy > -margin && sy < CH + margin;
  }

  snap(targetX: number, targetY: number, worldW: number, worldH: number): void {
    this.x = Math.max(CW / 2, Math.min(worldW - CW / 2, targetX));
    this.y = Math.max(CH / 2, Math.min(worldH - CH / 2, targetY));
  }
}
