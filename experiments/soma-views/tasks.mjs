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
    convo: [
      'Can you add a shark that swims by now and then? If it touches the fish on my hook, I lose that fish.',
      'How do I keep my fish away from the shark?',
      'Make the shark come by more often at night, and give a little warning splash just before it shows up.',
      'The big golden fish at dusk should be worth double. Can you do that?',
    ],
  },
  'anithis-c81ec4': {
    about: 'skuntin: two dogs harass skunks in a backyard at night, get skunked, and run home to show off.',
    tasks: {
      tweak: 'The skunks are a bit too quick to spray. Make them a little more patient before they spray.',
      feature: 'Add a cat that sometimes wanders across the yard. If a dog barks at it, the cat hisses and runs off, and you get a few points.',
      across: 'Can the family keep a running count of how many times each dog came home stinky, shown on the HUD, and remember it between games?',
    },
    convo: [
      'Add a cat that sometimes wanders across the yard. If a dog barks at it, the cat hisses and runs off, and you get a few points.',
      'What do I press to bark at the cat?',
      'Make the cat come by a bit more often, and show the points you get for it in orange when it runs off.',
      'The skunks are a bit too quick to spray. Make them a little more patient before they spray.',
    ],
  },
  'genek-09adf3': {
    about: 'sword-walk: a 3D forest you clear with a sword, with villages and roads.',
    tasks: {
      tweak: 'Chopping feels slow. Make each slash reach a bit further, maybe half again as far.',
      feature: 'When a tree falls, leave a log on the ground that I can walk over to pick up, and show how many logs I have.',
      across: 'Add a day and night cycle: the light dims to night and back over about two minutes, and show the time of day on the HUD.',
    },
    convo: [
      'When a tree falls, leave a log on the ground that I can walk over to pick up, and show how many logs I have.',
      'Where do the logs end up when a tree falls?',
      'Let me sell my logs in a village: when I walk into one, each log I carry becomes a coin.',
      'Chopping feels slow. Make each slash reach a bit further, maybe half again as far.',
    ],
  },
  // A bigger body than any live ludant has yet (make-arcade.mjs): three games in one.
  arcade: {
    about: "Arcade: a cabinet of three games, switched with 1, 2 and 3: sword-walk (a 3D forest you clear with a sword, with villages and roads), day-fishing (a 2D fishing game, one two-minute day) and skuntin' (two dogs harass skunks in a backyard at night).",
    tasks: {
      fish: 'In day-fishing, can you add a shark that swims by now and then? If it touches the fish on my hook, I lose that fish.',
      skunk: "In skuntin', the skunks are a bit too quick to spray. Make them a little more patient before they spray.",
      sword: 'In sword-walk, when a tree falls, leave a log on the ground that I can walk over to pick up, and show how many logs I have.',
      cabinet: 'Can you show which game is playing, and the keys to switch, small in a corner, in all three games?',
    },
    // Which game in the cabinet the checker plays for each request.
    switch: { fish: '2', skunk: '3', sword: '1', cabinet: '2' },
  },
};

/** How the checker plays a game: wait, press about, walk with the pointer, look. */
export const playFor = (game, task) => {
  const key = GAMES[game].switch?.[task];
  return key ? [{ hold: key }, { advance: 0.1 }, { release: key }, ...PLAY] : PLAY;
};

export const PLAY = [
  { advance: 1 }, { look: true },
  { hold: ' ' }, { advance: 0.3 }, { release: ' ' },
  { hold: 'arrowright' }, { advance: 2 }, { release: 'arrowright' },
  { hold: 'arrowdown' }, { advance: 1.5 }, { release: 'arrowdown' },
  { point: [460, 200, true] }, { advance: 2 }, { point: [460, 200, false] },
  { hold: ' ' }, { advance: 0.3 }, { release: ' ' }, { advance: 2 },
  { look: true },
];
