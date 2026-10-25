// What people ask the ludants for: the kind of thing someone says from the couch. Each
// game gets a small tweak, a feature that touches a few places, and one that cuts across.

export const GAMES = {
  'evevina-f08ff7': {
    about: 'Day-Fishing: a 2D fishing game, one two-minute day per playthrough.',
    tasks: {
      tweak: 'The big golden fish at dusk should be worth double. Can you do that?',
      feature: 'Can you add a shark that swims by now and then? If it touches the fish on my hook, I lose that fish.',
      across: 'Let me pause the game with P, and show PAUSED big in the middle while it\'s paused.',
    },
  },
  'anithis-c81ec4': {
    about: 'skuntin: two dogs harass skunks in a backyard at night, get skunked, and run home to show off.',
    tasks: {
      tweak: 'The skunks are a bit too quick to spray. Make them a little more patient before they spray.',
      feature: 'Add a cat that sometimes wanders across the yard. If a dog barks at it, the cat hisses and runs off, and you get a few points.',
      across: 'Can the family keep a running count of how many times each dog came home stinky, shown on the HUD, and remember it between games?',
    },
  },
  'genek-09adf3': {
    about: 'sword-walk: a 3D forest you clear with a sword, with villages and roads.',
    tasks: {
      tweak: 'Chopping feels slow. Make each slash reach a bit further, maybe half again as far.',
      feature: 'When a tree falls, leave a log on the ground that I can walk over to pick up, and show how many logs I have.',
      across: 'Add a day and night cycle: the light dims to night and back over about two minutes, and show the time of day on the HUD.',
    },
  },
};

/** How the checker plays a game: wait, press about, walk with the pointer, look. */
export const PLAY = [
  { advance: 1 }, { look: true },
  { hold: ' ' }, { advance: 0.3 }, { release: ' ' },
  { hold: 'arrowright' }, { advance: 2 }, { release: 'arrowright' },
  { hold: 'arrowdown' }, { advance: 1.5 }, { release: 'arrowdown' },
  { point: [460, 200, true] }, { advance: 2 }, { point: [460, 200, false] },
  { hold: ' ' }, { advance: 0.3 }, { release: ' ' }, { advance: 2 },
  { look: true },
];
