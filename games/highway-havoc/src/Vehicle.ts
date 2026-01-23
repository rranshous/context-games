import { Vector2D } from './Vector2D'
import { Turret } from './Turret'

export class Vehicle {
  public position: Vector2D
  public velocity: Vector2D
  public angle: number = 0
  public speed: number = 0
  public maxSpeed: number = 200
  public acceleration: number = 300
  public friction: number = 0.9

  public turret: Turret

  constructor(x: number, y: number) {
    this.position = new Vector2D(x, y)
    this.velocity = new Vector2D(0, 0)
    this.turret = new Turret(this.position)
  }

  update(deltaTime: number, leftStickX: number, leftStickY: number, rightStickX: number, rightStickY: number) {
    // Handle steering input (left stick X axis)
    const steeringInput = leftStickX
    const steeringForce = steeringInput * 2 * Math.PI * deltaTime // Max 2 radians per second turn

    this.angle += steeringForce

    // Handle acceleration input (left stick Y axis, inverted)
    const accelerationInput = -leftStickY // Negative because up is negative in gamepad
    const acceleration = accelerationInput * this.acceleration * deltaTime

    // Apply acceleration in the direction the vehicle is facing
    const accelerationVector = new Vector2D(
      Math.sin(this.angle) * acceleration,
      -Math.cos(this.angle) * acceleration
    )

    this.velocity = this.velocity.add(accelerationVector)

    // Apply friction
    this.velocity = this.velocity.multiply(this.friction)

    // Limit speed
    const currentSpeed = this.velocity.distance(new Vector2D(0, 0))
    if (currentSpeed > this.maxSpeed) {
      this.velocity = this.velocity.multiply(this.maxSpeed / currentSpeed)
    }

    // Update position
    this.position = this.position.add(this.velocity.multiply(deltaTime))

    // Update turret position and aiming
    this.turret = new Turret(this.position) // Recreate turret at new position
    this.turret.update(rightStickX, rightStickY)
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(this.position.x, this.position.y)
    ctx.rotate(this.angle)

    // Vehicle body
    ctx.fillStyle = '#e74c3c'
    ctx.fillRect(-15, -8, 30, 16)

    // Direction indicator
    ctx.fillStyle = '#f39c12'
    ctx.fillRect(12, -2, 8, 4)

    ctx.restore()

    // Render turret (not rotated with vehicle body)
    this.turret.render(ctx)
  }
}