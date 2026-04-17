import { Room, Item, GameOutput, GameState } from './types.js';

const rooms: Map<string, Room> = new Map();
const items: Map<string, Item> = new Map();

// Helper: get dynamic description based on awareness
export function getHallwayDescription(state: GameState): string {
  const base = `The hallway you've walked a thousand times. Same oatmeal carpet you picked because it was on sale. Same family photos — you remember hanging each one, arguing about which height looked right. But now... are the people in them looking at something behind you? You turn around. Nothing. You look back. They're just photos again.

Your kitchen is to the west. The living room opens up to the south. The garage door is to the north. At the far end, the front door — your front door — stands shut. You know you should be able to open it. You know how locks work. But something heavy and wordless tells you: not yet. Stairs lead up.`;

  if (state.statusScreen.Awareness >= 3) {
    return base + `\n\nThere's a draft coming from upstairs. Faint, but steady. Most of it feels normal — stale bedroom air, the lavender soap from the bathroom. But there's something else underneath it. Coming from the far end of the upstairs hall. Something that smells like ozone and old pennies. Your skin prickles.`;
  }
  return base;
}

// ─── ROOMS ───────────────────────────────────────────────────

rooms.set('kitchen', {
  id: 'kitchen',
  name: 'Kitchen',
  description: `Your kitchen. You know every stain on this countertop, every ring left by a coffee mug you were too lazy to use a coaster for. The fluorescent light hums its same tired hum. Your coffee maker — the one you keep meaning to descale — sits next to a dish rack with yesterday's bowl still in it. The junk drawer is slightly ajar, the way you always leave it because the track is bent.

Everything looks the same. But the air tastes different. Metallic, almost. And the shadows under the cabinets seem... deeper than they should be.

A doorway leads east into the hallway.`,
  exits: { east: 'hallway', e: 'hallway' },
  items: ['kitchen-knife', 'old-spatula', 'flashlight'],
  firstVisit: true,
});

rooms.set('hallway', {
  id: 'hallway',
  name: 'Hallway',
  description: '', // dynamic — overridden in executeLook via getDescription
  exits: {
    west: 'kitchen', w: 'kitchen',
    south: 'living-room', s: 'living-room',
    north: 'garage', n: 'garage',
    up: 'upstairs-hall', u: 'upstairs-hall',
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('hallway')) return outputs;
    outputs.push({
      text: 'As you step into the hallway, the fluorescent light flickers once. Just once. Probably nothing.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('living-room', {
  id: 'living-room',
  name: 'Living Room',
  description: `Your living room. Your couch, with the dip on the left side where you always sit. Your bookshelf, still holding that novel you swore you'd finish. The indent in the carpet from the coffee table is exactly where you pushed it last movie night.

But the TV is on. You didn't leave it on. It's showing static — not the random snow kind, but something with a pulse to it, a slow rhythm, like breathing. And the couch cushions are warm, like someone was just sitting here.

The hallway is back to the north.`,
  exits: { north: 'hallway', n: 'hallway' },
  items: ['tv-remote', 'weird-coin'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('living-room')) return outputs;
    outputs.push({
      text: 'The TV static shifts as you enter. For just a moment, you could swear you saw a shape in it. A silhouette. Watching.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('garage', {
  id: 'garage',
  name: 'Garage',
  description: `Your garage. The overhead bulb gives everything that amber tint you've been meaning to fix by switching to LED. Your workbench, still scarred from that shelf project that didn't go great. Half-empty paint cans from when you painted the bedroom. A bike you haven't ridden in two years.

It's darker than it should be. The amber light only reaches so far now, like the corners are pushing it back. And the oil stains on the concrete — you've seen them a hundred times, but right now, in this light, they almost look like they're arranged in a pattern. Almost.

The door back to the hallway is to the south.`,
  exits: { south: 'hallway', s: 'hallway' },
  items: ['baseball-bat', 'duct-tape', 'box-of-nails'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('garage')) return outputs;
    outputs.push({
      text: 'The garage light flickers when you enter. The shadows in the corners seem to pull back, just slightly, like they were caught doing something.',
      type: 'narration',
    });
    return outputs;
  },
});

// ─── UPSTAIRS ───────────────────────────────────────────────

rooms.set('upstairs-hall', {
  id: 'upstairs-hall',
  name: 'Upstairs Hallway',
  description: '', // dynamic
  exits: {
    down: 'hallway', d: 'hallway',
    west: 'bedroom', w: 'bedroom',
    east: 'bathroom', e: 'bathroom',
    north: 'study', n: 'study',
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('upstairs-hall')) return outputs;
    outputs.push({
      text: 'The stairs creak in ways you don\'t remember. Each step feels like it takes longer than it should. When you reach the top, you\'re slightly out of breath, though it\'s only twelve stairs. You\'ve counted them before. There are still twelve.',
      type: 'narration',
    });
    return outputs;
  },
});

export function getUpstairsHallDescription(state: GameState): string {
  const base = `The upstairs hallway is shorter than the one below. Three doors. Your bedroom to the west — the door is open, and you can see the edge of your unmade bed. The bathroom to the east — door ajar, the nightlight casting a faint blue glow on the tile. And straight ahead, to the north, the door to your study.`;

  if (state.statusScreen.Awareness >= 3) {
    return base + `\n\nThe study door is closed. The gap beneath it is dark — darker than it should be, as if the darkness on the other side is thicker than ordinary shadow. The ozone smell is stronger here. The hair on your arms stands up. Something behind that door is waiting. You can feel it the way you can feel someone watching you across a crowded room.`;
  }
  return base + `\n\nThe study door is closed.`;
}

rooms.set('bedroom', {
  id: 'bedroom',
  name: 'Bedroom',
  description: `Your bedroom. The sheets are tangled the way you left them this morning. A stack of books on the nightstand, alarm clock blinking 12:00 because you never reset it after the last power outage. The closet door is open — your clothes hang in the same disorganized order you swore you'd fix.

On the shelf inside the closet, behind a shoebox of old photos, there's a small cardboard box you haven't opened in years. You know what's in it.

The upstairs hallway is back to the east.`,
  exits: { east: 'upstairs-hall', e: 'upstairs-hall' },
  items: ['lucky-rock'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('bedroom')) return outputs;
    outputs.push({
      text: 'The bedroom smells like sleep and laundry detergent. Your pillow still has the indent from your head. This morning feels like it was a hundred years ago.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('bathroom', {
  id: 'bathroom',
  name: 'Bathroom',
  description: `Your bathroom. The nightlight casts everything in a blue glow that makes the white tile look like the bottom of a swimming pool. Your toothbrush is in its usual spot. The mirror above the sink is slightly fogged, which is strange — nobody's taken a shower.

A towel hangs on the hook behind the door, still damp from this morning. The medicine cabinet is closed. The shower curtain is pulled shut.

The upstairs hallway is back to the west.`,
  exits: { west: 'upstairs-hall', w: 'upstairs-hall' },
  items: ['mirror-shard'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('bathroom')) return outputs;
    outputs.push({
      text: 'You glance at the mirror as you enter. Your reflection looks back. It blinks a half-second after you do. You decide not to look at it again.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('study', {
  id: 'study',
  name: 'Study',
  description: '', // dynamic — depends on whether you survive entering
  exits: { south: 'upstairs-hall', s: 'upstairs-hall' },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const hasTalisman = state.inventory.includes('lucky-rock');

    if (!hasTalisman) {
      // Death
      state.flags.dead = true;
      return [
        { text: '', type: 'normal' },
        { text: 'You open the study door.', type: 'normal' },
        { text: '', type: 'normal' },
        { text: 'The darkness inside isn\'t darkness. It\'s an absence. An un-place. It reaches for you the moment the door swings wide, and your body understands before your mind does — every nerve fires at once, a full-body scream that starts in your fingertips and converges somewhere behind your eyes.', type: 'death' },
        { text: '', type: 'normal' },
        { text: 'You feel yourself coming apart. Not painfully — worse than that. Gently. Like being unraveled by careful hands. Your edges soften. Your name gets harder to remember. The kitchen, the hallway, the couch with the dip on the left side — they dissolve like sugar in warm water.', type: 'death' },
        { text: '', type: 'normal' },
        { text: 'The last thing you feel is something like an apology.', type: 'death' },
        { text: '', type: 'normal' },
        { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
        { text: 'THE REACH OFFERS ITS SINCEREST CONDOLENCES.', type: 'system' },
        { text: 'YOUR DESIGNATION REMAINS: PENDING.', type: 'system' },
        { text: 'IT WILL ALWAYS REMAIN: PENDING.', type: 'system' },
        { text: '', type: 'normal' },
        { text: 'THE REACH ACKNOWLEDGES THAT IT COULD HAVE BEEN MORE FORTHCOMING.', type: 'system' },
        { text: 'THIS IS AS CLOSE TO REGRET AS THE REACH GETS.', type: 'system' },
        { text: '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒', type: 'system' },
        { text: '', type: 'normal' },
        { text: 'YOU HAVE DIED.', type: 'death' },
        { text: '', type: 'normal' },
        { text: 'The story ends here. Refresh to try again.', type: 'narration' },
      ];
    }

    // Survived with talisman
    state.flags.survivedStudy = true;
    return [
      { text: '', type: 'normal' },
      { text: 'You open the study door. The darkness surges forward.', type: 'normal' },
      { text: '', type: 'normal' },
      { text: 'And then — something in your pocket flares hot. Not burning, but alive. The rock. Your rock. The one you picked up when you were seven, the one that fit perfectly in your palm, the one you carried for a week straight and refused to leave behind when your parents said it was just a rock.', type: 'narration' },
      { text: '', type: 'normal' },
      { text: 'It isn\'t just a rock.', type: 'narration' },
      { text: '', type: 'normal' },
      { text: 'Light pours out of your pocket — not flashlight light, not sunlight, something older and warmer. The darkness recoils like a living thing, hissing, pulling back into the corners of the room. You feel it pass through you — death, actual death, brushing past your skin like someone walking too close in a narrow hallway. Your heart stops for a full beat. Your vision whites out.', type: 'death' },
      { text: '', type: 'normal' },
      { text: 'Then it\'s over. You\'re standing in your study. Your heart is pounding. The rock in your pocket is warm and still. You are alive.', type: 'normal' },
      { text: '', type: 'normal' },
      { text: 'You are very, very alive.', type: 'narration' },
    ];
  },
});

// ─── ITEMS ───────────────────────────────────────────────────

items.set('kitchen-knife', {
  id: 'kitchen-knife',
  name: 'kitchen knife',
  description: 'A standard 8-inch chef\'s knife. The blade is dull from years of abuse against cutting boards and frozen dinners. There\'s a chip near the tip.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Blade of the Morning Meal] — Rarity: COMMON+
BEHOLD! A weapon forged in the FIRES OF DOMESTICITY! Its edge, honed against ten thousand tomatoes, now SINGS with latent fury! The chip near its tip? A BATTLE SCAR, hero — evidence of wars fought across cutting boards stained with the blood of onions! Lesser candidates would overlook this instrument. YOU did not. The Reach is... cautiously impressed.
  +1 Edge
  +1 Resourcefulness
CLASSIFICATION: MELEE / CULINARY`,
  takeable: true,
  effects: { Edge: 1, Resourcefulness: 1 },
  usable: false,
});

items.set('old-spatula', {
  id: 'old-spatula',
  name: 'old spatula',
  description: 'A rubber spatula with a cracked handle. The rubber is yellowed and starting to peel. Someone wrote "MINE" on the handle in sharpie.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[The Claimant's Paddle] — Rarity: COMMON
A BOLD selection! This implement bears the mark "MINE" — a DECLARATION OF DOMINION scrawled by a previous champion who understood that true power begins with CLAIMING what is yours! Ten thousand pancakes have been flipped by this paddle! Ten thousand pots scraped clean! It bends but NEVER breaks — a lesson many warriors learn too late. The Reach admires your eye for the unconventional.
  +1 Flexibility
CLASSIFICATION: TOOL / EXISTENTIAL`,
  takeable: true,
  effects: { Flexibility: 1 },
  usable: false,
});

items.set('flashlight', {
  id: 'flashlight',
  name: 'flashlight',
  description: 'A heavy Maglite flashlight, the kind that doubles as a weapon in a pinch. Found rolling around in the junk drawer among dead batteries and rubber bands. It works, somehow.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Torch of the Domestic Frontier] — Rarity: UNCOMMON
EXCELLENT! A BEACON against the encroaching dark! This is no mere flashlight, champion — this is a CYLINDER OF REVELATION, heavier than reason permits, for it carries not just batteries but PURPOSE! In ages past, heroes quested for enchanted torches. You found yours in a junk drawer. The batteries should be dead. They are not. The Reach does not waste its gifts on the unworthy.
  +1 Awareness
  +1 Edge
CLASSIFICATION: TOOL / LUMINANCE / BLUNT`,
  takeable: true,
  effects: { Awareness: 1, Edge: 1 },
  usable: false,
});

items.set('tv-remote', {
  id: 'tv-remote',
  name: 'TV remote',
  description: 'A universal remote with too many buttons and not enough purpose. The battery cover is held on with tape. Channel Up and Channel Down are worn smooth. The power button doesn\'t seem to do anything — the TV stays on regardless.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[The Arbiter of Frequencies] — Rarity: COMMON
Oh, FASCINATING! A device that once commanded the very STREAMS OF INFORMATION flowing into this dwelling! Its wielder could summon visions of distant lands, tales of war and triumph, and — yes — advertisements for mattresses! But now? NOW it reaches for channels that exist between channels. The power button does nothing because what it connects to now was never meant to be turned OFF. A discerning acquisition, candidate.
  +1 Awareness
CLASSIFICATION: TOOL / ENIGMATIC`,
  takeable: true,
  effects: { Awareness: 1 },
  usable: false,
});

items.set('weird-coin', {
  id: 'weird-coin',
  name: 'weird coin',
  description: 'A coin that was wedged between the couch cushions. It\'s heavier than it should be, and slightly warm to the touch. One side has a face you don\'t recognize. The other side has a symbol that hurts to look at directly, so you mostly don\'t.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Token of the Reach] — Rarity: ???
...
The Reach grows quiet.
This is not an item. This is a COVENANT. It was here before the foundation was poured, before the subdivision was zoned, before the CONCEPT of "neighborhood" was a gleam in a developer's eye. It waited between the cushions because THAT IS WHERE IT NEEDED TO BE. For you. Specifically you. The symbol on its face is not for your eyes — not yet — but the weight of it in your palm? That weight is DESTINY, candidate. Do not flip it. Do not lose it. The Reach will say no more.
  +2 Resonance
  +1 ???
CLASSIFICATION: ARTIFACT / [REDACTED]`,
  takeable: true,
  effects: { Resonance: 2, '???': 1 },
  usable: false,
});

items.set('baseball-bat', {
  id: 'baseball-bat',
  name: 'baseball bat',
  description: 'An aluminum baseball bat leaning against the workbench. It has a dent near the sweet spot and someone wrapped the grip in electrical tape. A faded Little League sticker clings to the barrel.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Louisville Adjudicator] — Rarity: COMMON+
YES! NOW we're TALKING! An instrument of AMERICAN CONFLICT RESOLUTION! Aluminum construction provides DEVASTATING swing velocity! That dent? That's not damage — that's a TROPHY from a previous encounter with something that LOST! The Little League sticker whispers of a simpler time, when the only battles were for second base. Those days are OVER, champion. The Reach APPROVES of this selection with considerable enthusiasm.
  +2 Edge
CLASSIFICATION: MELEE / BLUNT / NOSTALGIC`,
  takeable: true,
  effects: { Edge: 2 },
  usable: false,
});

items.set('duct-tape', {
  id: 'duct-tape',
  name: 'duct tape',
  description: 'A half-used roll of silver duct tape. The universal fix for everything that isn\'t actually broken and most things that are.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[The Silver Binding] — Rarity: COMMON
MAGNIFICENT in its humility! In EVERY world the Reach has touched — and it has touched MANY — there exists a substance that holds reality together when all other bonds fail. In some worlds it is dragon sinew. In others, crystallized starlight. In THIS world? It is silver, adhesive, and available at any hardware store for $4.99. Do NOT underestimate it, candidate. CIVILIZATIONS have been built on less. The Reach has seen it.
  +1 Resourcefulness
  +1 Flexibility
CLASSIFICATION: MATERIAL / ADHESIVE / PHILOSOPHICAL`,
  takeable: true,
  effects: { Resourcefulness: 1, Flexibility: 1 },
  usable: false,
});

items.set('box-of-nails', {
  id: 'box-of-nails',
  name: 'box of nails',
  description: 'A small cardboard box of 2-inch common nails. Most of them are still straight. The box says "100 count" but there are clearly fewer than that. Someone\'s been using them.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Points of Commitment] — Rarity: COMMON
Each nail — EACH INDIVIDUAL NAIL — is a small iron oath! A declaration that THIS board shall be joined to THAT board and NEITHER SHALL MOVE AGAIN! There are fewer than the box promises. The Reach finds this deeply symbolic but will not elaborate because the metaphor is, frankly, too beautiful to explain. An understated but STRATEGICALLY SOUND acquisition!
  +1 Resourcefulness
CLASSIFICATION: MATERIAL / FASTENER / METAPHORICAL`,
  takeable: true,
  effects: { Resourcefulness: 1 },
  usable: false,
});

// ─── UPSTAIRS ITEMS ─────────────────────────────────────────

items.set('lucky-rock', {
  id: 'lucky-rock',
  name: 'smooth rock',
  description: 'A smooth, dark stone about the size of a plum. You found it in the creek behind your grandmother\'s house when you were seven. You carried it in your pocket for a week. When your parents tried to make you leave it behind, you cried until they gave up. It\'s been on that shelf ever since, in a box with your old baseball cards and a broken watch. It\'s warm to the touch. It has always been warm to the touch. You never questioned that.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[    ] — Rarity: —
...
The Reach is silent for a long time.
...
The Reach does not recognize this item. This is... unprecedented. This stone predates the Reach's knowledge of you. It predates the Reach's knowledge of THIS WORLD. It is warm in a way that has nothing to do with temperature. The Reach cannot classify it. The Reach cannot quantify it.
The Reach is, for the first time, uncertain.
  +???
CLASSIFICATION: UNKNOWN / PERSONAL / [UNREADABLE]`,
  takeable: true,
  effects: { Resonance: 3 },
  usable: false,
});

items.set('mirror-shard', {
  id: 'mirror-shard',
  name: 'mirror shard',
  description: 'A triangular piece of glass from the corner of the medicine cabinet mirror. You don\'t remember it being broken. The edge is sharp but the surface is perfectly smooth. When you look into it, your reflection seems slightly delayed. Not much. Just enough to notice.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Fragment of Delayed Truth] — Rarity: UNCOMMON
A shard of reflective surface that shows what WAS rather than what IS! A fraction of a second — barely perceptible — but in that fraction, WORLDS diverge! The Reach has seen mirrors that show the future. This one shows the past. Both are useful. Both are dangerous. Handle with care, candidate. The edge is sharp in more ways than one.
  +2 Awareness
CLASSIFICATION: TOOL / REFLECTIVE / TEMPORAL`,
  takeable: true,
  effects: { Awareness: 2 },
  usable: false,
});

// ─── ACCESSORS ───────────────────────────────────────────────

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function getItem(id: string): Item | undefined {
  return items.get(id);
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

export function getAllItems(): Map<string, Item> {
  return items;
}
