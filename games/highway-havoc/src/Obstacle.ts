import { Vector2D } from './Vector2D'

export class Obstacle {
  public position: Vector2D
  public active: boolean = true
  public type: 'mine' | 'barrier' | 'pothole'
  public size: number

  constructor(x: number, y: number, type: 'mine' | 'barrier' | 'pothole' = 'mine') {
    this.position = new Vector2D(x, y)
    this.type = type
    this.size = type === 'mine' ? 8 : type === 'barrier' ? 20 : 15
  }

  update(deltaTime: number) {
    // Obstacles scroll with the road
    this.position.y += 150 * deltaTime // Same speed as road
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return

    switch (this.type) {
      case 'mine':
        ctx.fillStyle = '#e74c3c'
        ctx.fillRect(this.position.x - 4, this.position.y - 4, 8, 8)
        break
      case 'barrier':
        ctx.fillStyle = '#f39c12'
        ctx.fillRect(this.position.x - 10, this.position.y - 2, 20, 4)
        break
      case 'pothole':
        ctx.fillStyle = '#34495e'
        ctx.fillRect(this.position.x - 7, this.position.y - 7, 14, 14)
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