import { Command } from '../engine/types.js';

const DIRECTION_ALIASES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  north: 'north', south: 'south', east: 'east', west: 'west',
  up: 'up', down: 'down', u: 'up', d: 'down',
};

const VERB_ALIASES: Record<string, string> = {
  l: 'look', look: 'look',
  i: 'inventory', inv: 'inventory', inventory: 'inventory',
  get: 'take', take: 'take', grab: 'take', pick: 'take', collect: 'take',
  x: 'examine', examine: 'examine',
  inspect: 'inspect', scan: 'inspect',
  drop: 'drop', leave: 'drop', discard: 'drop', put: 'drop',
  go: 'go', walk: 'go', move: 'go', head: 'go', enter: 'go', climb: 'go',
  follow: 'go',
  turn: 'use', press: 'use', push: 'use', pull: 'use', flip: 'use', activate: 'use',
  open: 'use', close: 'use', read: 'examine',
  status: 'status', stats: 'status',
  help: 'help', '?': 'help',
  use: 'use',
  quit: 'quit', q: 'quit',
  respawn: 'respawn',
  restart: 'restart', reset: 'reset', undo: 'undo', refresh: 'refresh',
};

// Words that never carry meaning — strip them
const NOISE = new Set([
  'the', 'a', 'an', 'at', 'to', 'into', 'in', 'on', 'with', 'of', 'for',
  'my', 'its', 'this', 'that', 'some', 'around', 'carefully', 'closely',
  'quickly', 'slowly', 'again', 'please', 'just', 'then', 'now',
  'very', 'really', 'back',
]);

// Phrases that map to directions — checked against the full input
const DIRECTION_PHRASES: [RegExp, string][] = [
  [/\b(?:go\s+)?back\s+down(?:stairs)?/, 'down'],
  [/\b(?:go\s+)?down(?:stairs)/, 'down'],
  [/\b(?:go\s+)?up(?:stairs)/, 'up'],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:north|n)\b/, 'north'],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:south|s)\b/, 'south'],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:east|e)\b/, 'east'],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:west|w)\b/, 'west'],
  [/\b(?:go\s+)?(?:back\s+)?outside\b/, 'east'], // contextual — front door from hallway
  [/\b(?:go\s+)?(?:back\s+)?inside\b/, 'west'],   // contextual — into house from yard
];

// Phrases that map directly to verbs (no noun needed)
const VERB_PHRASES: [RegExp, string][] = [
  [/^look\s+around/, 'look'],
  [/^check\s+(?:my\s+)?inventory/, 'inventory'],
  [/^check\s+(?:my\s+)?(?:status|stats)/, 'status'],
  [/^(?:examine|look\s+at)\s+(?:my\s+)?status\s+screen/, 'status'],
  [/^what\s+(?:do\s+i\s+have|am\s+i\s+carrying)/, 'inventory'],
  [/^where\s+am\s+i/, 'look'],
  [/^what\s+(?:is\s+this|can\s+i\s+do|should\s+i\s+do)/, 'help'],
  [/^how\s+do\s+i/, 'help'],
];

export function parseInput(input: string): Command {
  const trimmed = input.trim().toLowerCase();

  // Check verb phrases first (full-input patterns)
  for (const [pattern, verb] of VERB_PHRASES) {
    if (pattern.test(trimmed)) {
      return { verb, noun: '', fullInput: trimmed };
    }
  }

  // Check direction phrases
  for (const [pattern, dir] of DIRECTION_PHRASES) {
    if (pattern.test(trimmed)) {
      return { verb: 'go', noun: dir, fullInput: trimmed };
    }
  }

  // Strip noise words
  const parts = trimmed.split(/\s+/).filter(w => !NOISE.has(w));
  if (parts.length === 0) {
    return { verb: trimmed, noun: '', fullInput: trimmed };
  }

  const first = parts[0];
  const rest = parts.slice(1).join(' ');

  // Bare direction: "north", "n", etc.
  if (DIRECTION_ALIASES[first] && parts.length === 1) {
    return { verb: 'go', noun: DIRECTION_ALIASES[first], fullInput: trimmed };
  }

  // "pick up X" special case
  if (first === 'pick' && parts[1] === 'up') {
    return { verb: 'take', noun: parts.slice(2).join(' '), fullInput: trimmed };
  }

  const verb = VERB_ALIASES[first] || first;

  // Direction as noun: "go north", "walk down", "head east"
  let noun = rest;
  if (verb === 'go') {
    // Check each remaining word for a direction
    for (const w of parts.slice(1)) {
      if (DIRECTION_ALIASES[w]) {
        noun = DIRECTION_ALIASES[w];
        break;
      }
    }
  }

  return { verb, noun, fullInput: trimmed };
}
