import { Room, Item, GameOutput, GameState } from './types.js';

const rooms: Map<string, Room> = new Map();
const items: Map<string, Item> = new Map();

// Helper: get dynamic description based on awareness
export function getHallwayDescription(state: GameState): string {
  let exits = 'Your kitchen is to the west. The living room opens up to the south. The garage door is to the north.';

  if (state.flags.survivedStudy) {
    exits += ' The front door is to the east — and for the first time since you woke up, you feel like you could actually open it.';
  } else {
    exits += ' At the far end, the front door.';
  }
  exits += ' Stairs lead up.';

  const base = `The hallway you've walked a thousand times. Same oatmeal carpet you picked because it was on sale. Same family photos — you remember hanging each one, arguing about which height looked right. Everything looks completely normal. It IS completely normal. Except for the translucent status screen hovering at the edge of your vision.

${exits}`;

  if (state.statusScreen.Awareness >= 3) {
    return base + `\n\nYou notice a faint smell drifting down from upstairs. Mostly normal — stale bedroom air, the lavender soap from the bathroom. But there's something else mixed in. Ozone, maybe? Like the air after a thunderstorm. Weird.`;
  }
  return base;
}

// ─── ROOMS ───────────────────────────────────────────────────

rooms.set('kitchen', {
  id: 'kitchen',
  name: 'Kitchen',
  description: `Your kitchen. You know every stain on this countertop, every ring left by a coffee mug you were too lazy to use a coaster for. The fluorescent light hums its same tired hum. Your coffee maker — the one you keep meaning to descale — sits next to a dish rack with yesterday's bowl still in it. The junk drawer is slightly ajar, the way you always leave it because the track is bent.

Everything looks exactly the same as it did this morning. Which makes the floating status screen even weirder.

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
    east: 'front-yard', e: 'front-yard',
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('hallway')) return outputs;
    outputs.push({
      text: 'The hallway looks exactly the way it always does. Somehow that makes it worse. You keep expecting something to be different.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('living-room', {
  id: 'living-room',
  name: 'Living Room',
  description: `Your living room. Your couch, with the dip on the left side where you always sit. Your bookshelf, still holding that novel you swore you'd finish. The indent in the carpet from the coffee table is exactly where you pushed it last movie night.

The TV is on, showing static. You don't remember leaving it on, but you also don't remember a lot about this morning. The remote is on the arm of the couch.

The hallway is back to the north.`,
  exits: { north: 'hallway', n: 'hallway' },
  items: ['tv-remote', 'weird-coin'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('living-room')) return outputs;
    outputs.push({
      text: 'You could swear the TV wasn\'t on when you left for work this morning. Then again, you were on the kitchen floor a minute ago, so who knows.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('garage', {
  id: 'garage',
  name: 'Garage',
  description: `Your garage. The overhead bulb gives everything that amber tint you've been meaning to fix by switching to LED. Your workbench, still scarred from that shelf project that didn't go great. Half-empty paint cans from when you painted the bedroom. A bike you haven't ridden in two years.

Just your garage. Completely normal. You're starting to wonder if you hallucinated the whole status screen thing.

The door back to the hallway is to the south.`,
  exits: { south: 'hallway', s: 'hallway' },
  items: ['baseball-bat', 'duct-tape', 'box-of-nails'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('garage')) return outputs;
    outputs.push({
      text: 'Smells like oil and sawdust. Same as always.',
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
      text: 'Twelve stairs, same as always. The carpet runner is still coming loose on the third step. You keep meaning to fix that.',
      type: 'narration',
    });
    return outputs;
  },
});

export function getUpstairsHallDescription(state: GameState): string {
  const base = `The upstairs hallway is shorter than the one below. Three doors. Your bedroom to the west — the door is open, and you can see the edge of your unmade bed. The bathroom to the east — door ajar, the nightlight casting a faint blue glow on the tile. And straight ahead, to the north, the door to your study.`;

  if (state.statusScreen.Awareness >= 3) {
    return base + `\n\nThe study door is closed. You notice a faint smell — ozone, like after a lightning strike. It's coming from under the door. And there's a feeling you can't quite name. Not fear, exactly. More like the feeling right before you open a test you're not sure you studied for.`;
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
  description: `Your bathroom. The nightlight casts everything in a blue glow that makes the white tile look like the bottom of a swimming pool. Your toothbrush is in its usual spot. The mirror above the sink needs cleaning — you can see the toothpaste flecks from this morning.

A towel hangs on the hook behind the door, still damp from this morning. The medicine cabinet is closed. The shower curtain is pulled shut.

The upstairs hallway is back to the west.`,
  exits: { west: 'upstairs-hall', w: 'upstairs-hall' },
  items: ['mirror-shard'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('bathroom')) return outputs;
    outputs.push({
      text: 'You catch your reflection in the mirror. You look tired. Not surprising, given you just woke up on your kitchen floor.',
      type: 'narration',
    });
    return outputs;
  },
});

export function getStudyDescription(state: GameState): string {
  if (!state.flags.survivedStudy) {
    return 'You shouldn\'t be here.';
  }
  return `Your study. Same IKEA desk, same office chair with the wonky wheel, same shelf of books you half-read in college. Your old monitor is on — you don't remember leaving it on either, but at this point you're getting used to that.

The screen is showing something. Not your desktop, not a screensaver. A map. Your neighborhood, seen from above, drawn in the same teal lines as the System overlay. Your house is at the center, pulsing gently. Other markers dot the streets — some steady, some flickering. You have no idea what they mean. But they're clearly meant for you.

On the desk next to the keyboard, there's something that wasn't there this morning.

The upstairs hallway is back to the south.`;
}

rooms.set('study', {
  id: 'study',
  name: 'Study',
  description: '', // dynamic
  exits: { south: 'upstairs-hall', s: 'upstairs-hall' },
  items: ['system-compass'],
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

// ─── OUTSIDE ────────────────────────────────────────────────

rooms.set('front-yard', {
  id: 'front-yard',
  name: 'Front Yard',
  description: `Your front yard. The lawn needs mowing — it needed mowing before all this, so that's not new. Your mailbox is at the curb, flag down. The welcome mat says "GO AWAY" in cheerful letters — a gift from your sister you thought was funny at the time.

The sky is blue. Regular blue. The sun is out. Birds are singing. It's a completely normal day in a completely normal neighborhood. Except for the translucent System overlay, which now seems to extend... everywhere. Not just in your house. Everywhere you look.

Your front door is to the west. The street stretches north and south.`,
  exits: {
    west: 'hallway', w: 'hallway',
    north: 'street-north', n: 'street-north',
    south: 'street-south', s: 'street-south',
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('front-yard')) return outputs;
    outputs.push({
      text: 'You step outside. The sunlight is warm on your face. A lawn mower hums somewhere a few streets over. A dog barks. It\'s so aggressively normal that you almost laugh.',
      type: 'narration',
    });
    outputs.push({ text: '', type: 'normal' });
    outputs.push({
      text: '▒▒▒ EXTERIOR PROTOCOLS ENGAGED ▒▒▒',
      type: 'system',
    });
    outputs.push({
      text: 'CONGRATULATIONS, CANDIDATE! You have LEFT THE TUTORIAL ZONE! The Reach is THRILLED to inform you that the ENTIRE WORLD is now your arena! Every mailbox a MYSTERY! Every lawn a POTENTIAL BATTLEFIELD! The Reach can barely contain its excitement!',
      type: 'system',
    });
    outputs.push({
      text: 'AREA UNLOCKED: THE NEIGHBORHOOD.',
      type: 'system',
    });
    return outputs;
  },
});

rooms.set('street-north', {
  id: 'street-north',
  name: 'Maple Street (North)',
  description: `Maple Street, looking north. Your street. The asphalt has that one crack running down the middle that the city never fixed. To the east is the Hendersons' place — white picket fence, garden gnomes, the whole thing. Their car is in the driveway but you don't see anyone around.

Further north, the street curves toward the park. You can see the big oak tree from here — the one the kids climb, the one that's been there longer than any of the houses.

Your front yard is back to the south. The Hendersons' yard is to the east. The park is further north.`,
  exits: {
    south: 'front-yard', s: 'front-yard',
    east: 'hendersons-yard', e: 'hendersons-yard',
    north: 'park', n: 'park',
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('street-north')) return outputs;
    outputs.push({
      text: 'The street looks the same as it did yesterday. Same parked cars. Same cracked sidewalk. Same everything. You keep looking for something to be different and it just... isn\'t.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('street-south', {
  id: 'street-south',
  name: 'Maple Street (South)',
  description: `Maple Street, looking south. The Kowalskis' place is on the left — they're on vacation, you think. Mail is piling up in their box. On the right is the empty lot where old Mr. Chen's house used to be before they tore it down last year. Weeds and gravel now. Kids ride bikes through it sometimes.

Further south, the street dead-ends at the corner store — Raj's Quik-Mart, the one with the bell on the door and the cat that sits on the counter.

Your front yard is back to the north. The corner store is to the south.`,
  exits: {
    north: 'front-yard', n: 'front-yard',
    south: 'corner-store', s: 'corner-store',
  },
  items: ['sturdy-stick'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('street-south')) return outputs;
    outputs.push({
      text: 'A sprinkler is going in someone\'s yard. The rhythmic tch-tch-tch-tch is the most normal sound you\'ve heard all day.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('hendersons-yard', {
  id: 'hendersons-yard',
  name: 'The Hendersons\' Yard',
  description: `The Hendersons' front yard. Immaculate, as always. Mrs. Henderson's rose bushes are in full bloom — red, pink, white. The garden gnomes stand in their usual formation near the walkway. There are five of them. You could swear there used to be four.

The Hendersons' front door is closed. No lights on inside.

The street is back to the west.`,
  exits: { west: 'street-north', w: 'street-north' },
  items: ['garden-gnome'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('hendersons-yard')) return outputs;
    outputs.push({
      text: 'The roses smell incredible. You\'ve walked past this yard a hundred times and never noticed how strong the smell is. Maybe you just never paid attention before.',
      type: 'narration',
    });
    return outputs;
  },
});

rooms.set('park', {
  id: 'park',
  name: 'Oakvale Park',
  description: `The neighborhood park. A swing set, a rusted slide, a bench with a memorial plaque you've never bothered to read. The big oak tree dominates the center — massive trunk, branches spreading wide enough to shade half the park.

The grass is green and freshly cut. Someone's left a soccer ball near the swings. Everything looks perfectly, aggressively normal.

Except for the thing sitting at the base of the oak tree.

It's about the size of a large dog, but it's not a dog. It's... you're not sure what it is. It looks like someone described a lizard to a person who'd never seen one, and that person sculpted it out of wet clay and forgot to smooth it out. It's watching you with calm, amber eyes. It doesn't seem hostile. It seems curious.

The street is back to the south.`,
  exits: { south: 'street-north', s: 'street-north' },
  items: ['memorial-plaque-rubbing'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('park')) return outputs;
    outputs.push({
      text: 'The oak tree is even bigger than you remembered. It must be two hundred years old. The System overlay shimmers faintly around its trunk, like heat haze.',
      type: 'narration',
    });
    outputs.push({ text: '', type: 'normal' });
    outputs.push({
      text: '▒▒▒ ENTITY DETECTED ▒▒▒',
      type: 'system',
    });
    outputs.push({
      text: 'The Reach has IDENTIFIED a previously uncatalogued LIFE FORM in your vicinity! REMAIN CALM! This is EXTREMELY exciting! Classification is PENDING but initial readings suggest it is NOT IMMEDIATELY LETHAL! The Reach rates your chances of survival at a VERY ENCOURAGING 73%!',
      type: 'system',
    });
    return outputs;
  },
});

rooms.set('corner-store', {
  id: 'corner-store',
  name: 'Raj\'s Quik-Mart',
  description: `Raj's Quik-Mart. The bell dings when you push the door open. Fluorescent lights, linoleum floor, aisles of snacks and necessities. The cat — an enormous orange tabby named Sergeant — is on the counter, watching you with the same expression he always has: vague contempt.

Raj isn't here. The store is empty. But the lights are on, the Open sign is lit, and the coffee machine is gurgling away like it's a normal Tuesday. The radio behind the counter is playing classic rock, a little too quietly to make out the song.

The street is back to the north.`,
  exits: { north: 'street-south', n: 'street-south' },
  items: ['energy-drink', 'bag-of-jerky'],
  firstVisit: true,
  onEnter: (state) => {
    const outputs: GameOutput[] = [];
    if (state.visitedRooms.has('corner-store')) return outputs;
    outputs.push({
      text: 'The bell on the door dings. Sergeant the cat looks up, decides you\'re not interesting, and goes back to sleep. Some things never change.',
      type: 'narration',
    });
    return outputs;
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
  description: 'A smooth, dark stone about the size of a plum. You found it in the creek behind your grandmother\'s house when you were seven. You carried it in your pocket for a week. When your parents tried to make you leave it behind, you cried until they gave up. It\'s been on that shelf ever since, in a box with your old baseball cards and a broken watch. It\'s warm to the touch. It has always been warm to the touch, even in winter, even when the house was freezing. You just always figured rocks were like that.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[    ] — Rarity: ∞
OH. OH YES. NOW THIS — THIS IS SOMETHING! The Reach has catalogued TEN BILLION artifacts across COUNTLESS worlds and THIS — a rock from a creek — THIS is the one that makes the whole system sit up and PAY ATTENTION! Classification? BEYOND CLASSIFICATION! Rarity? THE SCALE DOESN'T GO HIGH ENOUGH! This stone has been waiting on that shelf for YEARS, candidate, tucked behind baseball cards like it was NOTHING, and the whole time it was — it was —
The Reach STRONGLY RECOMMENDS you keep this on your person AT ALL TIMES. For reasons. EXCELLENT reasons. The BEST reasons. Or maybe not. No further questions.
  +??? +??? +???
CLASSIFICATION: ██████████ / ██████████`,
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

// ─── STUDY ITEMS ────────────────────────────────────────────

items.set('system-compass', {
  id: 'system-compass',
  name: 'system compass',
  description: 'It looks like a compass, but it\'s not made of anything you can identify. Translucent, like the status screen, but solid enough to hold. The needle doesn\'t point north. It spins slowly, then stops, pointing... somewhere. It changes when you move.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Waypoint Resonator] — Rarity: RARE
NOW we are getting somewhere! LITERALLY! This device — and the Reach uses the word "device" with MAXIMUM respect — is a NAVIGATIONAL INSTRUMENT of the HIGHEST ORDER! It points toward things of INTEREST! Things of VALUE! Things that want to be FOUND! The Reach PERSONALLY calibrated this unit and is QUITE proud of the results! Follow the needle, candidate! ADVENTURE AWAITS!
  +2 Awareness
  +1 Resonance
CLASSIFICATION: TOOL / NAVIGATIONAL / SYSTEM-LINKED`,
  takeable: true,
  effects: { Awareness: 2, Resonance: 1 },
  usable: false,
});

// ─── OUTSIDE ITEMS ──────────────────────────────────────────

items.set('sturdy-stick', {
  id: 'sturdy-stick',
  name: 'sturdy stick',
  description: 'A thick branch that fell from one of the street trees. About three feet long, solid oak, with a satisfying heft to it. The kind of stick you would have been thrilled to find when you were ten.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Bough of the Street Oak] — Rarity: COMMON
A WEAPON plucked from the VERY BODY of a noble tree! Oak — the wood of KINGS and SHIP BUILDERS and people who take things SERIOUSLY! This branch fell of its own accord, which means — according to Reach doctrine — it CHOSE you! Or it was windy. Either way, EXCELLENT reach and solid swing weight!
  +1 Edge
  +1 Flexibility
CLASSIFICATION: MELEE / BLUNT / ARBOREAL`,
  takeable: true,
  effects: { Edge: 1, Flexibility: 1 },
  usable: false,
});

items.set('garden-gnome', {
  id: 'garden-gnome',
  name: 'garden gnome',
  description: 'One of Mrs. Henderson\'s garden gnomes. This one is standing slightly apart from the others, near the edge of the yard, facing your direction. It\'s wearing a red hat and holding a tiny fishing rod. Ceramic, about a foot tall. Heavy for its size. There\'s something written on the bottom in Sharpie: "Gerald."',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Gerald, the Vigilant] — Rarity: UNCOMMON
The Reach has OPINIONS about this one! Gerald has been standing in this yard for ELEVEN YEARS and in that time has witnessed EVERYTHING that has occurred on Maple Street! EVERYTHING! His ceramic eyes see all! His tiny fishing rod catches more than fish — it catches SECRETS! The Reach is not saying Gerald is alive. The Reach is not saying Gerald is NOT alive. The Reach DECLINES TO COMMENT.
  +2 Awareness
CLASSIFICATION: SENTINEL / CERAMIC / AMBIGUOUS`,
  takeable: true,
  effects: { Awareness: 2 },
  usable: false,
});

items.set('energy-drink', {
  id: 'energy-drink',
  name: 'energy drink',
  description: 'A can of "VOLT SURGE — MAXIMUM ENERGY" from the cooler at Raj\'s. The can is ice cold and the ingredients list includes something called "taurine complex" which sounds made up. But you could use the boost.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Elixir of Suburban Vitality] — Rarity: COMMON
BEHOLD! A POTION brewed in the GREAT ALCHEMICAL FACTORIES of the modern age! Its ingredients — caffeine, sugar, something called "taurine" that the Reach ASSURES you comes from a very reputable source — combine to produce a SURGE of temporary vigor! Available at fine convenience stores everywhere for $3.49! The Reach considers this a BARGAIN!
  +1 Edge
  +1 Resourcefulness
CLASSIFICATION: CONSUMABLE / ENERGETIC / CARBONATED`,
  takeable: true,
  effects: { Edge: 1, Resourcefulness: 1 },
  usable: false,
});

items.set('bag-of-jerky', {
  id: 'bag-of-jerky',
  name: 'bag of jerky',
  description: 'A bag of teriyaki beef jerky from behind the counter. Raj keeps the good stuff back there. It\'s the expensive kind — small batch, actually tastes like food. You feel a little guilty taking it without paying, but Raj isn\'t here and the world might be ending. Or beginning. Hard to tell.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Provisions of the Absent Merchant] — Rarity: COMMON
SUSTENANCE! Every great adventurer needs PROVISIONS and these dried meat strips — teriyaki-flavored, small-batch, artisanally preserved — are EXACTLY the kind of rations that fuel LEGENDARY JOURNEYS! The Reach notes that you did not pay for these. The Reach does not judge. The Reach understands that sometimes DESTINY requires a five-finger discount.
  +1 Resourcefulness
  +1 Flexibility
CLASSIFICATION: CONSUMABLE / SUSTENANCE / ETHICALLY GRAY`,
  takeable: true,
  effects: { Resourcefulness: 1, Flexibility: 1 },
  usable: false,
});

items.set('memorial-plaque-rubbing', {
  id: 'memorial-plaque-rubbing',
  name: 'plaque rubbing',
  description: 'You don\'t have paper or charcoal, but when you touch the plaque on the park bench, the text seems to imprint itself on your hand for a moment before fading. It read: "In memory of Eleanor Voss, who planted the oak and never left its shade. 1847-1932." That tree is older than you thought.',
  systemDescription: `▒▒▒ ITEM ACQUIRED ▒▒▒
[Echo of Eleanor Voss] — Rarity: UNCOMMON
FASCINATING! The Reach has accessed its records and — oh my. OH MY! Eleanor Voss! The Reach KNOWS that name! Or rather, the Reach knows the ECHO of that name, reverberating through the substrate of this neighborhood like a bell that was struck a hundred and seventy-four years ago and NEVER STOPPED RINGING! This plaque is a CONDUIT! A TINY DOOR! The Reach is being DELIBERATELY VAGUE because the truth would OVERWHELM you at this stage!
  +2 Resonance
  +1 ???
CLASSIFICATION: ARTIFACT / MEMORIAL / RESONANT`,
  takeable: true,
  effects: { Resonance: 2, '???': 1 },
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

// Store original room items for respawn reset
const originalRoomItems: Record<string, string[]> = {};
for (const [id, room] of rooms) {
  originalRoomItems[id] = [...room.items];
}

export function resetWorld(): void {
  for (const [id, room] of rooms) {
    room.items = [...(originalRoomItems[id] || [])];
    room.firstVisit = true;
  }
}
