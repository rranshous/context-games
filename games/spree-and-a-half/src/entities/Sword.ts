import { Vector2 } from '../core/Vector2.js';

// Basic sword entity with boids flocking behavior
export class Sword {
  public position: Vector2;
  public velocity: Vector2;
  public acceleration: Vector2;
  public maxSpeed: number = 3;
  public maxForce: number = 0.1;
  public size: number = 16; // Size for collision detection

  // Boids behavior parameters
  public separationRadius: number = 30;
  public alignmentRadius: number = 50;
  public cohesionRadius: number = 50;

  constructor(x: number, y: number) {
    this.position = new Vector2(x, y);
    this.velocity = new Vector2(0, 0);
    this.acceleration = new Vector2(0, 0);
  }

  // Main update method
  update(mousePosition: Vector2, allSwords: Sword[]): void {
    // Apply boids flocking behavior
    this.flock(allSwords, mousePosition);
    
    // Update physics
    this.velocity.addInPlace(this.acceleration);
    this.velocity = this.velocity.limit(this.maxSpeed);
    this.position.addInPlace(this.velocity);
    
    // Reset acceleration for next frame
    this.acceleration = Vector2.zero();
  }

  // Boids flocking behavior
  private flock(swords: Sword[], mousePosition: Vector2): void {
    const separation = this.separate(swords);
    const alignment = this.align(swords);
    const cohesion = this.cohere(swords);
    const mouseSeek = this.seek(mousePosition);

    // Weight the forces
    separation.multiplyInPlace(2.0);  // Avoid crowding
    alignment.multiplyInPlace(1.0);   // Match neighbors
    cohesion.multiplyInPlace(1.0);    // Stay with group
    mouseSeek.multiplyInPlace(1.5);   // Follow mouse

    // Apply forces
    this.acceleration.addInPlace(separation);
    this.acceleration.addInPlace(alignment);
    this.acceleration.addInPlace(cohesion);
    this.acceleration.addInPlace(mouseSeek);
  }

  // Boids: Separation - avoid crowding neighbors
  private separate(swords: Sword[]): Vector2 {
    let steer = Vector2.zero();
    let count = 0;

    for (const other of swords) {
      const distance = this.position.distance(other.position);
      if (distance > 0 && distance < this.separationRadius) {
        // Calculate vector pointing away from neighbor
        const diff = this.position.subtract(other.position).normalized();
        diff.multiplyInPlace(1 / distance); // Weight by distance
        steer.addInPlace(diff);
        count++;
      }
    }

    if (count > 0) {
      steer.multiplyInPlace(1 / count); // Average
      steer = steer.normalized().multiply(this.maxSpeed);
      steer = steer.subtract(this.velocity).limit(this.maxForce);
    }

    return steer;
  }

  // Boids: Alignment - steer towards average heading of neighbors
  private align(swords: Sword[]): Vector2 {
    const sum = Vector2.zero();
    let count = 0;

    for (const other of swords) {
      const distance = this.position.distance(other.position);
      if (distance > 0 && distance < this.alignmentRadius) {
        sum.addInPlace(other.velocity);
        count++;
      }
    }

    if (count > 0) {
      sum.multiplyInPlace(1 / count); // Average
      const steer = sum.normalized().multiply(this.maxSpeed);
      return steer.subtract(this.velocity).limit(this.maxForce);
    }

    return Vector2.zero();
  }

  // Boids: Cohesion - steer towards average position of neighbors
  private cohere(swords: Sword[]): Vector2 {
    const sum = Vector2.zero();
    let count = 0;

    for (const other of swords) {
      const distance = this.position.distance(other.position);
      if (distance > 0 && distance < this.cohesionRadius) {
        sum.addInPlace(other.position);
        count++;
      }
    }

    if (count > 0) {
      sum.multiplyInPlace(1 / count); // Average position
      return this.seek(sum);
    }

    return Vector2.zero();
  }

  // Seek towards a target position
  private seek(target: Vector2): Vector2 {
    const desired = target.subtract(this.position).normalized().multiply(this.maxSpeed);
    return desired.subtract(this.velocity).limit(this.maxForce);
  }

  // Check collision with platforms or other objects
  collidesWith(rect: { x: number, y: number, width: number, height: number }): boolean {
    return (
      this.position.x - this.size/2 < rect.x + rect.width &&
      this.position.x + this.size/2 > rect.x &&
      this.position.y - this.size/2 < rect.y + rect.height &&
      this.position.y + this.size/2 > rect.y
    );
  }
}
