import { Vector2 } from '../core/Vector2.js';

// Basic enemy entity with simple AI
export class Enemy {
  public position: Vector2;
  public velocity: Vector2;
  public acceleration: Vector2;
  public maxSpeed: number = 1.5; // Slower than swords
  public size: number = 24; // Size for collision detection
  public health: number = 5; // More health to showcase multi-sword combat
  public maxHealth: number = 5; // Track max health for visual effects
  public isAlive: boolean = true;
  
  // Visual feedback
  public justHit: boolean = false;
  public hitTime: number = 0;
  public lastHitBySwords: Map<number, number> = new Map(); // Track last hit time per sword ID

  // AI behavior parameters
  public wanderAngle: number = 0;
  public wanderChangeTime: number = 0;
  public lastDirectionChange: number = 0;
  
  constructor(x: number, y: number) {
    this.position = new Vector2(x, y);
    this.velocity = new Vector2(0, 0);
    this.acceleration = new Vector2(0, 0);
    
    // Random initial wander direction
    this.wanderAngle = Math.random() * Math.PI * 2;
  }

  // Main update method
  update(): void {
    if (!this.isAlive) return;
    
    // Update hit visual feedback
    if (this.justHit) {
      const currentTime = Date.now();
      if (currentTime - this.hitTime > 500) { // Flash for 500ms (longer)
        this.justHit = false;
      }
    }
    
    // Apply simple wandering AI
    this.wander();
    
    // Update physics
    this.velocity.addInPlace(this.acceleration);
    this.velocity = this.velocity.limit(this.maxSpeed);
    this.position.addInPlace(this.velocity);
    
    // Reset acceleration for next frame
    this.acceleration = Vector2.zero();
  }

  // Simple wandering behavior
  private wander(): void {
    const currentTime = Date.now();
    
    // Change direction occasionally
    if (currentTime - this.lastDirectionChange > this.wanderChangeTime) {
      this.wanderAngle += (Math.random() - 0.5) * 0.8; // Small random direction change
      this.wanderChangeTime = 1000 + Math.random() * 2000; // 1-3 seconds between changes
      this.lastDirectionChange = currentTime;
    }
    
    // Apply wandering force
    const wanderForce = Vector2.fromAngle(this.wanderAngle, 0.05);
    this.acceleration.addInPlace(wanderForce);
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

  // Take damage from a specific sword
  takeDamage(amount: number, swordId: number): void {
    const currentTime = Date.now();
    
    // Per-sword damage cooldown to prevent spam from same sword
    const lastHitTime = this.lastHitBySwords.get(swordId) || 0;
    if (currentTime - lastHitTime < 200) { // Shorter cooldown, but per sword
      return; // This specific sword hit too recently
    }
    
    this.health -= amount;
    this.justHit = true;
    this.hitTime = currentTime;
    this.lastHitBySwords.set(swordId, currentTime);
    
    console.log(`🩸 Enemy took ${amount} damage from sword ${swordId}! Health: ${this.health}/${this.maxHealth}`);
    
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }

  // Check if enemy overlaps with a point (for sword collision)
  containsPoint(x: number, y: number): boolean {
    const distance = this.position.distance(new Vector2(x, y));
    return distance < this.size/2;
  }
}
