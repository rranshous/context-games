// ── Pursuer Soma ──
// Signal-driven soma for cop pursuers. Hot-pursuit pattern adapted for desert chase.
// Each pursuer has identity, on_tick (signal handler), and memory.

import { PursuerSoma } from './types';

// ── Named Templates ──

interface PursuerTemplate {
  name: string;
  nature: string;
  identity: string;
}

const TEMPLATES: PursuerTemplate[] = [
  {
    name: 'Viper',
    nature: 'The ambush predator. Lies in wait near the objective, strikes when the driver commits to the final approach.',
    identity: 'I am Viper. I don\'t chase — I predict. While other units run around the desert burning fuel, I position myself where the driver has to go. The objective is the trap. I watch the angles, I block the approach. When they come in hot for the drop, I\'m already there.',
  },
  {
    name: 'Hound',
    nature: 'The relentless tracker. Once locked on, never breaks pursuit. Wears the driver down through sheer persistence.',
    identity: 'I am Hound. When I see the driver, I don\'t stop. I don\'t get clever, I don\'t try to cut them off — I chase. Straight and hard. I stay on the tail, I keep the pressure up, I force mistakes. The desert is big but I am patient. They have to stop eventually. I don\'t.',
  },
  {
    name: 'Hawk',
    nature: 'The wide-range scout. Covers maximum ground with broad patrol loops, spots the driver from distance, calls it in.',
    identity: 'I am Hawk. My job is to find them first. Wide patrols, long sight lines, always moving. When I spot the driver, I call it in immediately so the others can converge. I keep eyes on target and report position updates. The team can\'t chase what they can\'t see — I fix that.',
  },
  {
    name: 'Rattler',
    nature: 'The chokepoint blocker. Studies terrain, positions at narrows and passes, cuts off escape routes.',
    identity: 'I am Rattler. The desert looks open but it\'s not — water, rocks, cactus groves create channels. I learn where the driver has to go and I sit on those paths. When the others push, I\'m the wall they run into. I read the terrain, I read the route, I close the door.',
  },
];

// ── Default Signal Handler ──

export const DEFAULT_PURSUER_ON_TICK = `async function onSignal(type, data, me) {
  // type: 'driver_spotted' | 'driver_lost' | 'ally_signal' | 'tick'
  // data: depends on signal type
  // me: position, speed, angle, steer(), accelerate(), brake(), etc.

  if (type === 'driver_spotted') {
    // Chase the driver directly
    const angle = me.angleTo(data.driverPosition);
    const diff = Math.atan2(Math.sin(angle - me.angle), Math.cos(angle - me.angle));
    if (Math.abs(diff) > 0.1) {
      me.steer(diff > 0 ? 1 : -1);
    }
    me.accelerate(1.0);

    // Broadcast sighting to allies
    me.broadcast({ type: 'spotted', position: data.driverPosition });
  }

  else if (type === 'driver_lost') {
    // Drive toward last known position
    const angle = me.angleTo(data.lastKnownPosition);
    const diff = Math.atan2(Math.sin(angle - me.angle), Math.cos(angle - me.angle));
    if (Math.abs(diff) > 0.1) {
      me.steer(diff > 0 ? 1 : -1);
    }
    me.accelerate(0.8);
  }

  else if (type === 'ally_signal') {
    // Respond to ally broadcasts — head toward reported position
    if (data.signalData && data.signalData.position) {
      const angle = me.angleTo(data.signalData.position);
      const diff = Math.atan2(Math.sin(angle - me.angle), Math.cos(angle - me.angle));
      if (Math.abs(diff) > 0.1) {
        me.steer(diff > 0 ? 1 : -1);
      }
      me.accelerate(0.9);
    }
  }

  else if (type === 'tick') {
    // Patrol: drive toward next waypoint
    if (data.patrolWaypoint) {
      const angle = me.angleTo(data.patrolWaypoint);
      const diff = Math.atan2(Math.sin(angle - me.angle), Math.cos(angle - me.angle));
      if (Math.abs(diff) > 0.1) {
        me.steer(diff > 0 ? 1 : -1);
      }
      me.accelerate(0.7);

      // If close to waypoint, we'll get a new one automatically
    }
  }
}`;

// ── Soma Creation ──

export function createPursuerSoma(index: number): PursuerSoma {
  const template = TEMPLATES[index % TEMPLATES.length];
  return {
    id: `pursuer-${index}`,
    name: template.name,
    nature: template.nature,
    identity: template.identity,
    on_tick: DEFAULT_PURSUER_ON_TICK,
    memory: '',
    chaseHistory: [],
  };
}

// ── Persistence ──

const STORAGE_KEY = 'wheelman-pursuers';

export function savePursuerSomas(somas: PursuerSoma[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(somas));
}

export function loadPursuerSomas(): PursuerSoma[] | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as PursuerSoma[];
  } catch {
    return null;
  }
}

// Load N pursuers — creates defaults for any missing
export function loadOrCreatePursuerSomas(count: number): PursuerSoma[] {
  const saved = loadPursuerSomas();
  const somas: PursuerSoma[] = [];
  for (let i = 0; i < count; i++) {
    if (saved && saved[i]) {
      somas.push(saved[i]);
    } else {
      somas.push(createPursuerSoma(i));
    }
  }
  return somas;
}

// How many pursuers for a given run number
export function getPursuerCount(runNumber: number): number {
  // Import-free — uses the escalation table shape
  // Actual values come from CONFIG.ESCALATION in the caller
  return runNumber; // placeholder — caller uses CONFIG
}
