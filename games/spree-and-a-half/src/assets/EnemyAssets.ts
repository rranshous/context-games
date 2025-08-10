import { AssetManager, SpriteSheet } from './SpriteSystem.js';

// Enemy sprite definitions and asset loading
export class EnemyAssets {
  private static assetManager = AssetManager.getInstance();
  
  // Initialize enemy sprite assets
  static async loadAssets(): Promise<void> {
    console.log('👹 Loading enemy sprite assets...');
    
    try {
      // Load the enemy character sheet
      const enemySheet = await this.assetManager.loadSpriteSheet(
        'enemies_main',
        './assets/sprites/npcs_and_swords-sheets/u6242629974_sprite_pack_fantasy_psychedelic_colors_RPG_charac_eff282c0-53fa-417f-91f9-13ebd8773c93_1.png'
      );

      // Define the basic enemy sprite coordinates from your measurements
      enemySheet.addSprite('basic_enemy', {
        x: 796,     // 894px from the left
        y: 289,     // 291px from the top
        width: 196, // 200px wide
        height: 196,// 200px tall
        name: 'basic_enemy'
      });

      console.log('✅ Enemy assets loaded successfully');
      
    } catch (error) {
      console.error('❌ Failed to load enemy assets:', error);
      throw error;
    }
  }

  // Get the main enemy sprite sheet
  static getEnemySheet(): SpriteSheet | undefined {
    return this.assetManager.getSpriteSheet('enemies_main');
  }

  // Draw a basic enemy sprite
  static drawBasicEnemy(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    rotation?: number,
    maxWidth: number = 48,   // Smaller than swords for visual hierarchy
    maxHeight: number = 48   // Square enemies vs tall swords
  ): boolean {
    const sheet = this.getEnemySheet();
    if (!sheet) {
      console.warn('Enemy sheet not available');
      return false;
    }

    // Get the sprite definition to know source dimensions
    const sprite = sheet.getSprite('basic_enemy');
    if (!sprite) {
      console.warn('Basic enemy sprite not found');
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
    
    // No rotation adjustment needed for enemies (they face forward by default)
    const adjustedRotation = rotation ?? 0;
    
    return sheet.drawSprite(ctx, 'basic_enemy', x, y, finalWidth, finalHeight, adjustedRotation);
  }

  // Check if enemy assets are ready
  static areAssetsReady(): boolean {
    const sheet = this.getEnemySheet();
    return sheet?.isLoaded ?? false;
  }
}
