import { Vector2D } from './Vector2D'

export class Turret {
  public angle: number = 0
  private basePosition: Vector2D

  constructor(vehiclePosition: Vector2D) {
    this.basePosition = vehiclePosition
  }

  update(rightStickX: number, rightStickY: number) {
    // Calculate turret angle from right stick input
    if (Math.abs(rightStickX) > 0.1 || Math.abs(rightStickY) > 0.1) {
      this.angle = Math.atan2(rightStickY, rightStickX)
    }
  }

  getPosition(): Vector2D {
    return this.basePosition.clone()
  }

  getBarrelEnd(): Vector2D {
    const barrelLength = 25
    return new Vector2D(
      this.basePosition.x + Math.cos(this.angle) * barrelLength,
      this.basePosition.y + Math.sin(this.angle) * barrelLength
    )
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(this.basePosition.x, this.basePosition.y)
    ctx.rotate(this.angle)

    // Turret base
    ctx.fillStyle = '#34495e'
    ctx.fillRect(-8, -8, 16, 16)

    // Turret barrel
    ctx.fillStyle = '#e74c3c'
    ctx.fillRect(0, -3, 25, 6)

    // Turret tip
    ctx.fillStyle = '#f39c12'
    ctx.fillRect(22, -4, 6, 8)

    ctx.restore()
  }
}