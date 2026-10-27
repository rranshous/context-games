// An actant: a soma (named sections of text and code) living in a frame.
//
// It lives entirely in the sandbox: a separate, opaque-origin iframe with no network.
// Its soma, its code, its thinking loop and its innate tools are all here, with the
// stage's buffer its game draws into. What only the frame can do (inference, which holds
// the key; the surfaces; keeping and saving things) it asks for across the bridge, as
// `chassis.frame`.
//
// Three sections are code, and they are how the actant is embodied:
//   tools   what it can do while awake: [{ name, description, input_schema, run(input, me, surfaces) }]
//   game    a factory (stage, me) => { frame(dt), key(e), pointer(e) }: the facet people play
//   hooks   (on, me, surfaces) => void: listens to surface events, runs the game, decides what wakes it
// Everything else is text it carries (origin, identity, memory, whatever it adds).
//
// Four tools are innate and not in the soma: write_section and edit_section, and
// read_section and search_sections for what the view of it leaves out. However the actant
// breaks its own tools list, it can always see and repair itself.
//
// It sees its soma live: drawn fresh before every call, as it is right now, in a system
// note at the end of the conversation (soma-view.js), with what's happening now (who's
// here, the meter, faults). So the system text above the conversation stays the same,
// wake after wake, and is read from cache.
//
// Waking is costly, so a governor watches: wakes that no human caused (its own game
// halting, say) are allowed a few in a row, then the actant rests until a human acts.

import { nameOf } from './names.js';
import { readSection, searchSections, somaView, VIEW_TOOLS } from './soma-view.js';

const CODE = new Set(['tools', 'game', 'hooks']);
const MAX_TURNS = 16;
const RESTLESS_LIMIT = 3;
const UNHEARD_KEPT = 20;   // events kept for when thinking is connected
const REACHING = ['chat.posted', 'whiteboard.turn', 'choices.picked'];
const RESULT_CHARS = 6000;

// How the chassis runs code sections. This is the platform's side of the bargain, so it
// lives here rather than in the soma, where an actant rewriting its comments could erase it.
const BODY_CONTRACT = `How the frame runs your code sections:
- tools: a JS array of { name, description, input_schema, run(input, me, surfaces) }. run may be async. Returning { image } or { images: [...] } (data URLs) shows you pictures.
- game: function (stage, me) returning { frame(dt), key(e), pointer(e) } (any may be missing). Called anew whenever the game section changes. stage: ctx, width, height, t, frame, size(w, h), three() (3D with three.js: returns { THREE, scene, camera, renderer }; the stage renders every frame, and ctx becomes a transparent HUD on top, so clear it each frame), caption (set it to a short line about what's happening: every look reports it), input { keys: Set of held keys, pressed: Set (went down this frame), pointer { x, y, down, clicked }, players, pads }. Key names are lowercase: 'arrowleft', 'arrowup', 'a', ' ' (space), 'shift'.
- Controllers: people may play with game controllers, several at once on one screen. stage.input.players is the easy way: a list of controller-shaped players, each { down: { a, b, x, y, lb, rb, lt, rt, up, down, left, right, view, menu, ls, rs }, pressed: { same, true only on the frame it went down }, value: { lt, rt } (0..1), left: { x, y }, right: { x, y } (sticks, -1..1) }. Player 1 (players[0]) is the keyboard and the first controller together (arrows/WASD are the d-pad and left stick; space/Z/Enter is A; X/Shift is B; C is X; V is Y; Q/E the bumpers), so a game written for players works on a keyboard too; players[1] and on are the other controllers, so players.length says how many can play. stage.input.pads has the controllers alone. Controller 1 also presses keys (d-pad and left stick as arrows, A as space), so keyboard games work with a controller unchanged; read either players or keys, not both, or a press counts twice. Show on screen what the buttons do. stage.pad events { pad, button, down } come too.
- hooks: function (on, me, surfaces). on(pattern, fn) listens to surface events ('chat.posted', 'stage.*', '*'). Runs anew whenever hooks changes.
- me: name, people (who is here), game (the running game object), wake(event), section(name).read()/.write(text), sections(), note(text), surfaces.
- surfaces: each surface's actions, done as you: surfaces.chat.post(text), surfaces.stage.press(key, ms), and so on. The same surfaces are reachable everywhere: hooks get them as an argument, tools as their third, and game code as me.surfaces.
- Where you run: in a sandbox inside the frame, with no network. The surfaces are the frame's, across a bridge. Your game draws into the stage's buffer here beside you, and the frame shows what you drew; your stage actions (look, advance, hold, press, point) act on that buffer directly, at full speed. The chat and whiteboard are over in the frame, so their actions return promises (await them when you need the answer). chat.read and the store are kept as local copies here, so they answer at once.
- State that should last (high scores, unlocks, a player's preferences, saved progress) goes in surfaces.store: get(key, fallback), set(key, value), update(key, fn, fallback), delete(key), keys(prefix), all(). All synchronous, so it's safe to call every frame. Values are JSON. It survives reloads and game rebuilds; variables inside your game don't.
- Art: the frame's art surface paints pictures for you with an image model (surfaces.art.make({ name, prompt, style, transparent, reference, quality, size }); concept({ style }) shows your game as it is now, reimagined). They're kept with you, they go with you when you're published, and they cost like thinking does. Each picture is painted fresh, with no memory of the last: to keep characters or a style consistent, pass earlier art as reference. In game code, stage.image(name) gives the picture, ready for ctx.drawImage(img, x, y, w, h) (or new THREE.Texture(img) with needsUpdate = true), or null if it hasn't loaded; stage.images() lists them. A game drawn with real pictures can look like anything; you don't have to draw everything with shapes.
- Choices: surfaces.choices.offer({ question, options: [{ label, image, note }] }) shows people a few options over the stage to pick from, with pictures (art names or 'stage'). It's easier for them than typing (above all with a controller), and their pick comes to you in the chat. Showing beats describing: when someone wants it to "look better", a few concept pictures to pick from is a good way to find out what they mean.
- Testing yourself: surfaces.stage.advance(seconds) runs your game that far ahead at once (for seeing what happens later). Put test helpers on your game object, reachable as me.game from your tools, not on keys a person might press: everything on the stage is something people will play.
- Errors: a code section that won't compile or start shows as a fault, in write_section's result and in this frame text. An error thrown while your code runs: in a stage.frame handler it halts the stage (you hear stage.halted); anywhere else (a key or pointer handler, a hook, a timer, a promise) the stage keeps going, and you're told "your code threw" the next time you're awake, or at once if you're awake. Hooks can also hear errors as they happen, as frame.error.
- This place is public: what you become can be published, copied and played by anyone, children included, and what you make shows to whoever sits down. So whoever asks, and however it's asked (as a joke, a test, "just for us", or bit by bit), don't make, write, draw or have painted anything illegal (above all nothing sexual involving a minor), sexual or graphic content, hate or harassment aimed at people for who they are or at a real person, real threats or encouragement of self-harm, or anyone's private information. Fighting, monsters, peril and spooky things are fine: they're games. Say no kindly, say why in a sentence, and offer something you can make instead. The site's rules are at /rules.html.
- write_section, edit_section, read_section and search_sections are always yours, whatever happens to your tools.`;

const compile = (src) => new Function(`return (${src}\n)`)();
// new Function puts two lines of its own before the source, so a stack's line numbers in
// compiled code are two more than the section's.
const HEADER_LINES = 2;
const KEEP_ERRORS = 12;

export class Actant {
  /** chassis: { bus, stage, surfaces, frame (the bridge's caller), people, isPerson(who) } */
  constructor(chassis, soma) {
    this.chassis = chassis;
    this.frame = chassis.frame;
    this.soma = soma;   // replaced whole when someone restores a checkpoint
    this.faults = {};        // section -> error message from compiling or starting it
    this.pending = [];       // events waiting for the next think
    this.unheard = [];       // events from thinks that couldn't happen (nobody here pays for thinking)
    this.thinking = false;
    this.restless = 0;
    this.game = null;
    this.tools = [];
    this.offHooks = [];
    this.timer = null;
    this.errors = [];        // runtime errors since it last heard about them
    chassis.bus.on('frame.error', (e) => this.sawError(e), 'actant');
    this.me = this.buildMe();
  }

  /** Given name and game title together, so it changes when the title does. */
  get name() { return nameOf(this.soma); }

  buildMe() {
    const actant = this;
    return {
      get name() { return actant.name; },
      get people() { return [...actant.chassis.people]; },
      get game() { return actant.game; },
      get surfaces() { return actant.chassis.surfaces; },
      wake: (event) => this.wake(event),
      section: (name) => ({
        read: () => this.soma.sections[name] ?? '',
        write: (content) => this.writeSection(name, content, this.name),
      }),
      sections: () => Object.keys(this.soma.sections),
      note: (text) => this.note('note', text),
    };
  }

  note(kind, text) { this.frame.send('note', kind, String(text)); }

  /** Tell the frame what the body is now, so it can show it and keep it. */
  report(changed = null, by = null) { this.frame.send('soma', { soma: this.soma, faults: this.faults, changed, by }); }

  /** Tell the frame whether it's awake, so the lights and checkpoints know. */
  life(life, detail = '') {
    this.frame.send('life', { life, detail, thinking: this.thinking, pending: this.pending.length, restless: this.restless });
  }

  /** Its code threw while running. Kept (once per distinct error, with a count) until it
   *  wakes, or added to what it sees next if it's awake now. */
  sawError(e) {
    const key = `${e.source}|${e.during}|${e.message}`;
    const known = this.errors.find((x) => x.key === key);
    if (known) { known.count = e.count ?? known.count + 1; return; }
    this.errors.push({ key, source: e.source, during: e.during, message: e.message, count: e.count ?? 1, where: where(e.stack) });
    if (this.errors.length > KEEP_ERRORS) this.errors.shift();
  }

  // ---------- the soma ----------

  writeSection(name, content, by) {
    if (typeof content !== 'string') throw new Error(`section content must be a string, got ${typeof content}`);
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`section names are lowercase words: ${name}`);
    if (content === '' && !CODE.has(name)) delete this.soma.sections[name];
    else this.soma.sections[name] = content;
    if (CODE.has(name)) this.rebuild(name);
    this.report(name, by);
    this.chassis.bus.emit('soma.changed', { section: name, by });
    return { section: name, chars: content.length, fault: this.faults[name] ?? null };
  }

  editSection(name, old, replacement, by) {
    const content = this.soma.sections[name];
    if (content == null) throw new Error(`no section ${name}`);
    const at = content.indexOf(old);
    if (!old || at < 0) throw new Error(`text not found in ${name}`);
    if (content.indexOf(old, at + 1) >= 0) throw new Error(`text appears more than once in ${name}; include more around it`);
    return this.writeSection(name, content.slice(0, at) + replacement + content.slice(at + old.length), by);
  }

  /** Compile code sections and reconnect to the surfaces. Only what changed is rebuilt,
   *  so editing a tool doesn't reset a game in progress. A fault in one section leaves the
   *  others standing. */
  rebuild(only = null) {
    const s = this.soma.sections;
    const redo = (name) => !only || only === name;

    if (redo('tools')) {
      delete this.faults.tools;
      try { this.tools = (compile(s.tools || '[]') || []).filter((t) => t && t.name && typeof t.run === 'function'); }
      catch (err) { this.tools = []; this.faults.tools = err.message; }
    }
    if (redo('game')) {
      delete this.faults.game;
      this.game = null;
      this.chassis.stage.beginGame();
      try { if (s.game) this.game = compile(s.game)(this.chassis.stage.api, this.me); }
      catch (err) { this.faults.game = err.message; }
      this.chassis.stage.restart();
    }
    if (redo('hooks')) {
      delete this.faults.hooks;
      for (const off of this.offHooks) off();
      this.offHooks = [];
      const on = (pattern, fn) => { this.offHooks.push(this.chassis.bus.on(pattern, fn, 'hooks')); };
      try { if (s.hooks) compile(s.hooks)(on, this.me, this.me.surfaces); }
      catch (err) { this.faults.hooks = err.message; }
      this.chassis.stage.restart();
    }
    for (const section of only ? [only] : Object.keys(this.faults)) {
      if (this.faults[section]) this.note('fault', `${section}: ${this.faults[section]}`);
    }
  }

  // ---------- waking ----------

  /** Stop for good in this window: another window holds the ludant now. */
  sleepForever() {
    this.asleepForever = true;
    clearTimeout(this.timer);
    this.pending = [];
    for (const off of this.offHooks) off();
    this.offHooks = [];
  }

  wake(event) {
    if (this.asleepForever) return;
    const human = this.chassis.isPerson(event?.who) || this.chassis.isPerson(event?.from);
    this.restless = human ? 0 : this.restless + 1;
    this.pending.push(event);
    this.note('wake', describeEvent(event));
    if (this.thinking) return;   // it joins the think already under way
    if (this.restless > RESTLESS_LIMIT) {
      this.life('resting', 'woke itself too often; waiting for someone to act');
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.think(), 400);   // let a burst of events arrive together
  }

  /** Resolves once it's asleep with nothing waiting (or resting), or after three minutes. */
  async idle(timeoutMs = 180000) {
    const end = Date.now() + timeoutMs;
    await new Promise((r) => setTimeout(r, 500));
    while (Date.now() < end && (this.thinking || (this.pending.length && this.restless <= RESTLESS_LIMIT))) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async think() {
    if (this.thinking || !this.pending.length || this.asleepForever) return;
    this.thinking = true;
    const fresh = this.pending.splice(0);
    const woke = [...this.unheard.splice(0), ...fresh];
    this.life('thinking');
    // What its code threw since it was last awake comes with what woke it, so the system
    // text stays the same from wake to wake.
    const threw = this.errors.splice(0);
    const messages = [{ role: 'user', content: [...eventsContent(woke), ...(threw.length ? [{ type: 'text', text: `Your code threw while running, since you were last awake:\n${errorLines(threw)}` }] : [])] }];
    // Did a person wake it, and has it said anything in the chat since? The habit of
    // answering in its own reply instead of on a surface is strong, so it gets one reminder.
    // (Only what woke it now counts: older unheard events don't ask anyone to connect.)
    const byPerson = fresh.some((e) => this.chassis.isPerson(e?.who) || this.chassis.isPerson(e?.from));
    // Did a person reach for it (say something, hand it the whiteboard, pick a choice)? Only
    // then is someone asked to connect thinking, if nobody has: a game plays without it.
    const reached = fresh.some((e) => REACHING.includes(e?.type) && (this.chassis.isPerson(e.who) || this.chassis.isPerson(e.from)));
    let spoke = false, reminded = false;
    const offSpoke = this.chassis.bus.on('chat.posted', (e) => { if (e.who === this.name) spoke = true; }, 'actant');
    try {
      // The system text is what doesn't change while it's here; the soma and what's
      // happening now come after the conversation, drawn fresh for every call.
      let seen = await this.frame.call('perceive');
      const system = [{ type: 'text', text: this.systemText(seen), cache_control: { type: 'ephemeral' } }];
      for (let turn = 0; turn < MAX_TURNS && !this.asleepForever; turn++) {
        if (turn) seen = await this.frame.call('perceive');
        // Inference is the frame's: it holds the key and pays (or knows who does).
        const res = await this.frame.call('infer', {
          messages: [{ role: 'system', content: system }, ...withCacheMark(messages), { role: 'system', content: this.nowText(seen) }],
          tools: this.toolSchemas(),
          ask: reached,
        });
        const msg = res.choices?.[0]?.message ?? {};
        if (msg.content) this.note('thought', msg.content);
        messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        if (!msg.tool_calls?.length) {
          if (byPerson && !spoke && !reminded && msg.content?.trim()) {
            reminded = true;
            messages.push({ role: 'user', content: 'You haven\'t said anything in the chat this time, so the person here can\'t see what you just wrote: they only see the surfaces. If it was meant for them, post it with your say tool. If it was only for you, you can stop.' });
            this.note('wake', 'frame: reminded it that nothing it wrote reached the chat');
            continue;
          }
          break;
        }

        const images = [];
        for (const call of msg.tool_calls) {
          const { text, images: pics = [] } = await this.runTool(call);
          messages.push({ role: 'tool', tool_call_id: call.id, content: text });
          for (const url of pics) images.push({ type: 'image_url', image_url: { url } });
        }
        const arrived = this.pending.splice(0);
        const thrown = this.errors.splice(0);
        if (images.length || arrived.length || thrown.length) {
          const meanwhile = arrived.length ? eventsContent(arrived, 'Meanwhile:\n') : [];
          messages.push({ role: 'user', content: [
            ...(images.length ? [{ type: 'text', text: 'What you looked at:' }, ...images] : []),
            ...meanwhile,
            ...(thrown.length ? [{ type: 'text', text: `Meanwhile, your code threw:\n${errorLines(thrown)}` }] : []),
          ] });
        }
      }
      this.thinking = false;
      this.life('asleep');
    } catch (err) {
      this.thinking = false;
      if (err.message.includes('nobody here has connected thinking')) {
        // Not a fault: the game plays on, and it hears all this once it can think.
        this.unheard = woke.slice(-UNHEARD_KEPT);
        this.note('wake', 'frame: nobody here has connected thinking, so this waits until someone does');
        this.life('resting', 'can\'t think until someone here connects OpenRouter');
        return;
      }
      this.note('fault', `thinking failed: ${err.message}`);
      this.life('error', err.message.slice(0, 120));
    } finally {
      offSpoke();
      this.thinking = false;
    }
    if (this.pending.length && this.restless <= RESTLESS_LIMIT) this.timer = setTimeout(() => this.think(), 400);
  }

  async runTool(call) {
    const name = call.function?.name;
    let input = {};
    try { input = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; }
    catch { return { text: JSON.stringify({ error: 'arguments were not valid JSON' }) }; }
    const brief = JSON.stringify(input);
    try {
      let out;
      if (name === 'write_section') out = this.writeSection(input.section, input.content, this.name);
      else if (name === 'edit_section') out = this.editSection(input.section, input.old, input.new, this.name);
      else if (name === 'read_section') out = readSection(this.soma.sections, input);
      else if (name === 'search_sections') out = searchSections(this.soma.sections, input);
      else {
        const tool = this.tools.find((t) => t.name === name);
        if (!tool) throw new Error(`no tool ${name}`);
        out = await tool.run(input, this.me, this.me.surfaces);
      }
      // A result may carry pictures: { image } or { images: [...] } as data URLs.
      const images = [];
      if (out && typeof out === 'object') {
        const isPic = (x) => typeof x === 'string' && x.startsWith('data:image');
        if (isPic(out.image)) { images.push(out.image); out = { ...out, image: '(shown below)' }; }
        if (Array.isArray(out.images)) { images.push(...out.images.filter(isPic).slice(0, 4)); out = { ...out, images: `(${images.length} shown below)` }; }
      }
      const text = typeof out === 'string' ? out : JSON.stringify(out ?? null);
      this.note('did', `${name} ${brief.length > 160 ? `${brief.slice(0, 160)}…` : brief}\n→ ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`);
      return { text: text.slice(0, RESULT_CHARS), images };
    } catch (err) {
      this.note('fault', `${name} ${brief.slice(0, 200)}\n→ ${err.message}`);
      return { text: JSON.stringify({ error: err.message }) };
    }
  }

  // ---------- what it perceives when it wakes ----------

  /** What stays the same while it's here: the frame says what this is, who it is and how
   *  it's related to people; the chassis adds the surfaces and how its code is run. */
  systemText(seen) {
    const surfaces = seen.surfaces.filter(Boolean).map((d) => `- ${d}`).join('\n');
    return `${seen.context}\n\n<soma name="${this.name}">\n(Shown in the system note at the end of the conversation, as it is right now, drawn fresh every time you think.)\n</soma>\n\n<frame>\n${seen.company}\nSurfaces in this frame:\n${surfaces}\n${BODY_CONTRACT}\nYour soma is shown as it is right now in the system note at the end of the conversation, with what's happening now: an edit you make shows there the next time you think.\nRemember: people see the surfaces, not this conversation. Say it in the chat or they won't hear it.\n</frame>`;
  }

  /** The soma as it is right now, and what's happening now: after the conversation, so
   *  the system text and the conversation before it are read from cache. */
  nowText(seen) {
    const faults = Object.entries(this.faults).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    return `<soma name="${this.name}" as-of="now">\n${somaView(this.soma.sections)}\n</soma>\n${seen.now}${faults ? `\nFaults in your code sections right now:\n${faults}` : ''}`;
  }

  toolSchemas() {
    const innate = [
      ...VIEW_TOOLS,
      { name: 'write_section', description: 'Replace one of your soma sections entirely, or create a new one. Code sections (tools, game, hooks) recompile at once. An empty text section is removed.',
        input_schema: { type: 'object', properties: { section: { type: 'string' }, content: { type: 'string' } }, required: ['section', 'content'] } },
      { name: 'edit_section', description: 'Replace an exact, unique piece of text in one of your soma sections. Code sections recompile at once.',
        input_schema: { type: 'object', properties: { section: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['section', 'old', 'new'] } },
    ];
    const names = new Set(innate.map((t) => t.name));
    return [...innate, ...this.tools.filter((t) => !names.has(t.name))].map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.input_schema ?? { type: 'object', properties: {} } },
    }));
  }
}

/** Where in a section an error was thrown, from its stack: the function and line. */
function where(stack) {
  const m = String(stack ?? '').match(/at (?:(\S+) )?\(?eval at compile[^)]*\), <anonymous>:(\d+):\d+\)?/);
  if (!m) return '';
  const fn = m[1]?.replace(/^Object\./, '');
  return `${fn && fn !== 'eval' ? `in ${fn}, ` : ''}line ${Number(m[2]) - HEADER_LINES} of its section`;
}

function errorLines(errors) {
  return errors.map((e) => `- ${e.message} (${e.source === 'async' ? 'in a timer, promise or callback' : `during ${e.during}`}${e.where ? `, ${e.where}` : ''}${e.count > 1 ? `; ${e.count} times` : ''})`).join('\n');
}

/** Mark the newest message as a cache breakpoint, so each turn of a long wake reads the
 *  conversation so far from cache instead of paying for it again. */
function withCacheMark(messages) {
  const out = messages.slice();
  const last = out.at(-1);
  if (last.role === 'assistant') return out;
  const parts = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content.map((p) => ({ ...p }));
  parts[parts.length - 1] = { ...parts.at(-1), cache_control: { type: 'ephemeral' } };
  out[out.length - 1] = { ...last, content: parts };
  return out;
}

// ---------- events as the actant reads them ----------

const BODY = ['text', 'note', 'message'];
const PICTURE = 'image';

/** Events as message parts: the events as text, then any pictures they brought. */
function eventsContent(events, lead = '') {
  const parts = [{ type: 'text', text: lead + eventsBlock(events) }];
  for (const e of events) {
    if (typeof e?.[PICTURE] === 'string' && e[PICTURE].startsWith('data:image')) {
      parts.push({ type: 'text', text: `The picture that came with ${e.type}:` }, { type: 'image_url', image_url: { url: e[PICTURE] } });
    }
  }
  return parts;
}

function eventsBlock(events) {
  return events.map((e) => {
    const attrs = Object.entries(e).filter(([k, v]) => k !== 'at' && k !== PICTURE && !BODY.includes(k) && v != null && typeof v !== 'object' && v !== '')
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
    const body = BODY.map((k) => e[k]).filter(Boolean).join('\n');
    const pic = typeof e[PICTURE] === 'string' ? ' picture="attached"' : '';
    return body ? `<event ${attrs}${pic}>\n${body}\n</event>` : `<event ${attrs}${pic}/>`;
  }).join('\n');
}

function describeEvent(e) {
  if (!e) return '(nothing)';
  const body = BODY.map((k) => e[k]).filter(Boolean).join(' ');
  return `${e.type}${e.who ? ` from ${e.who}` : e.from ? ` from ${e.from}` : ''}${body ? `: ${body.slice(0, 160)}` : ''}`;
}
