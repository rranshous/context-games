// ── Hot Pursuit: Entry Point ──

import { Game } from './game';

console.log(JSON.stringify({
  _hp: 'boot',
  version: '0.1.0',
  phase: 1,
  description: 'Hot Pursuit — Phase 1: The Grid and the Chase',
  timestamp: new Date().toISOString(),
}));

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

const game = new Game(canvas);
game.start();
