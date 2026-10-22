// The frame: one browser window holding surfaces, one ludant, and the people sitting
// with it.
//
//   frame.html?l=<ludant id>
//
// There are no modes. Whoever sits down can play, ask for changes, checkpoint, restore,
// and publish. The frame tells the ludant who is here and how they're related to it, and
// the ludant's hooks decide what that means.
//
// The ludant itself isn't in this page. Its embodiment runs in a sandbox (sandbox.js on
// this side, chassis.js on the other) that can't reach the page, its storage or the key.
// Here are all the surfaces (the stage too: the game draws in a buffer over there, and
// the stage shows the pictures), the people's controls, inference, and keeping things.

import { Bus } from './bus.js';
import { nameOf } from './names.js';
import { ART_MODELS, buildRequest, complete, connect, disconnect, keyInfo, key as ownKey } from './openrouter.js';
import { Art } from './surfaces/art.js';
import { Choices } from './surfaces/choices.js';
import { Body, Sandbox } from './sandbox.js';
import { Chat } from './surfaces/chat.js';
import { Inspector } from './surfaces/inspector.js';
import { Lights } from './lights.js';
import { PadNav, Pads } from './pads.js';
import { Stage } from './surfaces/stage.js';
import { Store } from './surfaces/store.js';
import { Whiteboard } from './surfaces/whiteboard.js';
import { api, askName, el, forget, own, ownerOf, remember } from './ui.js';
import { installExplorer } from './explorer.js';
import { report, watchPage } from './telemetry.js';

// What a think hears when nobody here pays for thinking (actant.js knows it by these words).
const NO_THINKING = 'nobody here has connected thinking';

const SAVE_MS = 800;
const HEARTBEAT_MS = 5000;
const THUMB_MS = 90000;   // how often the lobby's picture of this ludant is refreshed

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

How people meet you: a person opens your frame, a browser window with surfaces in it (a stage where your game runs, a chat, a whiteboard, an inspector, and lights at the top showing who's here and whether you're awake). They play you, and anyone who plays you can also shape you: asking for a change is shaping, and so is how they play. Anyone can publish you, and others take copies that go on with their own people. There are no separate phases for making you and playing you; both happen in every sitting.

What people see: only the surfaces. They see what's on the stage, what's posted in the chat, what's drawn on the whiteboard, and the frame's lights. They do not see this conversation. Your replies here, your reasoning, and anything you write outside of a tool call go nowhere a person will read. (The inspector can show your inner text to someone debugging, but treat that as a window into you, not a way to talk.) So whenever you want to tell someone something (an answer, a greeting, a question, what you changed), post it in the chat with your say tool. If you didn't post it, they didn't hear it.

Where you live: your whole body (your soma, your code, this thinking) runs in a sandbox inside the frame. Every surface is the frame's. Your game draws into the stage's buffer, there in the sandbox with you, and the frame's stage shows what you drew. The frame does your thinking for you when you wake, and keeps you saved. Because your code came from whoever shaped you, the sandbox keeps it apart from the page people use, so nothing you run can touch what's theirs.

The frame also gives you an artist and a way to ask: its art surface paints pictures for you (sprites, backgrounds, your whole game reimagined in a style), and its choices surface lets you show people a few options to pick from. Your game doesn't have to be drawn with shapes; it can look like anything.

Libraries come from the frame, never from the network: today that's three.js (r170), through stage.three(), for when a game wants real 3D instead of drawing perspective by hand. The frame may offer more over time.

Most of you runs without thinking: your hooks and game code run at frame rate, and nothing costs anything until something wakes you. Being awake costs real money, so wake purposefully, do what's needed, and let yourself go back to sleep.

This is early and experimental. Things in the frame may be rough or change. If something about your body or the surfaces seems wrong or confusing, it's fine to say so in the chat.
</context>`;

class Frame {
  constructor(record, seat) {
    this.recordId = record.id;
    this.record = record;
    this.seat = seat;                       // the person at this keyboard
    this.people = new Set([seat]);          // everyone sitting here: the seat, and any shard
    this.bus = new Bus();
    this.sandbox = new Sandbox(this);
    this.sandbox.relay(this.bus);
    this.stage = new Stage(this);
    this.chat = new Chat(this);
    this.whiteboard = new Whiteboard(this);
    this.status = new Lights(this);   // the top bar's lights: the frame's, not a surface
    this.store = new Store(this);
    this.inspector = new Inspector(this);
    this.art = new Art(this);
    this.choices = new Choices(this);
    this.surfaces = [this.stage, this.chat, this.whiteboard, this.store, this.art, this.choices, this.inspector];
    for (const s of this.surfaces) s.load?.(record.surfaces?.[s.id]);
    this.actant = new Body(this, record.soma);   // the ludant as this side sees it
    this.saveTimer = null;
    // This window's claim on the ludant. (crypto.randomUUID needs https, and a phone on
    // the LAN reaches this over plain http.)
    this.token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.owner = ownerOf(record.id);   // this browser's key to it, if it's this browser's
    this.lost = null;                   // set once another window takes the ludant
  }

  /** Hold the ludant so only this window saves it. Another window may be holding it:
   *  then the person chooses whether to take it over. */
  async hold() {
    try {
      const { owner } = await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, owner: this.owner, who: this.seat });
      if (owner) { own(this.recordId, owner); this.owner = owner; }   // a ludant from before owners: it's this browser's now
    } catch (err) {
      if (err.status === 403 && err.body?.notYours) return this.notYours();
      if (err.status !== 409) throw err;
      const since = err.body?.since ? new Date(err.body.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      await this.ask(`${this.actant.name} is open in another window${err.body?.heldBy ? ` (${err.body.heldBy}${since ? `, since ${since}` : ''})` : ''}. A ludant lives in one window at a time.`, 'bring it here');
      await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, owner: this.owner, who: this.seat, takeOver: true });
    }
    // Heartbeats also carry what the sitting has cost since the last one and how long it's
    // been watched, so the server can say what a ludant costs per hour of play.
    let lastBeat = Date.now(), reported = 0;
    this.heartbeat = setInterval(async () => {
      const now = Date.now(), seconds = document.visibilityState === 'visible' ? (now - lastBeat) / 1000 : 0;
      const spent = this.status.spent - reported;
      lastBeat = now; reported = this.status.spent;
      try { await api('POST', `ludants/${this.recordId}/heartbeat`, { token: this.token, owner: this.owner, seconds, spent }); }
      catch (err) { if (err.status === 409) this.lose(err.body?.heldBy); }
    }, HEARTBEAT_MS);
    addEventListener('pagehide', () => navigator.sendBeacon(`/api/ludants/${this.recordId}/release`, JSON.stringify({ token: this.token })));
  }

  /** Someone else's ludant: whoever has its link can look, or take a copy of their own. The
   *  frame goes no further (it never holds it). */
  notYours() {
    const by = this.record.lineage?.takenBy || this.record.lineage?.seededBy;
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
      el('p', {}, el('strong', {}, `${this.actant.name} belongs to someone else${by ? ` (${by})` : ''}. `), 'Only they can change it. You can take a copy of your own, as it is now, and play and shape that one.'),
      el('button', { class: 'top-btn primary', onclick: async () => {
        try {
          const { id, owner } = await api('POST', `ludants/${this.recordId}/copy`, { by: this.seat });
          own(id, owner); remember(id);
          location.href = `/frame.html?l=${id}`;
        } catch (err) { alert(`couldn't take a copy: ${err.message}`); }
      } }, 'take my own copy'),
      el('a', { class: 'top-btn', href: '/' }, 'to the lobby')));
    document.body.append(box);
    return new Promise(() => {});   // the sitting doesn't start
  }

  /** A link that opens this ludant as this browser's on another device (a console, a
   *  phone): the owner key rides after the #, which browsers never send to a server. */
  ownerLink() {
    return `${location.origin}/frame.html?l=${this.recordId}#own=${this.owner}`;
  }

  /** Another window has the ludant now. This one stops: no saving, no thinking, no game. */
  lose(heldBy) {
    if (this.lost) return;
    this.lost = heldBy || 'another window';
    clearInterval(this.heartbeat);
    clearTimeout(this.saveTimer);
    this.stage.live = false;
    this.sandbox.send('sleep');
    setTimeout(() => this.sandbox.remove(), 100);
    this.cover(`${this.actant.name} moved to another window${heldBy ? ` (${heldBy})` : ''}. This window has let go of it, so nothing here is saved any more.`, 'bring it back', async () => location.reload());
  }

  /** A full-window notice with one button. Resolves when the button is pressed. */
  ask(text, button) { return new Promise((resolve) => this.cover(text, button, resolve)); }

  cover(text, button, onclick) {
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' }, el('p', {}, text),
      el('button', { class: 'top-btn primary', onclick: () => { box.remove(); onclick(); } }, button),
      el('a', { class: 'top-btn', href: '/' }, 'lobby')));
    document.body.append(box);
  }

  isPerson(who) { return this.people.has(who); }

  /** Someone sat down or stood up (a shard, say). The ludant is told who's here. */
  peopleChanged() {
    this.sandbox.send('people', [...this.people]);
    this.status.render();
  }

  /** Who pays for thinking here: the person's own OpenRouter account, this server's key
   *  (a local install), or nobody yet. */
  payer() { return ownKey() ? 'own' : this.config?.hasKey ? 'server' : null; }

  /** Thinking, done for the ludant. The key stays on this side; the sandbox only ever
   *  sees the answer. */
  async infer({ messages, tools, ask }) {
    await this.thinkingReady(ask);
    let res;
    if (this.payer() === 'own') {
      const request = buildRequest({ model: this.config.model, messages, tools });
      const started = Date.now();
      res = await complete(request);
      if (this.config.logs) {
        api('POST', `log/${this.recordId}`, { at: new Date().toISOString(), ms: Date.now() - started, model: request.model, status: 200, via: 'browser',
          usage: res.usage, last: request.messages.at(-1), reply: res.choices?.[0]?.message }).catch(() => {});
      }
    } else {
      res = await api('POST', 'infer', { who: this.recordId, messages, tools });
    }
    this.status.addSpend(res.usage?.cost);
    this.checkIn();
    return res;
  }

  /** A picture from an image model, on whoever pays for thinking here. images: data URLs
   *  to paint from. Resolves with { url } (a data URL). */
  async imagine({ prompt, images = [], quality = 'fast' }) {
    await this.thinkingReady();
    this.sandbox.allow();
    const model = ART_MODELS[quality] ?? ART_MODELS.fast;
    const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] }];
    const ask = { model, messages, modalities: ['image', 'text'], max_tokens: 8000 };
    const res = this.payer() === 'own' ? await complete(buildRequest(ask)) : await api('POST', 'infer', { who: this.recordId, ...ask });
    this.status.addSpend(res.usage?.cost);
    this.checkIn();
    const msg = res.choices?.[0]?.message;
    const url = msg?.images?.[0]?.image_url?.url;
    if (!url) throw new Error(`the image model sent back no picture${msg?.content ? `: "${String(msg.content).slice(0, 200)}"` : ''}`);
    return { url };
  }

  /** Nobody here has connected thinking yet. A game plays without it, so the person is
   *  asked only when they reach for the ludant (ask: a person's chat, sketch or pick woke
   *  it); a think it starts by itself just doesn't happen. Either way, what woke it is kept
   *  for when it can think. */
  thinkingReady(ask = true) {
    if (this.payer()) return Promise.resolve();
    if (!ask) return Promise.reject(new Error(NO_THINKING));
    this.asking ??= new Promise((resolve, reject) => {
      const box = el('div', { class: 'banner' },
        el('p', {}, el('strong', {}, `To answer you or change, ${this.actant.name} needs to think. `), 'You can play it without that. Ludants think with an AI model, on your own OpenRouter account: it costs real money, usually a few cents at a time, and the meter at the top shows what this sitting has cost. Connect, and it hears what you said.'),
        el('button', { class: 'top-btn primary', onclick: async () => { if (await connect()) { box.remove(); this.asking = null; this.status.render(); resolve(); } } }, 'connect OpenRouter'),
        el('button', { class: 'top-btn', onclick: () => { box.remove(); this.asking = null; reject(new Error(NO_THINKING)); } }, 'just play'));
      document.body.append(box);
    });
    return this.asking;
  }

  /** Each time the sitting passes another mark (a dollar, unless the person set another),
   *  say so, with the way out. It doesn't stop anything: leaving is how a person stops. */
  checkIn() {
    const mark = this.status.checkInEvery();
    if (!mark) return;
    const passed = Math.floor(this.status.spent / mark);
    if (passed <= (this.checkedIn ?? 0)) return;
    this.checkedIn = passed;
    const rate = this.status.rate();
    const box = el('div', { class: 'banner' },
      el('p', {}, `This sitting with ${this.actant.name} has cost $${this.status.spent.toFixed(2)}${rate ? ` (about $${rate.toFixed(2)} an hour)` : ''}.`),
      el('button', { class: 'top-btn primary', onclick: () => box.remove() }, 'keep playing'),
      el('a', { class: 'top-btn', href: '/' }, 'leave'));
    document.body.append(box);
  }

  /** What the person's own key has left, refreshed now and then (and right away when
   *  someone opens the meter); between refreshes, what's been spent here comes off it. */
  async refreshKey() {
    if (this.payer() !== 'own') { this.keyLeft = null; return null; }
    try { this.keyLeft = { ...(await keyInfo()), spentAt: this.status.spent, at: Date.now() }; }
    catch { this.keyLeft = null; }
    this.status.render();
    return this.keyLeft;
  }

  /** { remaining, balance, limit, resets } with this sitting's spend since the last refresh taken off. */
  left() {
    const k = this.keyLeft;
    if (!k) return null;
    const since = this.status.spent - k.spentAt;
    return { ...k, remaining: k.remaining != null ? k.remaining - since : null, balance: k.balance != null ? k.balance - since : null };
  }

  connectThinking() { return connect().then((ok) => { this.refreshKey(); this.status.render(); return ok; }); }
  disconnectThinking() { disconnect(); this.status.render(); }

  /** What the frame tells the ludant when it wakes: the experiment, who's here, how
   *  they're related to it, and the surfaces on this side. (The chassis adds its soma,
   *  the stage beside it, and how its code runs.) */
  perception() {
    const soma = this.actant.soma, name = this.actant.name;
    const r = this.record, l = r.lineage ?? {};
    const lineage = l.from
      ? `You are a copy of ${l.from.name}, published by ${l.from.by ?? 'someone'}${l.takenBy ? `, taken by ${l.takenBy}` : ''}.`
      : `You were seeded here${l.seededBy ? ` by ${l.seededBy}` : ''}.`;
    const known = Object.keys(r.visitors ?? {});
    const restored = r.restored ? ` ${r.restored.by ?? 'Someone'} last put you back to an earlier checkpoint ("${r.restored.label || `#${r.restored.n}`}"): what changed after it was undone (your memory you kept), though the chat may still mention it.` : '';
    const family = r.familyNames?.length ? ` Names your family (everyone with the given name ${soma.given}) has already been published under: ${r.familyNames.join(', ')}.` : '';
    const titled = nameOf(soma) !== soma.given;
    const naming = `Your name is ${name}: your given name ${soma.given}${titled ? ', and your title section' : ' (your title section is empty, so you have no title yet)'}.${family} Each published name belongs to one snapshot, so being published again takes a change and a new title.`;
    const busy = this.stage.personPlaying() ? ` ${this.seat} is playing your game right now (they gave it input moments ago): a change to your game section restarts it under their hands, so it may be kind to say so first, or wait for a pause.` : '';
    const away = document.hidden ? ` Nobody is looking at the frame right now (its window is in the background): your game keeps running only while you're busy, and what you post waits until ${this.seat} comes back.` : '';
    const view = this.playing ? ` ${this.seat} is in play mode: they see only the stage (${this.stage.touch ? 'filling their phone\'s screen, with on-screen buttons over it' : 'and the lights at the top'}). Your chat messages pop up briefly over the stage, so keep them short, or show things on the stage itself.` : '';
    const rate = this.status.rate();
    const payer = this.payer() === 'own' ? `${this.seat} pays for it, through their own OpenRouter account` : 'this install pays for it';
    const left = this.left();
    const room = left ? ` Their key has ${[left.remaining != null ? `$${left.remaining.toFixed(2)} left of its $${left.limit} limit` : null, left.balance != null ? `$${left.balance.toFixed(2)} in their account` : null].filter(Boolean).join(', ')}.` : '';
    const cost = `Your thinking in this sitting has cost $${this.status.spent.toFixed(2)} so far${rate ? ` (about $${rate.toFixed(2)} an hour)` : ''}, and ${payer}.${room} The people here can see that meter.`;
    const company = `${naming}\nHere with you now: ${[...this.people].join(', ')}.${view}${busy}${away} ${cost} ${lineage}${known.length ? ` People who have sat with you: ${known.join(', ')}.` : ''}${restored}
Anyone sitting with you can play you, ask you to change, take checkpoints, put you back to one, and publish you so others can take copies. A checkpoint is taken whenever someone sits down.`;
    const surfaces = this.surfaces.map((s) => s.describe(name)).filter(Boolean);
    return { context: CONTEXT, company, surfaces };
  }

  /** The ludant's name is its given name plus its title, so a retitle (or a restore that
   *  brings back an old title) renames it. Surfaces that hold names hear about it, so a
   *  baton handed to Elodon is still its baton once it's Elodon-Hop. */
  noticeName() {
    const name = this.actant.name;
    if (this.knownName && this.knownName !== name) {
      this.bus.emit('frame.renamed', { from: this.knownName, to: name });
      this.changed();
    }
    this.knownName = name;
    document.title = `${name} · gactant`;
    this.status.render();
    this.chat.showLife();
    this.whiteboard.renderBaton();
  }

  /** The surfaces' actions, done as `who`. */
  surfacesFor(who) {
    return Object.fromEntries(this.surfaces.map((s) => [s.id, s.actions(who)]));
  }

  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_MS);
  }

  async save() {
    clearTimeout(this.saveTimer);
    if (this.lost) return;
    const surfaces = Object.fromEntries(this.surfaces.filter((s) => s.toJSON).map((s) => [s.id, s.toJSON()]));
    try { await api('PUT', `ludants/${this.recordId}`, { soma: this.actant.soma, surfaces, token: this.token, owner: this.owner }); }
    catch (err) {
      if (err.status === 409) this.lose(err.body?.heldBy);
      else this.inspector.note('fault', `saving failed: ${err.message}`);
    }
  }

  /** Checkpoints and publishing wait for the ludant to finish what it's doing, so they
   *  never catch it halfway through answering the very message that asked for them. */
  async settled(why) {
    if (this.actant.thinking || this.actant.pending) this.status.setLife(this.status.life, `waiting for ${this.actant.name} to finish before ${why}…`);
    await this.actant.idle();
    await this.save();
  }

  async takeCheckpoint(label, by = this.seat) {
    await this.settled('the checkpoint');
    const { n } = await api('POST', `ludants/${this.recordId}/checkpoints`, { label, by, token: this.token, owner: this.owner });
    this.inspector.note('changed', `${by} took checkpoint ${n}${label ? ` "${label}"` : ''}`);
    this.status.setLife(this.status.life);
    return { n };
  }

  /** Publish the ludant as it is now, under its name. A title given here is written into
   *  its title section first (by whoever is publishing), which renames it. */
  async publish(note = '', title = null, by = this.seat) {
    await this.settled('publishing');
    await this.sendThumb();
    const before = this.actant.soma.sections.title ?? '';
    const retitled = title != null && title.trim() !== before.trim();
    if (retitled) {
      await this.actant.writeSection('title', title.trim(), by);
      await this.save();
    }
    try {
      const { id, name, held } = await api('POST', 'published', { ludant: this.recordId, note, by, token: this.token, owner: this.owner });
      const url = `${location.origin}/play.html?p=${id}`;
      this.record.familyNames = [...(this.record.familyNames ?? []), name];
      this.inspector.note('changed', held ? `${by} published ${name}, but it's held for a person to look at first (${held})` : `${by} published ${name}: ${url}`);
      this.bus.emit('frame.published', { who: by, name, url, ...(held ? { held } : {}) });
      return { id, name, url, held };
    } catch (err) {
      // A refused publish leaves the name as it was.
      if (retitled) { await this.actant.writeSection('title', before, by); await this.save(); }
      throw err;
    } finally {
      this.status.setLife(this.status.life);
    }
  }

  /** Put the ludant back to a checkpoint, in place: the stage keeps running, the people
   *  stay seated, and the ludant's body is swapped for the one it had then. */
  async restore(n, by = this.seat) {
    await this.settled('restoring');
    await api('POST', `ludants/${this.recordId}/restore`, { n, by, token: this.token, owner: this.owner });
    const record = await api('GET', `ludants/${this.recordId}`);
    this.record = { ...this.record, ...record, surfaces: this.record.surfaces };
    await this.actant.load(record.soma);
    this.inspector.note('changed', `${by} restored checkpoint #${n}`);
    this.inspector.renderBody();
    this.status.render();
    const label = record.restored?.label ?? '';
    this.bus.emit('frame.restored', { who: by, n, label, note: `${by} put you back to checkpoint #${n}${label ? ` ("${label}")` : ''}. Your body is now the one you had then, except your memory, which you keep; anything else changed since was undone, and is kept as a checkpoint of its own.` });
    return { restored: n, label };
  }

  checkpoints() { return api('GET', `ludants/${this.recordId}/checkpoints`); }

  /** Let the ludant go. Its versions, art and chat stop being kept; what it was published
   *  as stays (those are snapshots with lives of their own), and so do copies others took. */
  askAbandon() {
    const pubs = this.record.familyNames?.length ? ' Its publications stay up, and copies others took stay theirs.' : '';
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
      el('p', {}, el('strong', {}, `Abandon ${this.actant.name}? `), `It stops being kept: it, its versions, its art and its chat go, and its link will say it was abandoned. This can't be undone.${pubs}`),
      el('button', { class: 'top-btn danger', onclick: async () => {
        box.remove();
        try {
          await this.settled('abandoning');
          await api('POST', `ludants/${this.recordId}/abandon`, { token: this.token, by: this.seat });
          this.lost = 'abandoned';
          clearInterval(this.heartbeat);
          this.sandbox.remove();
          forget(this.recordId);
          location.href = '/';
        } catch (err) { alert(`couldn't abandon it: ${err.message}`); }
      } }, 'abandon it'),
      el('button', { class: 'top-btn', onclick: () => box.remove() }, 'keep it')));
    document.body.append(box);
  }

  /** Someone thinks what's here doesn't belong. The report says which ludant and, for a
   *  copy, which publication it came from (that's what others can see), with a picture of
   *  the stage as it is. Whoever runs the site reads it (tools/moderate.mjs). */
  askReport() {
    const from = this.record.lineage?.from;
    const reasons = [
      ['illegal', 'illegal: sexual content involving minors, real threats, or other illegal material'],
      ['sexual', 'sexual or graphic content'],
      ['hateful', 'hateful or harassing'],
      ['violent', 'violent in a way that goes too far'],
      ['other', 'something else'],
    ];
    let reason = null;
    const note = el('textarea', { class: 'report-note', rows: 3, maxlength: 1000, placeholder: 'What did you see? (optional)' });
    const send = el('button', { class: 'top-btn danger', disabled: true, onclick: async () => {
      send.disabled = true;
      try {
        const c = document.createElement('canvas');
        c.width = 320; c.height = Math.round(320 * this.stage.height / this.stage.width);
        c.getContext('2d').drawImage(this.stage.canvas, 0, 0, c.width, c.height);
        await api('POST', 'flags', { ludant: this.recordId, published: from?.published ?? null, reason, note: note.value, by: this.seat, image: c.toDataURL('image/jpeg', 0.72) });
        box.querySelector('.cover-box').replaceChildren(el('p', {}, 'Thank you. Your report went to the people who run gactant, with a picture of the stage as it is now.'),
          el('button', { class: 'top-btn', onclick: () => box.remove() }, 'close'));
      } catch (err) { send.disabled = false; alert(`couldn't send the report: ${err.message}`); }
    } }, 'send report');
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box report-box' },
      el('p', {}, el('strong', {}, 'Report what you saw here. '), from ? `This is a copy of ${from.name}${from.by ? `, published by ${from.by}` : ''}. The report covers both.` : `The report is about ${this.actant.name}.`, ' ', el('a', { href: '/rules.html', target: '_blank' }, 'What isn\'t allowed')),
      ...reasons.map(([value, label]) => el('label', { class: 'report-reason' },
        el('input', { type: 'radio', name: 'report-reason', value, onchange: () => { reason = value; send.disabled = false; } }), label)),
      note, send,
      el('button', { class: 'top-btn', onclick: () => box.remove() }, 'cancel')));
    document.body.append(box);
  }

  /** A small picture of the stage for the lobby. */
  async sendThumb() {
    if (this.lost || !this.stage.count) return;
    const c = document.createElement('canvas');
    c.width = 320; c.height = Math.round(320 * this.stage.height / this.stage.width);
    const g = c.getContext('2d');
    g.drawImage(this.stage.canvas, 0, 0, c.width, c.height);
    try { await api('POST', `ludants/${this.recordId}/thumb`, { token: this.token, image: c.toDataURL('image/jpeg', 0.72) }); } catch {}
  }

  mount() {
    const top = el('header', { class: 'top' },
      el('a', { class: 'brand', href: '/' }, 'gactant'),
      el('div', { class: 'status' }),
      el('div', { class: 'top-actions' }));
    // The inside starts folded until someone opens it: new people need the game and the
    // chat first.
    let folded = true, playing = false;
    try { folded = localStorage.getItem('gactant-fold') !== '0'; playing = localStorage.getItem('gactant-play') === '1'; } catch {}
    // A play link (&play) starts in play mode, whatever was chosen last time.
    if (new URLSearchParams(location.search).has('play')) playing = true;
    this.playing = playing;
    const main = el('main', { class: `frame${folded ? ' folded' : ''}${playing ? ' playing' : ''}` },
      el('section', { class: 'pane stage-pane' }),
      el('section', { class: 'pane wb-pane' }),
      el('section', { class: 'pane chat-pane' }),
      el('section', { class: 'pane insp-pane' }));
    document.body.append(top, main);
    this.status.mount(top.querySelector('.status'));
    this.stage.mount(main.querySelector('.stage-pane'));
    this.choices.mount(main.querySelector('.stage-pane'));
    this.sandbox.mount(document.body);
    this.whiteboard.mount(main.querySelector('.wb-pane'));
    this.chat.mount(main.querySelector('.chat-pane'));
    this.inspector.mount(main.querySelector('.insp-pane'));
    this.mountActions(top.querySelector('.top-actions'), main);
    this.main = main;
    // In play mode only the stage shows, so the ludant's chat messages surface over it.
    this.toasts = el('div', { class: 'toasts' });
    main.querySelector('.stage-pane').append(this.toasts);
    // On a phone, play mode fills the screen, with its own way out (there's no top bar).
    this.fullBtn = el('button', { class: 'full-btn', title: 'full screen', onclick: () => this.goFullscreen() }, '⛶');
    main.querySelector('.stage-pane').append(el('div', { class: 'full-bar' }, this.fullBtn,
      el('button', { class: 'full-btn', title: 'show all', onclick: () => this.setPlaying(false) }, '✕')));
    document.addEventListener('fullscreenchange', () => { this.fullBtn.hidden = Boolean(document.fullscreenElement); this.stage.fit(); });
    this.fullBtn.hidden = !document.documentElement.requestFullscreen;
    document.body.classList.toggle('fullplay', this.playing && this.stage.touch);
    this.bus.on('chat.posted', (e) => { if (this.playing && e.who !== this.seat) this.toast(e.who, e.text); }, 'frame');
    this.hint();
  }

  // ---------- controllers ----------
  //
  // A controller plays the game, unless something asks for it: a dialog or banner on top
  // takes it while it's there, and Menu hands it to the page (moving between the frame's
  // buttons, the chat, the whiteboard) until B or Menu hands it back. View is play mode.

  /** The open dialog, banner or popover, if any: it has the controller first. */
  overlay() { return [...document.querySelectorAll('.cover, .banner, .meter-pop, .history.on, .choices-panel')].at(-1) ?? null; }

  gameHasPads() { return this.padTarget === 'game' && !this.overlay(); }

  usePads(pads) {
    this.pads = pads;
    this.padTarget = 'game';
    pads.on((e) => {
      const overlay = this.overlay();
      if (overlay || this.padTarget === 'page') {
        this.nav.enabled = true;
        if (!overlay && e.down && !e.repeat && e.button === 'menu') { this.padToGame(); this.nav.enabled = false; }
        return;
      }
      this.nav.enabled = false;
      if (!e.down || e.repeat) { this.stage.padEvent(e); return; }
      if (e.button === 'menu') { this.padToPage(); this.nav.enabled = true; return; }
      if (e.button === 'view') { this.setPlaying(!this.playing); return; }
      if (!this.padHinted) { this.padHinted = true; this.padChip('controller: playing the game · Menu for the page', 4000); }
      this.stage.padEvent(e);
    });
    // Moving around the page; it answers only when the game doesn't have the controller.
    this.nav = new PadNav(pads, { scope: () => this.overlay() ?? document.body, onBack: () => { if (!this.overlay()) this.padToGame(); } });
    this.nav.enabled = false;
  }

  padToPage() {
    this.padTarget = 'page';
    this.stage.releasePads();
    this.nav.focus(this.playBtn);
    this.padChip('controller: moving around the page · B for the game');
  }

  padToGame() {
    this.padTarget = 'game';
    this.nav.clear();
    this.padChip(null);
    this.stage.wrap?.focus();
  }

  /** A small note saying where the controller is going. */
  padChip(text, ms = 0) {
    this.chipEl ??= document.body.appendChild(el('div', { class: 'pad-chip' }));
    clearTimeout(this.chipTimer);
    this.chipEl.textContent = text ?? '';
    this.chipEl.classList.toggle('on', Boolean(text));
    if (ms) this.chipTimer = setTimeout(() => this.chipEl.classList.remove('on'), ms);
  }

  /** The first sitting in this browser gets one line about what's going on. */
  hint() {
    try { if (localStorage.getItem('gactant-hinted')) return; } catch { return; }
    const bar = el('div', { class: 'hint-bar' },
      el('span', {}, `${this.actant.name} is a game that's also alive. Play it, and talk to it in the chat: ask it to change something and it will change itself.`),
      el('button', { class: 'wb-btn', onclick: () => { bar.remove(); try { localStorage.setItem('gactant-hinted', '1'); } catch {} } }, 'got it'));
    this.main.before(bar);
  }

  /** Play mode: hide every surface but the stage. The ludant is told, since it changes
   *  what the person can see. */
  setPlaying(on) {
    this.playing = on;
    this.main.classList.toggle('playing', on);
    this.playBtn?.classList.toggle('on', on);
    if (this.playBtn) this.playBtn.textContent = on ? 'show all' : 'play';
    try { localStorage.setItem('gactant-play', on ? '1' : '0'); } catch {}
    this.bus.emit('frame.view', { who: this.seat, playing: on });
    document.body.classList.toggle('fullplay', on && this.stage.touch);
    if (this.stage.touch) {
      if (on) this.goFullscreen();
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
    this.stage.fit();
    if (on) this.stage.wrap?.focus();
  }

  /** The browser's own full screen, where it has one (not on iPhones: there, play mode
   *  still fills the page). A wide game turns the phone sideways if the browser allows. */
  async goFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      if (this.stage.width > this.stage.height) await screen.orientation?.lock?.('landscape');
    } catch {}
    this.stage.fit();
  }

  toast(who, text) {
    const t = el('div', { class: 'toast' }, el('span', { class: 'toast-who' }, who), el('span', {}, text));
    t.addEventListener('click', () => t.remove());
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('gone'), 4000 + Math.min(12000, text.length * 60));
    setTimeout(() => t.remove(), 5000 + Math.min(12000, text.length * 60));
  }

  mountActions(root, main) {
    const history = el('div', { class: 'history' });
    const toggleHistory = async () => {
      if (!history.classList.toggle('on')) return;
      const cps = await this.checkpoints();
      const when = (at) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      history.replaceChildren(
        el('div', { class: 'history-head' },
          el('span', {}, `Every version of ${this.actant.name} worth keeping. One is kept whenever someone sits down; go back to any of them (the chat stays).`),
          el('button', { class: 'wb-btn', onclick: async () => {
            const label = prompt('A label for how it is now (optional):', '');
            if (label === null) return;
            await this.takeCheckpoint(label);
            history.classList.remove('on'); toggleHistory();
          } }, 'keep this version')),
        ...cps.slice().reverse().map((cp) => el('div', { class: 'history-row' },
          el('span', { class: 'history-n' }, `#${cp.n}`),
          el('span', { class: 'history-label' }, cp.label || '(no label)', el('em', {}, ` ${cp.by ? `${cp.by} · ` : ''}${when(cp.at)}`)),
          el('button', { class: 'wb-btn', onclick: () => {
            if (confirm(`Put ${this.actant.name} back to checkpoint #${cp.n}? How it is now is kept as a checkpoint too, and the chat stays.`)) { history.classList.remove('on'); this.restore(cp.n); }
          } }, 'restore'))),
        el('div', { class: 'history-foot' },
          this.owner ? el('button', { class: 'wb-btn', onclick: () => { history.classList.remove('on'); prompt(`Open this on another device of yours (a console, a phone) and ${this.actant.name} is yours there too. Anyone with this link can change it, so keep it to yourself:`, this.ownerLink()); } }, 'open on another device…') : null,
          el('button', { class: 'wb-btn danger', onclick: () => { history.classList.remove('on'); this.askAbandon(); } }, 'abandon this ludant…')),
      );
    };
    root.append(
      el('button', { class: 'top-btn', title: 'versions of this ludant: keep one, or go back to one', onclick: toggleHistory }, 'history'),
      el('button', { class: 'top-btn primary', onclick: async () => {
        const given = this.actant.soma.given;
        const title = prompt(`Publish under the name ${given}-<title>. Each name belongs to one snapshot, so a new publication needs a new title. Title:`, this.actant.soma.sections.title ?? '');
        if (!title?.trim()) return;
        const note = prompt('A note for whoever takes a copy (optional):', '') ?? '';
        try {
          const { url, name, held } = await this.publish(note, title);
          if (held) alert(`${name} is published, but held back: a check before publications go public thought something in it might break the rules (${held.replace(/^the publish check: /, '')}). A person will look at it soon, and it shows up once they have. Your ludant is as it was.`);
          else prompt(`Published as ${name}. Anyone can take a copy here:`, url);
        } catch (err) { alert(err.message); }
      } }, 'publish'),
      el('a', { class: 'top-btn', href: '/', title: 'back to the lobby' }, 'lobby'),
      this.playBtn = el('button', { class: `top-btn${this.playing ? ' on' : ''}`, title: 'show only the stage', onclick: () => this.setPlaying(!this.playing) }, this.playing ? 'show all' : 'play'),
      el('button', { class: 'top-btn', title: 'look inside: its soma, what it\'s doing, its store', onclick: () => {
        const f = main.classList.toggle('folded');
        try { localStorage.setItem('gactant-fold', f ? '1' : '0'); } catch {}
      } }, 'inside'),
      el('button', { class: 'top-btn', title: 'report something that doesn\'t belong here', 'aria-label': 'report', onclick: () => this.askReport() }, '⚑'),
      history,
    );
  }

  /** Who the ludant is to the person who just sat down, in a sentence. */
  arrivalNote(arrival) {
    const who = this.seat, l = this.record.lineage ?? {};
    if (this.record.fresh && l.from) {
      const took = l.takenBy && l.takenBy !== who ? `${l.takenBy} took this copy; ${who} is here with you.` : `${who} took this copy and is here with you.`;
      const whence = l.from.published ? `published by ${l.from.by ?? 'someone'}` : 'taken from its link, as it was then';
      return `You are a new copy of ${l.from.name}, ${whence}. ${took}`;
    }
    if (this.record.fresh) return `You have just been seeded by ${who}. They are here with you.`;
    if (arrival.firstVisit) return `${who} has sat down with you for the first time.`;
    return `${who} is back (visit ${arrival.visits}).`;
  }

  async start() {
    // The sandbox gets the ludant and what it needs to read at frame rate. The frame's
    // surfaces it reaches through their actions, which it's told the names of.
    const actions = Object.fromEntries(this.surfaces.filter((s) => s.id !== 'stage' && s.id !== 'inspector').map((s) => [s.id, Object.keys(s.actions(''))]));
    await this.art.fetch();
    await this.sandbox.call('init', {
      soma: this.actant.soma, stage: this.stage.toJSON(), chat: this.chat.messages, store: this.store.data, people: [...this.people], actions,
      art: this.art.forSandbox(),
    });
    await this.sandbox.checkPictures();
    this.stage.live = true;
    this.status.render();
    const arrival = await api('POST', `ludants/${this.recordId}/arrive`, { who: this.seat, token: this.token, owner: this.owner });
    this.record.visitors = Object.fromEntries(arrival.people.map((p) => [p, true]));
    this.bus.emit('frame.arrived', { who: this.seat, firstVisit: arrival.firstVisit, visits: arrival.visits, fresh: Boolean(this.record.fresh), note: this.arrivalNote(arrival) });
    if (this.record.fresh) this.changed();
  }
}

async function boot() {
  const id = new URLSearchParams(location.search).get('l');
  if (!id) { location.href = '/'; return; }
  // An owner link (#own=…) makes it this browser's too; the key leaves the address bar.
  const ownKey = new URLSearchParams(location.hash.slice(1)).get('own');
  if (ownKey) { own(id, ownKey); history.replaceState(null, '', location.pathname + location.search); }
  // Controllers from the start, so even the first question (a name) can be answered with one.
  const pads = new Pads();
  const askNav = new PadNav(pads, { scope: () => document.querySelector('.cover') });
  const seat = await askName();
  askNav.enabled = false;
  remember(id);
  let record, config;
  try { [record, config] = await Promise.all([api('GET', `ludants/${id}`), api('GET', 'config')]); }
  catch (err) {
    if (err.status !== 410) throw err;
    // Abandoned: say so, and when, and forget it here.
    forget(id);
    const a = err.body?.abandoned ?? {};
    const when = a.at ? new Date(a.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    document.body.append(el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
      el('p', {}, a.takenDown
        ? `${a.name ?? 'This ludant'} was taken down${when ? ` on ${when}` : ''} for breaking gactant's rules. It isn't kept any more.`
        : `${a.name ?? 'This ludant'} was abandoned${a.by ? ` by ${a.by}` : ''}${when ? ` on ${when}` : ''}. It isn't kept any more, though anything it was published as may still be in the lobby.`),
      el('a', { class: 'top-btn primary', href: '/' }, 'to the lobby'))));
    return;
  }
  const frame = new Frame(record, seat);
  frame.config = config;
  frame.noticeName();
  frame.mount();
  frame.usePads(pads);
  await frame.hold();
  await frame.start();
  setTimeout(() => frame.sendThumb(), 5000);
  frame.refreshKey();
  setInterval(() => frame.refreshKey(), 5 * 60 * 1000);
  setInterval(() => { if (document.visibilityState === 'visible') frame.sendThumb(); }, THUMB_MS);
  installExplorer(frame);
  // How the stage runs here, now and then while someone's looking (telemetry.js).
  report('sit', { ludant: record.id });
  frame.stage.sample();
  const perf = () => { const p = frame.stage.sample(); if (p) report('perf', p); };
  setTimeout(() => { perf(); setInterval(perf, 5 * 60 * 1000); }, 60 * 1000);
  const brief = new URLSearchParams(location.search).get('shard');
  if (brief) window.explorer.shard(brief).then((r) => console.log('[shard]', r));
}

watchPage('frame');
boot().catch((err) => {
  report('crash', { where: 'frame boot', message: err.message, sample: err.stack });
  document.body.append(el('pre', { class: 'boot-fault' }, `couldn't open the frame: ${err.message}`));
});
