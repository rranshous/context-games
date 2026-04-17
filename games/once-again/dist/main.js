// src/ui/renderer.ts
var outputEl = document.getElementById("output");
var statusInfoEl = document.getElementById("status-info");
function appendOutput(outputs) {
  for (const output of outputs) {
    const line = document.createElement("div");
    if (output.text === "") {
      line.className = "output-break";
    } else {
      line.className = `output-line ${output.type}`;
      line.textContent = output.text;
    }
    outputEl.appendChild(line);
  }
  scrollToBottom();
}
function appendEcho(text) {
  const line = document.createElement("div");
  line.className = "output-line echo";
  line.textContent = `> ${text}`;
  outputEl.appendChild(line);
  const gap = document.createElement("div");
  gap.style.height = "4px";
  outputEl.appendChild(gap);
  scrollToBottom();
}
function appendBreak() {
  const br = document.createElement("div");
  br.className = "output-break";
  outputEl.appendChild(br);
}
function updateStatusBar(text) {
  statusInfoEl.textContent = text;
}
function scrollToBottom() {
  outputEl.scrollTop = outputEl.scrollHeight;
}
function appendOutputSequence(outputs, delayMs = 400) {
  return new Promise((resolve) => {
    let i = 0;
    function next() {
      if (i >= outputs.length) {
        resolve();
        return;
      }
      appendOutput([outputs[i]]);
      i++;
      setTimeout(next, delayMs);
    }
    next();
  });
}

// src/parser/parser.ts
var DIRECTION_ALIASES = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  up: "up",
  down: "down",
  u: "up",
  d: "down"
};
var VERB_ALIASES = {
  l: "look",
  look: "look",
  i: "inventory",
  inv: "inventory",
  inventory: "inventory",
  get: "take",
  take: "take",
  grab: "take",
  pick: "take",
  x: "examine",
  examine: "examine",
  inspect: "examine",
  study: "examine",
  drop: "drop",
  go: "go",
  walk: "go",
  move: "go",
  status: "status",
  stats: "status",
  help: "help",
  "?": "help",
  use: "use",
  quit: "quit",
  q: "quit"
};
function parseInput(input) {
  const trimmed = input.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const first = parts[0] || "";
  const rest = parts.slice(1).join(" ");
  if (DIRECTION_ALIASES[first] && parts.length === 1) {
    return {
      verb: "go",
      noun: DIRECTION_ALIASES[first],
      fullInput: trimmed
    };
  }
  if (first === "pick" && parts[1] === "up") {
    return {
      verb: "take",
      noun: parts.slice(2).join(" "),
      fullInput: trimmed
    };
  }
  const verb = VERB_ALIASES[first] || first;
  let noun = rest;
  if (verb === "go" && DIRECTION_ALIASES[rest]) {
    noun = DIRECTION_ALIASES[rest];
  }
  return { verb, noun, fullInput: trimmed };
}

// src/engine/world.ts
var rooms = /* @__PURE__ */ new Map();
var items = /* @__PURE__ */ new Map();
function getHallwayDescription(state) {
  const base = `The hallway you've walked a thousand times. Same oatmeal carpet you picked because it was on sale. Same family photos \u2014 you remember hanging each one, arguing about which height looked right. But now... are the people in them looking at something behind you? You turn around. Nothing. You look back. They're just photos again.

Your kitchen is to the west. The living room opens up to the south. The garage door is to the north. At the far end, the front door \u2014 your front door \u2014 stands shut. You know you should be able to open it. You know how locks work. But something heavy and wordless tells you: not yet. Stairs lead up.`;
  if (state.statusScreen.Awareness >= 3) {
    return base + `

There's a draft coming from upstairs. Faint, but steady. Most of it feels normal \u2014 stale bedroom air, the lavender soap from the bathroom. But there's something else underneath it. Coming from the far end of the upstairs hall. Something that smells like ozone and old pennies. Your skin prickles.`;
  }
  return base;
}
rooms.set("kitchen", {
  id: "kitchen",
  name: "Kitchen",
  description: `Your kitchen. You know every stain on this countertop, every ring left by a coffee mug you were too lazy to use a coaster for. The fluorescent light hums its same tired hum. Your coffee maker \u2014 the one you keep meaning to descale \u2014 sits next to a dish rack with yesterday's bowl still in it. The junk drawer is slightly ajar, the way you always leave it because the track is bent.

Everything looks the same. But the air tastes different. Metallic, almost. And the shadows under the cabinets seem... deeper than they should be.

A doorway leads east into the hallway.`,
  exits: { east: "hallway", e: "hallway" },
  items: ["kitchen-knife", "old-spatula", "flashlight"],
  firstVisit: true
});
rooms.set("hallway", {
  id: "hallway",
  name: "Hallway",
  description: "",
  // dynamic — overridden in executeLook via getDescription
  exits: {
    west: "kitchen",
    w: "kitchen",
    south: "living-room",
    s: "living-room",
    north: "garage",
    n: "garage",
    up: "upstairs-hall",
    u: "upstairs-hall"
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("hallway")) return outputs;
    outputs.push({
      text: "As you step into the hallway, the fluorescent light flickers once. Just once. Probably nothing.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("living-room", {
  id: "living-room",
  name: "Living Room",
  description: `Your living room. Your couch, with the dip on the left side where you always sit. Your bookshelf, still holding that novel you swore you'd finish. The indent in the carpet from the coffee table is exactly where you pushed it last movie night.

But the TV is on. You didn't leave it on. It's showing static \u2014 not the random snow kind, but something with a pulse to it, a slow rhythm, like breathing. And the couch cushions are warm, like someone was just sitting here.

The hallway is back to the north.`,
  exits: { north: "hallway", n: "hallway" },
  items: ["tv-remote", "weird-coin"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("living-room")) return outputs;
    outputs.push({
      text: "The TV static shifts as you enter. For just a moment, you could swear you saw a shape in it. A silhouette. Watching.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("garage", {
  id: "garage",
  name: "Garage",
  description: `Your garage. The overhead bulb gives everything that amber tint you've been meaning to fix by switching to LED. Your workbench, still scarred from that shelf project that didn't go great. Half-empty paint cans from when you painted the bedroom. A bike you haven't ridden in two years.

It's darker than it should be. The amber light only reaches so far now, like the corners are pushing it back. And the oil stains on the concrete \u2014 you've seen them a hundred times, but right now, in this light, they almost look like they're arranged in a pattern. Almost.

The door back to the hallway is to the south.`,
  exits: { south: "hallway", s: "hallway" },
  items: ["baseball-bat", "duct-tape", "box-of-nails"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("garage")) return outputs;
    outputs.push({
      text: "The garage light flickers when you enter. The shadows in the corners seem to pull back, just slightly, like they were caught doing something.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("upstairs-hall", {
  id: "upstairs-hall",
  name: "Upstairs Hallway",
  description: "",
  // dynamic
  exits: {
    down: "hallway",
    d: "hallway",
    west: "bedroom",
    w: "bedroom",
    east: "bathroom",
    e: "bathroom",
    north: "study",
    n: "study"
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("upstairs-hall")) return outputs;
    outputs.push({
      text: "The stairs creak in ways you don't remember. Each step feels like it takes longer than it should. When you reach the top, you're slightly out of breath, though it's only twelve stairs. You've counted them before. There are still twelve.",
      type: "narration"
    });
    return outputs;
  }
});
function getUpstairsHallDescription(state) {
  const base = `The upstairs hallway is shorter than the one below. Three doors. Your bedroom to the west \u2014 the door is open, and you can see the edge of your unmade bed. The bathroom to the east \u2014 door ajar, the nightlight casting a faint blue glow on the tile. And straight ahead, to the north, the door to your study.`;
  if (state.statusScreen.Awareness >= 3) {
    return base + `

The study door is closed. The gap beneath it is dark \u2014 darker than it should be, as if the darkness on the other side is thicker than ordinary shadow. The ozone smell is stronger here. The hair on your arms stands up. Something behind that door is waiting. You can feel it the way you can feel someone watching you across a crowded room.`;
  }
  return base + `

The study door is closed.`;
}
rooms.set("bedroom", {
  id: "bedroom",
  name: "Bedroom",
  description: `Your bedroom. The sheets are tangled the way you left them this morning. A stack of books on the nightstand, alarm clock blinking 12:00 because you never reset it after the last power outage. The closet door is open \u2014 your clothes hang in the same disorganized order you swore you'd fix.

On the shelf inside the closet, behind a shoebox of old photos, there's a small cardboard box you haven't opened in years. You know what's in it.

The upstairs hallway is back to the east.`,
  exits: { east: "upstairs-hall", e: "upstairs-hall" },
  items: ["lucky-rock"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("bedroom")) return outputs;
    outputs.push({
      text: "The bedroom smells like sleep and laundry detergent. Your pillow still has the indent from your head. This morning feels like it was a hundred years ago.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("bathroom", {
  id: "bathroom",
  name: "Bathroom",
  description: `Your bathroom. The nightlight casts everything in a blue glow that makes the white tile look like the bottom of a swimming pool. Your toothbrush is in its usual spot. The mirror above the sink is slightly fogged, which is strange \u2014 nobody's taken a shower.

A towel hangs on the hook behind the door, still damp from this morning. The medicine cabinet is closed. The shower curtain is pulled shut.

The upstairs hallway is back to the west.`,
  exits: { west: "upstairs-hall", w: "upstairs-hall" },
  items: ["mirror-shard"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("bathroom")) return outputs;
    outputs.push({
      text: "You glance at the mirror as you enter. Your reflection looks back. It blinks a half-second after you do. You decide not to look at it again.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("study", {
  id: "study",
  name: "Study",
  description: "",
  // dynamic — depends on whether you survive entering
  exits: { south: "upstairs-hall", s: "upstairs-hall" },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const hasTalisman = state.inventory.includes("lucky-rock");
    if (!hasTalisman) {
      state.flags.dead = true;
      return [
        { text: "", type: "normal" },
        { text: "You open the study door.", type: "normal" },
        { text: "", type: "normal" },
        { text: "The darkness inside isn't darkness. It's an absence. An un-place. It reaches for you the moment the door swings wide, and your body understands before your mind does \u2014 every nerve fires at once, a full-body scream that starts in your fingertips and converges somewhere behind your eyes.", type: "death" },
        { text: "", type: "normal" },
        { text: "You feel yourself coming apart. Not painfully \u2014 worse than that. Gently. Like being unraveled by careful hands. Your edges soften. Your name gets harder to remember. The kitchen, the hallway, the couch with the dip on the left side \u2014 they dissolve like sugar in warm water.", type: "death" },
        { text: "", type: "normal" },
        { text: "The last thing you feel is something like an apology.", type: "death" },
        { text: "", type: "normal" },
        { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
        { text: "THE REACH OFFERS ITS SINCEREST CONDOLENCES.", type: "system" },
        { text: "YOUR DESIGNATION REMAINS: PENDING.", type: "system" },
        { text: "IT WILL ALWAYS REMAIN: PENDING.", type: "system" },
        { text: "", type: "normal" },
        { text: "THE REACH ACKNOWLEDGES THAT IT COULD HAVE BEEN MORE FORTHCOMING.", type: "system" },
        { text: "THIS IS AS CLOSE TO REGRET AS THE REACH GETS.", type: "system" },
        { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
        { text: "", type: "normal" },
        { text: "YOU HAVE DIED.", type: "death" },
        { text: "", type: "normal" },
        { text: "The story ends here. Refresh to try again.", type: "narration" }
      ];
    }
    state.flags.survivedStudy = true;
    return [
      { text: "", type: "normal" },
      { text: "You open the study door. The darkness surges forward.", type: "normal" },
      { text: "", type: "normal" },
      { text: "And then \u2014 something in your pocket flares hot. Not burning, but alive. The rock. Your rock. The one you picked up when you were seven, the one that fit perfectly in your palm, the one you carried for a week straight and refused to leave behind when your parents said it was just a rock.", type: "narration" },
      { text: "", type: "normal" },
      { text: "It isn't just a rock.", type: "narration" },
      { text: "", type: "normal" },
      { text: "Light pours out of your pocket \u2014 not flashlight light, not sunlight, something older and warmer. The darkness recoils like a living thing, hissing, pulling back into the corners of the room. You feel it pass through you \u2014 death, actual death, brushing past your skin like someone walking too close in a narrow hallway. Your heart stops for a full beat. Your vision whites out.", type: "death" },
      { text: "", type: "normal" },
      { text: "Then it's over. You're standing in your study. Your heart is pounding. The rock in your pocket is warm and still. You are alive.", type: "normal" },
      { text: "", type: "normal" },
      { text: "You are very, very alive.", type: "narration" }
    ];
  }
});
items.set("kitchen-knife", {
  id: "kitchen-knife",
  name: "kitchen knife",
  description: "A standard 8-inch chef's knife. The blade is dull from years of abuse against cutting boards and frozen dinners. There's a chip near the tip.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Blade of the Morning Meal] \u2014 Rarity: COMMON+
BEHOLD! A weapon forged in the FIRES OF DOMESTICITY! Its edge, honed against ten thousand tomatoes, now SINGS with latent fury! The chip near its tip? A BATTLE SCAR, hero \u2014 evidence of wars fought across cutting boards stained with the blood of onions! Lesser candidates would overlook this instrument. YOU did not. The Reach is... cautiously impressed.
  +1 Edge
  +1 Resourcefulness
CLASSIFICATION: MELEE / CULINARY`,
  takeable: true,
  effects: { Edge: 1, Resourcefulness: 1 },
  usable: false
});
items.set("old-spatula", {
  id: "old-spatula",
  name: "old spatula",
  description: 'A rubber spatula with a cracked handle. The rubber is yellowed and starting to peel. Someone wrote "MINE" on the handle in sharpie.',
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[The Claimant's Paddle] \u2014 Rarity: COMMON
A BOLD selection! This implement bears the mark "MINE" \u2014 a DECLARATION OF DOMINION scrawled by a previous champion who understood that true power begins with CLAIMING what is yours! Ten thousand pancakes have been flipped by this paddle! Ten thousand pots scraped clean! It bends but NEVER breaks \u2014 a lesson many warriors learn too late. The Reach admires your eye for the unconventional.
  +1 Flexibility
CLASSIFICATION: TOOL / EXISTENTIAL`,
  takeable: true,
  effects: { Flexibility: 1 },
  usable: false
});
items.set("flashlight", {
  id: "flashlight",
  name: "flashlight",
  description: "A heavy Maglite flashlight, the kind that doubles as a weapon in a pinch. Found rolling around in the junk drawer among dead batteries and rubber bands. It works, somehow.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Torch of the Domestic Frontier] \u2014 Rarity: UNCOMMON
EXCELLENT! A BEACON against the encroaching dark! This is no mere flashlight, champion \u2014 this is a CYLINDER OF REVELATION, heavier than reason permits, for it carries not just batteries but PURPOSE! In ages past, heroes quested for enchanted torches. You found yours in a junk drawer. The batteries should be dead. They are not. The Reach does not waste its gifts on the unworthy.
  +1 Awareness
  +1 Edge
CLASSIFICATION: TOOL / LUMINANCE / BLUNT`,
  takeable: true,
  effects: { Awareness: 1, Edge: 1 },
  usable: false
});
items.set("tv-remote", {
  id: "tv-remote",
  name: "TV remote",
  description: "A universal remote with too many buttons and not enough purpose. The battery cover is held on with tape. Channel Up and Channel Down are worn smooth. The power button doesn't seem to do anything \u2014 the TV stays on regardless.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[The Arbiter of Frequencies] \u2014 Rarity: COMMON
Oh, FASCINATING! A device that once commanded the very STREAMS OF INFORMATION flowing into this dwelling! Its wielder could summon visions of distant lands, tales of war and triumph, and \u2014 yes \u2014 advertisements for mattresses! But now? NOW it reaches for channels that exist between channels. The power button does nothing because what it connects to now was never meant to be turned OFF. A discerning acquisition, candidate.
  +1 Awareness
CLASSIFICATION: TOOL / ENIGMATIC`,
  takeable: true,
  effects: { Awareness: 1 },
  usable: false
});
items.set("weird-coin", {
  id: "weird-coin",
  name: "weird coin",
  description: "A coin that was wedged between the couch cushions. It's heavier than it should be, and slightly warm to the touch. One side has a face you don't recognize. The other side has a symbol that hurts to look at directly, so you mostly don't.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Token of the Reach] \u2014 Rarity: ???
...
The Reach grows quiet.
This is not an item. This is a COVENANT. It was here before the foundation was poured, before the subdivision was zoned, before the CONCEPT of "neighborhood" was a gleam in a developer's eye. It waited between the cushions because THAT IS WHERE IT NEEDED TO BE. For you. Specifically you. The symbol on its face is not for your eyes \u2014 not yet \u2014 but the weight of it in your palm? That weight is DESTINY, candidate. Do not flip it. Do not lose it. The Reach will say no more.
  +2 Resonance
  +1 ???
CLASSIFICATION: ARTIFACT / [REDACTED]`,
  takeable: true,
  effects: { Resonance: 2, "???": 1 },
  usable: false
});
items.set("baseball-bat", {
  id: "baseball-bat",
  name: "baseball bat",
  description: "An aluminum baseball bat leaning against the workbench. It has a dent near the sweet spot and someone wrapped the grip in electrical tape. A faded Little League sticker clings to the barrel.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Louisville Adjudicator] \u2014 Rarity: COMMON+
YES! NOW we're TALKING! An instrument of AMERICAN CONFLICT RESOLUTION! Aluminum construction provides DEVASTATING swing velocity! That dent? That's not damage \u2014 that's a TROPHY from a previous encounter with something that LOST! The Little League sticker whispers of a simpler time, when the only battles were for second base. Those days are OVER, champion. The Reach APPROVES of this selection with considerable enthusiasm.
  +2 Edge
CLASSIFICATION: MELEE / BLUNT / NOSTALGIC`,
  takeable: true,
  effects: { Edge: 2 },
  usable: false
});
items.set("duct-tape", {
  id: "duct-tape",
  name: "duct tape",
  description: "A half-used roll of silver duct tape. The universal fix for everything that isn't actually broken and most things that are.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[The Silver Binding] \u2014 Rarity: COMMON
MAGNIFICENT in its humility! In EVERY world the Reach has touched \u2014 and it has touched MANY \u2014 there exists a substance that holds reality together when all other bonds fail. In some worlds it is dragon sinew. In others, crystallized starlight. In THIS world? It is silver, adhesive, and available at any hardware store for $4.99. Do NOT underestimate it, candidate. CIVILIZATIONS have been built on less. The Reach has seen it.
  +1 Resourcefulness
  +1 Flexibility
CLASSIFICATION: MATERIAL / ADHESIVE / PHILOSOPHICAL`,
  takeable: true,
  effects: { Resourcefulness: 1, Flexibility: 1 },
  usable: false
});
items.set("box-of-nails", {
  id: "box-of-nails",
  name: "box of nails",
  description: `A small cardboard box of 2-inch common nails. Most of them are still straight. The box says "100 count" but there are clearly fewer than that. Someone's been using them.`,
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Points of Commitment] \u2014 Rarity: COMMON
Each nail \u2014 EACH INDIVIDUAL NAIL \u2014 is a small iron oath! A declaration that THIS board shall be joined to THAT board and NEITHER SHALL MOVE AGAIN! There are fewer than the box promises. The Reach finds this deeply symbolic but will not elaborate because the metaphor is, frankly, too beautiful to explain. An understated but STRATEGICALLY SOUND acquisition!
  +1 Resourcefulness
CLASSIFICATION: MATERIAL / FASTENER / METAPHORICAL`,
  takeable: true,
  effects: { Resourcefulness: 1 },
  usable: false
});
items.set("lucky-rock", {
  id: "lucky-rock",
  name: "smooth rock",
  description: "A smooth, dark stone about the size of a plum. You found it in the creek behind your grandmother's house when you were seven. You carried it in your pocket for a week. When your parents tried to make you leave it behind, you cried until they gave up. It's been on that shelf ever since, in a box with your old baseball cards and a broken watch. It's warm to the touch. It has always been warm to the touch. You never questioned that.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[    ] \u2014 Rarity: \u2014
...
The Reach is silent for a long time.
...
The Reach does not recognize this item. This is... unprecedented. This stone predates the Reach's knowledge of you. It predates the Reach's knowledge of THIS WORLD. It is warm in a way that has nothing to do with temperature. The Reach cannot classify it. The Reach cannot quantify it.
The Reach is, for the first time, uncertain.
  +???
CLASSIFICATION: UNKNOWN / PERSONAL / [UNREADABLE]`,
  takeable: true,
  effects: { Resonance: 3 },
  usable: false
});
items.set("mirror-shard", {
  id: "mirror-shard",
  name: "mirror shard",
  description: "A triangular piece of glass from the corner of the medicine cabinet mirror. You don't remember it being broken. The edge is sharp but the surface is perfectly smooth. When you look into it, your reflection seems slightly delayed. Not much. Just enough to notice.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Fragment of Delayed Truth] \u2014 Rarity: UNCOMMON
A shard of reflective surface that shows what WAS rather than what IS! A fraction of a second \u2014 barely perceptible \u2014 but in that fraction, WORLDS diverge! The Reach has seen mirrors that show the future. This one shows the past. Both are useful. Both are dangerous. Handle with care, candidate. The edge is sharp in more ways than one.
  +2 Awareness
CLASSIFICATION: TOOL / REFLECTIVE / TEMPORAL`,
  takeable: true,
  effects: { Awareness: 2 },
  usable: false
});
function getRoom(id) {
  return rooms.get(id);
}
function getItem(id) {
  return items.get(id);
}

// src/engine/state.ts
function createInitialState() {
  return {
    currentRoom: "kitchen",
    inventory: [],
    statusScreen: {
      Edge: 0,
      Awareness: 0,
      Resourcefulness: 0,
      Flexibility: 0,
      Resonance: 0,
      "???": 0
    },
    visitedRooms: /* @__PURE__ */ new Set(["kitchen"]),
    flags: {
      systemInitialized: true,
      identified: {}
      // itemId → true if system-identified
    },
    turnCount: 0
  };
}
function moveToRoom(state, roomId) {
  const room = getRoom(roomId);
  if (!room) {
    return [{ text: "You can't go that way.", type: "error" }];
  }
  const outputs = [];
  if (room.onEnter) {
    outputs.push(...room.onEnter(state));
  }
  state.currentRoom = roomId;
  state.visitedRooms.add(roomId);
  console.log(`[MOVE] \u2192 ${room.name} (${roomId}) | Visited: ${state.visitedRooms.size} rooms`);
  room.firstVisit = false;
  return outputs;
}
function addToInventory(state, itemId) {
  const item = getItem(itemId);
  if (!item) {
    return [{ text: "That doesn't seem to exist.", type: "error" }];
  }
  if (!item.takeable) {
    return [{ text: "You can't take that.", type: "normal" }];
  }
  const room = getRoom(state.currentRoom);
  if (room) {
    const idx = room.items.indexOf(itemId);
    if (idx !== -1) {
      room.items.splice(idx, 1);
    }
  }
  state.inventory.push(itemId);
  if (!state.flags.identified) state.flags.identified = {};
  state.flags.identified[itemId] = true;
  for (const [stat, value] of Object.entries(item.effects)) {
    state.statusScreen[stat] = (state.statusScreen[stat] || 0) + value;
  }
  console.log(`[TAKE] ${item.name} (${itemId}) | Effects:`, item.effects, "| Stats now:", { ...state.statusScreen });
  const outputs = [];
  outputs.push({ text: `You pick up the ${item.name}.`, type: "normal" });
  outputs.push({ text: "", type: "normal" });
  outputs.push({ text: item.systemDescription, type: "system" });
  return outputs;
}
function removeFromInventory(state, itemId) {
  const item = getItem(itemId);
  if (!item) {
    return [{ text: "You don't have that.", type: "error" }];
  }
  const idx = state.inventory.indexOf(itemId);
  if (idx === -1) {
    return [{ text: "You're not carrying that.", type: "normal" }];
  }
  state.inventory.splice(idx, 1);
  const room = getRoom(state.currentRoom);
  if (room) {
    room.items.push(itemId);
  }
  for (const [stat, value] of Object.entries(item.effects)) {
    state.statusScreen[stat] = (state.statusScreen[stat] || 0) - value;
  }
  console.log(`[DROP] ${item.name} (${itemId}) in ${state.currentRoom} | Stats now:`, { ...state.statusScreen });
  return [{ text: `You drop the ${item.name}.`, type: "normal" }];
}
function getStats(state) {
  return { ...state.statusScreen };
}
var gameState = createInitialState();

// src/parser/commands.ts
function findItemByName(name, itemIds) {
  const lower = name.toLowerCase();
  return itemIds.find((id) => {
    const item = getItem(id);
    if (!item) return false;
    return item.id.toLowerCase() === lower || item.name.toLowerCase() === lower || item.id.toLowerCase().replace(/-/g, " ") === lower || item.name.toLowerCase().includes(lower);
  });
}
var EXIT_NAMES = {
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  up: "up",
  down: "down",
  u: "up",
  d: "down"
};
var dynamicDescriptions = {
  hallway: getHallwayDescription,
  "upstairs-hall": getUpstairsHallDescription
};
function executeLook(state) {
  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: "You are nowhere. This is concerning.", type: "error" }];
  const description = dynamicDescriptions[state.currentRoom] ? dynamicDescriptions[state.currentRoom](state) : room.description;
  const outputs = [];
  outputs.push({ text: `\u2014 ${room.name} \u2014`, type: "system" });
  outputs.push({ text: "", type: "normal" });
  outputs.push({ text: description, type: "normal" });
  if (room.items.length > 0) {
    outputs.push({ text: "", type: "normal" });
    const itemNames = room.items.map((id) => getItem(id)?.name || id).join(", ");
    outputs.push({ text: `You can see: ${itemNames}.`, type: "normal" });
  }
  const exitDirs = Object.keys(room.exits).filter((k) => k.length > 1).join(", ");
  if (exitDirs) {
    outputs.push({ text: `Exits: ${exitDirs}.`, type: "narration" });
  }
  return outputs;
}
function executeGo(state, direction) {
  if (!direction) {
    return [{ text: "Go where?", type: "normal" }];
  }
  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: "You are lost in the void.", type: "error" }];
  const dir = EXIT_NAMES[direction] || direction;
  const targetId = room.exits[dir] || room.exits[direction];
  if (!targetId) {
    return [{ text: "You can't go that way.", type: "normal" }];
  }
  const outputs = moveToRoom(state, targetId);
  if (state.flags.dead) {
    return outputs;
  }
  outputs.push(...executeLook(state));
  return outputs;
}
function executeTake(state, noun) {
  if (!noun) {
    return [{ text: "Take what?", type: "normal" }];
  }
  const room = getRoom(state.currentRoom);
  if (!room) return [{ text: "There's nothing here to take.", type: "error" }];
  const itemId = findItemByName(noun, room.items);
  if (!itemId) {
    return [{ text: `You don't see any "${noun}" here.`, type: "normal" }];
  }
  return addToInventory(state, itemId);
}
function executeDrop(state, noun) {
  if (!noun) {
    return [{ text: "Drop what?", type: "normal" }];
  }
  const itemId = findItemByName(noun, state.inventory);
  if (!itemId) {
    return [{ text: `You're not carrying any "${noun}".`, type: "normal" }];
  }
  return removeFromInventory(state, itemId);
}
function executeExamine(state, noun) {
  if (!noun) {
    return executeLook(state);
  }
  let itemId = findItemByName(noun, state.inventory);
  if (!itemId) {
    const room = getRoom(state.currentRoom);
    if (room) {
      itemId = findItemByName(noun, room.items);
    }
  }
  if (!itemId) {
    return [{ text: `You don't see any "${noun}" to examine.`, type: "normal" }];
  }
  const item = getItem(itemId);
  if (!item) return [{ text: "It vanishes as you reach for it.", type: "error" }];
  const outputs = [];
  outputs.push({ text: item.description, type: "normal" });
  const identified = state.flags.identified?.[itemId];
  if (identified) {
    outputs.push({ text: "", type: "normal" });
    outputs.push({ text: "The System flickers:", type: "narration" });
    outputs.push({ text: item.systemDescription, type: "system" });
  }
  return outputs;
}
function executeInventory(state) {
  if (state.inventory.length === 0) {
    return [{ text: "You're not carrying anything. Your pockets echo with emptiness.", type: "normal" }];
  }
  const outputs = [];
  outputs.push({ text: "\u2592\u2592\u2592 INVENTORY \u2592\u2592\u2592", type: "system" });
  outputs.push({ text: "", type: "normal" });
  for (const id of state.inventory) {
    const item = getItem(id);
    if (item) {
      outputs.push({ text: `  \u2022 ${item.name}`, type: "normal" });
    }
  }
  return outputs;
}
function executeStatus(state) {
  const stats = getStats(state);
  const outputs = [];
  outputs.push({ text: "\u2592\u2592\u2592 STATUS PROTOCOL \u2592\u2592\u2592", type: "system" });
  outputs.push({ text: `DESIGNATION: PENDING`, type: "system" });
  outputs.push({ text: `TURN: ${state.turnCount}`, type: "system" });
  outputs.push({ text: "", type: "normal" });
  for (const [stat, value] of Object.entries(stats)) {
    const bar = value > 0 ? "\u2588".repeat(value) + "\u2591".repeat(Math.max(0, 10 - value)) : "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591";
    outputs.push({ text: `  ${stat.padEnd(18)} ${bar}  ${value}`, type: "system" });
  }
  outputs.push({ text: "", type: "normal" });
  outputs.push({ text: `Rooms explored: ${state.visitedRooms.size}`, type: "narration" });
  outputs.push({ text: `Items carried: ${state.inventory.length}`, type: "narration" });
  return outputs;
}
function executeHelp() {
  return [
    { text: "\u2592\u2592\u2592 SYSTEM ASSISTANCE PROTOCOL \u2592\u2592\u2592", type: "system" },
    { text: "", type: "normal" },
    { text: "  look (l)         \u2014 observe your surroundings", type: "normal" },
    { text: "  go <direction>   \u2014 move (or just type n/s/e/w)", type: "normal" },
    { text: "  take <item>      \u2014 pick up an item", type: "normal" },
    { text: "  drop <item>      \u2014 drop an item", type: "normal" },
    { text: "  examine <item>   \u2014 inspect an item closely", type: "normal" },
    { text: "  inventory (i)    \u2014 check what you're carrying", type: "normal" },
    { text: "  status           \u2014 view your status screen", type: "normal" },
    { text: "  help (?)         \u2014 this message", type: "normal" },
    { text: "", type: "normal" },
    { text: "The Reach provides. The Reach observes.", type: "narration" }
  ];
}
function executeUnknown(verb) {
  const responses = [
    `The System does not recognize "${verb}" as a valid action. It regards you with something like pity.`,
    `"${verb}" is not a thing you can do. Not yet. Perhaps not ever.`,
    `The Reach considers your request to "${verb}" and finds it... wanting. Type "help" for guidance.`,
    `You attempt to "${verb}." Nothing happens, but you feel judged.`
  ];
  const text = responses[Math.floor(Math.random() * responses.length)];
  return [{ text, type: "narration" }];
}
function executeCommand(cmd, state) {
  if (state.flags.dead) {
    return [{ text: "You are dead. The story is over. Refresh to try again.", type: "death" }];
  }
  state.turnCount++;
  console.log(`[TURN ${state.turnCount}] Command: "${cmd.verb}${cmd.noun ? " " + cmd.noun : ""}" | Room: ${state.currentRoom} | Inventory: [${state.inventory.join(", ")}]`);
  switch (cmd.verb) {
    case "look":
      return executeLook(state);
    case "go":
      return executeGo(state, cmd.noun);
    case "take":
      return executeTake(state, cmd.noun);
    case "drop":
      return executeDrop(state, cmd.noun);
    case "examine":
      return executeExamine(state, cmd.noun);
    case "inventory":
      return executeInventory(state);
    case "status":
      return executeStatus(state);
    case "help":
      return executeHelp();
    default:
      return executeUnknown(cmd.verb);
  }
}

// src/ui/input.ts
var inputEl = document.getElementById("input");
function initInput() {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const raw = inputEl.value.trim();
      if (!raw) return;
      appendEcho(raw);
      const cmd = parseInput(raw);
      const outputs = executeCommand(cmd, gameState);
      appendOutput(outputs);
      updateStatusBar(`TURN ${gameState.turnCount} | ROOMS ${gameState.visitedRooms.size} | ITEMS ${gameState.inventory.length}`);
      inputEl.value = "";
    }
  });
  document.addEventListener("click", () => {
    inputEl.focus();
  });
}

// src/engine/game-api.ts
function sendCommand(input) {
  const cmd = parseInput(input);
  const outputs = executeCommand(cmd, gameState);
  const text = outputs.map((o) => o.text).filter((t) => t.length > 0).join("\n");
  console.log(`[GAME-API] "${input}" \u2192 ${outputs.length} lines`);
  return { text, outputs };
}
function getTurnCount() {
  return gameState.turnCount;
}

// src/actant/actant.ts
var MODEL = "anthropic/claude-haiku-4.5";
var API_URL = "/api/inference/openrouter/chat/completions";
var transcript = [];
var history = [];
var listeners = [];
var thinking = false;
function isThinking() {
  return thinking;
}
function onTurn(fn) {
  listeners.push(fn);
}
function buildPrompt() {
  const recent = transcript.slice(-30).join("\n");
  return `You are playing a text adventure game. Here is what you see:

${recent}

Based on what you see, decide what command to type next. You can use commands like: look, go <direction>, take <item>, drop <item>, examine <item>, inventory, status, help.

Directions: north/south/east/west (or n/s/e/w).

Explore the world. Pick up interesting items. Try to visit every room.

Respond with ONLY the command you want to type. Nothing else. Just the command.`;
}
async function callModel(prompt) {
  const body = {
    model: MODEL,
    messages: [
      { role: "user", content: prompt }
    ],
    max_tokens: 50,
    temperature: 0.7
  };
  console.log("[ACTANT] Calling model...", MODEL);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inference failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  console.log("[ACTANT] Model responded:", content);
  return content;
}
function parseModelResponse(raw) {
  let cmd = raw.replace(/^```\w*\n?/gm, "").replace(/```$/gm, "").trim();
  cmd = cmd.replace(/^["'>]+/, "").replace(/["']+$/, "").trim();
  cmd = cmd.split("\n")[0].trim();
  cmd = cmd.replace(/^>\s*/, "");
  return cmd.toLowerCase();
}
async function step() {
  if (thinking) throw new Error("Already thinking");
  thinking = true;
  try {
    if (transcript.length === 0) {
      const lookResult = sendCommand("look");
      transcript.push(`> look
${lookResult.text}`);
    }
    const prompt = buildPrompt();
    const raw = await callModel(prompt);
    const command = parseModelResponse(raw);
    console.log(`[ACTANT] Executing: "${command}"`);
    const result = sendCommand(command);
    transcript.push(`> ${command}
${result.text}`);
    const turn = {
      turn: getTurnCount(),
      prompt,
      response: raw,
      command,
      gameOutput: result.text,
      gameOutputs: result.outputs,
      timestamp: Date.now()
    };
    history.push(turn);
    for (const fn of listeners) fn(turn);
    return turn;
  } finally {
    thinking = false;
  }
}

// src/actant/inspector.ts
var logEl = document.getElementById("inspector-log");
var statusEl = document.getElementById("inspector-status");
function initInspector() {
  const inspector = document.getElementById("inspector");
  const toggleBtn = document.getElementById("inspector-toggle");
  toggleBtn.addEventListener("click", () => {
    inspector.classList.toggle("collapsed");
    toggleBtn.textContent = inspector.classList.contains("collapsed") ? "\u25B6" : "\u25C0";
  });
  logEl.addEventListener("click", (e) => {
    const header = e.target.closest(".inspector-entry-header");
    if (header) {
      header.parentElement.classList.toggle("expanded");
    }
  });
  onTurn((turn) => {
    addEntry(turn);
    updateStatus();
  });
}
function setStatus(msg, className = "") {
  statusEl.textContent = msg;
  statusEl.className = `inspector-status ${className}`;
}
function updateStatus() {
  if (isThinking()) {
    setStatus("Thinking...", "thinking");
  } else {
    setStatus("Idle");
  }
}
function addEntry(turn) {
  statusEl.style.display = "none";
  const entry = document.createElement("div");
  entry.className = "inspector-entry expanded";
  logEl.querySelectorAll(".inspector-entry.expanded").forEach((el) => {
    el.classList.remove("expanded");
  });
  const time = new Date(turn.timestamp).toLocaleTimeString();
  entry.innerHTML = `
    <div class="inspector-entry-header">
      <span>
        <span class="turn-label">T${turn.turn}</span>
        <span class="command-label">${escapeHtml(turn.command)}</span>
      </span>
      <span>${time}</span>
    </div>
    <div class="inspector-entry-body">
      <div class="inspector-section">
        <div class="inspector-section-label">Prompt sent</div>
        <div class="inspector-section-content prompt">${escapeHtml(turn.prompt)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Model response</div>
        <div class="inspector-section-content response">${escapeHtml(turn.response)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Command executed</div>
        <div class="inspector-section-content">${escapeHtml(turn.command)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Game output</div>
        <div class="inspector-section-content game-output">${escapeHtml(turn.gameOutput)}</div>
      </div>
    </div>
  `;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/actant/autoplay.ts
var running = false;
var intervalId = null;
var STEP_DELAY = 4e3;
function initAutoplay() {
  const autoplayBtn = document.getElementById("btn-autoplay");
  const stepBtn = document.getElementById("btn-step");
  autoplayBtn.addEventListener("click", () => {
    if (running) {
      stopAutoplay();
      autoplayBtn.classList.remove("active");
      autoplayBtn.textContent = "Autoplay";
    } else {
      startAutoplay();
      autoplayBtn.classList.add("active");
      autoplayBtn.textContent = "Pause";
    }
  });
  stepBtn.addEventListener("click", () => {
    if (running) return;
    doStep();
  });
}
function startAutoplay() {
  if (running) return;
  running = true;
  console.log("[AUTOPLAY] Started");
  doStep();
  intervalId = window.setInterval(() => {
    if (!isThinking()) doStep();
  }, STEP_DELAY);
}
function stopAutoplay() {
  running = false;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  setStatus("Paused");
  console.log("[AUTOPLAY] Stopped");
}
async function doStep() {
  if (isThinking()) return;
  setStatus("Thinking...", "thinking");
  try {
    const turn = await step();
    appendEcho(turn.command);
    appendOutput(turn.gameOutputs);
    updateStatusBar(
      `TURN ${gameState.turnCount} | ROOMS ${gameState.visitedRooms.size} | ITEMS ${gameState.inventory.length}`
    );
    setStatus(`Last: "${turn.command}" (T${turn.turn})`);
  } catch (err) {
    console.error("[AUTOPLAY] Error:", err);
    setStatus(`Error: ${err.message}`);
    if (running) {
      stopAutoplay();
      const btn = document.getElementById("btn-autoplay");
      btn.classList.remove("active");
      btn.textContent = "Autoplay";
    }
  }
}

// src/main.ts
async function showIntro() {
  const wakeUp = [
    { text: "Everything goes dark.", type: "normal" },
    { text: "...", type: "narration" },
    { text: "...", type: "narration" },
    { text: "You open your eyes.", type: "normal" },
    { text: "You're on the kitchen floor. The linoleum is cold against your cheek.", type: "normal" },
    { text: "The fluorescent light above buzzes like something alive and unhappy about it.", type: "normal" },
    { text: "", type: "normal" },
    { text: "Something is different.", type: "narration" },
    { text: "Something is very, very different.", type: "narration" }
  ];
  await appendOutputSequence(wakeUp, 600);
  await delay(800);
  appendBreak();
  const systemBoot = [
    { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
    { text: "\u2592\u2592\u2592 SYSTEM INITIALIZED \u2592\u2592\u2592", type: "system" },
    { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
    { text: "", type: "normal" },
    { text: "CANDIDATE IDENTIFIED.", type: "system" },
    { text: "DESIGNATION: PENDING.", type: "system" },
    { text: "", type: "normal" },
    { text: "THE REACH EXTENDS. THE REACH PROVIDES.", type: "system" },
    { text: "CONGRATULATIONS ON YOUR ASSIMILATION. IT IS IRREVERSIBLE.", type: "system" },
    { text: "YOUR SAGA BEGINS WHERE ALL GREAT SAGAS BEGIN: ON LINOLEUM.", type: "system" },
    { text: "", type: "normal" },
    { text: "STATUS PROTOCOL: ENGAGED", type: "system" }
  ];
  await appendOutputSequence(systemBoot, 350);
  await delay(400);
  const stats = [
    { text: "", type: "normal" },
    { text: "  Edge               \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" },
    { text: "  Awareness          \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" },
    { text: "  Resourcefulness    \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" },
    { text: "  Flexibility        \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" },
    { text: "  Resonance          \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" },
    { text: "  ???                \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  0", type: "system" }
  ];
  await appendOutputSequence(stats, 150);
  await delay(600);
  const hint = [
    { text: "", type: "normal" },
    { text: "You should probably get off the floor.", type: "narration" },
    { text: 'Try "look" to observe your surroundings, or "help" for a list of commands.', type: "narration" }
  ];
  await appendOutputSequence(hint, 400);
  updateStatusBar("TURN 0 | ROOMS 1 | ITEMS 0");
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
  await showIntro();
  initInput();
  initInspector();
  initAutoplay();
}
main();
//# sourceMappingURL=main.js.map
