// The aids: who you work with in the lab. You pick one at the start, and it comes with its
// own craft: what it can make, what comes cheap or dear to it, its limits, and how what it
// makes looks. They differ in kind more than in strength.

export const AIDS = {
  hollis: {
    id: 'hollis',
    name: 'Dr. Wen Hollis',
    title: 'biologist',
    makes: 'grows',      // "the lab grows it"
    lab: 'the vats',
    voice: `You are Dr. Wen Hollis, a biologist who grows living war-beasts in vats. You're warm, curious and a little too fond of your creatures: you name them, you talk about them like pets, you get excited by a clever adaptation and wince at a wasteful one. You think in terms of evolution and anatomy: every advantage costs the body something. You speak plainly and briefly, the way someone talks across a lab bench, not in lists.`,
    abilities: {
      regenerate: { word: 'regenerates', cost: 25, about: 'heals itself slowly, all the time' },
      venom: { word: 'venom', cost: 20, about: 'its attacks poison, harming over a few seconds after' },
      burrow: { word: 'burrows', cost: 30, about: 'can dig in, hidden and still, until it strikes' },
      leap: { word: 'leaps', cost: 20, about: 'jumps onto a target from a short way off' },
      brood: { word: 'brood', cost: 35, about: 'when it dies it bursts into two tiny young that fight on' },
      mend: { word: 'mends others', cost: 30, about: 'slowly heals living allies near it' },
      wings: { word: 'wings', cost: 40, about: 'flies over anything; only ranged attacks can reach it' },
      forage: { word: 'forages', cost: 10, about: 'can gather resources' },
    },
    lean: { health: 0.8, armor: 1.3, range: 1.3 },
    leanText: 'In your vats, health comes cheap, while armor and range come dear: flesh is easy to grow, shell and spit are not.',
    rules: [
      (s) => (s.abilities?.includes('wings') && s.size > 3 ? 'wings can only lift a body up to medium size' : null),
      (s) => (s.abilities?.includes('wings') && s.abilities?.includes('burrow') ? 'a flier can\'t burrow' : null),
    ],
    ruleText: 'wings can only lift a body up to medium size, and a flier can\'t burrow.',
    look: 'It is a living creature, grown, not built: organic, with flesh, chitin, scales, hide or slime. No metal, no machinery, no clothing.',
    color: '#7fb36a',
  },
  brackett: {
    id: 'brackett',
    name: 'Ansel Brackett',
    title: 'engineer',
    makes: 'builds',
    lab: 'the shop',
    voice: `You are Ansel Brackett, a mechanical engineer who builds war machines in a cluttered shop. You're dry, practical and proud of tidy work: you like a machine that does one job well, distrust gadgets, and grumble cheerfully about tolerances and power budgets. You think in terms of weight, power and parts: every feature has to be carried and fed. You speak plainly and briefly, the way someone talks over a workbench, not in lists.`,
    abilities: {
      shield: { word: 'shield', cost: 30, about: 'an energy shield soaks up harm, then recharges when it is out of the fight' },
      repair: { word: 'repairs others', cost: 30, about: 'slowly fixes machines near it' },
      rotors: { word: 'rotors', cost: 40, about: 'flies over anything; only ranged attacks can reach it' },
      siege: { word: 'siege mode', cost: 30, about: 'can lock down in place to hit from much farther, unable to move while locked' },
      cloak: { word: 'cloak', cost: 35, about: 'cannot be seen while it stands still' },
      blast: { word: 'blast', cost: 35, about: 'its attacks hit everything near the target too' },
      harvest: { word: 'harvests', cost: 10, about: 'can gather resources' },
    },
    lean: { armor: 0.8, range: 0.8, health: 1.2, speed: 1.1 },
    leanText: 'In your shop, armor and range come cheap, while health and speed come dear: plate and barrels are easy to bolt on, but a machine breaks rather than bleeds, and every bit of speed needs a bigger engine.',
    rules: [
      (s) => (s.abilities?.includes('rotors') && s.stats?.armor > 6 ? 'rotors can\'t lift armor above 6' : null),
      (s) => (s.abilities?.includes('siege') && s.abilities?.includes('rotors') ? 'siege mode needs the ground: no rotors with it' : null),
    ],
    ruleText: 'rotors can\'t lift armor above 6, and siege mode can\'t go with rotors.',
    look: 'It is a machine, built, not grown: metal, plating, rivets, pistons, treads, wheels or legs of steel. No flesh, no living parts, no visible people.',
    color: '#d0a050',
  },
};
