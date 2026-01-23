import { Vector2D } from './Vector2D'

export type PickupType = 'health' | 'ammo' | 'speed' | 'damage' | 'armor'

export class Pickup {
  public position: Vector2D
  public active: boolean = true
  public type: PickupType
  private size: number = 12

  constructor(x: number, y: number, type: PickupType) {
    this.position = new Vector2D(x, y)
    this.type = type
  }

  update(deltaTime: number) {
    // Pickups scroll with the road
    this.position.y += 150 * deltaTime

    // Add some floating animation
    this.position.y += Math.sin(performance.now() / 500) * 0.5
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return

    // Draw pickup based on type
    switch (this.type) {
      case 'health':
        ctx.fillStyle = '#e74c3c'
        ctx.fillRect(this.position.x - 6, this.position.y - 6, 12, 12)
        ctx.fillStyle = '#fff'
        ctx.fillRect(this.position.x - 2, this.position.y - 2, 4, 4)
        break
      case 'ammo':
        ctx.fillStyle = '#f39c12'
        ctx.fillRect(this.position.x - 6, this.position.y - 6, 12, 12)
        break
      case 'speed':
        ctx.fillStyle = '#27ae60'
        ctx.fillRect(this.position.x - 6, this.position.y - 6, 12, 12)
        ctx.fillStyle = '#fff'
        ctx.fillRect(this.position.x - 1, this.position.y - 3, 2, 6)
        break
      case 'damage':
        ctx.fillStyle = '#e67e22'
        ctx.fillRect(this.position.x - 6, this.position.y - 6, 12, 12)
        ctx.fillStyle = '#fff'
        ctx.fillRect(this.position.x - 3, this.position.y - 1, 6, 2)
        break
      case 'armor':
        ctx.fillStyle = '#34495e'
        ctx.fillRect(this.position.x - 6, this.position.y - 6, 12, 12)
        ctx.fillStyle = '#95a5a6'
        ctx.fillRect(this.position.x - 4, this.position.y - 4, 8, 8)
        break
    }
  }

  getBounds() {
    return {
      left: this.position.x - this.size/2,
      right: this.position.x + this.size/2,
      top: this.position.y - this.size/2,
      bottom: this.position.y + this.size/2
    }
  }
}