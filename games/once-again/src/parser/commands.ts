import { GameOutput, GameState } from '../engine/types.js';
import { getRoom, getItem, getHallwayDescription, getUpstairsHallDescription } from '../engine/world.js';
import { moveToRoom, addToInventory, removeFromInventory, getStats } from '../engine/state.js';
import { Command } from '../engine/types.js';

// ─── HELPERS ─────────────────────────────────────────────────

function findItemByName(name: string, itemIds: string[]): string | undefined {
  const lower = name.toLowerCase();
  return itemIds.find((id) => {
    const item = getItem(id);
    if (!item) return false;
    return (
      item.id.toLowerCase() === lower ||
      item.name.toLowerCase() === lower ||
      item.id.toLowerCase().replace(/-/g, ' ') === lower ||
      item.name.toLowerCase().includes(lower)
    );
  });
}

const EXIT_NAMES: Record<string, string> = {
  north: 'north', south: 'south', east: 'east', west: 'west',
  n: 'north', s: 'south', e: 'east', w: 'west',
  up: 'up', down: 'down', u: 'up', d: 'down',
};

// ─── COMMANDS ────────────────────────────────────────────────

// Dynamic descriptions that change based on game state
const dynamicDescriptions: Record<string, (state: GameState) => string> = {
  hallway: getHallwayDescription,
  'upstairs-hall': getUpstairsHallDescription,
};

export function executeLook(state: GameState): GameOutput[] {
  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: 'You are nowhere. This is concerning.', type: 'error' }];

  const description = dynamicDescriptions[state.currentRoom]
    ? dynamicDescriptions[state.currentRoom](state)
    : room.description;

  const outputs: GameOutput[] = [];
  outputs.push({ text: `— ${room.name} —`, type: 'system' });
  outputs.push({ text: '', type: 'normal' });
  outputs.push({ text: description, type: 'normal' });

  if (room.items.length > 0) {
    outputs.push({ text: '', type: 'normal' });
    const itemNames = room.items
      .map((id) => getItem(id)?.name || id)
      .join(', ');
    outputs.push({ text: `You can see: ${itemNames}.`, type: 'normal' });
  }

  const exitDirs = Object.keys(room.exits)
    .filter((k) => k.length > 1) // filter out single-char aliases
    .join(', ');
  if (exitDirs) {
    outputs.push({ text: `Exits: ${exitDirs}.`, type: 'narration' });
  }

  return outputs;
}

export function executeGo(state: GameState, direction: string): GameOutput[] {
  if (!direction) {
    return [{ text: 'Go where?', type: 'normal' }];
  }

  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: 'You are lost in the void.', type: 'error' }];

  const dir = EXIT_NAMES[direction] || direction;
  const targetId = room.exits[dir] || room.exits[direction];

  if (!targetId) {
    return [{ text: 'You can\'t go that way.', type: 'normal' }];
  }

  const outputs = moveToRoom(state, targetId);

  // Death stops the game — don't append look
  if (state.flags.dead) {
    return outputs;
  }

  outputs.push(...executeLook(state));
  return outputs;
}

export function executeTake(state: GameState, noun: string): GameOutput[] {
  if (!noun) {
    return [{ text: 'Take what?', type: 'normal' }];
  }

  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: 'There\'s nothing here to take.', type: 'error' }];

  const itemId = findItemByName(noun, room.items);
  if (!itemId) {
    return [{ text: `You don't see any "${noun}" here.`, type: 'normal' }];
  }

  return addToInventory(state, itemId);
}

export function executeDrop(state: GameState, noun: string): GameOutput[] {
  if (!noun) {
    return [{ text: 'Drop what?', type: 'normal' }];
  }

  const itemId = findItemByName(noun, state.inventory);
  if (!itemId) {
    return [{ text: `You're not carrying any "${noun}".`, type: 'normal' }];
  }

  return removeFromInventory(state, itemId);
}

export function executeExamine(state: GameState, noun: string): GameOutput[] {
  if (!noun) {
    return executeLook(state);
  }

  // Check inventory first, then room
  let itemId = findItemByName(noun, state.inventory);
  if (!itemId) {
    const room = getRoom(state.currentRoom);
    if (room) {
      itemId = findItemByName(noun, room.items);
    }
  }

  if (!itemId) {
    return [{ text: `You don't see any "${noun}" to examine.`, type: 'normal' }];
  }

  const item = getItem(itemId);
  if (!item) return [{ text: 'It vanishes as you reach for it.', type: 'error' }];

  const outputs: GameOutput[] = [];
  outputs.push({ text: item.description, type: 'normal' });

  // If previously identified (taken), show system description too
  const identified = state.flags.identified?.[itemId];
  if (identified) {
    outputs.push({ text: '', type: 'normal' });
    outputs.push({ text: 'The System flickers:', type: 'narration' });
    outputs.push({ text: item.systemDescription, type: 'system' });
  }

  return outputs;
}

export function executeInventory(state: GameState): GameOutput[] {
  if (state.inventory.length === 0) {
    return [{ text: 'You\'re not carrying anything. Your pockets echo with emptiness.', type: 'normal' }];
  }

  const outputs: GameOutput[] = [];
  outputs.push({ text: '▒▒▒ INVENTORY ▒▒▒', type: 'system' });
  outputs.push({ text: '', type: 'normal' });

  for (const id of state.inventory) {
    const item = getItem(id);
    if (item) {
      outputs.push({ text: `  • ${item.name}`, type: 'normal' });
    }
  }

  return outputs;
}

export function executeStatus(state: GameState): GameOutput[] {
  const stats = getStats(state);
  const outputs: GameOutput[] = [];

  outputs.push({ text: '▒▒▒ STATUS PROTOCOL ▒▒▒', type: 'system' });
  outputs.push({ text: `DESIGNATION: PENDING`, type: 'system' });
  outputs.push({ text: `TURN: ${state.turnCount}`, type: 'system' });
  outputs.push({ text: '', type: 'normal' });

  for (const [stat, value] of Object.entries(stats)) {
    const bar = value > 0 ? '█'.repeat(value) + '░'.repeat(Math.max(0, 10 - value)) : '░░░░░░░░░░';
    outputs.push({ text: `  ${stat.padEnd(18)} ${bar}  ${value}`, type: 'system' });
  }

  outputs.push({ text: '', type: 'normal' });
  outputs.push({ text: `Rooms explored: ${state.visitedRooms.size}`, type: 'narration' });
  outputs.push({ text: `Items carried: ${state.inventory.length}`, type: 'narration' });

  return outputs;
}

export function executeHelp(): GameOutput[] {
  return [
    { text: '▒▒▒ SYSTEM ASSISTANCE PROTOCOL ▒▒▒', type: 'system' },
    { text: '', type: 'normal' },
    { text: '  look (l)         — observe your surroundings', type: 'normal' },
    { text: '  go <direction>   — move (or just type n/s/e/w)', type: 'normal' },
    { text: '  take <item>      — pick up an item', type: 'normal' },
    { text: '  drop <item>      — drop an item', type: 'normal' },
    { text: '  examine <item>   — inspect an item closely', type: 'normal' },
    { text: '  inventory (i)    — check what you\'re carrying', type: 'normal' },
    { text: '  status           — view your status screen', type: 'normal' },
    { text: '  help (?)         — this message', type: 'normal' },
    { text: '', type: 'normal' },
    { text: 'The Reach provides. The Reach observes.', type: 'narration' },
  ];
}

export function executeUnknown(verb: string): GameOutput[] {
  const responses = [
    `The System does not recognize "${verb}" as a valid action. It regards you with something like pity.`,
    `"${verb}" is not a thing you can do. Not yet. Perhaps not ever.`,
    `The Reach considers your request to "${verb}" and finds it... wanting. Type "help" for guidance.`,
    `You attempt to "${verb}." Nothing happens, but you feel judged.`,
  ];
  const text = responses[Math.floor(Math.random() * responses.length)];
  return [{ text, type: 'narration' }];
}

// ─── DISPATCH ────────────────────────────────────────────────

export function executeCommand(cmd: Command, state: GameState): GameOutput[] {
  if (state.flags.dead) {
    return [{ text: 'You are dead. The story is over. Refresh to try again.', type: 'death' }];
  }

  state.turnCount++;
  console.log(`[TURN ${state.turnCount}] Command: "${cmd.verb}${cmd.noun ? ' ' + cmd.noun : ''}" | Room: ${state.currentRoom} | Inventory: [${state.inventory.join(', ')}]`);

  switch (cmd.verb) {
    case 'look':
      return executeLook(state);
    case 'go':
      return executeGo(state, cmd.noun);
    case 'take':
      return executeTake(state, cmd.noun);
    case 'drop':
      return executeDrop(state, cmd.noun);
    case 'examine':
      return executeExamine(state, cmd.noun);
    case 'inventory':
      return executeInventory(state);
    case 'status':
      return executeStatus(state);
    case 'help':
      return executeHelp();
    default:
      return executeUnknown(cmd.verb);
  }
}
