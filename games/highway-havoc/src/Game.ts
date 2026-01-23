export class Game {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private running = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D context')
    this.ctx = ctx

    // Set canvas size
    this.canvas.width = 800
    this.canvas.height = 600

    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Gamepad support will go here
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

    this.update()
    this.render()

    requestAnimationFrame(this.gameLoop)
  }

  private update() {
    // Game logic goes here
  }

  private render() {
    // Clear canvas
    this.ctx.fillStyle = '#2c3e50'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw road
    this.drawRoad()

    // Draw UI text
    this.ctx.fillStyle = '#fff'
    this.ctx.font = '20px monospace'
    this.ctx.fillText('Highway Havoc - Coming Soon!', 250, 300)
  }

  private drawRoad() {
    const roadWidth = 400
    const roadX = (this.canvas.width - roadWidth) / 2

    // Road surface
    this.ctx.fillStyle = '#34495e'
    this.ctx.fillRect(roadX, 0, roadWidth, this.canvas.height)

    // Road lines
    this.ctx.fillStyle = '#f39c12'
    this.ctx.fillRect(roadX + roadWidth/2 - 2, 0, 4, this.canvas.height)
  }
}