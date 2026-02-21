import type { SimCommand } from '../interface/commands.js';
import type { SimEvent } from '../interface/events.js';
import { Engine } from './engine.js';

// ── Web Worker entry point ───────────────────────────────

let engine: Engine | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let ticksPerSecond = 10;

function emit(event: SimEvent): void {
  postMessage(event);
}

function startTickLoop(): void {
  stopTickLoop();
  tickTimer = setInterval(() => {
    if (engine) engine.step();
  }, 1000 / ticksPerSecond);
}

function stopTickLoop(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// ── Command handler ──────────────────────────────────────

self.onmessage = (e: MessageEvent<SimCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case 'start': {
      engine = new Engine(emit);
      // Send initial full state
      emit({ type: 'state', state: engine.getWorldState() });
      emit({ type: 'log', message: `Simulation started — ${engine.creatures.filter(c => c.alive).length} creatures` });
      startTickLoop();
      break;
    }

    case 'pause': {
      stopTickLoop();
      emit({ type: 'log', message: 'Paused' });
      break;
    }

    case 'resume': {
      if (engine) startTickLoop();
      emit({ type: 'log', message: 'Resumed' });
      break;
    }

    case 'setSpeed': {
      ticksPerSecond = Math.max(1, Math.min(60, cmd.ticksPerSecond));
      if (tickTimer !== null) startTickLoop(); // restart with new interval
      break;
    }

    case 'getState': {
      if (engine) {
        emit({ type: 'state', state: engine.getWorldState() });
      }
      break;
    }

    case 'spawnFood': {
      if (engine) {
        engine.world.setFood(cmd.x, cmd.y, (engine.world.cellAt(cmd.x, cmd.y).food) + cmd.value);
      }
      break;
    }

    case 'spawnCreature': {
      if (engine) {
        engine.spawnCreatureAt(cmd.x, cmd.y, cmd.genome);
      }
      break;
    }

    case 'modifyTerrain': {
      // TODO: implement terrain modification
      break;
    }
  }
};
