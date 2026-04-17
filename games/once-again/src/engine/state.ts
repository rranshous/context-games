import { GameState, GameOutput } from './types.js';
import { getRoom, getItem } from './world.js';

export function createInitialState(): GameState {
  return {
    currentRoom: 'kitchen',
    inventory: [],
    statusScreen: {
      Edge: 0,
      Awareness: 0,
      Resourcefulness: 0,
      Flexibility: 0,
      Resonance: 0,
      '???': 0,
    },
    visitedRooms: new Set(['kitchen']),
    flags: {
      systemInitialized: true,
      identified: {},  // itemId → true if system-identified
    },
    turnCount: 0,
  };
}

export function moveToRoom(state: GameState, roomId: string): GameOutput[] {
  const room = getRoom(roomId);
  if (!room) {
    return [{ text: 'You can\'t go that way.', type: 'error' }];
  }

  const outputs: GameOutput[] = [];

  // Fire onEnter before marking visited
  if (room.onEnter) {
    outputs.push(...room.onEnter(state));
  }

  state.currentRoom = roomId;
  state.visitedRooms.add(roomId);
  console.log(`[MOVE] → ${room.name} (${roomId}) | Visited: ${state.visitedRooms.size} rooms`);
  room.firstVisit = false;

  return outputs;
}

const MAX_INVENTORY = 5;

export function addToInventory(state: GameState, itemId: string): GameOutput[] {
  const item = getItem(itemId);
  if (!item) {
    return [{ text: 'That doesn\'t seem to exist.', type: 'error' }];
  }

  if (!item.takeable) {
    return [{ text: 'You can\'t take that.', type: 'normal' }];
  }

  if (state.inventory.length >= MAX_INVENTORY) {
    return [
      { text: `Your hands are full. You're already carrying ${state.inventory.length} items.`, type: 'normal' },
      { text: '', type: 'normal' },
      { text: `▒▒▒ CAPACITY EXCEEDED ▒▒▒`, type: 'system' },
      { text: `The Reach APPRECIATES your collector's instinct! TRULY! But even ENHANCED candidates have only TWO HANDS and — at MOST — several pockets! Drop something first. The Reach BELIEVES in you but cannot SUSPEND PHYSICS. Yet.`, type: 'system' },
    ];
  }

  // Remove from room
  const room = getRoom(state.currentRoom);
  if (room) {
    const idx = room.items.indexOf(itemId);
    if (idx !== -1) {
      room.items.splice(idx, 1);
    }
  }

  state.inventory.push(itemId);

  // Mark as identified
  if (!state.flags.identified) state.flags.identified = {};
  state.flags.identified[itemId] = true;

  // Apply effects to status screen
  for (const [stat, value] of Object.entries(item.effects)) {
    state.statusScreen[stat] = (state.statusScreen[stat] || 0) + value;
  }

  console.log(`[TAKE] ${item.name} (${itemId}) | Effects:`, item.effects, '| Stats now:', { ...state.statusScreen });

  const outputs: GameOutput[] = [];
  outputs.push({ text: `You pick up the ${item.name}.`, type: 'normal' });
  outputs.push({ text: '', type: 'normal' });
  outputs.push({ text: item.systemDescription, type: 'system' });

  return outputs;
}

export function removeFromInventory(state: GameState, itemId: string): GameOutput[] {
  const item = getItem(itemId);
  if (!item) {
    return [{ text: 'You don\'t have that.', type: 'error' }];
  }

  const idx = state.inventory.indexOf(itemId);
  if (idx === -1) {
    return [{ text: 'You\'re not carrying that.', type: 'normal' }];
  }

  state.inventory.splice(idx, 1);

  // Add to current room
  const room = getRoom(state.currentRoom);
  if (room) {
    room.items.push(itemId);
  }

  // Remove effects from status screen
  for (const [stat, value] of Object.entries(item.effects)) {
    state.statusScreen[stat] = (state.statusScreen[stat] || 0) - value;
  }

  console.log(`[DROP] ${item.name} (${itemId}) in ${state.currentRoom} | Stats now:`, { ...state.statusScreen });
  return [{ text: `You drop the ${item.name}.`, type: 'normal' }];
}

export function getStats(state: GameState): Record<string, number> {
  return { ...state.statusScreen };
}

// The mutable game state
export let gameState: GameState = createInitialState();

export function resetState(): void {
  gameState = createInitialState();
}
