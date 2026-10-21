// The chassis: what runs inside the sandbox. The sandbox is an iframe with an opaque
// origin and no network, so nothing in it can see the frame's page, its storage, or the
// key that pays for thinking. The ludant's whole embodiment lives here: its soma, its
// code (game, hooks, tools), its thinking loop and its innate tools.
//
// Every surface is the frame's, across the bridge. The stage keeps a buffer here (see
// stage-buffer.js), because a game draws at frame rate: the frame ticks it and gets
// pictures back.
//   the frame answers   infer, perceive, act(surface, action, args)
//   the frame is told   soma (the body as it is now), life, note, event, store,
//                       frame (pictures), size, halt, restart, advanced, input (a key or pointer)
//   the frame asks      init, tick, event, store, people, stage(action, args), restart,
//                       write, load, idle, sleep, gameState
//
// Surfaces across the bridge are proxies whose actions return promises. Two are kept
// as local copies so game code can read them every frame: the store (writes go to the
// frame too) and the chat's recent messages.

import { Actant } from './actant.js';
import { Bridge } from './bridge.js';
import { Bus } from './bus.js';
import { StageBuffer } from './stage-buffer.js';
import { Store } from './surfaces/store.js';

const KEEP_CHAT = 200;

async function loadLibraries() {
  const libs = {};
  try { libs.THREE = await import('/vendor/three/three.module.js'); }
  catch (err) { console.warn('three.js failed to load', err); }
  return libs;
}

/** Wait for the frame to hand over its end of the bridge. Only the parent may. */
function connect() {
  return new Promise((resolve) => {
    addEventListener('message', function take(e) {
      if (e.source !== parent || !e.ports?.[0] || e.data?.gactant !== 'bridge') return;
      removeEventListener('message', take);
      resolve(e.ports[0]);
    });
    parent.postMessage({ gactant: 'ready' }, '*');
  });
}

async function boot() {
  const libs = await loadLibraries();
  const bus = new Bus();
  const stage = new StageBuffer({ bus, libs });

  const chassis = { bus, stage, people: [], surfaces: null, frame: null, isPerson: (who) => chassis.people.includes(who) };
  let actant = null;
  let chat = [];
  // The store's local copy. It checks and applies writes here (so reads right after see
  // them, and a full store refuses here), then the frame keeps them.
  const store = new Store({ bus: { emit() {} }, changed() {} });

  const port = await connect();
  const frame = new Bridge(port, {
    init(state) {
      chat = state.chat ?? [];
      store.load({ data: state.store ?? {} });
      chassis.people = state.people ?? [];
      if (state.stage?.width) { stage.width = stage.canvas.width = state.stage.width; stage.height = stage.canvas.height = state.stage.height; }
      chassis.surfaces = surfaces(state.actions);
      actant = new Actant(chassis, state.soma);
      actant.rebuild();
      actant.report();
      return { name: actant.name };
    },
    tick(t) { stage.tick(t); },
    restart() { stage.restarted(); },
    event(e) {
      if (e.type === 'chat.posted') {
        chat.push({ who: e.who, text: e.text, at: e.at });
        if (chat.length > KEEP_CHAT) chat.splice(0, chat.length - KEEP_CHAT);
      }
      bus.deliver(e);
    },
    store(data) { store.load({ data }); },
    people(list) { chassis.people = list; },
    stage(action, args = []) {
      const fn = stage.actions()[action];
      if (!fn) throw new Error(`the stage has no action ${action}`);
      return fn(...args);
    },
    write(name, content, by) { return actant.writeSection(name, content, by); },
    load(soma) {
      actant.soma = soma;
      actant.rebuild();
      actant.report();
      return { name: actant.name };
    },
    idle(ms) { return actant.idle(ms); },
    sleep() { actant?.sleepForever(); stage.halted = 'moved'; },
    gameState() { return JSON.parse(JSON.stringify(actant?.game?.state ?? null)); },
  });
  chassis.frame = frame;
  stage.frame = frame;

  // What happens here that the frame should hear: the body changing. (The stage's own
  // events start at the frame, and stage.frame stays here.)
  bus.outward = (e) => { if (e.type.startsWith('soma.')) frame.send('event', e); };
  // A hook that throws is reported in the inspector (once, then now and then: see bus.js).
  bus.on('frame.error', (e) => frame.send('note', 'fault', `${e.source} during ${e.during}: ${e.message}${e.count > 1 ? ` (${e.count} times)` : ''}`), 'chassis');

  /** The surfaces, done as the ludant. The stage is here; the rest are across the bridge. */
  function surfaces(actions) {
    const out = { stage: stage.actions() };
    for (const [id, names] of Object.entries(actions ?? {})) {
      out[id] = Object.fromEntries(names.map((a) => [a, (...args) => frame.call('act', id, a, args)]));
    }
    if (out.chat) out.chat.read = (n = 20) => chat.slice(-n).map((m) => ({ ...m }));
    if (out.store) {
      const local = store.actions('');
      out.store = {
        ...local,
        set: (key, value) => { const v = local.set(key, value); frame.send('store', 'set', [String(key), v]); return v; },
        update: (key, fn, fallback) => { const v = local.update(key, fn, fallback); frame.send('store', 'set', [String(key), v]); return v; },
        delete: (key) => { local.delete(key); frame.send('store', 'delete', [String(key)]); return true; },
      };
    }
    return out;
  }
}

boot().catch((err) => {
  document.body.textContent = `the sandbox couldn't start: ${err.message}`;
  console.error(err);
});
