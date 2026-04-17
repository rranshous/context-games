import { Command } from '../engine/types.js';

const DIRECTION_ALIASES: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  up: 'up',
  down: 'down',
  u: 'up',
  d: 'down',
};

const VERB_ALIASES: Record<string, string> = {
  l: 'look',
  look: 'look',
  i: 'inventory',
  inv: 'inventory',
  inventory: 'inventory',
  get: 'take',
  take: 'take',
  grab: 'take',
  pick: 'take',
  x: 'examine',
  examine: 'examine',
  inspect: 'examine',
  study: 'examine',
  drop: 'drop',
  go: 'go',
  walk: 'go',
  move: 'go',
  status: 'status',
  stats: 'status',
  help: 'help',
  '?': 'help',
  use: 'use',
  quit: 'quit',
  q: 'quit',
};

export function parseInput(input: string): Command {
  const trimmed = input.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const first = parts[0] || '';
  const rest = parts.slice(1).join(' ');

  // Bare direction: "north", "n", etc.
  if (DIRECTION_ALIASES[first] && parts.length === 1) {
    return {
      verb: 'go',
      noun: DIRECTION_ALIASES[first],
      fullInput: trimmed,
    };
  }

  // "pick up X" special case
  if (first === 'pick' && parts[1] === 'up') {
    return {
      verb: 'take',
      noun: parts.slice(2).join(' '),
      fullInput: trimmed,
    };
  }

  const verb = VERB_ALIASES[first] || first;

  // "go north", "go n"
  let noun = rest;
  if (verb === 'go' && DIRECTION_ALIASES[rest]) {
    noun = DIRECTION_ALIASES[rest];
  }

  return { verb, noun, fullInput: trimmed };
}
