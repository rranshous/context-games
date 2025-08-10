import { Vector2 } from '../core/Vector2.js';
import { Sword } from '../entities/Sword.js';

// Game simulation - manages all game state and logic
export class GameSimulation {
  public swords: Sword[] = [];
  public mousePosition: Vector2 = new Vector2(400, 300); // Default center
  public platforms: Platform[] = [];
  public swarmSize: number = 1; // Start with 1 sword

  // Camera for side-scrolling
  public camera: Vector2 = new Vector2(0, 0);
  public worldWidth: number = 2000;
  public worldHeight: number = 800;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.initializePlatforms();
    this.initializeSwarm(canvasWidth, canvasHeight);
  }

  // Initialize starting sword(s)
  private initializeSwarm(canvasWidth: number, canvasHeight: number): void {
    // Start with a single sword in the center
    const startX = canvasWidth / 2;
    const startY = canvasHeight / 2;
    this.swords.push(new Sword(startX, startY));
  }

  // Create basic platform layout for testing
  private initializePlatforms(): void {
    // Ground platforms
    this.platforms.push(new Platform(0, 700, 400, 50));
    this.platforms.push(new Platform(500, 700, 400, 50));
    this.platforms.push(new Platform(1000, 700, 400, 50));
    
    // Some mid-level platforms
    this.platforms.push(new Platform(200, 500, 200, 30));
    this.platforms.push(new Platform(600, 400, 200, 30));
    this.platforms.push(new Platform(1200, 500, 200, 30));
    
    // Higher platforms
    this.platforms.push(new Platform(400, 300, 150, 30));
    this.platforms.push(new Platform(800, 200, 150, 30));
  }

  // Main simulation update
  update(): void {
    this.updateSwarm();
    this.updateCamera();
    this.handlePlatformCollisions();
  }

  // Update all swords in the swarm
  private updateSwarm(): void {
    for (const sword of this.swords) {
      sword.update(this.mousePosition, this.swords);
    }
  }

  // Simple camera following the swarm center
  private updateCamera(): void {
    if (this.swords.length === 0) return;

    // Find swarm center
    const center = this.getSwarmCenter();
    
    // Camera follows swarm with some smoothing
    const targetCameraX = center.x - 400; // Offset for centering
    this.camera.x += (targetCameraX - this.camera.x) * 0.05; // Smooth following

    // Keep camera in world bounds
    this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - 800));
    this.camera.y = 0; // Fixed Y for side-scroller
  }

  // Get center position of the swarm
  private getSwarmCenter(): Vector2 {
    if (this.swords.length === 0) return Vector2.zero();

    const sum = Vector2.zero();
    for (const sword of this.swords) {
      sum.addInPlace(sword.position);
    }
    return sum.divide(this.swords.length);
  }

  // Handle sword collisions with platforms
  private handlePlatformCollisions(): void {
    for (const sword of this.swords) {
      for (const platform of this.platforms) {
        if (sword.collidesWith(platform)) {
          // Simple collision response - push sword out of platform
          this.resolvePlatformCollision(sword, platform);
        }
      }
    }
  }

  // Resolve sword-platform collision
  private resolvePlatformCollision(sword: Sword, platform: Platform): void {
    // Simple top collision for now
    if (sword.position.y < platform.y + platform.height/2) {
      sword.position.y = platform.y - sword.size/2;
      sword.velocity.y = Math.min(0, sword.velocity.y); // Stop downward movement
    }
  }

  // Add a new sword to the swarm
  addSword(x?: number, y?: number): void {
    const center = this.getSwarmCenter();
    const newX = x ?? center.x + (Math.random() - 0.5) * 50;
    const newY = y ?? center.y + (Math.random() - 0.5) * 50;
    
    this.swords.push(new Sword(newX, newY));
    this.swarmSize = this.swords.length;
  }

  // Update mouse position (from input)
  updateMousePosition(x: number, y: number): void {
    // Convert screen coordinates to world coordinates
    this.mousePosition.x = x + this.camera.x;
    this.mousePosition.y = y + this.camera.y;
  }
}

// Simple platform class
export class Platform {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number
  ) {}
}
