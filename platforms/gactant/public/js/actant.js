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

import { api } from './ui.js';

const CODE = new Set(['tools', 'game', 'hooks']);
const MAX_TURNS = 16;
const RESTLESS_LIMIT = 3;
const RESULT_CHARS = 6000;

const compile = (src) => new Function(`return (${src}\n)`)();

export class Actant {
  constructor(frame, soma) {
    this.frame = frame;
    this.soma = soma;
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

  get name() { return this.soma.name; }

  buildMe() {
    const actant = this;
    return {
      get name() { return actant.soma.name; },
      get audience() { return actant.frame.audience; },
      get game() { return actant.game; },
      get surfaces() { return actant.frame.surfacesFor(actant.soma.name); },
      wake: (event) => this.wake(event),
      section: (name) => ({
        read: () => this.soma.sections[name] ?? '',
        write: (content) => this.writeSection(name, content, this.soma.name),
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

  wake(event) {
    const human = this.frame.isHuman(event?.who) || this.frame.isHuman(event?.from) || event?.type === 'frame.audience';
    this.restless = human ? 0 : this.restless + 1;
    this.pending.push(event);
    this.frame.inspector.note('wake', describeEvent(event));
    if (this.thinking) return;   // it joins the think already under way
    if (this.restless > RESTLESS_LIMIT) {
      this.frame.status.setLife('resting', 'woke itself too often; waiting for a human');
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.think(), 400);   // let a burst of events arrive together
  }

  async think() {
    if (this.thinking || !this.pending.length) return;
    this.thinking = true;
    this.frame.status.setLife('thinking');
    const messages = [{ role: 'user', content: eventsBlock(this.pending.splice(0)) }];
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await api('POST', 'infer', {
          who: this.frame.recordId,
          messages: [{ role: 'system', content: [{ type: 'text', text: this.systemText(), cache_control: { type: 'ephemeral' } }] }, ...messages],
          tools: this.toolSchemas(),
        });
        this.frame.status.addSpend(res.usage?.cost);
        const msg = res.choices?.[0]?.message ?? {};
        if (msg.content) this.frame.inspector.note('thought', msg.content);
        messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        if (!msg.tool_calls?.length) break;

        const images = [];
        for (const call of msg.tool_calls) {
          const { text, image } = await this.runTool(call);
          messages.push({ role: 'tool', tool_call_id: call.id, content: text });
          if (image) images.push({ type: 'image_url', image_url: { url: image } });
        }
        const arrived = this.pending.splice(0);
        if (images.length || arrived.length) {
          messages.push({ role: 'user', content: [
            ...(images.length ? [{ type: 'text', text: 'What you looked at:' }, ...images] : []),
            ...(arrived.length ? [{ type: 'text', text: `Meanwhile:\n${eventsBlock(arrived)}` }] : []),
          ] });
        }
      }
      this.frame.status.setLife('asleep');
    } catch (err) {
      this.frame.inspector.note('fault', `thinking failed: ${err.message}`);
      this.frame.status.setLife('error', err.message.slice(0, 120));
    } finally {
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
      let image = null;
      if (out && typeof out === 'object' && typeof out.image === 'string' && out.image.startsWith('data:image')) {
        image = out.image;
        out = { ...out, image: '(shown below)' };
      }
      const text = typeof out === 'string' ? out : JSON.stringify(out ?? null);
      this.frame.inspector.note('did', `${name} ${brief.length > 160 ? `${brief.slice(0, 160)}…` : brief}\n→ ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`);
      return { text: text.slice(0, RESULT_CHARS), image };
    } catch (err) {
      this.frame.inspector.note('fault', `${name} ${brief.slice(0, 200)}\n→ ${err.message}`);
      return { text: JSON.stringify({ error: err.message }) };
    }
  }

  // ---------- what it perceives when it wakes ----------

  systemText() {
    const sections = Object.entries(this.soma.sections)
      .map(([name, content]) => `<section name="${name}"${CODE.has(name) ? ' kind="code"' : ''}>\n${content}\n</section>`).join('\n\n');
    const surfaces = this.frame.surfaces.map((s) => s.describe()).filter(Boolean).map((d) => `- ${d}`).join('\n');
    const faults = Object.entries(this.faults).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    const audience = this.frame.audience === 'shaper'
      ? 'You are being shaped. The human here is your shaper; they appear as "shaper".'
      : 'You are installed for a player. The human here is your player; they appear as "player".';
    return `<soma name="${this.name}">\n${sections}\n</soma>\n\n<frame>\n${audience}\nSurfaces in this frame:\n${surfaces}\n${faults ? `Faults in your code sections right now:\n${faults}\n` : ''}Text you write outside of tools stays with you; nobody else sees it.\n</frame>`;
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

// ---------- events as the actant reads them ----------

const BODY = ['text', 'note', 'message'];

function eventsBlock(events) {
  return events.map((e) => {
    const attrs = Object.entries(e).filter(([k, v]) => k !== 'at' && !BODY.includes(k) && v != null && typeof v !== 'object' && v !== '')
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
    const body = BODY.map((k) => e[k]).filter(Boolean).join('\n');
    return body ? `<event ${attrs}>\n${body}\n</event>` : `<event ${attrs}/>`;
  }).join('\n');
}

function describeEvent(e) {
  if (!e) return '(nothing)';
  const body = BODY.map((k) => e[k]).filter(Boolean).join(' ');
  return `${e.type}${e.who ? ` from ${e.who}` : e.from ? ` from ${e.from}` : ''}${body ? `: ${body.slice(0, 160)}` : ''}`;
}
