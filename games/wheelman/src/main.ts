import { Game } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas not found');

const game = new Game(canvas);
game.start();
