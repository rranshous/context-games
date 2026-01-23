import { Vehicle } from './Vehicle'
import { Road } from './Road'
import { Vector2D } from './Vector2D'
import { ProjectileManager } from './ProjectileManager'
import { EnemyManager } from './EnemyManager'
import { ObstacleManager } from './ObstacleManager'
import { PickupManager } from './PickupManager'
import { UpgradeSystem } from './UpgradeSystem'

export class Game {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private running = false

  // Game systems
  private vehicle: Vehicle
  private road: Road
  private projectileManager: ProjectileManager
  private enemyManager: EnemyManager
  private obstacleManager: ObstacleManager
  private pickupManager: PickupManager
  private upgradeSystem: UpgradeSystem

  // Game state
  private score: number = 0
  private gameState: 'menu' | 'playing' | 'gameOver' = 'menu'
  private highScore: number = 0

  // Timing
  private lastTime: number = 0

  // Gamepad state
  private gamepads: (Gamepad | null)[] = []
  private lastGamepadStates: (Gamepad | null)[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx

    // Set canvas size
    this.canvas.width = 800
    this.canvas.height = 600

    // Initialize game systems
    this.vehicle = new Vehicle(this.canvas.width / 2, this.canvas.height - 100)
    this.road = new Road(this.canvas.height)
    this.projectileManager = new ProjectileManager()
    this.enemyManager = new EnemyManager(this.canvas.width, this.canvas.height)
    this.obstacleManager = new ObstacleManager(
      (this.canvas.width - 400) / 2, // road left
      (this.canvas.width + 400) / 2, // road right
      this.canvas.height
    )
    this.pickupManager = new PickupManager(
      (this.canvas.width - 400) / 2, // road left
      (this.canvas.width + 400) / 2, // road right
      this.canvas.height
    )
    this.upgradeSystem = new UpgradeSystem()

    // Load high score
    this.highScore = parseInt(localStorage.getItem('highwayHavoc_highScore') || '0')

    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Gamepad connection events
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`Gamepad ${e.gamepad.index} connected: ${e.gamepad.id}`)
      this.gamepads[e.gamepad.index] = e.gamepad
    })

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`Gamepad ${e.gamepad.index} disconnected`)
      this.gamepads[e.gamepad.index] = null
    })
  }

  start() {
    this.running = true
    this.gameLoop()
  }

  stop() {
    this.running = false
  }

  private gameLoop = () => {
    if (!this.running) return

    const currentTime = performance.now()
    const deltaTime = this.lastTime ? (currentTime - this.lastTime) / 1000 : 0
    this.lastTime = currentTime

    this.updateGamepads()

    switch (this.gameState) {
      case 'menu':
        this.updateMenu()
        break
      case 'playing':
        this.update(deltaTime)
        break
      case 'gameOver':
        this.updateGameOver()
        break
    }

    this.render()

    requestAnimationFrame(this.gameLoop)
  }

  private updateGamepads() {
    // Update gamepad states
    const currentGamepads = navigator.getGamepads()
    for (let i = 0; i < currentGamepads.length; i++) {
      this.lastGamepadStates[i] = this.gamepads[i]
      this.gamepads[i] = currentGamepads[i]
    }
  }

  private update(deltaTime: number) {
    // Update road
    this.road.update(deltaTime)

    // Get player 1 input (driver)
    const player1Gamepad = this.gamepads[0]
    let leftStickX = 0
    let leftStickY = 0

    if (player1Gamepad) {
      leftStickX = player1Gamepad.axes[0] || 0
      leftStickY = player1Gamepad.axes[1] || 0

      // Deadzone
      if (Math.abs(leftStickX) < 0.1) leftStickX = 0
      if (Math.abs(leftStickY) < 0.1) leftStickY = 0
    }

    // Get player 2 input (gunner)
    const player2Gamepad = this.gamepads[1]
    let rightStickX = 0
    let rightStickY = 0
    let triggerPressed = false

    if (player2Gamepad) {
      rightStickX = player2Gamepad.axes[2] || 0
      rightStickY = player2Gamepad.axes[3] || 0
      triggerPressed = (player2Gamepad.buttons[7]?.value || 0) > 0.5

      // Deadzone for right stick
      if (Math.abs(rightStickX) < 0.1) rightStickX = 0
      if (Math.abs(rightStickY) < 0.1) rightStickY = 0
    }

    // Update vehicle with both players' inputs
    this.vehicle.update(deltaTime, leftStickX, leftStickY, rightStickX, rightStickY)

    // Handle shooting
    if (triggerPressed) {
      const barrelEnd = this.vehicle.turret.getBarrelEnd()
      this.projectileManager.shoot(barrelEnd, this.vehicle.turret.angle, performance.now() / 1000)
    }

    // Update projectiles
    this.projectileManager.update(deltaTime)

    // Update enemies
    this.enemyManager.update(deltaTime, this.vehicle.position)

    // Update obstacles
    this.obstacleManager.update(deltaTime)

    // Update pickups
    this.pickupManager.update(deltaTime)

    // Update upgrade system (power-ups)
    this.upgradeSystem.update(deltaTime)

    // Check projectile-enemy collisions
    this.enemyManager.checkCollisions(this.projectileManager.getProjectiles())

    // Check projectile-obstacle collisions (barriers can be destroyed)
    const barriersDestroyed = this.obstacleManager.checkProjectileCollisions(this.projectileManager.getProjectiles())
    this.score += barriersDestroyed * 50

    // Check vehicle-obstacle collisions
    const vehicleBounds = {
      left: this.vehicle.position.x - 15,
      right: this.vehicle.position.x + 15,
      top: this.vehicle.position.y - 8,
      bottom: this.vehicle.position.y + 8
    }

    if (this.obstacleManager.checkVehicleCollisions(vehicleBounds)) {
      this.upgradeSystem.takeDamage(20)
    }

    // Check vehicle-pickup collisions
    const collectedPickup = this.pickupManager.checkVehicleCollisions(vehicleBounds)
    if (collectedPickup) {
      this.applyPickupEffect(collectedPickup)
    }

    // Keep vehicle on screen horizontally
    this.vehicle.position.x = Math.max(50, Math.min(this.canvas.width - 50, this.vehicle.position.x))

    // Road boundary checking
    if (!this.road.isOnRoad(this.vehicle.position.x, this.canvas.width)) {
      // Apply penalty for going off road
      this.vehicle.velocity = this.vehicle.velocity.multiply(0.95)
    }

    // Check for game over
    this.checkGameOver()
  }

  private applyPickupEffect(type: string) {
    switch (type) {
      case 'health':
        this.upgradeSystem.heal(25)
        this.score += 100
        break
      case 'ammo':
        // Could refill ammo if we had limited ammo
        this.score += 50
        break
      case 'speed':
        this.upgradeSystem.addPowerUp('speed', 10, { multiplier: 1.5 })
        this.score += 200
        break
      case 'damage':
        this.upgradeSystem.addPowerUp('damage', 15, { multiplier: 2.0 })
        this.score += 200
        break
      case 'armor':
        this.upgradeSystem.upgradeArmor(1)
        this.score += 300
        break
    }
  }

  private updateMenu() {
    // Check for start game input
    for (let i = 0; i < this.gamepads.length; i++) {
      const gamepad = this.gamepads[i]
      if (gamepad) {
        // Start game with any button press
        for (let j = 0; j < gamepad.buttons.length; j++) {
          if (gamepad.buttons[j]?.pressed) {
            this.startGame()
            return
          }
        }
      }
    }
  }

  private updateGameOver() {
    // Check for restart input
    for (let i = 0; i < this.gamepads.length; i++) {
      const gamepad = this.gamepads[i]
      if (gamepad) {
        // Restart game with any button press
        for (let j = 0; j < gamepad.buttons.length; j++) {
          if (gamepad.buttons[j]?.pressed) {
            this.restartGame()
            return
          }
        }
      }
    }
  }

  private startGame() {
    this.gameState = 'playing'
    this.resetGame()
  }

  private restartGame() {
    this.gameState = 'menu'
    this.resetGame()
  }

  private resetGame() {
    // Reset game systems
    this.vehicle = new Vehicle(this.canvas.width / 2, this.canvas.height - 100)
    this.road = new Road(this.canvas.height)
    this.projectileManager = new ProjectileManager()
    this.enemyManager = new EnemyManager(this.canvas.width, this.canvas.height)
    this.obstacleManager = new ObstacleManager(
      (this.canvas.width - 400) / 2,
      (this.canvas.width + 400) / 2,
      this.canvas.height
    )
    this.pickupManager = new PickupManager(
      (this.canvas.width - 400) / 2,
      (this.canvas.width + 400) / 2,
      this.canvas.height
    )
    this.upgradeSystem = new UpgradeSystem()

    // Reset game state
    this.score = 0
  }

  private checkGameOver() {
    const upgrades = this.upgradeSystem.getUpgrades()
    if (upgrades.currentHealth <= 0) {
      this.gameState = 'gameOver'
      // Save high score
      if (this.score > this.highScore) {
        this.highScore = this.score
        localStorage.setItem('highwayHavoc_highScore', this.highScore.toString())
      }
    }
  }

  private render() {
    // Clear canvas
    this.ctx.fillStyle = '#2c3e50'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    switch (this.gameState) {
      case 'menu':
        this.renderMenu()
        break
      case 'playing':
        this.renderGame()
        break
      case 'gameOver':
        this.renderGameOver()
        break
    }
  }

  private renderMenu() {
    this.ctx.fillStyle = '#fff'
    this.ctx.font = '48px monospace'
    this.ctx.textAlign = 'center'
    this.ctx.fillText('HIGHWAY HAVOC', this.canvas.width / 2, 200)

    this.ctx.font = '24px monospace'
    this.ctx.fillText('Cooperative 2-Player Action', this.canvas.width / 2, 250)

    this.ctx.font = '18px monospace'
    this.ctx.fillText('Player 1: Left stick to drive', this.canvas.width / 2, 300)
    this.ctx.fillText('Player 2: Right stick to aim, trigger to shoot', this.canvas.width / 2, 325)

    this.ctx.fillText(`High Score: ${this.highScore}`, this.canvas.width / 2, 375)

    this.ctx.font = '20px monospace'
    this.ctx.fillText('Press any button to start', this.canvas.width / 2, 425)

    this.ctx.textAlign = 'left'
  }

  private renderGame() {
    // Draw road
    this.road.render(this.ctx, this.canvas.width)

    // Draw obstacles
    this.obstacleManager.render(this.ctx)

    // Draw pickups
    this.pickupManager.render(this.ctx)

    // Draw enemies
    this.enemyManager.render(this.ctx)

    // Draw projectiles
    this.projectileManager.render(this.ctx)

    // Draw vehicle
    this.vehicle.render(this.ctx)

    // Draw gamepad status
    this.drawGamepadStatus()

    // Draw UI text
    this.ctx.fillStyle = '#fff'
    this.ctx.font = '16px monospace'
    this.ctx.fillText('Highway Havoc', 20, 30)

    // Draw stats
    const upgrades = this.upgradeSystem.getUpgrades()
    const speed = Math.round(this.vehicle.velocity.distance(new Vector2D(0, 0)))
    this.ctx.fillText(`Speed: ${speed}`, 20, 50)
    this.ctx.fillText(`Health: ${upgrades.currentHealth}/${upgrades.maxHealth}`, 20, 70)
    this.ctx.fillText(`Score: ${this.score}`, 20, 90)

    // Draw active power-ups
    let powerUpY = 110
    if (this.upgradeSystem.hasPowerUp('speed')) {
      this.ctx.fillStyle = '#27ae60'
      this.ctx.fillText(`SPEED: ${Math.ceil(this.upgradeSystem.getPowerUpTime('speed'))}s`, 20, powerUpY)
      powerUpY += 20
      this.ctx.fillStyle = '#fff'
    }
    if (this.upgradeSystem.hasPowerUp('damage')) {
      this.ctx.fillStyle = '#e67e22'
      this.ctx.fillText(`DAMAGE: ${Math.ceil(this.upgradeSystem.getPowerUpTime('damage'))}s`, 20, powerUpY)
      powerUpY += 20
      this.ctx.fillStyle = '#fff'
    }
  }

  private renderGameOver() {
    // First render the game in the background
    this.renderGame()

    // Overlay game over screen
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    this.ctx.fillStyle = '#fff'
    this.ctx.font = '48px monospace'
    this.ctx.textAlign = 'center'
    this.ctx.fillText('GAME OVER', this.canvas.width / 2, 250)

    this.ctx.font = '24px monospace'
    this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, 300)
    this.ctx.fillText(`High Score: ${this.highScore}`, this.canvas.width / 2, 330)

    this.ctx.font = '20px monospace'
    this.ctx.fillText('Press any button to return to menu', this.canvas.width / 2, 380)

    this.ctx.textAlign = 'left'
  }

  private drawGamepadStatus() {
    this.ctx.fillStyle = '#fff'
    this.ctx.font = '14px monospace'

    let y = 100
    for (let i = 0; i < 2; i++) {
      const gamepad = this.gamepads[i]
      const status = gamepad ? `Connected: ${gamepad.id.slice(0, 20)}` : 'Not Connected'
      this.ctx.fillText(`Player ${i+1}: ${status}`, 50, y)
      y += 20
    }
  }
}