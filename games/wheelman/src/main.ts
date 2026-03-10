import { Game } from './game';
import { loadSprites } from './sprites';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas not found');

// Load sprites, then start game (game works without sprites via fallback)
loadSprites().then(() => {
  console.log('[WHEELMAN] Sprites ready');
}).catch(() => {
  console.warn('[WHEELMAN] Sprites failed to load, using shape fallback');
});

const game = new Game(canvas);
game.start();
