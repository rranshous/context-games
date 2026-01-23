export class Road {
  private segments: RoadSegment[] = []
  private segmentHeight = 100
  private roadWidth = 400
  private scrollSpeed = 150 // pixels per second
  private canvasHeight: number

  constructor(canvasHeight: number) {
    this.canvasHeight = canvasHeight
    this.generateInitialSegments()
  }

  private generateInitialSegments() {
    const numSegments = Math.ceil(this.canvasHeight / this.segmentHeight) + 2
    for (let i = 0; i < numSegments; i++) {
      this.segments.push({
        y: i * this.segmentHeight,
        width: this.roadWidth,
        color: this.getRoadColor(i)
      })
    }
  }

  private getRoadColor(segmentIndex: number): string {
    // Alternate between different shades for visual interest
    const colors = ['#2c3e50', '#34495e', '#2c3e50']
    return colors[segmentIndex % colors.length]
  }

  update(deltaTime: number) {
    // Scroll segments downward
    for (const segment of this.segments) {
      segment.y += this.scrollSpeed * deltaTime
    }

    // Remove segments that have scrolled off screen
    this.segments = this.segments.filter(segment => segment.y < this.canvasHeight + this.segmentHeight)

    // Add new segments at the top
    while (this.segments.length < Math.ceil(this.canvasHeight / this.segmentHeight) + 2) {
      const lastSegment = this.segments[this.segments.length - 1]
      const newY = lastSegment.y - this.segmentHeight
      this.segments.unshift({
        y: newY,
        width: this.roadWidth,
        color: this.getRoadColor(Math.floor(-newY / this.segmentHeight))
      })
    }
  }

  render(ctx: CanvasRenderingContext2D, canvasWidth: number) {
    const roadX = (canvasWidth - this.roadWidth) / 2

    // Draw road segments
    for (const segment of this.segments) {
      ctx.fillStyle = segment.color
      ctx.fillRect(roadX, segment.y, this.roadWidth, this.segmentHeight)
    }

    // Draw center line
    ctx.fillStyle = '#f39c12'
    ctx.fillRect(roadX + this.roadWidth/2 - 2, 0, 4, this.canvasHeight)

    // Draw road edges
    ctx.fillStyle = '#95a5a6'
    ctx.fillRect(roadX - 4, 0, 4, this.canvasHeight) // Left edge
    ctx.fillRect(roadX + this.roadWidth, 0, 4, this.canvasHeight) // Right edge
  }

  getRoadBounds(canvasWidth: number): { left: number, right: number } {
    const roadX = (canvasWidth - this.roadWidth) / 2
    return {
      left: roadX,
      right: roadX + this.roadWidth
    }
  }

  isOnRoad(vehicleX: number, canvasWidth: number): boolean {
    const bounds = this.getRoadBounds(canvasWidth)
    return vehicleX >= bounds.left && vehicleX <= bounds.right
  }
}

interface RoadSegment {
  y: number
  width: number
  color: string
}