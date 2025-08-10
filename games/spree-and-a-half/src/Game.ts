import { GameSimulation } from './simulation/GameSimulation.js';
import { GameRenderer } from './presentation/GameRenderer.js';
import { InputHandler } from './input/InputHandler.js';

// Main game class - coordinates simulation, rendering, and input
export class Game {
  private simulation: GameSimulation;
  private renderer: GameRenderer;
  private inputHandler: InputHandler;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private debugMode: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize core systems following Dark Hall pattern
    this.simulation = new GameSimulation(canvas.width, canvas.height);
    this.renderer = new GameRenderer(canvas);
    this.inputHandler = new InputHandler(canvas);
    
    // Set up input callbacks
    this.setupInputHandlers();
    
    console.log('🗡️ Spree-and-a-Half initialized - Single sword to swarm experiment');
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
    
    if (this.debugMode) {
      this.renderer.renderDebug(this.simulation);
    }
  }
}
