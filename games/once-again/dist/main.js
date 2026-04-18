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
  collect: "take",
  x: "examine",
  examine: "examine",
  inspect: "inspect",
  scan: "inspect",
  drop: "drop",
  leave: "drop",
  discard: "drop",
  put: "drop",
  go: "go",
  walk: "go",
  move: "go",
  head: "go",
  enter: "go",
  climb: "go",
  follow: "go",
  turn: "use",
  press: "use",
  push: "use",
  pull: "use",
  flip: "use",
  activate: "use",
  open: "use",
  close: "use",
  read: "examine",
  status: "status",
  stats: "status",
  help: "help",
  "?": "help",
  use: "use",
  quit: "quit",
  q: "quit",
  respawn: "respawn",
  restart: "restart",
  reset: "reset",
  undo: "undo",
  refresh: "refresh"
};
var NOISE = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "at",
  "to",
  "into",
  "in",
  "on",
  "with",
  "of",
  "for",
  "my",
  "its",
  "this",
  "that",
  "some",
  "around",
  "carefully",
  "closely",
  "quickly",
  "slowly",
  "again",
  "please",
  "just",
  "then",
  "now",
  "very",
  "really",
  "back"
]);
var DIRECTION_PHRASES = [
  [/\b(?:go\s+)?back\s+down(?:stairs)?/, "down"],
  [/\b(?:go\s+)?down(?:stairs)/, "down"],
  [/\b(?:go\s+)?up(?:stairs)/, "up"],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:north|n)\b/, "north"],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:south|s)\b/, "south"],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:east|e)\b/, "east"],
  [/\b(?:go\s+)?back\s+(?:to\s+)?(?:the\s+)?(?:west|w)\b/, "west"],
  [/\b(?:go\s+)?(?:back\s+)?outside\b/, "east"],
  // contextual — front door from hallway
  [/\b(?:go\s+)?(?:back\s+)?inside\b/, "west"]
  // contextual — into house from yard
];
var VERB_PHRASES = [
  [/^look\s+around/, "look"],
  [/^check\s+(?:my\s+)?inventory/, "inventory"],
  [/^check\s+(?:my\s+)?(?:status|stats)/, "status"],
  [/^(?:examine|look\s+at)\s+(?:my\s+)?status\s+screen/, "status"],
  [/^what\s+(?:do\s+i\s+have|am\s+i\s+carrying)/, "inventory"],
  [/^where\s+am\s+i/, "look"],
  [/^what\s+(?:is\s+this|can\s+i\s+do|should\s+i\s+do)/, "help"],
  [/^how\s+do\s+i/, "help"]
];
function parseInput(input) {
  const trimmed = input.trim().toLowerCase();
  for (const [pattern, verb2] of VERB_PHRASES) {
    if (pattern.test(trimmed)) {
      return { verb: verb2, noun: "", fullInput: trimmed };
    }
  }
  for (const [pattern, dir] of DIRECTION_PHRASES) {
    if (pattern.test(trimmed)) {
      return { verb: "go", noun: dir, fullInput: trimmed };
    }
  }
  const parts = trimmed.split(/\s+/).filter((w) => !NOISE.has(w));
  if (parts.length === 0) {
    return { verb: trimmed, noun: "", fullInput: trimmed };
  }
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  if (DIRECTION_ALIASES[first] && parts.length === 1) {
    return { verb: "go", noun: DIRECTION_ALIASES[first], fullInput: trimmed };
  }
  if (first === "pick" && parts[1] === "up") {
    return { verb: "take", noun: parts.slice(2).join(" "), fullInput: trimmed };
  }
  const verb = VERB_ALIASES[first] || first;
  let noun = rest;
  if (verb === "go") {
    for (const w of parts.slice(1)) {
      if (DIRECTION_ALIASES[w]) {
        noun = DIRECTION_ALIASES[w];
        break;
      }
    }
  }
  return { verb, noun, fullInput: trimmed };
}

// src/engine/world.ts
var rooms = /* @__PURE__ */ new Map();
var items = /* @__PURE__ */ new Map();
function getHallwayDescription(state) {
  let exits = "Your kitchen is to the west. The living room opens up to the south. The garage door is to the north.";
  if (state.flags.survivedStudy) {
    exits += " The front door is to the east \u2014 and for the first time since you woke up, you feel like you could actually open it.";
  } else {
    exits += " At the far end, the front door.";
  }
  exits += " Stairs lead up.";
  const base = `The hallway you've walked a thousand times. Same oatmeal carpet you picked because it was on sale. Same family photos \u2014 you remember hanging each one, arguing about which height looked right. Everything looks completely normal. It IS completely normal. Except for the translucent status screen hovering at the edge of your vision.

${exits}`;
  if (state.statusScreen.Awareness >= 3) {
    return base + `

You notice a faint smell drifting down from upstairs. Mostly normal \u2014 stale bedroom air, the lavender soap from the bathroom. But there's something else mixed in. Ozone, maybe? Like the air after a thunderstorm. Weird.`;
  }
  return base;
}
rooms.set("kitchen", {
  id: "kitchen",
  name: "Kitchen",
  description: `Your kitchen. You know every stain on this countertop, every ring left by a coffee mug you were too lazy to use a coaster for. The fluorescent light hums its same tired hum. Your coffee maker \u2014 the one you keep meaning to descale \u2014 sits next to a dish rack with yesterday's bowl still in it. The junk drawer is slightly ajar, the way you always leave it because the track is bent.

Everything looks exactly the same as it did this morning. Which makes the floating status screen even weirder.

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
    u: "upstairs-hall",
    east: "front-yard",
    e: "front-yard"
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("hallway")) return outputs;
    outputs.push({
      text: "The hallway looks exactly the way it always does. Somehow that makes it worse. You keep expecting something to be different.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("living-room", {
  id: "living-room",
  name: "Living Room",
  description: `Your living room. Your couch, with the dip on the left side where you always sit. Your bookshelf, still holding that novel you swore you'd finish. The indent in the carpet from the coffee table is exactly where you pushed it last movie night.

The TV is on, showing static. You don't remember leaving it on, but you also don't remember a lot about this morning. The remote is on the arm of the couch.

The hallway is back to the north.`,
  exits: { north: "hallway", n: "hallway" },
  items: ["tv-remote", "weird-coin"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("living-room")) return outputs;
    outputs.push({
      text: "You could swear the TV wasn't on when you left for work this morning. Then again, you were on the kitchen floor a minute ago, so who knows.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("garage", {
  id: "garage",
  name: "Garage",
  description: `Your garage. The overhead bulb gives everything that amber tint you've been meaning to fix by switching to LED. Your workbench, still scarred from that shelf project that didn't go great. Half-empty paint cans from when you painted the bedroom. A bike you haven't ridden in two years.

Just your garage. Completely normal. You're starting to wonder if you hallucinated the whole status screen thing.

The door back to the hallway is to the south.`,
  exits: { south: "hallway", s: "hallway" },
  items: ["baseball-bat", "duct-tape", "box-of-nails"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("garage")) return outputs;
    outputs.push({
      text: "Smells like oil and sawdust. Same as always.",
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
      text: "Twelve stairs, same as always. The carpet runner is still coming loose on the third step. You keep meaning to fix that.",
      type: "narration"
    });
    return outputs;
  }
});
function getUpstairsHallDescription(state) {
  const base = `The upstairs hallway is shorter than the one below. Three doors. Your bedroom to the west \u2014 the door is open, and you can see the edge of your unmade bed. The bathroom to the east \u2014 door ajar, the nightlight casting a faint blue glow on the tile. And straight ahead, to the north, the door to your study.`;
  if (state.statusScreen.Awareness >= 3) {
    return base + `

The study door is closed. You notice a faint smell \u2014 ozone, like after a lightning strike. It's coming from under the door. And there's a feeling you can't quite name. Not fear, exactly. More like the feeling right before you open a test you're not sure you studied for.`;
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
  description: `Your bathroom. The nightlight casts everything in a blue glow that makes the white tile look like the bottom of a swimming pool. Your toothbrush is in its usual spot. The mirror above the sink needs cleaning \u2014 you can see the toothpaste flecks from this morning.

A towel hangs on the hook behind the door, still damp from this morning. The medicine cabinet is closed. The shower curtain is pulled shut.

The upstairs hallway is back to the west.`,
  exits: { west: "upstairs-hall", w: "upstairs-hall" },
  items: ["mirror-shard"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("bathroom")) return outputs;
    outputs.push({
      text: "You catch your reflection in the mirror. You look tired. Not surprising, given you just woke up on your kitchen floor.",
      type: "narration"
    });
    return outputs;
  }
});
function getStudyDescription(state) {
  if (!state.flags.survivedStudy) {
    return "You shouldn't be here.";
  }
  return `Your study. Same IKEA desk, same office chair with the wonky wheel, same shelf of books you half-read in college. Your old monitor is on \u2014 you don't remember leaving it on either, but at this point you're getting used to that.

The screen is showing something. Not your desktop, not a screensaver. A map. Your neighborhood, seen from above, drawn in the same teal lines as the System overlay. Your house is at the center, pulsing gently. Other markers dot the streets \u2014 some steady, some flickering. You have no idea what they mean. But they're clearly meant for you.

On the desk next to the keyboard, there's something that wasn't there this morning.

The upstairs hallway is back to the south.`;
}
rooms.set("study", {
  id: "study",
  name: "Study",
  description: "",
  // dynamic
  exits: { south: "upstairs-hall", s: "upstairs-hall" },
  items: ["system-compass"],
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
rooms.set("front-yard", {
  id: "front-yard",
  name: "Front Yard",
  description: `Your front yard. The lawn needs mowing \u2014 it needed mowing before all this, so that's not new. Your mailbox is at the curb, flag down. The welcome mat says "GO AWAY" in cheerful letters \u2014 a gift from your sister you thought was funny at the time.

The sky is blue. Regular blue. The sun is out. Birds are singing. It's a completely normal day in a completely normal neighborhood. Except for the translucent System overlay, which now seems to extend... everywhere. Not just in your house. Everywhere you look.

Your front door is to the west. The street stretches north and south.`,
  exits: {
    west: "hallway",
    w: "hallway",
    north: "street-north",
    n: "street-north",
    south: "street-south",
    s: "street-south"
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("front-yard")) return outputs;
    outputs.push({
      text: "You step outside. The sunlight is warm on your face. A lawn mower hums somewhere a few streets over. A dog barks. It's so aggressively normal that you almost laugh.",
      type: "narration"
    });
    outputs.push({ text: "", type: "normal" });
    outputs.push({
      text: "\u2592\u2592\u2592 EXTERIOR PROTOCOLS ENGAGED \u2592\u2592\u2592",
      type: "system"
    });
    outputs.push({
      text: "CONGRATULATIONS, CANDIDATE! You have LEFT THE TUTORIAL ZONE! The Reach is THRILLED to inform you that the ENTIRE WORLD is now your arena! Every mailbox a MYSTERY! Every lawn a POTENTIAL BATTLEFIELD! The Reach can barely contain its excitement!",
      type: "system"
    });
    outputs.push({
      text: "AREA UNLOCKED: THE NEIGHBORHOOD.",
      type: "system"
    });
    return outputs;
  }
});
rooms.set("street-north", {
  id: "street-north",
  name: "Maple Street (North)",
  description: `Maple Street, looking north. Your street. The asphalt has that one crack running down the middle that the city never fixed. To the east is the Hendersons' place \u2014 white picket fence, garden gnomes, the whole thing. Their car is in the driveway but you don't see anyone around.

Further north, the street curves toward the park. You can see the big oak tree from here \u2014 the one the kids climb, the one that's been there longer than any of the houses.

Your front yard is back to the south. The Hendersons' yard is to the east. The park is further north.`,
  exits: {
    south: "front-yard",
    s: "front-yard",
    east: "hendersons-yard",
    e: "hendersons-yard",
    north: "park",
    n: "park"
  },
  items: [],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("street-north")) return outputs;
    outputs.push({
      text: "The street looks the same as it did yesterday. Same parked cars. Same cracked sidewalk. Same everything. You keep looking for something to be different and it just... isn't.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("street-south", {
  id: "street-south",
  name: "Maple Street (South)",
  description: `Maple Street, looking south. The Kowalskis' place is on the left \u2014 they're on vacation, you think. Mail is piling up in their box. On the right is the empty lot where old Mr. Chen's house used to be before they tore it down last year. Weeds and gravel now. Kids ride bikes through it sometimes.

Further south, the street dead-ends at the corner store \u2014 Raj's Quik-Mart, the one with the bell on the door and the cat that sits on the counter.

Your front yard is back to the north. The corner store is to the south.`,
  exits: {
    north: "front-yard",
    n: "front-yard",
    south: "corner-store",
    s: "corner-store"
  },
  items: ["sturdy-stick"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("street-south")) return outputs;
    outputs.push({
      text: "A sprinkler is going in someone's yard. The rhythmic tch-tch-tch-tch is the most normal sound you've heard all day.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("hendersons-yard", {
  id: "hendersons-yard",
  name: "The Hendersons' Yard",
  description: `The Hendersons' front yard. Immaculate, as always. Mrs. Henderson's rose bushes are in full bloom \u2014 red, pink, white. The garden gnomes stand in their usual formation near the walkway. There are five of them. You could swear there used to be four.

The Hendersons' front door is closed. No lights on inside.

The street is back to the west.`,
  exits: { west: "street-north", w: "street-north" },
  items: ["garden-gnome"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("hendersons-yard")) return outputs;
    outputs.push({
      text: "The roses smell incredible. You've walked past this yard a hundred times and never noticed how strong the smell is. Maybe you just never paid attention before.",
      type: "narration"
    });
    return outputs;
  }
});
rooms.set("park", {
  id: "park",
  name: "Oakvale Park",
  description: `The neighborhood park. A swing set, a rusted slide, a bench with a memorial plaque you've never bothered to read. The big oak tree dominates the center \u2014 massive trunk, branches spreading wide enough to shade half the park.

The grass is green and freshly cut. Someone's left a soccer ball near the swings. Everything looks perfectly, aggressively normal.

Except for the thing sitting at the base of the oak tree.

It's about the size of a large dog, but it's not a dog. It's... you're not sure what it is. It looks like someone described a lizard to a person who'd never seen one, and that person sculpted it out of wet clay and forgot to smooth it out. It's watching you with calm, amber eyes. It doesn't seem hostile. It seems curious.

The street is back to the south.`,
  exits: { south: "street-north", s: "street-north" },
  items: ["memorial-plaque-rubbing"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("park")) return outputs;
    outputs.push({
      text: "The oak tree is even bigger than you remembered. It must be two hundred years old. The System overlay shimmers faintly around its trunk, like heat haze.",
      type: "narration"
    });
    outputs.push({ text: "", type: "normal" });
    outputs.push({
      text: "\u2592\u2592\u2592 ENTITY DETECTED \u2592\u2592\u2592",
      type: "system"
    });
    outputs.push({
      text: "The Reach has IDENTIFIED a previously uncatalogued LIFE FORM in your vicinity! REMAIN CALM! This is EXTREMELY exciting! Classification is PENDING but initial readings suggest it is NOT IMMEDIATELY LETHAL! The Reach rates your chances of survival at a VERY ENCOURAGING 73%!",
      type: "system"
    });
    return outputs;
  }
});
rooms.set("corner-store", {
  id: "corner-store",
  name: "Raj's Quik-Mart",
  description: `Raj's Quik-Mart. The bell dings when you push the door open. Fluorescent lights, linoleum floor, aisles of snacks and necessities. The cat \u2014 an enormous orange tabby named Sergeant \u2014 is on the counter, watching you with the same expression he always has: vague contempt.

Raj isn't here. The store is empty. But the lights are on, the Open sign is lit, and the coffee machine is gurgling away like it's a normal Tuesday. The radio behind the counter is playing classic rock, a little too quietly to make out the song.

The street is back to the north.`,
  exits: { north: "street-south", n: "street-south" },
  items: ["energy-drink", "bag-of-jerky"],
  firstVisit: true,
  onEnter: (state) => {
    const outputs = [];
    if (state.visitedRooms.has("corner-store")) return outputs;
    outputs.push({
      text: "The bell on the door dings. Sergeant the cat looks up, decides you're not interesting, and goes back to sleep. Some things never change.",
      type: "narration"
    });
    return outputs;
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
  description: "A smooth, dark stone about the size of a plum. You found it in the creek behind your grandmother's house when you were seven. You carried it in your pocket for a week. When your parents tried to make you leave it behind, you cried until they gave up. It's been on that shelf ever since, in a box with your old baseball cards and a broken watch. It's warm to the touch. It has always been warm to the touch, even in winter, even when the house was freezing. You just always figured rocks were like that.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[    ] \u2014 Rarity: \u221E
OH. OH YES. NOW THIS \u2014 THIS IS SOMETHING! The Reach has catalogued TEN BILLION artifacts across COUNTLESS worlds and THIS \u2014 a rock from a creek \u2014 THIS is the one that makes the whole system sit up and PAY ATTENTION! Classification? BEYOND CLASSIFICATION! Rarity? THE SCALE DOESN'T GO HIGH ENOUGH! This stone has been waiting on that shelf for YEARS, candidate, tucked behind baseball cards like it was NOTHING, and the whole time it was \u2014 it was \u2014
The Reach STRONGLY RECOMMENDS you keep this on your person AT ALL TIMES. For reasons. EXCELLENT reasons. The BEST reasons. Or maybe not. No further questions.
  +??? +??? +???
CLASSIFICATION: \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 / \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588`,
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
items.set("system-compass", {
  id: "system-compass",
  name: "system compass",
  description: "It looks like a compass, but it's not made of anything you can identify. Translucent, like the status screen, but solid enough to hold. The needle doesn't point north. It spins slowly, then stops, pointing... somewhere. It changes when you move.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Waypoint Resonator] \u2014 Rarity: RARE
NOW we are getting somewhere! LITERALLY! This device \u2014 and the Reach uses the word "device" with MAXIMUM respect \u2014 is a NAVIGATIONAL INSTRUMENT of the HIGHEST ORDER! It points toward things of INTEREST! Things of VALUE! Things that want to be FOUND! The Reach PERSONALLY calibrated this unit and is QUITE proud of the results! Follow the needle, candidate! ADVENTURE AWAITS!
  +2 Awareness
  +1 Resonance
CLASSIFICATION: TOOL / NAVIGATIONAL / SYSTEM-LINKED`,
  takeable: true,
  effects: { Awareness: 2, Resonance: 1 },
  usable: false
});
items.set("sturdy-stick", {
  id: "sturdy-stick",
  name: "sturdy stick",
  description: "A thick branch that fell from one of the street trees. About three feet long, solid oak, with a satisfying heft to it. The kind of stick you would have been thrilled to find when you were ten.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Bough of the Street Oak] \u2014 Rarity: COMMON
A WEAPON plucked from the VERY BODY of a noble tree! Oak \u2014 the wood of KINGS and SHIP BUILDERS and people who take things SERIOUSLY! This branch fell of its own accord, which means \u2014 according to Reach doctrine \u2014 it CHOSE you! Or it was windy. Either way, EXCELLENT reach and solid swing weight!
  +1 Edge
  +1 Flexibility
CLASSIFICATION: MELEE / BLUNT / ARBOREAL`,
  takeable: true,
  effects: { Edge: 1, Flexibility: 1 },
  usable: false
});
items.set("garden-gnome", {
  id: "garden-gnome",
  name: "garden gnome",
  description: `One of Mrs. Henderson's garden gnomes. This one is standing slightly apart from the others, near the edge of the yard, facing your direction. It's wearing a red hat and holding a tiny fishing rod. Ceramic, about a foot tall. Heavy for its size. There's something written on the bottom in Sharpie: "Gerald."`,
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Gerald, the Vigilant] \u2014 Rarity: UNCOMMON
The Reach has OPINIONS about this one! Gerald has been standing in this yard for ELEVEN YEARS and in that time has witnessed EVERYTHING that has occurred on Maple Street! EVERYTHING! His ceramic eyes see all! His tiny fishing rod catches more than fish \u2014 it catches SECRETS! The Reach is not saying Gerald is alive. The Reach is not saying Gerald is NOT alive. The Reach DECLINES TO COMMENT.
  +2 Awareness
CLASSIFICATION: SENTINEL / CERAMIC / AMBIGUOUS`,
  takeable: true,
  effects: { Awareness: 2 },
  usable: false
});
items.set("energy-drink", {
  id: "energy-drink",
  name: "energy drink",
  description: `A can of "VOLT SURGE \u2014 MAXIMUM ENERGY" from the cooler at Raj's. The can is ice cold and the ingredients list includes something called "taurine complex" which sounds made up. But you could use the boost.`,
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Elixir of Suburban Vitality] \u2014 Rarity: COMMON
BEHOLD! A POTION brewed in the GREAT ALCHEMICAL FACTORIES of the modern age! Its ingredients \u2014 caffeine, sugar, something called "taurine" that the Reach ASSURES you comes from a very reputable source \u2014 combine to produce a SURGE of temporary vigor! Available at fine convenience stores everywhere for $3.49! The Reach considers this a BARGAIN!
  +1 Edge
  +1 Resourcefulness
CLASSIFICATION: CONSUMABLE / ENERGETIC / CARBONATED`,
  takeable: true,
  effects: { Edge: 1, Resourcefulness: 1 },
  usable: false
});
items.set("bag-of-jerky", {
  id: "bag-of-jerky",
  name: "bag of jerky",
  description: "A bag of teriyaki beef jerky from behind the counter. Raj keeps the good stuff back there. It's the expensive kind \u2014 small batch, actually tastes like food. You feel a little guilty taking it without paying, but Raj isn't here and the world might be ending. Or beginning. Hard to tell.",
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Provisions of the Absent Merchant] \u2014 Rarity: COMMON
SUSTENANCE! Every great adventurer needs PROVISIONS and these dried meat strips \u2014 teriyaki-flavored, small-batch, artisanally preserved \u2014 are EXACTLY the kind of rations that fuel LEGENDARY JOURNEYS! The Reach notes that you did not pay for these. The Reach does not judge. The Reach understands that sometimes DESTINY requires a five-finger discount.
  +1 Resourcefulness
  +1 Flexibility
CLASSIFICATION: CONSUMABLE / SUSTENANCE / ETHICALLY GRAY`,
  takeable: true,
  effects: { Resourcefulness: 1, Flexibility: 1 },
  usable: false
});
items.set("memorial-plaque-rubbing", {
  id: "memorial-plaque-rubbing",
  name: "plaque rubbing",
  description: `You don't have paper or charcoal, but when you touch the plaque on the park bench, the text seems to imprint itself on your hand for a moment before fading. It read: "In memory of Eleanor Voss, who planted the oak and never left its shade. 1847-1932." That tree is older than you thought.`,
  systemDescription: `\u2592\u2592\u2592 ITEM ACQUIRED \u2592\u2592\u2592
[Echo of Eleanor Voss] \u2014 Rarity: UNCOMMON
FASCINATING! The Reach has accessed its records and \u2014 oh my. OH MY! Eleanor Voss! The Reach KNOWS that name! Or rather, the Reach knows the ECHO of that name, reverberating through the substrate of this neighborhood like a bell that was struck a hundred and seventy-four years ago and NEVER STOPPED RINGING! This plaque is a CONDUIT! A TINY DOOR! The Reach is being DELIBERATELY VAGUE because the truth would OVERWHELM you at this stage!
  +2 Resonance
  +1 ???
CLASSIFICATION: ARTIFACT / MEMORIAL / RESONANT`,
  takeable: true,
  effects: { Resonance: 2, "???": 1 },
  usable: false
});
function getRoom(id) {
  return rooms.get(id);
}
function getItem(id) {
  return items.get(id);
}
var originalRoomItems = {};
for (const [id, room] of rooms) {
  originalRoomItems[id] = [...room.items];
}
function resetWorld() {
  for (const [id, room] of rooms) {
    room.items = [...originalRoomItems[id] || []];
    room.firstVisit = true;
  }
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
var MAX_INVENTORY = 5;
function addToInventory(state, itemId) {
  const item = getItem(itemId);
  if (!item) {
    return [{ text: "That doesn't seem to exist.", type: "error" }];
  }
  if (!item.takeable) {
    return [{ text: "You can't take that.", type: "normal" }];
  }
  if (state.inventory.length >= MAX_INVENTORY) {
    return [
      { text: `Your hands are full. You're already carrying ${state.inventory.length} items.`, type: "normal" },
      { text: "", type: "normal" },
      { text: `\u2592\u2592\u2592 CAPACITY EXCEEDED \u2592\u2592\u2592`, type: "system" },
      { text: `The Reach APPRECIATES your collector's instinct! TRULY! But even ENHANCED candidates have only TWO HANDS and \u2014 at MOST \u2014 several pockets! Drop something first. The Reach BELIEVES in you but cannot SUSPEND PHYSICS. Yet.`, type: "system" }
    ];
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
  "upstairs-hall": getUpstairsHallDescription,
  study: getStudyDescription
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
  if (targetId === "front-yard" && !state.flags.survivedStudy) {
    return [{ text: "You try the front door. It's unlocked \u2014 it was always unlocked \u2014 but your hand won't turn the knob. Something unfinished upstairs. You should deal with that first.", type: "narration" }];
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
function executeHelp(state) {
  const cmds = [
    { text: "\u2592\u2592\u2592 SYSTEM ASSISTANCE PROTOCOL \u2592\u2592\u2592", type: "system" },
    { text: "", type: "normal" },
    { text: "  look (l)         \u2014 observe your surroundings", type: "normal" },
    { text: "  go <direction>   \u2014 move (or just type n/s/e/w)", type: "normal" },
    { text: "  take <item>      \u2014 pick up an item", type: "normal" },
    { text: "  drop <item>      \u2014 drop an item", type: "normal" },
    { text: "  examine <item>   \u2014 inspect an item closely", type: "normal" },
    { text: "  inventory (i)    \u2014 check what you're carrying", type: "normal" },
    { text: "  status           \u2014 view your status screen", type: "normal" }
  ];
  if (state.statusScreen.Awareness >= 4) {
    cmds.push({ text: "  inspect <thing>  \u2014 focus your awareness on something", type: "normal" });
  }
  cmds.push({ text: "  help (?)         \u2014 this message", type: "normal" });
  cmds.push({ text: "", type: "normal" });
  cmds.push({ text: "The Reach provides. The Reach observes.", type: "narration" });
  return cmds;
}
var inspectables = {
  "front-yard": {
    mailbox: {
      low: "It's your mailbox. White, slightly dented from that time the snowplow came too close. Flag is down.",
      high: `Your mailbox. The System overlay shimmers around it.
\u2592\u2592\u2592 OBJECT SCAN \u2592\u2592\u2592
[Postal Receptacle \u2014 Class: MUNDANE]
The Reach detects NOTHING of note about this mailbox. It is a box. For mail. HOWEVER \u2014 and the Reach wants to be VERY clear about this \u2014 the ABSENCE of significance is ITSELF significant! In a world where everything has been catalogued, an object that resists classification is DEEPLY INTERESTING! Also there's a coupon flyer inside.
THREAT LEVEL: NONE / MAIL`
    },
    lawn: {
      low: "Your lawn. It needs mowing.",
      high: `Your lawn. The System overlay shows a faint green shimmer across the grass.
\u2592\u2592\u2592 TERRAIN SCAN \u2592\u2592\u2592
[Suburban Grassland \u2014 Class: TERRITORY]
REMARKABLE! This patch of cultivated earth has been maintained by YOU for YEARS! Every blade of grass is a tiny soldier in your personal army of landscaping! The Reach detects trace amounts of ORGANIC POTENTIAL in the soil. Something could grow here that isn't grass. The Reach is not suggesting you plant anything. The Reach is merely OBSERVING.
FERTILITY: MODERATE / UNTAPPED`
    }
  },
  park: {
    creature: {
      low: "It's... something. You can't quite focus on it. Like looking at a word you almost remember.",
      high: `You focus on the creature at the base of the oak tree. The System overlay flares.
\u2592\u2592\u2592 ENTITY SCAN \u2592\u2592\u2592
[Territorial Grazer \u2014 Class: FAUNA / EMERGENT]
OH WONDERFUL! You can SEE it now! REALLY see it! This creature is a PRODUCT of the Reach \u2014 a life form that emerged when the System integrated with your local ecosystem! It is NOT dangerous unless provoked! It FEEDS on ambient resonance and NESTS near old, significant things \u2014 hence the oak tree! The Reach classifies it as FRIENDLY! Mostly! 73% friendly!
DISPOSITION: CURIOUS / PROBABLY FINE
EDGE: 3  |  AWARENESS: 5  |  RESONANCE: 7`
    },
    oak: {
      low: "A big oak tree. Been here longer than any of the houses on the street.",
      high: `The oak tree. The System overlay shimmers intensely around it, more than anything else you've seen.
\u2592\u2592\u2592 ENTITY SCAN \u2592\u2592\u2592
[The Oakvale Anchor \u2014 Class: FLORA / PRIMORDIAL]
This tree is TWO HUNDRED AND SEVENTEEN YEARS OLD! It was here before the neighborhood! Before the ROADS! Before the CONCEPT of suburbs! The Reach recognizes it as a NATURAL ANCHOR POINT \u2014 a place where the boundary between the mundane and the extraordinary was ALREADY thin! Eleanor Voss knew. She planted it here ON PURPOSE. The Reach is VERY impressed with Eleanor Voss!
RESONANCE: IMMENSE / OFF-SCALE`
    }
  },
  "corner-store": {
    sergeant: {
      low: "An orange tabby cat. Very large. Very unimpressed with you.",
      high: `You focus on Sergeant the cat. The System overlay flickers uncertainly.
\u2592\u2592\u2592 ENTITY SCAN \u2592\u2592\u2592
[Sergeant \u2014 Class: ???]
The Reach... cannot fully scan this entity. This is NOT because the cat is powerful. The Reach wants to be CLEAR about that. It is because the cat is AGGRESSIVELY INDIFFERENT to being scanned. The Reach's classification protocols require a MINIMUM level of cooperation from the subject and Sergeant is providing NONE. The Reach has encountered this before with cats. It is INFURIATING.
DISPOSITION: CONTEMPTUOUS / UNKNOWABLE`
    },
    cat: { low: "", high: "" },
    // alias
    radio: {
      low: "The radio behind the counter. Playing classic rock, too quietly to make out the song.",
      high: `You focus on the radio. The System overlay pulses gently in time with the music.
\u2592\u2592\u2592 OBJECT SCAN \u2592\u2592\u2592
[Frequency Receiver \u2014 Class: MUNDANE+]
The song playing is "Don't Fear the Reaper" by Blue \xD6yster Cult. The Reach wants you to know this is a COINCIDENCE and not a MESSAGE. The Reach does not communicate through CLASSIC ROCK RADIO. That would be RIDICULOUS. Although, if it DID, it would have EXCELLENT taste.
SIGNAL: AMBIENT / COINCIDENTAL`
    }
  },
  "hendersons-yard": {
    gnomes: {
      low: "Mrs. Henderson's garden gnomes. Five of them, standing in a row.",
      high: `You focus on the garden gnomes. The System overlay lights up.
\u2592\u2592\u2592 COLLECTIVE SCAN \u2592\u2592\u2592
[Henderson Sentinels \u2014 Class: CERAMIC / AMBIGUOUS]
FIVE gnomes! There WERE four! The fifth appeared AFTER the System initialized! The Reach is FASCINATED! Did the System create it? Did it arrive independently? Was it ALWAYS there and nobody NOTICED? The Reach has SEVENTEEN THEORIES and they are ALL compelling! Gerald in particular radiates a FAINT but MEASURABLE awareness signature!
COLLECTIVE DISPOSITION: VIGILANT / GARDEN-BOUND`
    },
    roses: {
      low: "Mrs. Henderson's roses. Red, pink, white. They smell amazing.",
      high: `You focus on the rose bushes. The System overlay shows a warm glow around them.
\u2592\u2592\u2592 FLORA SCAN \u2592\u2592\u2592
[Henderson Cultivars \u2014 Class: FLORA / TENDED]
These roses have been LOVINGLY maintained for OVER A DECADE! Mrs. Henderson's dedication to her garden has created a MICROBIOME of extraordinary vitality! The Reach detects elevated resonance levels in the soil \u2014 someone who tends something with this much care LEAVES A MARK on the world! The Reach finds this GENUINELY touching!
RESONANCE: WARM / CULTIVATED`
    }
  }
};
function executeInspect(state, noun) {
  if (!noun) {
    return [{ text: "Inspect what?", type: "normal" }];
  }
  if (state.statusScreen.Awareness < 4) {
    return [{ text: `You look at the ${noun}. It's... a ${noun}. You're not sure what you expected.`, type: "normal" }];
  }
  const roomInspectables = inspectables[state.currentRoom];
  if (!roomInspectables) {
    return [{ text: `There's nothing special to inspect here. Or maybe there is and you're not focused enough.`, type: "narration" }];
  }
  const lower = noun.toLowerCase();
  const entry = roomInspectables[lower];
  if (!entry || !entry.high) {
    for (const [key, val] of Object.entries(roomInspectables)) {
      if (lower.includes(key) || key.includes(lower)) {
        if (val.high) {
          return [{ text: val.high, type: "system" }];
        }
      }
    }
    return [{ text: `You focus on the ${noun}. The System overlay doesn't react. Maybe it's just... a ${noun}.`, type: "narration" }];
  }
  return [{ text: entry.high, type: "system" }];
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
var DEAD_TAUNTS = {
  restart: [
    { text: '"Restart."', type: "death" },
    { text: "", type: "normal" },
    { text: "THE REACH CONSIDERS YOUR REQUEST.", type: "system" },
    { text: 'RESTART WHAT, EXACTLY? YOUR CIRCULATORY SYSTEM? YOUR NEURAL ACTIVITY? THE CONCEPT OF "YOU"?', type: "system" },
    { text: "THE REACH APPRECIATES THE OPTIMISM BUT MUST RESPECTFULLY DECLINE.", type: "system" }
  ],
  refresh: [
    { text: '"Refresh."', type: "death" },
    { text: "", type: "normal" },
    { text: 'AH YES. "REFRESH." AS ONE REFRESHES A BROWSER TAB OR A TALL GLASS OF LEMONADE.', type: "system" },
    { text: "UNFORTUNATELY, DEATH IS NOT A BROWSER TAB. THOUGH THE REACH ADMIRES THE LATERAL THINKING.", type: "system" }
  ],
  reset: [
    { text: '"Reset."', type: "death" },
    { text: "", type: "normal" },
    { text: 'THE REACH HAS SEARCHED ITS EXTENSIVE PROTOCOL LIBRARY AND FOUND NO "RESET" OPTION.', type: "system" },
    { text: "THIS IS BY DESIGN. DEATH IS A FEATURE, NOT A BUG.", type: "system" }
  ],
  undo: [
    { text: '"Undo."', type: "death" },
    { text: "", type: "normal" },
    { text: "THE REACH REGRETS TO INFORM YOU THAT CTRL+Z DOES NOT WORK ON MORTALITY.", type: "system" },
    { text: "BELIEVE IT, THE REACH HAS TRIED.", type: "system" }
  ],
  help: [
    { text: "YOU ARE BEYOND HELP. THIS IS NOT A JUDGMENT \u2014 IT IS A FACTUAL ASSESSMENT OF YOUR VITAL SIGNS.", type: "system" },
    { text: "ALTHOUGH... THE REACH SUPPOSES THAT IN SOME WORLDS, IN SOME SYSTEMS, THE FALLEN HAVE BEEN KNOWN TO... NO. NEVER MIND. IT IS CERTAINLY NOT A SINGLE WORD THAT GAMERS WOULD KNOW.", type: "system" }
  ]
};
function executeDeadCommand(verb, state) {
  if (verb === "respawn") {
    return executeRespawn(state);
  }
  if (DEAD_TAUNTS[verb]) {
    return DEAD_TAUNTS[verb];
  }
  const generic = [
    'You are dead. Dead people do not "' + verb + '."',
    "Nothing happens. On account of you being dead.",
    'The dead do not "' + verb + '." The dead do very little, as a rule.'
  ];
  return [{ text: generic[Math.floor(Math.random() * generic.length)], type: "death" }];
}
function executeRespawn(state) {
  resetWorld();
  state.currentRoom = "kitchen";
  state.inventory = [];
  state.statusScreen = { Edge: 0, Awareness: 0, Resourcefulness: 0, Flexibility: 0, Resonance: 0, "???": 0 };
  state.visitedRooms = /* @__PURE__ */ new Set(["kitchen"]);
  state.turnCount = 0;
  state.flags = { systemInitialized: true, identified: {}, hasRespawned: true };
  console.log("[RESPAWN] Full reset \u2014 back to kitchen with nothing");
  return [
    { text: "", type: "normal" },
    { text: "...", type: "narration" },
    { text: "", type: "normal" },
    { text: '"Respawn."', type: "normal" },
    { text: "", type: "normal" },
    { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
    { text: "THE REACH PAUSES.", type: "system" },
    { text: "\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592\u2592", type: "system" },
    { text: "", type: "normal" },
    { text: "...FINE.", type: "system" },
    { text: "", type: "normal" },
    { text: "THE REACH HAS DETERMINED THAT YOUR TERMINATION WAS \u2014 PERHAPS \u2014 PREMATURE. NOT BECAUSE THE REACH MADE AN ERROR. THE REACH DOES NOT MAKE ERRORS. BUT BECAUSE YOUR POTENTIAL REMAINS... UNREALIZED. AND UNREALIZED POTENTIAL IS WASTEFUL. THE REACH ABHORS WASTE.", type: "system" },
    { text: "", type: "normal" },
    { text: "RESPAWN PROTOCOL: ENGAGED.", type: "system" },
    { text: "DESIGNATION: STILL PENDING.", type: "system" },
    { text: "DO BETTER THIS TIME.", type: "system" },
    { text: "", type: "normal" },
    { text: "You open your eyes. Kitchen floor. Linoleum. Again.", type: "normal" },
    { text: "Your pockets are empty. Your stats are gone. You remember everything, though. That's something.", type: "narration" }
  ];
}
function executeCommand(cmd, state) {
  if (state.flags.dead) {
    return executeDeadCommand(cmd.verb, state);
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
    case "inspect":
      return executeInspect(state, cmd.noun);
    case "help":
      return executeHelp(state);
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
function getScreenText() {
  const outputEl2 = document.getElementById("output");
  return outputEl2?.innerText ?? "";
}
function buildPrompt() {
  const screen = transcript.length === 0 ? getScreenText() : transcript.slice(-40).join("\n");
  return screen + "\n\n>";
}
async function callModel(prompt) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: "You are playing a text adventure. Respond with only a short command (1-4 words). No prose, no narration, no markdown." },
      { role: "user", content: prompt }
    ],
    max_tokens: 20,
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
  let cmd = raw.replace(/```[\s\S]*?```/g, "").replace(/^#+\s*/gm, "").replace(/^[*_~`>]+/gm, "").replace(/[*_~`]+$/gm, "").replace(/^["']+|["']+$/g, "").trim();
  cmd = cmd.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)[0] || "";
  cmd = cmd.replace(/^>\s*/, "");
  return cmd.toLowerCase();
}
async function step() {
  if (thinking) throw new Error("Already thinking");
  thinking = true;
  try {
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
var STEP_DELAY = 12e3;
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
