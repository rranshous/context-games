import { Vector2D } from './Vector2D'

export class Projectile {
  public position: Vector2D
  public velocity: Vector2D
  public active: boolean = true
  private speed: number = 400

  constructor(startPosition: Vector2D, angle: number) {
    this.position = startPosition.clone()
    this.velocity = new Vector2D(
      Math.cos(angle) * this.speed,
      Math.sin(angle) * this.speed
    )
  }

  update(deltaTime: number) {
    this.position = this.position.add(this.velocity.multiply(deltaTime))

    // Deactivate if off screen (basic bounds check)
    if (this.position.x < -50 || this.position.x > 850 ||
        this.position.y < -50 || this.position.y > 650) {
      this.active = false
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#f1c40f'
    ctx.fillRect(this.position.x - 2, this.position.y - 2, 4, 4)
  }
}