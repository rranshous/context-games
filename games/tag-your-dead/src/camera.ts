// ── Camera ──
// Smooth-follow camera centered on player car.

import { CONFIG } from './config.js';

const C = CONFIG.CAMERA;
const CW = CONFIG.CANVAS.WIDTH;
const CH = CONFIG.CANVAS.HEIGHT;

export class Camera {
  x: number = 0;
  y: number = 0;
  private worldW: number = 1;
  private worldH: number = 1;

  update(targetX: number, targetY: number, worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;

    // Smooth follow — wrap-aware delta so camera doesn't jump across the seam
    let dx = targetX - this.x;
    let dy = targetY - this.y;
    if (dx > worldW / 2) dx -= worldW;
    if (dx < -worldW / 2) dx += worldW;
    if (dy > worldH / 2) dy -= worldH;
    if (dy < -worldH / 2) dy += worldH;
    this.x += dx * C.SMOOTHING;
    this.y += dy * C.SMOOTHING;

    // Keep camera in canonical range so single-wrap in worldToScreen stays correct
    this.x = ((this.x % worldW) + worldW) % worldW;
    this.y = ((this.y % worldH) + worldH) % worldH;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    // Wrap world coord relative to camera for seamless toroidal rendering
    let dx = wx - this.x;
    let dy = wy - this.y;
    if (dx > this.worldW / 2) dx -= this.worldW;
    if (dx < -this.worldW / 2) dx += this.worldW;
    if (dy > this.worldH / 2) dy -= this.worldH;
    if (dy < -this.worldH / 2) dy += this.worldH;
    return { x: dx + CW / 2, y: dy + CH / 2 };
  }

  isVisible(wx: number, wy: number, margin: number = 50): boolean {
    let dx = wx - this.x;
    let dy = wy - this.y;
    if (dx > this.worldW / 2) dx -= this.worldW;
    if (dx < -this.worldW / 2) dx += this.worldW;
    if (dy > this.worldH / 2) dy -= this.worldH;
    if (dy < -this.worldH / 2) dy += this.worldH;
    const sx = dx + CW / 2;
    const sy = dy + CH / 2;
    return sx > -margin && sx < CW + margin && sy > -margin && sy < CH + margin;
  }

  snap(targetX: number, targetY: number, worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = targetX;
    this.y = targetY;
  }
}
