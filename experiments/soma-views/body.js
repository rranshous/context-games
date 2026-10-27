// A ludant's body on a bench: gactant's own Actant and stage buffer (imported from the
// platform as they are, read-only), with the frame played by this page and Node. There's
// no sandbox iframe and no bridge: the surfaces are stand-ins that record what's done, and
// thinking goes to Node (window.benchInfer), which holds the key, counts the cost and
// renders the view of the soma being tried (window.benchView, window.benchNav).
//
//   await bench.start({ soma, art, approach, context, company, person })
//   await bench.say(text)      a person speaks in the chat; resolves once the ludant is idle
//   bench.result()             { soma, chat, notes, faults, errors }
//   await bench.play(script)   for checking: rebuild, hold keys, advance, look

import { Actant } from '/platforms/gactant/public/js/actant.js';
import { Bus } from '/platforms/gactant/public/js/bus.js';
import { StageBuffer } from '/platforms/gactant/public/js/stage-buffer.js';
import { Store } from '/platforms/gactant/public/js/surfaces/store.js';

const NAV = new Set(['read_section', 'search_sections', 'expand_code']);

/** The real Actant, seeing its soma through a view, with the view's tools beside its own. */
const LIVE = new Set(['live', 'delta']);   // views drawn (in whole or in part) after the conversation

class Viewed extends Actant {
  constructor(chassis, soma, approach, navSchemas) {
    super(chassis, soma);
    this.approach = approach;
    this.view = LIVE.has(approach) ? 'outline' : approach;   // live is the outline, drawn after the conversation
    this.navSchemas = navSchemas;
  }

  async systemText(threw) {
    const text = await super.systemText(threw);
    if (this.approach === 'full') return text;
    const open = text.indexOf(`<soma name="${this.name}">\n`), close = text.indexOf('\n</soma>');
    // live: the soma isn't here at all. It's drawn fresh, as it is right now, in a system
    // note after the conversation, every time it thinks (run.mjs adds it), so this stays
    // the same all wake and is read from cache.
    if (this.approach === 'live') {
      return `${text.slice(0, open)}<soma name="${this.name}">\n(Shown in the system note at the end of the conversation, as it is right now, redrawn every time you think.)${text.slice(close)}`
        .replace('This is your soma as it was when you woke. Edits you make while awake take effect at once; your tool results show them.', 'Your soma is shown as it is right now, in the system note at the end of the conversation: an edit you make shows there the next time you think.');
    }
    // delta: the soma as it was when this sitting began, the same for every wake of it so it's
    // read from cache. A section changed since then is shown again, as it is now, in the
    // system note at the end (run.mjs adds it), and that one is the one that counts.
    if (this.approach === 'delta') {
      this.base ??= { ...this.soma.sections };
      const shown = await window.benchView('outline', this.base);
      return `${text.slice(0, open)}<soma name="${this.name}" as-of="when this sitting began">\n${shown}${text.slice(close)}`
        .replace('This is your soma as it was when you woke. Edits you make while awake take effect at once; your tool results show them.', 'This is your soma as it was when this sitting began. A section you have changed since is shown again, as it is right now, in the system note at the end of the conversation, and that one is the one that counts: an edit you make shows there the next time you think.');
    }
    const shown = await window.benchView(this.view, this.soma.sections);
    return `${text.slice(0, open)}<soma name="${this.name}">\n${shown}${text.slice(close)}`;
  }

  toolSchemas() {
    const mine = super.toolSchemas();
    const nav = this.navSchemas.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    return [...mine.slice(0, 2), ...nav, ...mine.slice(2)];
  }

  async runTool(call) {
    const name = call.function?.name;
    if (!NAV.has(name)) return super.runTool(call);
    let input = {};
    try { input = JSON.parse(call.function.arguments || '{}'); } catch { return { text: JSON.stringify({ error: 'arguments were not valid JSON' }) }; }
    const out = await window.benchNav(this.view, name, input, this.soma.sections);
    this.note('did', `${name} ${JSON.stringify(input).slice(0, 160)}`);
    return { text: typeof out === 'string' ? out : JSON.stringify(out), images: [] };
  }
}

let stage, bus, actant, chassis, ticking;
const log = { chat: [], notes: [], choices: [] };
let config;

function surfaces(store) {
  const say = (who, text) => {
    const m = { who, text: String(text), at: new Date().toISOString() };
    log.chat.push(m);
    bus.emit('chat.posted', { who, text: m.text });
    return { posted: true };
  };
  const blank = () => { const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#faf7f0'; g.fillRect(0, 0, 200, 120); return c.toDataURL(); };
  const off = (what) => () => { throw new Error(`${what} is turned off on this bench: work with what you have`); };
  const anything = new Proxy({}, { get: () => async () => ({ ok: true }) });
  return {
    stage: stage.actions(),
    chat: { post: async (text) => say(actant.name, text), read: (n = 20) => log.chat.slice(-n).map((m) => ({ ...m })) },
    whiteboard: { draw: async () => ({ drew: true }), undo: async () => ({}), clear: async () => ({}), pass: async () => ({ passed: true }), look: async () => ({ text: 'whiteboard: a shared sketch board, blank; the baton is with nobody.', image: blank() }) },
    art: {
      make: off('painting new art'), concept: off('concept art'),
      look: async (name) => { const a = config.art.find((x) => x.name === name); if (!a) throw new Error(`no art named ${name}`); return { text: name, image: a.image }; },
      list: async () => config.art.map(({ name, w, h, prompt }) => ({ name, w, h, prompt })),
      remove: async (name) => ({ removed: name }),
    },
    choices: { offer: async (o) => { log.choices.push(o); return { offered: true }; }, withdraw: async () => ({ withdrawn: true }) },
    status: anything,
    store: store.actions(''),
  };
}

const describe = (store) => [
  'chat: a conversation shared by everyone in the frame.',
  `whiteboard: a shared sketch board, 100 wide by 60 tall in board units (origin top-left); blank; the baton is with nobody.`,
  stage.describe(),
  store.describe(),
  `art: pictures made for you by an image model, kept with you, and drawn in your game with stage.image(name). ${config.art.length ? `You have ${config.art.length}: ${config.art.map((a) => a.name).join(', ')}.` : 'You have none yet.'} Actions: make(...), concept(...), look(name), list(), remove(name).`,
  'choices: put a question to the people here with 2 to 6 options to pick from. Actions: offer({ question, options: [{ label, image, note }] }), withdraw().',
];

async function build(soma) {
  const THREE = await import('/platforms/gactant/public/vendor/three/three.module.js').catch(() => null);
  bus = new Bus();
  const quiet = { send() {}, sendWith() {} };
  stage = new StageBuffer({ bus, libs: { THREE }, frame: quiet });
  for (const a of config.art) {
    const bytes = await (await fetch(a.image)).arrayBuffer();
    await stage.addImage(a.name, bytes, a.image.slice(5, a.image.indexOf(';')));
  }
  const store = new Store({ bus: { emit() {} }, changed() {} });
  store.load({ data: {} });
  chassis = { bus, stage, people: [config.person], surfaces: null, isPerson: (who) => chassis.people.includes(who) };
  chassis.surfaces = surfaces(store);
  chassis.frame = {
    send(kind, ...args) { if (kind === 'note') log.notes.push({ kind: args[0], text: String(args[1]).slice(0, 2000) }); },
    sendWith() {},
    async call(what, args) {
      if (what === 'infer') return window.benchInfer({ ...args, name: actant.name, sections: actant.soma.sections, faults: actant.faults });
      // As on the site, what it's told about the room (the cost meter with it) is fresh each wake.
      if (what === 'perceive') return { context: config.context, company: await window.benchCompany(), surfaces: describe(store) };
      throw new Error(`the bench has no ${what}`);
    },
  };
  const nav = await window.benchNavSchemas(LIVE.has(config.approach) ? 'outline' : config.approach);
  actant = new Viewed(chassis, soma, config.approach, nav);
  actant.rebuild();
  // The frame's clock, while it's awake: 15 ticks a second, not a display's 60. Checking
  // plays by advance(), not by this, and three pages of software-rendered 3D at 60 starved
  // the machine (trials took ten minutes of wall time for three calls).
  clearInterval(ticking);
  let t = 0, frame = 0;
  ticking = setInterval(() => { t += 1 / 15; frame++; stage.tick({ dt: 1 / 15, t, frame, fps: 15, input: null }); }, 1000 / 15);
}

window.bench = {
  async start(cfg) {
    config = cfg;
    log.chat = []; log.notes = []; log.choices = [];
    await build(structuredClone(cfg.soma));
    return { name: actant.name, faults: actant.faults };
  },
  async say(text) {
    const m = { who: config.person, text, at: new Date().toISOString() };
    log.chat.push(m);
    bus.emit('chat.posted', { who: config.person, text });
    await actant.idle(600_000);
    return { name: actant.name };
  },
  result() {
    return { soma: actant.soma, chat: log.chat, notes: log.notes, choices: log.choices, faults: actant.faults, errors: [...bus.errors.values()] };
  },
  /** A fresh build of a soma, played a little, for checking: faults on building, errors
   *  while running, whether the stage halted, and pictures along the way. */
  async play(soma, steps) {
    config.approach = 'full';
    await build(structuredClone(soma));
    clearInterval(ticking);
    const pics = [];
    const act = stage.actions();
    for (const s of steps) {
      if (s.hold) act.hold(s.hold);
      if (s.release) act.release(s.release);
      if (s.point) act.point(...s.point);
      if (s.advance) act.advance(s.advance);
      if (s.look) pics.push(act.look().image);
    }
    return { faults: actant.faults, halted: stage.halted, errors: [...bus.errors.values()].map(({ message, source, during, count }) => ({ message, source, during, count })), pics };
  },
};
window.benchReady = true;
