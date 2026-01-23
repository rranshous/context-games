export class Vector2D {
  constructor(public x: number = 0, public y: number = 0) {}

  add(other: Vector2D): Vector2D {
    return new Vector2D(this.x + other.x, this.y + other.y)
  }

  multiply(scalar: number): Vector2D {
    return new Vector2D(this.x * scalar, this.y * scalar)
  }

  clone(): Vector2D {
    return new Vector2D(this.x, this.y)
  }

  distance(other: Vector2D): number {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return Math.sqrt(dx * dx + dy * dy)
  }
}