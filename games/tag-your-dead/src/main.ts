import { Game } from './game.js';

// Wait for custom fonts before starting (canvas text needs them loaded)
document.fonts.ready.then(() => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const game = new Game(canvas);
  game.start();
});
