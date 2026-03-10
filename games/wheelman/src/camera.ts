import { CONFIG } from './config';
import { Position } from './types';

export class Camera {
  x: number = 0;
  y: number = 0;

  constructor(
    public canvasWidth: number,
    public canvasHeight: number,
    public worldWidth: number,
    public worldHeight: number,
  ) {}

  update(targetX: number, targetY: number): void {
    const smoothing = CONFIG.CAMERA.SMOOTHING;

    // Desired camera position (centered on target)
    const desiredX = targetX - this.canvasWidth / 2;
    const desiredY = targetY - this.canvasHeight / 2;

    // Smooth follow (lerp)
    this.x += (desiredX - this.x) * smoothing;
    this.y += (desiredY - this.y) * smoothing;

    // Clamp to world bounds
    this.x = Math.max(0, Math.min(this.worldWidth - this.canvasWidth, this.x));
    this.y = Math.max(0, Math.min(this.worldHeight - this.canvasHeight, this.y));
  }

  worldToScreen(wx: number, wy: number): Position {
    return {
      x: wx - this.x,
      y: wy - this.y,
    };
  }

  screenToWorld(sx: number, sy: number): Position {
    return {
      x: sx + this.x,
      y: sy + this.y,
    };
  }

  isVisible(wx: number, wy: number, margin: number = 0): boolean {
    return (
      wx + margin >= this.x &&
      wx - margin <= this.x + this.canvasWidth &&
      wy + margin >= this.y &&
      wy - margin <= this.y + this.canvasHeight
    );
  }
}
