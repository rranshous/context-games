import { AssetManager, SpriteSheet } from './SpriteSystem.js';

// Sword sprite definitions and asset loading
export class SwordAssets {
  private static assetManager = AssetManager.getInstance();
  
  // Initialize sword sprite assets
  static async loadAssets(): Promise<void> {
    console.log('🗡️ Loading sword sprite assets...');
    
    try {
      // Load the first sword sheet
      const swordSheet = await this.assetManager.loadSpriteSheet(
        'swords_main',
        './assets/sprites/swords-sheets/u6242629974_2d_Sprite_sheet_knives_swords_staffs_and_shields__35477d65-189d-4112-b39b-f16e0d5037e8_0.png'
      );

      // For now, let's manually define one sword sprite
      // Coordinates from actual sprite sheet measurement
      swordSheet.addSprite('basic_sword', {
        x: 225,     // First sword starts ~225px from left
        y: 47,      // Starts ~47px from top
        width: 130, // ~130px wide
        height: 463,// 463px tall
        name: 'basic_sword'
      });

      console.log('✅ Sword assets loaded successfully');
      
    } catch (error) {
      console.error('❌ Failed to load sword assets:', error);
      throw error;
    }
  }

  // Get the main sword sprite sheet
  static getSwordSheet(): SpriteSheet | undefined {
    return this.assetManager.getSpriteSheet('swords_main');
  }

  // Draw a basic sword sprite
  static drawBasicSword(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    rotation?: number,
    maxWidth: number = 64,   // Fixed maximum width regardless of source sprite
    maxHeight: number = 112   // Fixed maximum height regardless of source sprite
  ): boolean {
    const sheet = this.getSwordSheet();
    if (!sheet) {
      console.warn('Sword sheet not available');
      return false;
    }

    // Get the sprite definition to know source dimensions
    const sprite = sheet.getSprite('basic_sword');
    if (!sprite) {
      console.warn('Basic sword sprite not found');
      return false;
    }

    // Calculate scale to fit within max dimensions while preserving aspect ratio
    const sourceWidth = sprite.width;
    const sourceHeight = sprite.height;
    
    const scaleWidth = maxWidth / sourceWidth;
    const scaleHeight = maxHeight / sourceHeight;
    
    // Use the smaller scale to ensure both dimensions fit within limits
    const scale = Math.min(scaleWidth, scaleHeight);
    
    // Calculate final dimensions (maintaining aspect ratio)
    const finalWidth = sourceWidth * scale;
    const finalHeight = sourceHeight * scale;
    
    // Add 90 degrees clockwise rotation (π/2 radians)
    const adjustedRotation = (rotation ?? 0) + Math.PI / 2;
    
    return sheet.drawSprite(ctx, 'basic_sword', x, y, finalWidth, finalHeight, adjustedRotation);
  }

  // Check if sword assets are ready
  static areAssetsReady(): boolean {
    return this.assetManager.areAllLoaded();
  }
}
