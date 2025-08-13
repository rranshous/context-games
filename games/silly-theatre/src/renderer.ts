/**
 * Canvas rendering system for the theater simulator
 * Handles visual representation of all 4 layers
 */

import type { TheaterState, TileState, LEDState, PropState, PuppetState } from './types.js';

export interface RendererConfig {
  stageWidth: number;    // 64 logical units
  stageHeight: number;   // 32 logical units
  pixelsPerUnit: number; // How many pixels per logical unit (scale)
  enableGlow: boolean;   // LED glow effects
  enableShadows: boolean; // Prop/puppet shadows
}

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  stageWidth: 64,
  stageHeight: 32,
  pixelsPerUnit: 20, // Increased from 12 to 20 for much larger display (1280×640px)
  enableGlow: true,
  enableShadows: true
};

/**
 * Multi-layer canvas renderer for the theater
 */
export class TheaterRenderer {
  private container: HTMLElement;
  private config: RendererConfig;
  
  // Canvases for each layer (bottom to top)
  private tileCanvas: HTMLCanvasElement;
  private ledCanvas: HTMLCanvasElement;
  private propCanvas: HTMLCanvasElement;
  private puppetCanvas: HTMLCanvasElement;
  
  // Canvas contexts
  private tileCtx: CanvasRenderingContext2D;
  private ledCtx: CanvasRenderingContext2D;
  private propCtx: CanvasRenderingContext2D;
  private puppetCtx: CanvasRenderingContext2D;
  
  // Dimensions
  private canvasWidth: number;
  private canvasHeight: number;

  // Sprite images
  private propImages: Map<string, HTMLImageElement> = new Map();
  private puppetImage: HTMLImageElement | null = null;
  private imagesLoaded: boolean = false;

  constructor(container: HTMLElement, config: Partial<RendererConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_RENDERER_CONFIG, ...config };
    
    this.canvasWidth = this.config.stageWidth * this.config.pixelsPerUnit;
    this.canvasHeight = this.config.stageHeight * this.config.pixelsPerUnit;
    
    // Create and setup canvases
    const canvases = this.setupCanvases();
    this.tileCanvas = canvases.tile;
    this.ledCanvas = canvases.led;
    this.propCanvas = canvases.prop;
    this.puppetCanvas = canvases.puppet;
    
    // Get contexts with error checking
    this.tileCtx = this.getContext(this.tileCanvas, 'tile');
    this.ledCtx = this.getContext(this.ledCanvas, 'LED');
    this.propCtx = this.getContext(this.propCanvas, 'prop');
    this.puppetCtx = this.getContext(this.puppetCanvas, 'puppet');
    
    // Load sprite images
    this.loadImages();
    
    console.log(`🎨 Theater renderer initialized: ${this.canvasWidth}×${this.canvasHeight}px`);
  }

  /**
   * Create and configure all canvas layers
   */
  private setupCanvases(): {
    tile: HTMLCanvasElement;
    led: HTMLCanvasElement;
    prop: HTMLCanvasElement;
    puppet: HTMLCanvasElement;
  } {
    // Clear container
    this.container.innerHTML = '';
    
    // Create wrapper for layered canvases
    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.position = 'relative';
    canvasWrapper.style.width = `${this.canvasWidth}px`;
    canvasWrapper.style.height = `${this.canvasHeight}px`;
    canvasWrapper.style.border = '1px solid #666';
    canvasWrapper.style.background = '#000';
    
    // Create canvases (bottom to top rendering order)
    const tileCanvas = this.createCanvas('tile-layer');
    const ledCanvas = this.createCanvas('led-layer');
    const propCanvas = this.createCanvas('prop-layer');
    const puppetCanvas = this.createCanvas('puppet-layer');
    
    // Add canvases to wrapper
    canvasWrapper.appendChild(tileCanvas);
    canvasWrapper.appendChild(ledCanvas);
    canvasWrapper.appendChild(propCanvas);
    canvasWrapper.appendChild(puppetCanvas);
    
    this.container.appendChild(canvasWrapper);
    
    return { tile: tileCanvas, led: ledCanvas, prop: propCanvas, puppet: puppetCanvas };
  }

  /**
   * Create a single canvas with proper styling
   */
  private createCanvas(id: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.imageRendering = 'pixelated'; // Crisp pixel art
    return canvas;
  }

  /**
   * Get canvas context with error checking
   */
  private getContext(canvas: HTMLCanvasElement, layerName: string): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Failed to get 2D context for ${layerName} canvas`);
    }
    return ctx;
  }

  /**
   * Load all sprite images
   */
  private async loadImages(): Promise<void> {
    // Map prop types to actual filenames
    const propTypeToFile = {
      'tree': 'heart_tree.png',
      'house': 'rainbow_house.png', 
      'castle': 'pink_castle.png',
      'bush': 'colorful_squat_bush.png',
      'rock': 'clown_rock.png',
      'sign': 'fun_sign.png'
    };
    
    try {
      // Load prop images
      const propPromises = Object.entries(propTypeToFile).map(async ([type, filename]) => {
        const img = new Image();
        img.src = `props/${filename}`;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        this.propImages.set(type, img);
        console.log(`📷 Loaded prop image: ${type} (${filename})`);
      });

      // Load puppet image
      const puppetImg = new Image();
      puppetImg.src = 'puppets/little_girl.png';
      const puppetPromise = new Promise((resolve, reject) => {
        puppetImg.onload = resolve;
        puppetImg.onerror = reject;
      });

      // Wait for all images to load
      await Promise.all([...propPromises, puppetPromise]);
      this.puppetImage = puppetImg;
      this.imagesLoaded = true;
      
      console.log('✅ All sprite images loaded successfully');
    } catch (error) {
      console.warn('⚠️ Failed to load some sprite images, falling back to drawn shapes:', error);
      this.imagesLoaded = false;
    }
  }

  /**
   * Render the complete theater state
   */
  render(state: TheaterState): void {
    // Clear all canvases
    this.clearAll();
    
    // Render each layer
    this.renderTiles(state.tiles.tiles);
    this.renderLEDs(state.leds.leds);
    this.renderProps(state.props.props);
    this.renderPuppets(state.puppets.puppets, state.puppets.baseline_y);
  }

  /**
   * Clear all canvas layers
   */
  private clearAll(): void {
    this.tileCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ledCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.propCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.puppetCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  /**
   * Render the tile layer (background stage floor/wall)
   */
  private renderTiles(tiles: TileState[][]): void {
    const unit = this.config.pixelsPerUnit;
    
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const tile = tiles[y][x];
        
        // Add slight perspective - tiles get smaller toward the back
        const depthFactor = 1 - (y / tiles.length) * 0.1; // 10% smaller at back
        const tileSize = unit * depthFactor;
        
        // Set tile color with depth shading
        const depthShade = 1 - (y / tiles.length) * 0.2; // Darker toward back
        this.tileCtx.fillStyle = tile.state === 'white' 
          ? `rgba(255, 255, 255, ${depthShade})` 
          : `rgba(34, 34, 34, ${depthShade})`;
        
        // Draw tile with perspective
        const pixelX = x * unit + (unit - tileSize) / 2; // Center smaller tiles
        const pixelY = y * unit + (unit - tileSize) / 2;
        this.tileCtx.fillRect(pixelX, pixelY, tileSize, tileSize);
        
        // Add subtle grid lines
        this.tileCtx.strokeStyle = `rgba(51, 51, 51, ${depthShade * 0.5})`;
        this.tileCtx.lineWidth = 0.5;
        this.tileCtx.strokeRect(pixelX, pixelY, tileSize, tileSize);
      }
    }
  }

  /**
   * Render the LED layer (atmospheric lighting)
   */
  private renderLEDs(leds: LEDState[][]): void {
    const unit = this.config.pixelsPerUnit;
    
    // Enable compositing for glow effects
    if (this.config.enableGlow) {
      this.ledCtx.globalCompositeOperation = 'screen';
    }
    
    for (let y = 0; y < leds.length; y++) {
      for (let x = 0; x < leds[y].length; x++) {
        const led = leds[y][x];
        
        if (led.brightness > 0) {
          const { r, g, b } = led.color;
          const alpha = led.brightness / 100;
          
          const pixelX = x * unit + unit / 2;
          const pixelY = y * unit + unit / 2;
          
          if (this.config.enableGlow) {
            // Create glow effect with gradient
            const gradient = this.ledCtx.createRadialGradient(
              pixelX, pixelY, 0,
              pixelX, pixelY, unit * 1.5
            );
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            
            this.ledCtx.fillStyle = gradient;
            this.ledCtx.fillRect(
              pixelX - unit * 1.5,
              pixelY - unit * 1.5,
              unit * 3,
              unit * 3
            );
          } else {
            // Simple colored square
            this.ledCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            this.ledCtx.fillRect(pixelX - unit/4, pixelY - unit/4, unit/2, unit/2);
          }
        }
      }
    }
    
    // Reset composite operation
    this.ledCtx.globalCompositeOperation = 'source-over';
  }

  /**
   * Render the props layer (mid-layer objects)
   */
  private renderProps(props: (PropState | null)[]): void {
    const unit = this.config.pixelsPerUnit;
    
    props.forEach((prop) => {
      if (prop && prop.position === 'visible') {
        // Props are positioned in mid-stage with perspective depth
        const centerX = prop.x * unit;
        const centerY = prop.y * unit + (this.canvasHeight * 0.25); // Push props down and back
        
        // Save context for transforms
        this.propCtx.save();
        
        // Apply transforms with depth perspective
        this.propCtx.translate(centerX, centerY);
        this.propCtx.rotate((prop.rotation * Math.PI) / 180);
        this.propCtx.scale(1.0, 1.0 + prop.tilt / 100); // Normal scale for the much larger props
        
        // Draw prop based on type
        this.drawProp(this.propCtx, prop.type, unit);
        
        // Restore context
        this.propCtx.restore();
      }
    });
  }

  /**
   * Draw a specific prop type using sprite images or fallback shapes
   */
  private drawProp(ctx: CanvasRenderingContext2D, type: string, unit: number): void {
    const size = unit * 15.0; // Much larger props - 5x bigger for dramatic stage presence
    
    // Add shadow first (cast toward audience/front of stage)
    if (this.config.enableShadows) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000000';
      ctx.translate(-unit * 0.2, unit * 0.5); // Shadow cast forward toward audience
      ctx.scale(1.1, 0.4); // Elongated shadow toward front
      
      if (this.imagesLoaded && this.propImages.has(type)) {
        // Draw shadow of the image
        const img = this.propImages.get(type)!;
        ctx.drawImage(img, -size/2, -size, size, size);
      } else {
        // Draw shadow of fallback shape
        this.drawPropFallback(ctx, type, size * 0.9);
      }
      ctx.restore();
    }
    
    // Draw the main prop
    if (this.imagesLoaded && this.propImages.has(type)) {
      // Use loaded sprite image
      const img = this.propImages.get(type)!;
      ctx.drawImage(img, -size/2, -size, size, size);
    } else {
      // Fallback to drawn shapes
      this.drawPropFallback(ctx, type, size);
    }
  }

  /**
   * Draw fallback prop shapes when images aren't available
   */
  private drawPropFallback(ctx: CanvasRenderingContext2D, type: string, size: number): void {
    switch (type) {
      case 'tree':
        // Simple tree: brown trunk + green circle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-size/8, 0, size/4, size*0.7);
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.arc(0, -size/4, size/2, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'house':
        // Simple house: square + triangle roof
        ctx.fillStyle = '#CD853F';
        ctx.fillRect(-size/2, -size/2, size, size);
        ctx.fillStyle = '#B22222';
        ctx.beginPath();
        ctx.moveTo(-size/2, -size/2);
        ctx.lineTo(0, -size);
        ctx.lineTo(size/2, -size/2);
        ctx.closePath();
        ctx.fill();
        break;
        
      case 'castle':
        // Simple castle: rectangle with crenellations
        ctx.fillStyle = '#696969';
        ctx.fillRect(-size/2, -size, size, size);
        // Crenellations
        for (let i = 0; i < 3; i++) {
          const x = -size/2 + (i * size/3);
          ctx.fillRect(x, -size, size/6, size/4);
        }
        break;
        
      case 'bush':
        // Simple bush: green oval
        ctx.fillStyle = '#32CD32';
        ctx.beginPath();
        ctx.ellipse(0, -size/4, size/2, size/3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'rock':
        // Simple rock: gray circle
        ctx.fillStyle = '#708090';
        ctx.beginPath();
        ctx.arc(0, -size/4, size/3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'sign':
        // Simple sign: post + rectangle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-size/16, -size/2, size/8, size*0.8);
        ctx.fillStyle = '#F5DEB3';
        ctx.fillRect(-size/3, -size*0.7, size*0.67, size/3);
        break;
        
      default:
        // Unknown prop: question mark
        ctx.fillStyle = '#FF69B4';
        ctx.fillRect(-size/4, -size/2, size/2, size/2);
        break;
    }
  }

  /**
   * Render the puppet layer (foreground characters)
   */
  private renderPuppets(puppets: PuppetState[], baselineY: number): void {
    const unit = this.config.pixelsPerUnit;
    
    puppets.forEach((puppet) => {
      // Only render visible puppets
      if (!puppet.visible) return;
      
      // Puppets are at the front edge of the stage (closest to audience)
      const centerX = (puppet.x / 100) * this.canvasWidth;
      const centerY = (baselineY + 2) * unit + puppet.y_offset * unit; // Slightly forward position
      
      // Save context for transforms
      this.puppetCtx.save();
      
      // Apply transforms with foreground scale (larger since closer to camera)
      this.puppetCtx.translate(centerX, centerY);
      this.puppetCtx.rotate((puppet.rotation * Math.PI) / 180);
      this.puppetCtx.scale(1.2 + puppet.tilt / 100, 1.2); // Even larger scale - dominant stage presence
      
      // Draw puppet
      this.drawPuppet(this.puppetCtx, unit);
      
      // Restore context
      this.puppetCtx.restore();
    });
  }

  /**
   * Draw a puppet using sprite image or fallback shape
   */
  private drawPuppet(ctx: CanvasRenderingContext2D, unit: number): void {
    const size = unit * 4.5; // Much larger puppets - really prominent on stage
    
    // Draw shadow first (cast back onto the stage)
    if (this.config.enableShadows) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000000';
      ctx.translate(unit * 0.1, unit * 0.6); // Shadow cast back onto stage
      ctx.scale(0.8, 0.2); // Flat shadow on stage floor
      
      if (this.imagesLoaded && this.puppetImage) {
        // Draw shadow of the image
        ctx.drawImage(this.puppetImage, -size/2, -size, size, size);
      } else {
        // Draw shadow of fallback shape
        this.drawPuppetFallback(ctx, size * 0.9);
      }
      ctx.restore();
    }
    
    // Draw the main puppet
    if (this.imagesLoaded && this.puppetImage) {
      // Use loaded sprite image
      ctx.drawImage(this.puppetImage, -size/2, -size, size, size);
    } else {
      // Fallback to drawn shape
      this.drawPuppetFallback(ctx, size);
    }
  }

  /**
   * Draw fallback puppet shape when image isn't available
   */
  private drawPuppetFallback(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.strokeStyle = '#FFE4B5';
    ctx.fillStyle = '#FFE4B5';
    ctx.lineWidth = 2;
    
    // Head
    ctx.beginPath();
    ctx.arc(0, -size*0.7, size/6, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.beginPath();
    ctx.moveTo(0, -size*0.5);
    ctx.lineTo(0, size*0.2);
    ctx.stroke();
    
    // Arms
    ctx.beginPath();
    ctx.moveTo(-size*0.3, -size*0.3);
    ctx.lineTo(size*0.3, -size*0.3);
    ctx.stroke();
    
    // Legs
    ctx.beginPath();
    ctx.moveTo(0, size*0.2);
    ctx.lineTo(-size*0.2, size*0.6);
    ctx.moveTo(0, size*0.2);
    ctx.lineTo(size*0.2, size*0.6);
    ctx.stroke();
  }
}
