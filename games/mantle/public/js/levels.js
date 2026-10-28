// The campaign: maps that get harder, each held by a rival with units of their own. Rival
// units are specs like yours, from the same labs, checked and priced by the same contract.
// What makes a later map harder is said in its briefing: a rival with a head start, more
// deposits on their side, a richer supply line, and sharper orders.

import { check } from './spec.js';

const S = (size, health, armor, speed, damage, rate, range, sight, ...abilities) =>
  ({ size, stats: { health, armor, speed, damage, rate, range, sight }, abilities });

// The rivals' units. `aid` is the lab that made it: what it can do, and what it costs.
export const RIVAL_UNITS = {
  picket: { aid: 'brackett', name: 'Picket', spec: S(2, 3, 3, 5, 3, 4, 4, 5),
    description: 'A light two-legged gun walker. Cheap, quick to build, and fine in a crowd.',
    look: 'A small two-legged walker with a boxy body, a single short rifle barrel, olive-drab plating with stenciled numbers and a little sensor eye.' },
  rook: { aid: 'brackett', name: 'Rook', spec: S(3, 6, 6, 4, 5, 3, 1, 3),
    description: 'A squat armored rammer that closes in and hammers whatever it reaches.',
    look: 'A squat, heavily plated tracked machine with a huge hydraulic ram on the front, scuffed gray steel with hazard stripes.' },
  mortar: { aid: 'brackett', name: 'Mortar', spec: S(3, 3, 2, 2, 7, 2, 8, 4, 'siege', 'blast'),
    description: 'Locks down far back and drops shells that burst over a crowd.',
    look: 'A wheeled artillery carriage with a stubby, wide mortar tube, stabilizer legs folded at its sides, and ammunition racks, painted dull green.' },
  bastion: { aid: 'brackett', name: 'Bastion', spec: S(4, 6, 8, 2, 4, 3, 3, 3, 'shield'),
    description: 'A walking wall with a shield projector. Slow, and very hard to put down.',
    look: 'A massive four-legged walker carrying a curved slab of armor like a shield, a glowing blue shield emitter on top, and twin short guns.' },
  hornet: { aid: 'brackett', name: 'Hornet', spec: S(1, 2, 1, 8, 3, 6, 3, 6, 'rotors'),
    description: 'A tiny rotor drone that darts in and peppers its target.',
    look: 'A tiny quad-rotor drone with a yellow-and-black striped body and a single twitching gun barrel underneath.' },
  skitter: { aid: 'hollis', name: 'Skitter', spec: S(1, 2, 1, 8, 3, 6, 1, 4),
    description: 'A dog-sized biting thing that comes in floods.',
    look: 'A small, fast, six-legged biting creature with a glossy black carapace, too many teeth, and a red underbelly.' },
  spitter: { aid: 'hollis', name: 'Spitter', spec: S(2, 3, 1, 4, 4, 4, 5, 5, 'venom'),
    description: 'Lobs venom from behind the swarm; the poison keeps working after.',
    look: 'A hunched, frog-like creature with a swollen green throat sac, pale warty skin and dripping yellow-green spit.' },
  delver: { aid: 'hollis', name: 'Delver', spec: S(3, 6, 3, 4, 6, 3, 1, 3, 'burrow', 'leap'),
    description: 'Waits under the dirt, then leaps out onto whatever walks by.',
    look: 'A mole-like burrowing beast with huge spade claws, a ridged armored snout, dirt-caked gray hide and tiny blind eyes.' },
  moth: { aid: 'hollis', name: 'Moth', spec: S(2, 3, 1, 7, 3, 5, 2, 6, 'wings'),
    description: 'A winged thing that flies over the fight and stings from just out of reach.',
    look: 'A large moth-like flyer with dusty brown-and-ivory patterned wings, a fuzzy body and a long curved stinger.' },
  matron: { aid: 'hollis', name: 'Matron', spec: S(5, 10, 4, 2, 6, 3, 1, 4, 'regenerate', 'brood', 'mend'),
    description: 'A huge, slow mother-beast that heals those around her and bursts into young when she falls.',
    look: 'An enormous bloated grub-like mother creature with pulsing translucent egg sacs on her back, thick pale folds of hide and stubby legs.' },
};

for (const [key, u] of Object.entries(RIVAL_UNITS)) {
  const problems = check(u.spec, u.aid);
  if (problems.length) throw new Error(`rival unit ${key}: ${problems.join('; ')}`);
  u.key = key;
  u.art = `img/rivals/${key}.jpg`;
}

// Where bases stand on every map: yours at the lower left, theirs at the upper right.
export const LEVELS = [
  {
    id: 'outskirts', name: 'The Outskirts', holder: 'a border patrol',
    blurb: 'A thin patrol of gun walkers holds the edge of the plain. They build slowly and come late.',
    w: 1500, h: 950, ground: '#2b2a22', seed: 3,
    deposits: [[420, 330], [1080, 620], [760, 470]],
    units: ['picket'],
    rival: { start: [], build: ['picket'], income: 0.7, firstWave: 170, every: 90, wave: 4, grow: 1 },
  },
  {
    id: 'ford', name: 'Bramble Ford', holder: 'a brood of the river thickets',
    blurb: 'Something breeds in the thickets by the ford. It sends floods of biters, with spitters behind them.',
    w: 1700, h: 1050, ground: '#222a20', seed: 7,
    deposits: [[450, 380], [1250, 670], [850, 300], [850, 760]],
    units: ['skitter', 'spitter'],
    rival: { start: ['skitter', 'skitter'], build: ['skitter', 'skitter', 'spitter'], income: 0.9, firstWave: 120, every: 75, wave: 6, grow: 2 },
  },
  {
    id: 'gunline', name: 'The Gunline', holder: 'an entrenched battery',
    blurb: 'A dug-in battery: mortars locked down behind shielded walls. Charging the guns is costly; going around them may not be.',
    w: 1900, h: 1150, ground: '#2a2724', seed: 11,
    deposits: [[480, 420], [1420, 730], [950, 330], [950, 820], [1500, 300]],
    units: ['picket', 'bastion', 'mortar', 'rook'],
    rival: { start: ['bastion', 'mortar'], build: ['picket', 'rook', 'mortar', 'picket', 'bastion'], income: 1.0, firstWave: 150, every: 80, wave: 8, grow: 2 },
  },
  {
    id: 'warren', name: 'The Warren', holder: 'the burrow-mothers',
    blurb: 'The ground here is hollow. Delvers lie in wait, moths fly over walls, and a Matron keeps them all alive.',
    w: 2000, h: 1250, ground: '#26221c', seed: 19,
    deposits: [[500, 460], [1500, 790], [1000, 380], [1000, 880], [1650, 330], [380, 950]],
    units: ['skitter', 'spitter', 'delver', 'moth', 'matron'],
    rival: { start: ['delver', 'delver', 'moth'], build: ['skitter', 'delver', 'moth', 'spitter', 'skitter', 'matron'], income: 1.3, firstWave: 130, every: 70, wave: 10, grow: 3, ambush: true },
  },
  {
    id: 'crown', name: 'Iron Crown', holder: 'the Crown, with both labs behind it',
    blurb: 'The last hold, fed by both a shop and the vats. It starts with an army and a rich supply line, and it does not wait long.',
    w: 2300, h: 1400, ground: '#24211f', seed: 23,
    deposits: [[560, 500], [1740, 900], [1150, 420], [1150, 980], [1900, 380], [400, 1050], [1150, 700]],
    units: ['picket', 'bastion', 'mortar', 'hornet', 'skitter', 'delver', 'moth', 'matron'],
    rival: { start: ['bastion', 'picket', 'picket', 'hornet', 'delver'], build: ['picket', 'hornet', 'skitter', 'mortar', 'delver', 'moth', 'bastion', 'matron'], income: 1.55, firstWave: 100, every: 60, wave: 10, grow: 3, ambush: true },
  },
];

export const ROSTER_SIZE = 5;
