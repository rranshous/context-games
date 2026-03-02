// PredatorSoma — the predator's mind: instinct code, memory, hunt history.
// Parallels hot-pursuit's Soma but with biological framing.

export interface HuntHistoryEntry {
  huntId: number;
  outcome: 'catch' | 'lost';
  durationSeconds: number;
  closestDistance: number;
  preyConcealed: boolean;
  concealmentTile: string | null; // 'kelp' | 'crevice' | 'den' | null
}

export interface PredatorSoma {
  id: string;
  species: string;
  nature: string;               // poetic identity text

  instinctCode: string;         // JS string containing onStimulus(type, data, me)
  memory: string;               // free-form, curated by reflection
  huntHistory: HuntHistoryEntry[];  // last N hunts (capped at 10)

  lastReflectionTime: number;   // game clock seconds
  reflectionPending: boolean;
}

// --- Default shark instinct ---

const DEFAULT_SHARK_INSTINCT = `
async function onStimulus(type, data, me) {
  switch (type) {
    case 'prey_detected':
      me.setLastKnown(data.prey_position);
      me.pursue(data.prey_position);
      break;
    case 'prey_lost':
      me.patrol_to(data.last_known_position);
      break;
    case 'tick':
      if (data.time_since_lost < 5.0) {
        const lk = me.getLastKnown();
        if (lk) me.patrol_to(lk);
      } else {
        me.patrol_random();
      }
      break;
  }
}
`.trim();

export function createDefaultSharkSoma(id: string): PredatorSoma {
  return {
    id,
    species: 'shark',
    nature: 'The reef shark hunts by sight and speed — a torpedo with teeth, closing distance before prey can reach cover.',
    instinctCode: DEFAULT_SHARK_INSTINCT,
    memory: 'No hunts yet. Patrol the reef, chase what moves.',
    huntHistory: [],
    lastReflectionTime: 0,
    reflectionPending: false,
  };
}
