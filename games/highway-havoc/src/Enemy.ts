import { Vector2D } from './Vector2D'

export class Enemy {
  public position: Vector2D
  public velocity: Vector2D
  public active: boolean = true
  public health: number = 1
  private speed: number = 80

  constructor(x: number, y: number) {
    this.position = new Vector2D(x, y)
    this.velocity = new Vector2D(0, 0)
  }

  update(deltaTime: number, playerPosition: Vector2D) {
    if (!this.active) return

    // Simple AI: move toward player
    const direction = playerPosition.clone().add(this.position.multiply(-1))
    const distance = direction.distance(new Vector2D(0, 0))

    if (distance > 0) {
      // Normalize direction and set velocity
      direction.x /= distance
      direction.y /= distance
      this.velocity = direction.multiply(this.speed)
    }

    // Update position
    this.position = this.position.add(this.velocity.multiply(deltaTime))
  }

  takeDamage() {
    this.health--
    if (this.health <= 0) {
      this.active = false
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return

    ctx.fillStyle = '#e67e22'
    ctx.fillRect(this.position.x - 12, this.position.y - 6, 24, 12)

    // Enemy indicator
    ctx.fillStyle = '#f39c12'
    ctx.fillRect(this.position.x - 15, this.position.y - 2, 4, 4)
  }
}