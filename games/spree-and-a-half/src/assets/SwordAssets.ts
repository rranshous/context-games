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
    scale: number = 0.1  // Doubled again (463px -> ~46px height)
  ): boolean {
    const sheet = this.getSwordSheet();
    if (!sheet) {
      console.warn('Sword sheet not available');
      return false;
    }

    // Calculate scaled size - maintain aspect ratio
    const baseWidth = 130;
    const baseHeight = 463;
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    
    // Add 90 degrees clockwise rotation (π/2 radians)
    const adjustedRotation = (rotation ?? 0) + Math.PI / 2;
    
    return sheet.drawSprite(ctx, 'basic_sword', x, y, scaledWidth, scaledHeight, adjustedRotation);
  }

  // Check if sword assets are ready
  static areAssetsReady(): boolean {
    return this.assetManager.areAllLoaded();
  }
}
