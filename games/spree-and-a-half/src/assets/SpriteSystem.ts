// Sprite definition for extracting individual sprites from sheets
export interface SpriteDefinition {
  x: number;        // X position in the sprite sheet
  y: number;        // Y position in the sprite sheet
  width: number;    // Width of the individual sprite
  height: number;   // Height of the individual sprite
  name?: string;    // Optional identifier for the sprite
}

// Sprite sheet resource with loaded image and sprite definitions
export class SpriteSheet {
  public image: HTMLImageElement;
  public sprites: Map<string, SpriteDefinition> = new Map();
  public isLoaded: boolean = false;

  constructor(public imagePath: string) {
    this.image = new Image();
  }

  // Load the sprite sheet image
  async load(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.image.onload = () => {
        this.isLoaded = true;
        console.log(`✅ Loaded sprite sheet: ${this.imagePath}`);
        resolve();
      };
      
      this.image.onerror = () => {
        console.error(`❌ Failed to load sprite sheet: ${this.imagePath}`);
        reject(new Error(`Failed to load sprite sheet: ${this.imagePath}`));
      };
      
      this.image.src = this.imagePath;
    });
  }

  // Add a sprite definition to this sheet
  addSprite(name: string, definition: SpriteDefinition): void {
    this.sprites.set(name, definition);
  }

  // Get a sprite definition by name
  getSprite(name: string): SpriteDefinition | undefined {
    return this.sprites.get(name);
  }

  // Draw a specific sprite from this sheet
  drawSprite(
    ctx: CanvasRenderingContext2D,
    spriteName: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
    rotation?: number
  ): boolean {
    if (!this.isLoaded) {
      console.warn(`Sprite sheet not loaded: ${this.imagePath}`);
      return false;
    }

    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      console.warn(`Sprite not found: ${spriteName} in ${this.imagePath}`);
      return false;
    }

    ctx.save();
    
    // Apply rotation if specified
    if (rotation !== undefined) {
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.translate(-x, -y);
    }

    // Use provided dimensions or sprite's natural size
    const drawWidth = width ?? sprite.width;
    const drawHeight = height ?? sprite.height;

    // Draw the sprite using canvas clipping
    ctx.drawImage(
      this.image,
      sprite.x, sprite.y, sprite.width, sprite.height,  // Source rectangle
      x - drawWidth/2, y - drawHeight/2, drawWidth, drawHeight  // Destination rectangle (centered)
    );

    ctx.restore();
    return true;
  }
}

// Asset manager for loading and managing sprite sheets
export class AssetManager {
  private spriteSheets: Map<string, SpriteSheet> = new Map();
  private static instance: AssetManager | null = null;

  static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  // Load a sprite sheet
  async loadSpriteSheet(name: string, imagePath: string): Promise<SpriteSheet> {
    const spriteSheet = new SpriteSheet(imagePath);
    await spriteSheet.load();
    this.spriteSheets.set(name, spriteSheet);
    return spriteSheet;
  }

  // Get a loaded sprite sheet
  getSpriteSheet(name: string): SpriteSheet | undefined {
    return this.spriteSheets.get(name);
  }

  // Check if all assets are loaded
  areAllLoaded(): boolean {
    for (const sheet of this.spriteSheets.values()) {
      if (!sheet.isLoaded) return false;
    }
    return true;
  }

  // Get loading progress (0-1)
  getLoadingProgress(): number {
    if (this.spriteSheets.size === 0) return 1;
    
    const loaded = Array.from(this.spriteSheets.values()).filter(sheet => sheet.isLoaded).length;
    return loaded / this.spriteSheets.size;
  }
}
