// Movement shared by the dungeon and the client. The client predicts its own player with exactly
// this code and the dungeon applies the same commands in the same order, so they agree; the client
// only needs correcting when something it couldn't know happens (a blink, a collision it didn't see).
import { BALANCE as B } from './balance.ts';

export interface Arena {
  w: number;
  h: number;
  pillars: readonly { x: number; y: number; r: number }[];
}

/** One tick of player intent. `seq` orders commands; `dt` is the client tick it covers. */
export interface MoveCmd {
  seq: number;
  mx: number; // desired direction (normalized on use)
  my: number;
  ax: number; // aim point, world units
  ay: number;
  dt: number;
}

/** Longest a single command may cover (anything longer is clamped). */
export const MAX_CMD_DT = 1 / 20;

/** Push a circle out of pillars and keep it inside the arena. */
export function collideCircle(o: { x: number; y: number }, r: number, arena: Arena) {
  for (const q of arena.pillars) {
    const dx = o.x - q.x, dy = o.y - q.y;
    const d2 = dx * dx + dy * dy, min = q.r + r;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 1;
      o.x = q.x + (dx / d) * min;
      o.y = q.y + (dy / d) * min;
    }
  }
  o.x = Math.max(r, Math.min(arena.w - r, o.x));
  o.y = Math.max(r, Math.min(arena.h - r, o.y));
}

/** Apply one command to a player's position. Pure and deterministic given the same inputs. */
export function movePlayer(p: { x: number; y: number }, cmd: MoveCmd, arena: Arena, dt = Math.min(cmd.dt, MAX_CMD_DT)) {
  const l = Math.hypot(cmd.mx, cmd.my);
  if (l > 0 && dt > 0) {
    p.x += (cmd.mx / l) * B.player.speed * dt;
    p.y += (cmd.my / l) * B.player.speed * dt;
  }
  collideCircle(p, B.player.radius, arena);
}
