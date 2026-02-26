// ── Player Entity ──

import { Entity, Position, InputState, GameConfig, DEFAULT_CONFIG } from './types';
import { TileMap } from './map';

export class Player implements Entity {
  pos: Position;
  facing: Position;
  speed: number;
  private config: GameConfig;

  constructor(spawnPos: Position, config: GameConfig = DEFAULT_CONFIG) {
    this.pos = { ...spawnPos };
    this.facing = { x: 0, y: -1 }; // facing up initially
    this.speed = config.playerSpeed;
    this.config = config;
  }

  update(dt: number, input: InputState, map: TileMap): string {
    let dx = 0;
    let dy = 0;

    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    // No input = idle
    if (dx === 0 && dy === 0) return 'idle';

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    // Update facing
    this.facing = { x: dx, y: dy };

    // Calculate new position
    const moveX = dx * this.speed * dt;
    const moveY = dy * this.speed * dt;

    // Try X and Y separately for wall sliding
    const newX = this.pos.x + moveX;
    const newY = this.pos.y + moveY;

    if (map.isPositionWalkable(newX, this.pos.y)) {
      this.pos.x = newX;
    }
    if (map.isPositionWalkable(this.pos.x, newY)) {
      this.pos.y = newY;
    }

    return 'move';
  }
}

/** Input handler — tracks WASD + arrow keys */
export class InputHandler {
  state: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
  };

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W':
        this.state.up = down; e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S':
        this.state.down = down; e.preventDefault(); break;
      case 'ArrowLeft': case 'a': case 'A':
        this.state.left = down; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D':
        this.state.right = down; e.preventDefault(); break;
      case ' ':
        this.state.space = down; e.preventDefault(); break;
    }
  }

  /** Check if any movement key is pressed */
  isMoving(): boolean {
    return this.state.up || this.state.down || this.state.left || this.state.right;
  }
}
