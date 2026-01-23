import { Enemy } from './Enemy'
import { Vector2D } from './Vector2D'

export class EnemyManager {
  private enemies: Enemy[] = []
  private spawnTimer: number = 0
  private spawnInterval: number = 2 // seconds between spawns
  private canvasWidth: number
  private canvasHeight: number

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
  }

  update(deltaTime: number, playerPosition: Vector2D) {
    // Update spawn timer
    this.spawnTimer += deltaTime
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnEnemy()
      this.spawnTimer = 0
    }

    // Update all enemies
    for (const enemy of this.enemies) {
      enemy.update(deltaTime, playerPosition)
    }

    // Remove inactive enemies
    this.enemies = this.enemies.filter(enemy => enemy.active)
  }

  private spawnEnemy() {
    // Spawn enemy at random position off-screen
    const side = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left

    let x, y
    switch (side) {
      case 0: // top
        x = Math.random() * this.canvasWidth
        y = -20
        break
      case 1: // right
        x = this.canvasWidth + 20
        y = Math.random() * this.canvasHeight
        break
      case 2: // bottom
        x = Math.random() * this.canvasWidth
        y = this.canvasHeight + 20
        break
      case 3: // left
        x = -20
        y = Math.random() * this.canvasHeight
        break
      default:
        x = 0
        y = 0
    }

    this.enemies.push(new Enemy(x, y))
  }

  render(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.enemies) {
      enemy.render(ctx)
    }
  }

  getEnemies(): Enemy[] {
    return this.enemies
  }

  checkCollisions(projectiles: any[]) {
    for (const projectile of projectiles) {
      for (const enemy of this.enemies) {
        if (enemy.active && this.checkProjectileEnemyCollision(projectile, enemy)) {
          enemy.takeDamage()
          projectile.active = false // Assuming projectiles have an active property
        }
      }
    }
  }

  private checkProjectileEnemyCollision(projectile: any, enemy: Enemy): boolean {
    const dx = projectile.position.x - enemy.position.x
    const dy = projectile.position.y - enemy.position.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance < 15 // Collision radius
  }

  getEnemyCount(): number {
    return this.enemies.length
  }
}