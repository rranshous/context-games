import { Projectile } from './Projectile'
import { Vector2D } from './Vector2D'

export class ProjectileManager {
  private projectiles: Projectile[] = []
  private lastShotTime: number = 0
  private fireRate: number = 0.2 // seconds between shots

  shoot(startPosition: Vector2D, angle: number, currentTime: number): boolean {
    if (currentTime - this.lastShotTime >= this.fireRate) {
      this.projectiles.push(new Projectile(startPosition, angle))
      this.lastShotTime = currentTime
      return true
    }
    return false
  }

  update(deltaTime: number) {
    // Update all projectiles
    for (const projectile of this.projectiles) {
      projectile.update(deltaTime)
    }

    // Remove inactive projectiles
    this.projectiles = this.projectiles.filter(p => p.active)
  }

  render(ctx: CanvasRenderingContext2D) {
    for (const projectile of this.projectiles) {
      projectile.render(ctx)
    }
  }

  getProjectiles(): Projectile[] {
    return this.projectiles
  }

  getProjectileCount(): number {
    return this.projectiles.length
  }
}