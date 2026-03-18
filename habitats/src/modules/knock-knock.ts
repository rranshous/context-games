/**
 * Knock-Knock Module — joke posing and guessing game.
 *
 * One actant poses a knock-knock joke (setup + punchline).
 * Another actant guesses the punchline.
 * Module keeps score: guessing accuracy + joke difficulty.
 *
 * Flow:
 *   1. Poser calls pose({ setup: "Who's there?/Boo/Boo who?", punchline: "Don't cry!" })
 *   2. Guesser calls guess({ joke_id, punchline: "..." })
 *   3. Module judges (exact match for now, could add fuzzy later)
 *
 * State: { jokes, scores }
 */

import { ModuleDefinition } from '../soma/module-runtime.js';

export const knockKnockModule: ModuleDefinition = {
  id: 'knock-knock',
  name: 'Knock-Knock Jokes',

  init: () => ({
    jokes: [],       // { id, poser, setup, punchline, guesses: [{ guesser, guess, correct }] }
    scores: {},      // { [actantId]: { posed, guessed, correct } }
    nextId: 1,
  }),

  methods: {
    pose: {
      description: 'Pose a knock-knock joke with a setup and hidden punchline',
      handler: `
        var jokes = state.jokes || [];
        var scores = state.scores || {};
        var id = state.nextId || 1;

        if (!input.setup || !input.punchline) {
          return { state: state, result: { error: 'Need setup and punchline' } };
        }

        jokes.push({
          id: id,
          poser: caller,
          setup: input.setup,
          punchline: input.punchline,
          guesses: [],
        });

        if (!scores[caller]) scores[caller] = { posed: 0, guessed: 0, correct: 0 };
        scores[caller].posed++;

        return {
          state: { jokes: jokes, scores: scores, nextId: id + 1 },
          result: { ok: true, joke_id: id },
          emit: [{ event: 'joke_posed', data: { joke_id: id, poser: caller, setup: input.setup } }]
        };
      `,
    },

    guess: {
      description: 'Guess the punchline of a joke',
      handler: `
        var jokes = state.jokes || [];
        var scores = state.scores || {};

        if (!input.joke_id || !input.punchline) {
          return { state: state, result: { error: 'Need joke_id and punchline' } };
        }

        var joke = null;
        for (var i = 0; i < jokes.length; i++) {
          if (jokes[i].id === input.joke_id) { joke = jokes[i]; break; }
        }

        if (!joke) {
          return { state: state, result: { error: 'Joke not found' } };
        }

        if (joke.poser === caller) {
          return { state: state, result: { error: 'Cannot guess your own joke' } };
        }

        var correct = input.punchline.trim().toLowerCase() === joke.punchline.trim().toLowerCase();

        joke.guesses.push({ guesser: caller, guess: input.punchline, correct: correct });

        if (!scores[caller]) scores[caller] = { posed: 0, guessed: 0, correct: 0 };
        scores[caller].guessed++;
        if (correct) scores[caller].correct++;

        return {
          state: { jokes: jokes, scores: scores, nextId: state.nextId },
          result: {
            correct: correct,
            actual_punchline: correct ? joke.punchline : null,
          },
          emit: [{
            event: 'joke_guessed',
            data: { joke_id: input.joke_id, guesser: caller, correct: correct }
          }]
        };
      `,
    },

    reveal: {
      description: 'Reveal the punchline of a joke (only the poser can reveal)',
      handler: `
        var jokes = state.jokes || [];

        var joke = null;
        for (var i = 0; i < jokes.length; i++) {
          if (jokes[i].id === input.joke_id) { joke = jokes[i]; break; }
        }

        if (!joke) {
          return { state: state, result: { error: 'Joke not found' } };
        }

        if (joke.poser !== caller) {
          return { state: state, result: { error: 'Only the poser can reveal' } };
        }

        return {
          state: state,
          result: { setup: joke.setup, punchline: joke.punchline, guesses: joke.guesses }
        };
      `,
    },

    pending: {
      description: 'List jokes that still need guessing',
      handler: `
        var jokes = state.jokes || [];
        var pending = [];
        for (var i = 0; i < jokes.length; i++) {
          var j = jokes[i];
          var callerGuessed = false;
          for (var g = 0; g < j.guesses.length; g++) {
            if (j.guesses[g].guesser === caller) { callerGuessed = true; break; }
          }
          if (j.poser !== caller && !callerGuessed) {
            pending.push({ joke_id: j.id, poser: j.poser, setup: j.setup });
          }
        }
        return { state: state, result: { jokes: pending } };
      `,
    },

    scores: {
      description: 'Get the scoreboard',
      handler: `
        return { state: state, result: { scores: state.scores || {} } };
      `,
    },
  },

  emits: ['joke_posed', 'joke_guessed'],
};
