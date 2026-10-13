// The instruction set. Every glyph is also a number (its index here), so READ pushes
// a number, WRITE/GROW pop one, and `'` pushes the code of the next cell.
// Code 0 is `.` (no-op), which is what a grown cell holds unless told otherwise.

export const GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDAKI~xn";
/** Glyphs before The Climb's chemistry ones (I ~ x n): every other mode mutates and writes only these, so its runs replay as before. */
export const CLASSIC_GLYPHS = GLYPHS.indexOf('I');

export const CODE: Record<string, number> = {};
for (let i = 0; i < GLYPHS.length; i++) CODE[GLYPHS[i]] = i;

export function glyphOf(code: number): string {
  return GLYPHS[code] ?? '.';
}

// Directions: 0=E 1=S 2=W 3=N (numbers on the stack).
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const DIR_NAMES = ['E', 'S', 'W', 'N'];

// Cycle cost of each instruction (default 1). Cost is paid from the warrior's
// speed accumulator, so a 4-cycle bomb at speed 1 takes 4 ticks.
export const COST: Record<string, number> = { M: 2, G: 2, B: 4, W: 3 };

// Things SCAN/LOOK can report.
export const T_NOTHING = 0;
export const T_WALL = 1;
export const T_ENEMY = 2;
export const T_DEBRIS = 3;
export const T_SIZE = 4;
export const T_SPEED = 5;
export const T_RESOURCE = 6; // SCAN only: either kind of resource

export const GLYPH_DOCS: Record<string, string> = {
  '.': 'no-op',
  '>': 'go east', '<': 'go west', '^': 'go north', 'v': 'go south',
  '_': 'pop; 0 → east, else west',
  '|': 'pop; 0 → south, else north',
  '#': 'skip the next cell',
  '?': 'go in a random direction',
  '@': 'DIE (the poison glyph)',
  'r': 'reverse direction', '[': 'turn left', ']': 'turn right',
  '0': 'push 0..9 (digits)',
  ':': 'dup', '\\': 'swap top two', '$': 'drop', 'o': 'over (a b → a b a)',
  '+': 'a+b', '-': 'a-b', '*': 'a*b', '/': 'a/b (0 if b=0)', '%': 'a%b (0 if b=0)',
  '!': 'not', '`': 'a>b', '=': 'a==b',
  "'": 'push the code of the next cell, and skip it',
  'y': 'pop n; push random 0..n-1',
  's': 'push my cell count', 'm': 'push my max size', 'f': 'push my speed ×10',
  'd': 'push my direction',
  'e': 'push 1 if the last action succeeded, else 0',
  'L': 'LOOK: pop dir; push distance, type of the first thing seen that way',
  'S': 'SCAN: pop type; push dx, dy, found for the nearest visible thing of that type',
  'R': 'READ: pop dx dy; push the code at that cell (-1 if empty/unseen)',
  'T': 'TOWARD: pop dx dy; push the direction that heads there (random if 0,0)',
  'M': 'SHIFT: pop dir; move my whole body one step (only if all clear)',
  'F': 'FLOW: pop dx dy dir; move one of my cells one step (must stay connected)',
  'X': 'SWAP: pop dx1 dy1 dx2 dy2; swap the code of two of my cells',
  'G': 'GROW: pop dir; add a fat cell (.) at the end of my line that way, if my max size has room',
  'C': 'COLLECT: take every resource or debris touching my body',
  'B': 'BOMB: pop dx dy; destroy a visible foreign cell within range (empty stack: the foreign cell nearest my IP holding a glyph I don\'t have)',
  'W': 'WRITE: pop dx dy code; overwrite one of my cells, or a foreign cell within 2 of me',
  'A': 'OOZE: pop dir; amoeboid move: my rearmost cell (code and all) moves to the free spot touching my body farthest that way, if that is ahead of where it was and I stay connected',
  'K': 'no-op; armor: each K in my body lets me live one toxin level deeper (petri dish)',
  'I': 'no-op; insulation: lets me live one step higher (The Climb)',
  '~': 'no-op; chemistry (The Climb): flips the cells beside it, armor (K) ⇄ insulation (I)',
  'x': 'no-op; chemistry (The Climb): doubles the trait of the cells beside it (armor, insulation, bite, move)',
  'n': 'no-op; chemistry (The Climb): the cells beside it weigh nothing',
  'D': 'DIVIDE: pop dir; copy my whole body beyond itself that way as a new warrior (my lineage, but a rival like any other; needs max size ≥ 2× my cells; each copied cell may mutate)',
};
