import { Obstacle } from './Obstacle'

export class ObstacleManager {
  private obstacles: Obstacle[] = []
  private spawnTimer: number = 0
  private spawnInterval: number = 1.5 // seconds between spawns
  private roadLeft: number
  private roadRight: number
  private canvasHeight: number

  constructor(roadLeft: number, roadRight: number, canvasHeight: number) {
    this.roadLeft = roadLeft
    this.roadRight = roadRight
    this.canvasHeight = canvasHeight
  }

  update(deltaTime: number) {
    // Update spawn timer
    this.spawnTimer += deltaTime
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnObstacle()
      this.spawnTimer = 0
    }

    // Update all obstacles
    for (const obstacle of this.obstacles) {
      obstacle.update(deltaTime)
    }

    // Remove obstacles that have scrolled off screen
    this.obstacles = this.obstacles.filter(obstacle =>
      obstacle.active && obstacle.position.y < this.canvasHeight + 50
    )
  }

  private spawnObstacle() {
    const types: ('mine' | 'barrier' | 'pothole')[] = ['mine', 'barrier', 'pothole']
    const type = types[Math.floor(Math.random() * types.length)]

    // Spawn within road bounds
    const roadWidth = this.roadRight - this.roadLeft
    const x = this.roadLeft + Math.random() * roadWidth
    const y = -20 // Start above screen

    this.obstacles.push(new Obstacle(x, y, type))
  }

  render(ctx: CanvasRenderingContext2D) {
    for (const obstacle of this.obstacles) {
      obstacle.render(ctx)
    }
  }

  checkVehicleCollisions(vehicleBounds: { left: number, right: number, top: number, bottom: number }): boolean {
    for (const obstacle of this.obstacles) {
      if (obstacle.active && this.checkCollision(vehicleBounds, obstacle.getBounds())) {
        obstacle.active = false // Remove obstacle after collision
        return true
      }
    }
    return false
  }

  checkProjectileCollisions(projectiles: any[]): number {
    let destroyedCount = 0
    for (const projectile of projectiles) {
      if (!projectile.active) continue

      for (const obstacle of this.obstacles) {
        if (obstacle.active && obstacle.type === 'barrier' &&
            this.checkCollision(projectile.position, obstacle.getBounds())) {
          obstacle.active = false
          projectile.active = false
          destroyedCount++
          break
        }
      }
    }
    return destroyedCount
  }

  private checkCollision(bounds1: any, bounds2: any): boolean {
    // Simple AABB collision for projectiles
    if (bounds1.x !== undefined) {
      // Projectile bounds (circular approximation)
      const projX = bounds1.x
      const projY = bounds1.y
      return projX >= bounds2.left && projX <= bounds2.right &&
             projY >= bounds2.top && projY <= bounds2.bottom
    } else {
      // Vehicle bounds (rectangular)
      return !(bounds1.right < bounds2.left ||
               bounds1.left > bounds2.right ||
               bounds1.bottom < bounds2.top ||
               bounds1.top > bounds2.bottom)
    }
  }

  getObstacleCount(): number {
    return this.obstacles.length
  }
}