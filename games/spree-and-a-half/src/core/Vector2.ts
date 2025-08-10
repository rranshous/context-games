// Core vector math for 2D movement and physics
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  // Vector operations
  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  multiply(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  divide(scalar: number): Vector2 {
    return new Vector2(this.x / scalar, this.y / scalar);
  }

  // In-place operations for performance
  addInPlace(other: Vector2): void {
    this.x += other.x;
    this.y += other.y;
  }

  multiplyInPlace(scalar: number): void {
    this.x *= scalar;
    this.y *= scalar;
  }

  // Vector properties
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalized(): Vector2 {
    const mag = this.magnitude();
    return mag > 0 ? this.divide(mag) : new Vector2(0, 0);
  }

  distance(other: Vector2): number {
    return this.subtract(other).magnitude();
  }

  // Utility methods
  limit(maxLength: number): Vector2 {
    const mag = this.magnitude();
    if (mag > maxLength) {
      return this.normalized().multiply(maxLength);
    }
    return new Vector2(this.x, this.y);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  static fromAngle(angle: number, magnitude: number = 1): Vector2 {
    return new Vector2(
      Math.cos(angle) * magnitude,
      Math.sin(angle) * magnitude
    );
  }
}
