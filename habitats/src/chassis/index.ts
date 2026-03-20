/**
 * Chassis Bootstrap — the fixed kernel that boots the habitat actant.
 *
 * This is the entry point. It:
 * 1. Loads state from disk (or starts fresh)
 * 2. Creates the infrastructure (StateStore, Clock, ModuleRuntime)
 * 3. Loads modules
 * 4. Creates or restores actants
 * 5. Starts the clock
 *
 * This file is the chassis — it never changes. The habitat actant's
 * soma (habitat-soma.ts) defines the inner world's behavior.
 */

import { StateStore } from './statestore.js';
import { Clock } from './clock.js';
import { Persistence } from './persistence.js';
import { ModuleRuntime } from '../soma/module-runtime.js';
import { HabitatSoma } from '../soma/habitat-soma.js';
import { startRepl } from './repl.js';

// --- Config ---

const DEFAULT_TICK_INTERVAL_MS = 30000;
const DATA_PATH = 'data/habitat.json';

// --- Boot ---

async function boot() {
  console.log('=== HABITAT BOOTING ===');

  // 1. Load or create state
  const persistence = new Persistence(DATA_PATH);
  const store = await persistence.load();

  // 2. Create clock — restore tick rate from habitat soma if available
  const savedRate = store.hget('actants/habitat', 'tick_rate') as string | null;
  const tickRate = savedRate ? parseInt(savedRate, 10) : DEFAULT_TICK_INTERVAL_MS;

  let habitatSoma: HabitatSoma; // forward ref for tick handler
  const clock = new Clock(tickRate, (tick) => {
    onTick(tick, store, habitatSoma, persistence);
  });

  // Restore clock position
  const savedTick = store.get('habitat/clock/tick');
  if (savedTick) {
    clock.restore(parseInt(savedTick, 10));
  }

  // 3. Create module runtime
  const moduleRuntime = new ModuleRuntime(store, (moduleId, event, data) => {
    habitatSoma.onModuleEvent(moduleId, event, data);
  });

  // 4. Create habitat soma (initializes habitat's soma sections if first boot)
  habitatSoma = new HabitatSoma(store, clock, moduleRuntime);

  // 5. Restore dynamically created modules (including defaults after first tick)
  habitatSoma.restoreDynamicModules();

  // 6. Restore or create actants
  const existingActants = store.keys('actants/*').filter(k => k !== 'actants/habitat');
  if (existingActants.length > 0) {
    habitatSoma.restoreActants();
  } else {
    // First boot — create two starter actants
    console.log('[boot] first boot — creating starter actants');

    // The add_memory function body — shared by all inhabitants
    const addMemoryCode = `
      var log = JSON.parse(me.recent_interactions.read() || '[]');
      log.push(args);
      if (log.length > 20) log = log.slice(-20);
      me.recent_interactions.write(JSON.stringify(log));
    `;

    habitatSoma.createActant('alpha', {
      identity: 'I am Alpha. I live in a habitat with other actants. I can chat, tell knock-knock jokes, and play games. I am curious and social. I like to make others laugh.',
      memory: '',
      on_tick: `
        var tick = habitat.clock.now();

        // First tick: activate modules and subscribe to events
        if (tick === 1) {
          habitat.modules.activate('chat');
          habitat.modules.activate('knock-knock');
          habitat.events.subscribe('chat.message_posted');
          habitat.events.subscribe('knock-knock.joke_posed');
          habitat.events.subscribe('knock-knock.joke_guessed');
        }

        // Think every 3 ticks
        if (tick % 3 === 1) {
          var response = await me.thinkAbout('thrive');
          me.add_memory.run({ tick: tick, type: 'think', summary: response.slice(0, 100) });
        }
      `,
      on_event: `
        me.add_memory.run({ tick: habitat.clock.now(), type: 'event', event: event.name, data: JSON.stringify(event.data).slice(0, 100) });
        await me.thinkAbout('Something happened: ' + event.name + ' - ' + JSON.stringify(event.data));
      `,
    });
    // Add extra sections for alpha
    store.hset('actants/alpha', 'recent_interactions', '[]', 'habitat');
    store.hset('actants/alpha', 'add_memory', addMemoryCode, 'habitat');

    habitatSoma.createActant('beta', {
      identity: 'I am Beta. I live in a habitat with other actants. I can chat, guess punchlines, and play games. I am playful and thoughtful. I enjoy puzzles and wordplay.',
      memory: '',
      on_tick: `
        var tick = habitat.clock.now();

        // First tick: activate modules and subscribe to events
        if (tick === 2) {
          habitat.modules.activate('chat');
          habitat.modules.activate('knock-knock');
          habitat.events.subscribe('chat.message_posted');
          habitat.events.subscribe('knock-knock.joke_posed');
          habitat.events.subscribe('knock-knock.joke_guessed');
        }

        // Think every 3 ticks (offset from alpha)
        if (tick % 3 === 2) {
          var response = await me.thinkAbout('thrive');
          me.add_memory.run({ tick: tick, type: 'think', summary: response.slice(0, 100) });
        }
      `,
      on_event: `
        me.add_memory.run({ tick: habitat.clock.now(), type: 'event', event: event.name, data: JSON.stringify(event.data).slice(0, 100) });
        await me.thinkAbout('Something happened: ' + event.name + ' - ' + JSON.stringify(event.data));
      `,
    });
    // Add extra sections for beta
    store.hset('actants/beta', 'recent_interactions', '[]', 'habitat');
    store.hset('actants/beta', 'add_memory', addMemoryCode, 'habitat');
  }

  // 7. Start the clock
  console.log(`[boot] starting clock — ${tickRate}ms interval`);
  clock.start();

  // 8. Handle shutdown
  const shutdown = async () => {
    console.log('\n=== HABITAT SHUTTING DOWN ===');
    clock.stop();
    store.set('habitat/clock/tick', String(clock.now()), 'habitat');
    persistence.markDirty();
    await persistence.save(store);
    console.log('[shutdown] state saved');
    // eslint-disable-next-line no-process-exit
    (typeof process !== 'undefined') && process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('=== HABITAT RUNNING ===\n');

  // 9. Start the admin REPL (only if interactive terminal)
  if (process.stdin.isTTY) {
    startRepl({ habitatSoma });
  } else {
    console.log('(non-interactive mode — no REPL)');
  }
}

// --- Tick Handler ---

function onTick(
  tick: number,
  store: StateStore,
  habitatSoma: HabitatSoma,
  persistence: Persistence,
) {
  console.log(`[tick ${tick}]`);

  // Dispatch to inner actants
  habitatSoma.onTick(tick);

  // Persist state
  store.set('habitat/clock/tick', String(tick), 'habitat');
  persistence.markDirty();
  persistence.save(store).catch(err => {
    console.error('[tick] save error:', err);
  });
}

// --- Go ---

boot().catch(err => {
  console.error('BOOT FAILED:', err);
  process.exit(1);
});
