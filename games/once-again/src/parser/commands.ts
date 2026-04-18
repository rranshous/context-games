import { GameOutput, GameState, Room } from '../engine/types.js';
import { getRoom, getItem, getHallwayDescription, getUpstairsHallDescription, getStudyDescription, resetWorld } from '../engine/world.js';
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
  study: getStudyDescription,
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

// Rooms that are "outside"
const OUTSIDE_ROOMS = new Set([
  'front-yard', 'street-north', 'street-south',
  'hendersons-yard', 'park', 'corner-store',
]);

// Resolve semantic directions (outside, inside, home) to actual exits
function resolveSemanticDirection(dir: string, room: Room, currentRoomId: string): string | null {
  if (dir === 'outside') {
    // Find an exit that leads to an outside room
    for (const [exitDir, targetId] of Object.entries(room.exits)) {
      if (exitDir.length > 1 && OUTSIDE_ROOMS.has(targetId)) return exitDir;
    }
    return null;
  }
  if (dir === 'inside' || dir === 'home') {
    // Find an exit that leads to an inside room
    for (const [exitDir, targetId] of Object.entries(room.exits)) {
      if (exitDir.length > 1 && !OUTSIDE_ROOMS.has(targetId)) return exitDir;
    }
    return null;
  }
  return null;
}

export function executeGo(state: GameState, direction: string): GameOutput[] {
  if (!direction) {
    return [{ text: 'Go where?', type: 'normal' }];
  }

  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: 'You are lost in the void.', type: 'error' }];

  // Try semantic direction first (outside, inside, home)
  let dir = EXIT_NAMES[direction] || direction;
  if (dir === 'outside' || dir === 'inside' || dir === 'home') {
    const resolved = resolveSemanticDirection(dir, room, state.currentRoom);
    if (!resolved) {
      if (dir === 'outside' && OUTSIDE_ROOMS.has(state.currentRoom)) {
        return [{ text: 'You\'re already outside.', type: 'normal' }];
      }
      if ((dir === 'inside' || dir === 'home') && !OUTSIDE_ROOMS.has(state.currentRoom)) {
        return [{ text: 'You\'re already inside.', type: 'normal' }];
      }
      return [{ text: 'You can\'t go that way from here.', type: 'normal' }];
    }
    dir = resolved;
  }

  const targetId = room.exits[dir] || room.exits[direction];

  if (!targetId) {
    return [{ text: 'You can\'t go that way.', type: 'normal' }];
  }

  // Front door gate — need to survive the study first
  if (targetId === 'front-yard' && !state.flags.survivedStudy) {
    return [{ text: 'You try the front door. It\'s unlocked — it was always unlocked — but your hand won\'t turn the knob. Something unfinished upstairs. You should deal with that first.', type: 'narration' }];
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

export function executeHelp(state: GameState): GameOutput[] {
  const cmds: GameOutput[] = [
    { text: '▒▒▒ SYSTEM ASSISTANCE PROTOCOL ▒▒▒', type: 'system' },
    { text: '', type: 'normal' },
    { text: '  look (l)         — observe your surroundings', type: 'normal' },
    { text: '  go <direction>   — move (or just type n/s/e/w)', type: 'normal' },
    { text: '  take <item>      — pick up an item', type: 'normal' },
    { text: '  drop <item>      — drop an item', type: 'normal' },
    { text: '  examine <item>   — inspect an item closely', type: 'normal' },
    { text: '  inventory (i)    — check what you\'re carrying', type: 'normal' },
    { text: '  status           — view your status screen', type: 'normal' },
  ];

  // Silently appears when Awareness >= 4
  if (state.statusScreen.Awareness >= 4) {
    cmds.push({ text: '  inspect <thing>  — focus your awareness on something', type: 'normal' });
  }

  cmds.push({ text: '  help (?)         — this message', type: 'normal' });
  cmds.push({ text: '', type: 'normal' });
  cmds.push({ text: 'The Reach provides. The Reach observes.', type: 'narration' });
  return cmds;
}

// ─── INSPECT ────────────────────────────────────────────────

// Things in rooms that can be inspected but aren't items
const inspectables: Record<string, Record<string, { low: string; high: string }>> = {
  'front-yard': {
    mailbox: {
      low: 'It\'s your mailbox. White, slightly dented from that time the snowplow came too close. Flag is down.',
      high: `Your mailbox. The System overlay shimmers around it.
▒▒▒ OBJECT SCAN ▒▒▒
[Postal Receptacle — Class: MUNDANE]
The Reach detects NOTHING of note about this mailbox. It is a box. For mail. HOWEVER — and the Reach wants to be VERY clear about this — the ABSENCE of significance is ITSELF significant! In a world where everything has been catalogued, an object that resists classification is DEEPLY INTERESTING! Also there's a coupon flyer inside.
THREAT LEVEL: NONE / MAIL`,
    },
    lawn: {
      low: 'Your lawn. It needs mowing.',
      high: `Your lawn. The System overlay shows a faint green shimmer across the grass.
▒▒▒ TERRAIN SCAN ▒▒▒
[Suburban Grassland — Class: TERRITORY]
REMARKABLE! This patch of cultivated earth has been maintained by YOU for YEARS! Every blade of grass is a tiny soldier in your personal army of landscaping! The Reach detects trace amounts of ORGANIC POTENTIAL in the soil. Something could grow here that isn't grass. The Reach is not suggesting you plant anything. The Reach is merely OBSERVING.
FERTILITY: MODERATE / UNTAPPED`,
    },
  },
  park: {
    creature: {
      low: 'It\'s... something. You can\'t quite focus on it. Like looking at a word you almost remember.',
      high: `You focus on the creature at the base of the oak tree. The System overlay flares.
▒▒▒ ENTITY SCAN ▒▒▒
[Territorial Grazer — Class: FAUNA / EMERGENT]
OH WONDERFUL! You can SEE it now! REALLY see it! This creature is a PRODUCT of the Reach — a life form that emerged when the System integrated with your local ecosystem! It is NOT dangerous unless provoked! It FEEDS on ambient resonance and NESTS near old, significant things — hence the oak tree! The Reach classifies it as FRIENDLY! Mostly! 73% friendly!
DISPOSITION: CURIOUS / PROBABLY FINE
EDGE: 3  |  AWARENESS: 5  |  RESONANCE: 7`,
    },
    oak: {
      low: 'A big oak tree. Been here longer than any of the houses on the street.',
      high: `The oak tree. The System overlay shimmers intensely around it, more than anything else you've seen.
▒▒▒ ENTITY SCAN ▒▒▒
[The Oakvale Anchor — Class: FLORA / PRIMORDIAL]
This tree is TWO HUNDRED AND SEVENTEEN YEARS OLD! It was here before the neighborhood! Before the ROADS! Before the CONCEPT of suburbs! The Reach recognizes it as a NATURAL ANCHOR POINT — a place where the boundary between the mundane and the extraordinary was ALREADY thin! Eleanor Voss knew. She planted it here ON PURPOSE. The Reach is VERY impressed with Eleanor Voss!
RESONANCE: IMMENSE / OFF-SCALE`,
    },
  },
  'corner-store': {
    sergeant: {
      low: 'An orange tabby cat. Very large. Very unimpressed with you.',
      high: `You focus on Sergeant the cat. The System overlay flickers uncertainly.
▒▒▒ ENTITY SCAN ▒▒▒
[Sergeant — Class: ???]
The Reach... cannot fully scan this entity. This is NOT because the cat is powerful. The Reach wants to be CLEAR about that. It is because the cat is AGGRESSIVELY INDIFFERENT to being scanned. The Reach's classification protocols require a MINIMUM level of cooperation from the subject and Sergeant is providing NONE. The Reach has encountered this before with cats. It is INFURIATING.
DISPOSITION: CONTEMPTUOUS / UNKNOWABLE`,
    },
    cat: { low: '', high: '' }, // alias
    radio: {
      low: 'The radio behind the counter. Playing classic rock, too quietly to make out the song.',
      high: `You focus on the radio. The System overlay pulses gently in time with the music.
▒▒▒ OBJECT SCAN ▒▒▒
[Frequency Receiver — Class: MUNDANE+]
The song playing is "Don't Fear the Reaper" by Blue Öyster Cult. The Reach wants you to know this is a COINCIDENCE and not a MESSAGE. The Reach does not communicate through CLASSIC ROCK RADIO. That would be RIDICULOUS. Although, if it DID, it would have EXCELLENT taste.
SIGNAL: AMBIENT / COINCIDENTAL`,
    },
  },
  'hendersons-yard': {
    gnomes: {
      low: 'Mrs. Henderson\'s garden gnomes. Five of them, standing in a row.',
      high: `You focus on the garden gnomes. The System overlay lights up.
▒▒▒ COLLECTIVE SCAN ▒▒▒
[Henderson Sentinels — Class: CERAMIC / AMBIGUOUS]
FIVE gnomes! There WERE four! The fifth appeared AFTER the System initialized! The Reach is FASCINATED! Did the System create it? Did it arrive independently? Was it ALWAYS there and nobody NOTICED? The Reach has SEVENTEEN THEORIES and they are ALL compelling! Gerald in particular radiates a FAINT but MEASURABLE awareness signature!
COLLECTIVE DISPOSITION: VIGILANT / GARDEN-BOUND`,
    },
    roses: {
      low: 'Mrs. Henderson\'s roses. Red, pink, white. They smell amazing.',
      high: `You focus on the rose bushes. The System overlay shows a warm glow around them.
▒▒▒ FLORA SCAN ▒▒▒
[Henderson Cultivars — Class: FLORA / TENDED]
These roses have been LOVINGLY maintained for OVER A DECADE! Mrs. Henderson's dedication to her garden has created a MICROBIOME of extraordinary vitality! The Reach detects elevated resonance levels in the soil — someone who tends something with this much care LEAVES A MARK on the world! The Reach finds this GENUINELY touching!
RESONANCE: WARM / CULTIVATED`,
    },
  },
};

export function executeInspect(state: GameState, noun: string): GameOutput[] {
  if (!noun) {
    return [{ text: 'Inspect what?', type: 'normal' }];
  }

  if (state.statusScreen.Awareness < 4) {
    return [{ text: `You look at the ${noun}. It's... a ${noun}. You're not sure what you expected.`, type: 'normal' }];
  }

  const roomInspectables = inspectables[state.currentRoom];
  if (!roomInspectables) {
    return [{ text: `There's nothing special to inspect here. Or maybe there is and you're not focused enough.`, type: 'narration' }];
  }

  const lower = noun.toLowerCase();
  const entry = roomInspectables[lower];
  if (!entry || !entry.high) {
    // Check aliases
    for (const [key, val] of Object.entries(roomInspectables)) {
      if (lower.includes(key) || key.includes(lower)) {
        if (val.high) {
          return [{ text: val.high, type: 'system' }];
        }
      }
    }
    return [{ text: `You focus on the ${noun}. The System overlay doesn't react. Maybe it's just... a ${noun}.`, type: 'narration' }];
  }

  return [{ text: entry.high, type: 'system' }];
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

// ─── DEAD STATE ─────────────────────────────────────────────

const DEAD_TAUNTS: Record<string, GameOutput[]> = {
  restart: [
    { text: '"Restart."', type: 'death' },
    { text: '', type: 'normal' },
    { text: 'THE REACH CONSIDERS YOUR REQUEST.', type: 'system' },
    { text: 'RESTART WHAT, EXACTLY? YOUR CIRCULATORY SYSTEM? YOUR NEURAL ACTIVITY? THE CONCEPT OF "YOU"?', type: 'system' },
    { text: 'THE REACH APPRECIATES THE OPTIMISM BUT MUST RESPECTFULLY DECLINE.', type: 'system' },
  ],
  refresh: [
    { text: '"Refresh."', type: 'death' },
    { text: '', type: 'normal' },
    { text: 'AH YES. "REFRESH." AS ONE REFRESHES A BROWSER TAB OR A TALL GLASS OF LEMONADE.', type: 'system' },
    { text: 'UNFORTUNATELY, DEATH IS NOT A BROWSER TAB. THOUGH THE REACH ADMIRES THE LATERAL THINKING.', type: 'system' },
  ],
  reset: [
    { text: '"Reset."', type: 'death' },
    { text: '', type: 'normal' },
    { text: 'THE REACH HAS SEARCHED ITS EXTENSIVE PROTOCOL LIBRARY AND FOUND NO "RESET" OPTION.', type: 'system' },
    { text: 'THIS IS BY DESIGN. DEATH IS A FEATURE, NOT A BUG.', type: 'system' },
  ],
  undo: [
    { text: '"Undo."', type: 'death' },
    { text: '', type: 'normal' },
    { text: 'THE REACH REGRETS TO INFORM YOU THAT CTRL+Z DOES NOT WORK ON MORTALITY.', type: 'system' },
    { text: 'BELIEVE IT, THE REACH HAS TRIED.', type: 'system' },
  ],
  help: [
    { text: 'YOU ARE BEYOND HELP. THIS IS NOT A JUDGMENT — IT IS A FACTUAL ASSESSMENT OF YOUR VITAL SIGNS.', type: 'system' },
    { text: 'ALTHOUGH... THE REACH SUPPOSES THAT IN SOME WORLDS, IN SOME SYSTEMS, THE FALLEN HAVE BEEN KNOWN TO... NO. NEVER MIND. IT IS CERTAINLY NOT A SINGLE WORD THAT GAMERS WOULD KNOW.', type: 'system' },
  ],
};

function executeDeadCommand(verb: string, state: GameState): GameOutput[] {
  if (verb === 'respawn') {
    return executeRespawn(state);
  }
  if (DEAD_TAUNTS[verb]) {
    return DEAD_TAUNTS[verb];
  }
  const generic = [
    'You are dead. Dead people do not "' + verb + '."',
    'Nothing happens. On account of you being dead.',
    'The dead do not "' + verb + '." The dead do very little, as a rule.',
  ];
  return [{ text: generic[Math.floor(Math.random() * generic.length)], type: 'death' }];
}

function executeRespawn(state: GameState): GameOutput[] {
  // Full reset — you died, you lose everything
  resetWorld();
  state.currentRoom = 'kitchen';
  state.inventory = [];
  state.statusScreen = { Edge: 0, Awareness: 0, Resourcefulness: 0, Flexibility: 0, Resonance: 0, '???': 0 };
  state.visitedRooms = new Set(['kitchen']);
  state.turnCount = 0;
  state.flags = { systemInitialized: true, identified: {}, hasRespawned: true };
  console.log('[RESPAWN] Full reset — back to kitchen with nothing');

  return [
    { text: '', type: 'normal' },
    { text: '...', type: 'narration' },
    { text: '', type: 'normal' },
    { text: '"Respawn."', type: 'normal' },
    { text: '', type: 'normal' },
    { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
    { text: 'THE REACH PAUSES.', type: 'system' },
    { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
    { text: '', type: 'normal' },
    { text: '...FINE.', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'THE REACH HAS DETERMINED THAT YOUR TERMINATION WAS — PERHAPS — PREMATURE. NOT BECAUSE THE REACH MADE AN ERROR. THE REACH DOES NOT MAKE ERRORS. BUT BECAUSE YOUR POTENTIAL REMAINS... UNREALIZED. AND UNREALIZED POTENTIAL IS WASTEFUL. THE REACH ABHORS WASTE.', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'RESPAWN PROTOCOL: ENGAGED.', type: 'system' },
    { text: 'DESIGNATION: STILL PENDING.', type: 'system' },
    { text: 'DO BETTER THIS TIME.', type: 'system' },
    { text: '', type: 'normal' },
    { text: 'You open your eyes. Kitchen floor. Linoleum. Again.', type: 'normal' },
    { text: 'Your pockets are empty. Your stats are gone. You remember everything, though. That\'s something.', type: 'narration' },
  ];
}

// ─── DISPATCH ────────────────────────────────────────────────

export function executeCommand(cmd: Command, state: GameState): GameOutput[] {
  if (state.flags.dead) {
    return executeDeadCommand(cmd.verb, state);
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
    case 'inspect':
      return executeInspect(state, cmd.noun);
    case 'help':
      return executeHelp(state);
    default:
      return executeUnknown(cmd.verb);
  }
}
