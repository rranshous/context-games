// Input handler - manages keyboard and mouse input
export class InputHandler {
  private keys: { [key: string]: boolean } = {};
  private mousePosition: { x: number, y: number } = { x: 0, y: 0 };
  private canvas: HTMLCanvasElement;

  // Callbacks for game events
  public onMouseMove?: (x: number, y: number) => void;
  public onKeyPress?: (key: string) => void;
  public onAddSword?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Mouse movement
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mousePosition.x = event.clientX - rect.left;
      this.mousePosition.y = event.clientY - rect.top;
      
      if (this.onMouseMove) {
        this.onMouseMove(this.mousePosition.x, this.mousePosition.y);
      }
    });

    // Mouse clicks
    this.canvas.addEventListener('click', () => {
      // Add sword on click for testing
      if (this.onAddSword) {
        this.onAddSword();
      }
    });

    // Keyboard events
    document.addEventListener('keydown', (event) => {
      this.keys[event.code] = true;
      
      if (this.onKeyPress) {
        this.onKeyPress(event.code);
      }
      
      // Prevent default for game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 
           'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        event.preventDefault();
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys[event.code] = false;
    });

    // Focus canvas for keyboard input
    this.canvas.tabIndex = 0;
    this.canvas.focus();
  }

  // Check if a key is currently pressed
  isKeyPressed(key: string): boolean {
    return this.keys[key] || false;
  }

  // Get current mouse position
  getMousePosition(): { x: number, y: number } {
    return { ...this.mousePosition };
  }

  // Update method to handle continuous input
  update(): void {
    // Handle movement keys
    // Note: For swarm control, we might use these for formation modifiers
    // rather than direct movement
    
    // Example keyboard modifiers for swarm behavior:
    // SHIFT = tight formation
    // SPACE = spread out
    // CTRL = attack mode
  }
}
