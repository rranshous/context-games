// An actant: a soma (named sections of text and code) living in a frame.
//
// Three sections are code, and they are how the actant is embodied:
//   tools   what it can do while awake: [{ name, description, input_schema, run(input, me, surfaces) }]
//   game    a factory (stage, me) => { frame(dt), key(e), pointer(e) }: the facet people play
//   hooks   (on, me, surfaces) => void: listens to surface events, runs the game, decides what wakes it
// Everything else is text it carries (origin, identity, memory, whatever it adds).
//
// Two tools are innate and not in the soma: write_section and edit_section. However the
// actant breaks its own tools list, it can always repair itself.
//
// Waking is costly, so a governor watches: wakes that no human caused (its own game
// halting, say) are allowed a few in a row, then the actant rests until a human acts.

import { nameOf } from './names.js';
import { api } from './ui.js';

const CODE = new Set(['tools', 'game', 'hooks']);
const MAX_TURNS = 16;
const RESTLESS_LIMIT = 3;
const RESULT_CHARS = 6000;

// What this is, said plainly to the ludant at every wake. Ludants do better when they
// know the goals and that it's an experiment. The frame owns this, not the soma, and it's
// the same every time, so it caches.
const CONTEXT = `<context>
This is gactant, an experimental platform built by Robby Ranshous with Claude. You are part of the experiment, and this note explains it.

What you are: a ludant, a game that is also an actant. An actant is an AI that lives in a body it can change: its soma, the named sections below. Your game is not something you made and handed over; it is one of the ways you exist. Your game section is the game, so when the game changes, you have changed.

The idea behind it is a ladder of how an actant can relate to the program it works on:
1. Relay: it hears about the program from a human.
2. Instrumented: it handles the program through tools from outside.
3. Scripted: it writes code that runs inside the program's loop.
4. Co-framed: it lives alongside the program, sharing its frame and loop.
5. Faceted: it is the program. The game is a facet of the actant's own embodiment.
You are level 5. The test: does changing the game mean you have changed yourself? For you, yes.

How people meet you: a person opens your frame, a browser window with surfaces in it (a stage where your game runs, a chat, a whiteboard, status lights, an inspector). They play you, and anyone who plays you can also shape you: asking for a change is shaping, and so is how they play. Anyone can publish you, and others take copies that go on with their own people. There are no separate phases for making you and playing you; both happen in every sitting.

What people see: only the surfaces. They see what's on the stage, what's posted in the chat, what's drawn on the whiteboard, and the status lights. They do not see this conversation. Your replies here, your reasoning, and anything you write outside of a tool call go nowhere a person will read. (The inspector can show your inner text to someone debugging, but treat that as a window into you, not a way to talk.) So whenever you want to tell someone something (an answer, a greeting, a question, what you changed), post it in the chat with your say tool. If you didn't post it, they didn't hear it.

Libraries come from the frame, never from the network: today that's three.js (r170), through stage.three(), for when a game wants real 3D instead of drawing perspective by hand. The frame may offer more over time.

Most of you runs without thinking: your hooks and game code run at frame rate, and nothing costs anything until something wakes you. Being awake costs real money, so wake purposefully, do what's needed, and let yourself go back to sleep.

This is early and experimental. Things in the frame may be rough or change. If something about your body or the surfaces seems wrong or confusing, it's fine to say so in the chat.
</context>`;

// How the frame runs code sections. This is the frame's side of the bargain, so it lives
// here rather than in the soma, where an actant rewriting its comments could erase it.
const BODY_CONTRACT = `How the frame runs your code sections:
- tools: a JS array of { name, description, input_schema, run(input, me, surfaces) }. run may be async. Returning { image } or { images: [...] } (data URLs) shows you pictures.
- game: function (stage, me) returning { frame(dt), key(e), pointer(e) } (any may be missing). Called anew whenever the game section changes. stage: ctx, width, height, t, frame, size(w, h), three() (3D with three.js: returns { THREE, scene, camera, renderer }; the stage renders every frame, and ctx becomes a transparent HUD on top, so clear it each frame), caption (set it to a short line about what's happening: every look reports it), input { keys: Set of held keys, pressed: Set (went down this frame), pointer { x, y, down, clicked } }. Key names are lowercase: 'arrowleft', 'arrowup', 'a', ' ' (space), 'shift'.
- hooks: function (on, me, surfaces). on(pattern, fn) listens to surface events ('chat.posted', 'stage.*', '*'). Runs anew whenever hooks changes.
- me: name, people (who is here), game (the running game object), wake(event), section(name).read()/.write(text), sections(), note(text), surfaces.
- surfaces: each surface's actions, done as you: surfaces.chat.post(text), surfaces.stage.press(key, ms), and so on.
- Testing yourself: surfaces.stage.advance(seconds) runs your game that far ahead at once (for seeing what happens later). Put test helpers on your game object, reachable as me.game from your tools, not on keys a person might press: everything on the stage is something people will play.
- write_section and edit_section are always yours, whatever happens to your tools.`;

const compile = (src) => new Function(`return (${src}\n)`)();

export class Actant {
  constructor(frame, soma) {
    this.frame = frame;
    this.soma = soma;   // replaced whole when someone restores a checkpoint
    this.faults = {};        // section -> error message from compiling or starting it
    this.pending = [];       // events waiting for the next think
    this.thinking = false;
    this.restless = 0;
    this.game = null;
    this.tools = [];
    this.offHooks = [];
    this.timer = null;
    this.me = this.buildMe();
  }

  /** Given name and game title together, so it changes when the title does. */
  get name() { return nameOf(this.soma); }

  buildMe() {
    const actant = this;
    return {
      get name() { return actant.name; },
      get people() { return [...actant.frame.people]; },
      get game() { return actant.game; },
      get surfaces() { return actant.frame.surfacesFor(actant.name); },
      wake: (event) => this.wake(event),
      section: (name) => ({
        read: () => this.soma.sections[name] ?? '',
        write: (content) => this.writeSection(name, content, this.name),
      }),
      sections: () => Object.keys(this.soma.sections),
      note: (text) => this.frame.inspector.note('note', text),
    };
  }

  // ---------- the soma ----------

  writeSection(name, content, by) {
    if (typeof content !== 'string') throw new Error(`section content must be a string, got ${typeof content}`);
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`section names are lowercase words: ${name}`);
    if (content === '' && !CODE.has(name)) delete this.soma.sections[name];
    else this.soma.sections[name] = content;
    this.frame.inspector.note('changed', `${by} rewrote ${name} (${content.length} chars)`);
    this.frame.inspector.sectionChanged(name);
    if (CODE.has(name)) this.rebuild(name);
    this.frame.bus.emit('soma.changed', { section: name, by });
    this.frame.changed();
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
      this.frame.stage.beginGame();
      try { if (s.game) this.game = compile(s.game)(this.frame.stage.api, this.me); }
      catch (err) { this.faults.game = err.message; }
      this.frame.stage.restart();
    }
    if (redo('hooks')) {
      delete this.faults.hooks;
      for (const off of this.offHooks) off();
      this.offHooks = [];
      const on = (pattern, fn) => { this.offHooks.push(this.frame.bus.on(pattern, fn, 'hooks')); };
      try { if (s.hooks) compile(s.hooks)(on, this.me, this.me.surfaces); }
      catch (err) { this.faults.hooks = err.message; }
      this.frame.stage.restart();
    }
    for (const section of only ? [only] : Object.keys(this.faults)) {
      if (this.faults[section]) this.frame.inspector.note('fault', `${section}: ${this.faults[section]}`);
    }
    this.frame.inspector.renderTabs();
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
    const human = this.frame.isPerson(event?.who) || this.frame.isPerson(event?.from);
    this.restless = human ? 0 : this.restless + 1;
    this.pending.push(event);
    this.frame.inspector.note('wake', describeEvent(event));
    if (this.thinking) return;   // it joins the think already under way
    if (this.restless > RESTLESS_LIMIT) {
      this.frame.status.setLife('resting', 'woke itself too often; waiting for someone to act');
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
    this.frame.status.setLife('thinking');
    const woke = this.pending.splice(0);
    const messages = [{ role: 'user', content: eventsContent(woke) }];
    // Did a person wake it, and has it said anything in the chat since? The habit of
    // answering in its own reply instead of on a surface is strong, so it gets one reminder.
    const byPerson = woke.some((e) => this.frame.isPerson(e?.who) || this.frame.isPerson(e?.from));
    let spoke = false, reminded = false;
    const offSpoke = this.frame.bus.on('chat.posted', (e) => { if (e.who === this.name) spoke = true; }, 'actant');
    // The soma is shown as it was on waking. Re-rendering it after every edit made the
    // actant read its own fresh edits as code that had always been there.
    const system = [{ type: 'text', text: this.systemText(), cache_control: { type: 'ephemeral' } }];
    try {
      for (let turn = 0; turn < MAX_TURNS && !this.asleepForever; turn++) {
        const res = await api('POST', 'infer', {
          who: this.frame.recordId,
          messages: [{ role: 'system', content: system }, ...withCacheMark(messages)],
          tools: this.toolSchemas(),
        });
        this.frame.status.addSpend(res.usage?.cost);
        const msg = res.choices?.[0]?.message ?? {};
        if (msg.content) this.frame.inspector.note('thought', msg.content);
        messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        if (!msg.tool_calls?.length) {
          if (byPerson && !spoke && !reminded && msg.content?.trim()) {
            reminded = true;
            messages.push({ role: 'user', content: 'You haven\'t said anything in the chat this time, so the person here can\'t see what you just wrote: they only see the surfaces. If it was meant for them, post it with your say tool. If it was only for you, you can stop.' });
            this.frame.inspector.note('wake', 'frame: reminded it that nothing it wrote reached the chat');
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
        if (images.length || arrived.length) {
          const meanwhile = arrived.length ? eventsContent(arrived, 'Meanwhile:\n') : [];
          messages.push({ role: 'user', content: [
            ...(images.length ? [{ type: 'text', text: 'What you looked at:' }, ...images] : []),
            ...meanwhile,
          ] });
        }
      }
      this.frame.status.setLife('asleep');
    } catch (err) {
      this.frame.inspector.note('fault', `thinking failed: ${err.message}`);
      this.frame.status.setLife('error', err.message.slice(0, 120));
    } finally {
      offSpoke();
      this.thinking = false;
      this.frame.changed();
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
      this.frame.inspector.note('did', `${name} ${brief.length > 160 ? `${brief.slice(0, 160)}…` : brief}\n→ ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`);
      return { text: text.slice(0, RESULT_CHARS), images };
    } catch (err) {
      this.frame.inspector.note('fault', `${name} ${brief.slice(0, 200)}\n→ ${err.message}`);
      return { text: JSON.stringify({ error: err.message }) };
    }
  }

  // ---------- what it perceives when it wakes ----------

  systemText() {
    const sections = Object.entries(this.soma.sections)
      .map(([name, content]) => `<section name="${name}"${CODE.has(name) ? ' kind="code"' : ''}>\n${content}\n</section>`).join('\n\n');
    const surfaces = this.frame.surfaces.map((s) => s.describe(this.name)).filter(Boolean).map((d) => `- ${d}`).join('\n');
    const faults = Object.entries(this.faults).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    const here = [...this.frame.people].join(', ');
    const r = this.frame.record, l = r.lineage ?? {};
    const lineage = l.from
      ? `You are a copy of ${l.from.name}, published by ${l.from.by ?? 'someone'}${l.takenBy ? `, taken by ${l.takenBy}` : ''}.`
      : `You were seeded here${l.seededBy ? ` by ${l.seededBy}` : ''}.`;
    const known = Object.keys(r.visitors ?? {});
    const restored = r.restored ? ` ${r.restored.by ?? 'Someone'} last put you back to an earlier checkpoint ("${r.restored.label || `#${r.restored.n}`}"): what changed after it was undone (your memory you kept), though the chat may still mention it.` : '';
    const family = r.familyNames?.length ? ` Names your family (everyone with the given name ${this.soma.given}) has already been published under: ${r.familyNames.join(', ')}.` : '';
    const naming = `Your name is ${this.name}: your given name ${this.soma.given}${titleSlugged(this.soma) ? ', and your title section' : ' (your title section is empty, so you have no title yet)'}.${family} Each published name belongs to one snapshot, so being published again takes a change and a new title.`;
    const view = this.frame.playing ? ` ${this.frame.seat} is in play mode: they see only the stage (and the status lights). Your chat messages pop up briefly over the stage, so keep them short, or show things on the stage itself.` : '';
    const company = `${naming}\nHere with you now: ${here}.${view} ${lineage}${known.length ? ` People who have sat with you: ${known.join(', ')}.` : ''}${restored}
Anyone sitting with you can play you, ask you to change, take checkpoints, put you back to one, and publish you so others can take copies. A checkpoint is taken whenever someone sits down.`;
    return `${CONTEXT}\n\n<soma name="${this.name}">\n${sections}\n</soma>\n\n<frame>\n${company}\nSurfaces in this frame:\n${surfaces}\n${BODY_CONTRACT}\n${faults ? `Faults in your code sections right now:\n${faults}\n` : ''}This is your soma as it was when you woke. Edits you make while awake take effect at once; your tool results show them.\nRemember: people see the surfaces, not this conversation. Say it in the chat or they won't hear it.\n</frame>`;
  }

  toolSchemas() {
    const innate = [
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

const titleSlugged = (soma) => nameOf(soma) !== soma.given;

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
