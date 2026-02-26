// ── Soma: Actant Data Structure ──
// The soma IS the police officer. It contains identity, memory, tools,
// signal handlers, and reflection prompts. During chase mode, only the
// signal_handlers section executes. During reflection (Phase 3), the
// model reads and rewrites the entire soma.

import { Position, TilePosition } from './types';

/** A tool the actant has adopted — maps to a chassis primitive */
export interface ActantTool {
  name: string;
  description: string;  // orienting, not instructional
  inputSchema: Record<string, unknown>;
}

/** The complete soma — serializable to JSON */
export interface Soma {
  // Identity
  id: string;
  name: string;
  badgeNumber: string;
  nature: string;  // poetic analogy, not personality adjectives
  responsibility: string;

  // Tools the actant has adopted (starts minimal, grows via discover_tools)
  tools: ActantTool[];

  // Signal handlers — the code that runs during chases
  // This is a string containing a JS function body for onSignal(type, data, me)
  signalHandlers: string;

  // Memory — free-form, curated by the actant itself during reflection
  memory: string;

  // Memory maintainer — code that runs after reflection to compress memory
  memoryMaintainer: string;

  // Chase history metadata (structured, separate from free-form memory)
  chaseHistory: ChaseHistoryEntry[];

  // Player model — accumulated beliefs (structured for Phase 3, but seeded now)
  playerModel: {
    preferredRoutes: string[];
    behavioralPatterns: string[];
    exploitationIdeas: string[];
  };
}

export interface ChaseHistoryEntry {
  runId: number;
  outcome: string;
  durationSeconds: number;
  spotted: boolean;     // did this officer spot the player?
  captured: boolean;    // did this officer make the capture?
}

// ── Default Soma Templates ──
// Each officer starts with a different nature analogy but the same naive handlers.

const DEFAULT_HANDLER = `
async function onSignal(type, data, me) {
  switch(type) {
    case 'tick': {
      // Patrol: move to next patrol point
      if (me.getState() === 'patrol') {
        me.callTool('patrol_next');
      }
      break;
    }
    case 'player_spotted': {
      // Chase: move directly toward player
      me.callTool('move_toward', { target: data.player_position });
      break;
    }
    case 'player_lost': {
      // Search: go to last known position
      me.callTool('move_toward', { target: data.last_known_position });
      break;
    }
    case 'ally_signal': {
      // No-op for now
      break;
    }
  }
}
`;

const OFFICER_TEMPLATES: Array<{
  name: string;
  nature: string;
}> = [
  {
    name: 'Voss',
    nature: 'Voss moves through the grid like a current through wire — always taking the shortest path, never wasting a step, arriving before you\'ve finished deciding where to run.',
  },
  {
    name: 'Okafor',
    nature: 'Okafor watches intersections the way a spider watches a web — still at the center, feeling for vibrations, knowing which thread to pull.',
  },
  {
    name: 'Tanaka',
    nature: 'Tanaka doesn\'t pursue. Tanaka narrows. Every position Tanaka takes removes an option you thought you had.',
  },
  {
    name: 'Reeves',
    nature: 'Reeves patrols the grid the way a hawk circles a field — patient, reading the terrain, waiting for the moment the prey commits to a direction. She doesn\'t chase. She arrives.',
  },
];

/** Default tools — start minimal per implementation guide */
const DEFAULT_TOOLS: ActantTool[] = [
  {
    name: 'move_toward',
    description: 'Move toward a position. The most basic pursuit — go where they are.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'object', description: 'Position {x, y} to move toward' },
      },
      required: ['target'],
    },
  },
  {
    name: 'check_line_of_sight',
    description: 'Look toward a position. Can you see what\'s there?',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'object', description: 'Position {x, y} to check' },
      },
      required: ['target'],
    },
  },
];

export function createDefaultSoma(index: number): Soma {
  const template = OFFICER_TEMPLATES[index % OFFICER_TEMPLATES.length];
  return {
    id: `officer-${index}`,
    name: template.name,
    badgeNumber: `HPD-${String(index + 1).padStart(3, '0')}`,
    nature: template.nature,
    responsibility: 'Capture the fugitive. Learn from every chase. Become harder to escape.',
    tools: [...DEFAULT_TOOLS],
    signalHandlers: DEFAULT_HANDLER,
    memory: `Officer ${template.name} has not yet pursued anyone. No chase history.`,
    memoryMaintainer: '',
    chaseHistory: [],
    playerModel: {
      preferredRoutes: [],
      behavioralPatterns: [],
      exploitationIdeas: [],
    },
  };
}

/** Discoverable tools — not given at start, unlocked during reflection (Phase 3) */
export const DISCOVERABLE_TOOLS: ActantTool[] = [
  {
    name: 'move_to_intercept',
    description: 'Move to where the suspect is going, not where they are.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'object' },
        targetVelocity: { type: 'object' },
      },
      required: ['target', 'targetVelocity'],
    },
  },
  {
    name: 'hold_position',
    description: 'Stand your ground. Sometimes the best move is not to move.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'map_query',
    description: 'Study the terrain around a position. What paths exist? Where are the dead ends?',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'object' },
        radius: { type: 'number' },
      },
      required: ['position'],
    },
  },
  {
    name: 'escape_routes_from',
    description: 'Think like the suspect — where could they run from this position?',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'object' },
      },
      required: ['position'],
    },
  },
  {
    name: 'ally_positions',
    description: 'Where are your fellow officers right now?',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'distance_to',
    description: 'How far is a given position from you?',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'object' },
      },
      required: ['target'],
    },
  },
  {
    name: 'broadcast',
    description: 'Radio all units. Share what you\'ve seen or what you\'re planning.',
    inputSchema: {
      type: 'object',
      properties: {
        signalType: { type: 'string' },
        data: { type: 'object' },
      },
      required: ['signalType', 'data'],
    },
  },
];
