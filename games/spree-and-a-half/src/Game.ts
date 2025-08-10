import { GameSimulation } from './simulation/GameSimulation.js';
import { GameRenderer } from './presentation/GameRenderer.js';
import { InputHandler } from './input/InputHandler.js';
import { SwordAssets } from './assets/SwordAssets.js';
import { EnemyAssets } from './assets/EnemyAssets.js';

// Main game class - coordinates simulation, rendering, and input
export class Game {
  private simulation: GameSimulation;
  private renderer: GameRenderer;
  private inputHandler: InputHandler;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private debugMode: boolean = false;
  private assetsLoaded: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize core systems following Dark Hall pattern
    this.simulation = new GameSimulation(canvas.width, canvas.height);
    this.renderer = new GameRenderer(canvas);
    this.inputHandler = new InputHandler(canvas);
    
    // Set up input callbacks
    this.setupInputHandlers();
    
    console.log('🗡️ Spree-and-a-Half initialized - Loading assets...');
    
    // Load assets before starting
    this.loadAssets();
  }

  // Load game assets
  private async loadAssets(): Promise<void> {
    try {
      await Promise.all([
        SwordAssets.loadAssets(),
        EnemyAssets.loadAssets()
      ]);
      this.assetsLoaded = true;
      console.log('✅ All assets loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load assets:', error);
      // Continue with fallback rendering
      this.assetsLoaded = false;
    }
  }

  private setupInputHandlers(): void {
    // Mouse movement updates simulation
    this.inputHandler.onMouseMove = (x: number, y: number) => {
      this.simulation.updateMousePosition(x, y);
    };

    // Click to add swords for testing
    this.inputHandler.onAddSword = () => {
      this.simulation.addSword();
      console.log(`🗡️ Added sword! Swarm size: ${this.simulation.swarmSize}`);
    };

    // Key press handling
    this.inputHandler.onKeyPress = (key: string) => {
      switch (key) {
        case 'KeyD':
          if (this.inputHandler.isKeyPressed('ControlLeft') || 
              this.inputHandler.isKeyPressed('ControlRight')) {
            this.debugMode = !this.debugMode;
            console.log(`Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
          }
          break;
        
        case 'Space':
          // Test: add multiple swords
          this.simulation.addSword();
          this.simulation.addSword();
          this.simulation.addSword();
          console.log(`🗡️ Added 3 swords! Swarm size: ${this.simulation.swarmSize}`);
          break;
      }
    };
  }

  // Start the game loop
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop();
    
    console.log('🎮 Game started');
  }

  // Stop the game loop
  stop(): void {
    this.isRunning = false;
    console.log('🛑 Game stopped');
  }

  // Main game loop
  private gameLoop = (): void => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Update game systems
    this.update(deltaTime);
    this.render();

    // Continue the loop
    requestAnimationFrame(this.gameLoop);
  };

  // Update all game systems
  private update(_deltaTime: number): void {
    this.inputHandler.update();
    this.simulation.update();
  }

  // Render everything
  private render(): void {
    this.renderer.render(this.simulation);
    
    // Show loading status if assets aren't ready
    if (!this.assetsLoaded) {
      this.renderLoadingStatus();
    }
    
    if (this.debugMode) {
      this.renderer.renderDebug(this.simulation);
    }
  }

  // Show asset loading status
  private renderLoadingStatus(): void {
    const canvas = this.renderer['canvas']; // Access private canvas
    const ctx = this.renderer['ctx']; // Access private context
    
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#00ff00';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Loading Sprites...', canvas.width / 2, canvas.height / 2);
    
    ctx.fillStyle = '#ffaa00';
    ctx.font = '16px monospace';
    ctx.fillText('(Swords & Enemies)', canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillText('(Fallback shapes will be used if loading fails)', canvas.width / 2, canvas.height / 2 + 50);
    
    ctx.restore();
  }
}
