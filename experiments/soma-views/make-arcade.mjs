// A bigger body than any live ludant has yet: Genek's soma, with its game grown into a
// cabinet of three, its own sword-walk plus Evevina's fishing and Anithis's skunks, each
// kept whole as a function inside. Press 1, 2 or 3 to switch. It's synthetic (no ludant grew
// like this), but every line of it is real game code, and it all runs.
//
//   node make-arcade.mjs     → data/arcade.json

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const load = (id) => JSON.parse(readFileSync(join(import.meta.dirname, 'data', `${id}.json`), 'utf8'));
const genek = load('genek-09adf3'), evevina = load('evevina-f08ff7'), anithis = load('anithis-c81ec4');

/** A game section's function, renamed, indented one level. */
const inner = (code, name) => code.replace(/^function game\(stage, me\)/m, `function ${name}(stage, me)`).split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');

const game = `// Arcade: three games in one cabinet. Press 1 for sword-walk, 2 for day-fishing, 3 for skuntin'.
function game(stage, me) {
  // Each game keeps its own things in the store, under its own prefix.
  const store = me.surfaces.store;
  const own = (prefix) => Object.create(me, { surfaces: { value: { ...me.surfaces, store: {
    get: (k, d) => store.get(prefix + k, d), set: (k, v) => store.set(prefix + k, v),
  } } } });

${inner(evevina.soma.sections.game, 'dayFishing')}

${inner(anithis.soma.sections.game, 'skuntin')}

${inner(genek.soma.sections.game, 'swordWalk')}

  // ---------- the cabinet ----------
  // Each game sets up at once, so switching keeps where you were. sword-walk goes last:
  // it switches on 3D, and the 2D games paint over it while they're the one playing.
  const fishing = dayFishing(stage, own('fishing.'));
  const skunks = skuntin(stage, own('skuntin.'));
  const sword = swordWalk(stage, own('sword.'));
  const GAMES = [
    { key: '1', name: 'sword-walk', g: sword, w: 800, h: 450 },
    { key: '2', name: 'day-fishing', g: fishing, w: 640, h: 360 },
    { key: '3', name: "skuntin'", g: skunks, w: 640, h: 360 },
  ];
  let on = GAMES[0];
  stage.size(on.w, on.h);
  return {
    ...sword,
    frame(dt) {
      const pick = GAMES.find((x) => stage.input.pressed.has(x.key));
      if (pick && pick !== on) { on = pick; stage.size(on.w, on.h); }
      on.g.frame?.(dt);
    },
    key(e) { on.g.key?.(e); },
    pointer(e) { on.g.pointer?.(e); },
    playing: () => on.name,
  };
}`;

const sections = { ...genek.soma.sections, game, title: 'arcade' };
sections.identity = "I'm an arcade cabinet with three games in me: sword-walk (clearing roads through a 3D forest with a sword), day-fishing (one two-minute day on a boat), and skuntin' (two dogs, skunks, a family at home). 1, 2 and 3 switch between them.";
writeFileSync(join(import.meta.dirname, 'data', 'arcade.json'), JSON.stringify({ id: 'arcade', soma: { given: 'Genek', sections }, lineage: genek.lineage, familyNames: genek.familyNames, art: [] }, null, 1));
console.log('arcade: game', game.length, 'chars,', game.split('\n').length, 'lines; soma', Object.values(sections).join('').length, 'chars');
