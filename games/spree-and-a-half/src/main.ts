import { Game } from './Game.js';

// Initialize the game when the page loads
window.addEventListener('load', async () => {
  try {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Could not find game canvas');
    }
    
    // Create and start the game
    const game = new Game(canvas);
    game.start();
    
    console.log('🗡️ Spree-and-a-Half loaded successfully!');
    console.log('💡 Click to add swords, move mouse to direct swarm');
    console.log('💡 Press SPACE for multi-sword burst, Ctrl+D for debug');
    
  } catch (error) {
    console.error('❌ Failed to load game:', error);
    document.body.innerHTML = '<h1>Failed to load game. Check console for errors.</h1>';
  }
});
