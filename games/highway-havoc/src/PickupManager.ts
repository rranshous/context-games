import { Pickup, PickupType } from './Pickup'

export class PickupManager {
  private pickups: Pickup[] = []
  private spawnTimer: number = 0
  private spawnInterval: number = 3 // seconds between spawns
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
      this.spawnPickup()
      this.spawnTimer = 0
    }

    // Update all pickups
    for (const pickup of this.pickups) {
      pickup.update(deltaTime)
    }

    // Remove pickups that have scrolled off screen
    this.pickups = this.pickups.filter(pickup =>
      pickup.active && pickup.position.y < this.canvasHeight + 50
    )
  }

  private spawnPickup() {
    const types: PickupType[] = ['health', 'ammo', 'speed', 'damage', 'armor']
    const type = types[Math.floor(Math.random() * types.length)]

    // Spawn within road bounds
    const roadWidth = this.roadRight - this.roadLeft
    const x = this.roadLeft + Math.random() * roadWidth
    const y = -20 // Start above screen

    this.pickups.push(new Pickup(x, y, type))
  }

  render(ctx: CanvasRenderingContext2D) {
    for (const pickup of this.pickups) {
      pickup.render(ctx)
    }
  }

  checkVehicleCollisions(vehicleBounds: { left: number, right: number, top: number, bottom: number }): PickupType | null {
    for (const pickup of this.pickups) {
      if (pickup.active && this.checkCollision(vehicleBounds, pickup.getBounds())) {
        const type = pickup.type
        pickup.active = false
        return type
      }
    }
    return null
  }

  private checkCollision(bounds1: any, bounds2: any): boolean {
    return !(bounds1.right < bounds2.left ||
             bounds1.left > bounds2.right ||
             bounds1.bottom < bounds2.top ||
             bounds1.top > bounds2.bottom)
  }

  getPickupCount(): number {
    return this.pickups.length
  }
}