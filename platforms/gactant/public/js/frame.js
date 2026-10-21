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
import { Body, Sandbox } from './sandbox.js';
import { Chat } from './surfaces/chat.js';
import { Inspector } from './surfaces/inspector.js';
import { Stage } from './surfaces/stage.js';
import { Status } from './surfaces/status.js';
import { Store } from './surfaces/store.js';
import { Whiteboard } from './surfaces/whiteboard.js';
import { api, el, myName } from './ui.js';
import { installExplorer } from './explorer.js';

const SAVE_MS = 800;
const HEARTBEAT_MS = 5000;

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

Where you live: your whole body (your soma, your code, this thinking) runs in a sandbox inside the frame. Every surface is the frame's. Your game draws into the stage's buffer, there in the sandbox with you, and the frame's stage shows what you drew. The frame does your thinking for you when you wake, and keeps you saved. Because your code came from whoever shaped you, the sandbox keeps it apart from the page people use, so nothing you run can touch what's theirs.

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
    this.status = new Status(this);
    this.store = new Store(this);
    this.inspector = new Inspector(this);
    this.surfaces = [this.stage, this.chat, this.whiteboard, this.status, this.store, this.inspector];
    for (const s of this.surfaces) s.load?.(record.surfaces?.[s.id]);
    this.actant = new Body(this, record.soma);   // the ludant as this side sees it
    this.saveTimer = null;
    // This window's claim on the ludant. (crypto.randomUUID needs https, and a phone on
    // the LAN reaches this over plain http.)
    this.token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.lost = null;                   // set once another window takes the ludant
  }

  /** Hold the ludant so only this window saves it. Another window may be holding it:
   *  then the person chooses whether to take it over. */
  async hold() {
    try {
      await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, who: this.seat });
    } catch (err) {
      if (err.status !== 409) throw err;
      const since = err.body?.since ? new Date(err.body.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      await this.ask(`${this.actant.name} is open in another window${err.body?.heldBy ? ` (${err.body.heldBy}${since ? `, since ${since}` : ''})` : ''}. A ludant lives in one window at a time.`, 'bring it here');
      await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, who: this.seat, takeOver: true });
    }
    this.heartbeat = setInterval(async () => {
      try { await api('POST', `ludants/${this.recordId}/heartbeat`, { token: this.token }); }
      catch (err) { if (err.status === 409) this.lose(err.body?.heldBy); }
    }, HEARTBEAT_MS);
    addEventListener('pagehide', () => navigator.sendBeacon(`/api/ludants/${this.recordId}/release`, JSON.stringify({ token: this.token })));
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

  /** Thinking, done for the ludant. The key stays here (today on the server, behind the
   *  relay); the sandbox only ever sees the answer. */
  async infer({ messages, tools }) {
    const res = await api('POST', 'infer', { who: this.recordId, messages, tools });
    this.status.addSpend(res.usage?.cost);
    return res;
  }

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
    const view = this.playing ? ` ${this.seat} is in play mode: they see only the stage (and the status lights). Your chat messages pop up briefly over the stage, so keep them short, or show things on the stage itself.` : '';
    const company = `${naming}\nHere with you now: ${[...this.people].join(', ')}.${view} ${lineage}${known.length ? ` People who have sat with you: ${known.join(', ')}.` : ''}${restored}
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
    try { await api('PUT', `ludants/${this.recordId}`, { soma: this.actant.soma, surfaces, token: this.token }); }
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
    const { n } = await api('POST', `ludants/${this.recordId}/checkpoints`, { label, by });
    this.inspector.note('changed', `${by} took checkpoint ${n}${label ? ` "${label}"` : ''}`);
    this.status.setLife(this.status.life);
    return { n };
  }

  /** Publish the ludant as it is now, under its name. A title given here is written into
   *  its title section first (by whoever is publishing), which renames it. */
  async publish(note = '', title = null, by = this.seat) {
    await this.settled('publishing');
    const before = this.actant.soma.sections.title ?? '';
    const retitled = title != null && title.trim() !== before.trim();
    if (retitled) {
      await this.actant.writeSection('title', title.trim(), by);
      await this.save();
    }
    try {
      const { id, name } = await api('POST', 'published', { ludant: this.recordId, note, by });
      const url = `${location.origin}/play.html?p=${id}`;
      this.record.familyNames = [...(this.record.familyNames ?? []), name];
      this.inspector.note('changed', `${by} published ${name}: ${url}`);
      this.bus.emit('frame.published', { who: by, name, url });
      return { id, name, url };
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
    await api('POST', `ludants/${this.recordId}/restore`, { n, by });
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

  mount() {
    const top = el('header', { class: 'top' },
      el('a', { class: 'brand', href: '/' }, 'gactant'),
      el('div', { class: 'status' }),
      el('div', { class: 'top-actions' }));
    let folded = false, playing = false;
    try { folded = localStorage.getItem('gactant-fold') === '1'; playing = localStorage.getItem('gactant-play') === '1'; } catch {}
    this.playing = playing;
    const main = el('main', { class: `frame${folded ? ' folded' : ''}${playing ? ' playing' : ''}` },
      el('section', { class: 'pane stage-pane' }),
      el('section', { class: 'pane wb-pane' }),
      el('section', { class: 'pane chat-pane' }),
      el('section', { class: 'pane insp-pane' }));
    document.body.append(top, main);
    this.status.mount(top.querySelector('.status'));
    this.stage.mount(main.querySelector('.stage-pane'));
    this.sandbox.mount(document.body);
    this.whiteboard.mount(main.querySelector('.wb-pane'));
    this.chat.mount(main.querySelector('.chat-pane'));
    this.inspector.mount(main.querySelector('.insp-pane'));
    this.mountActions(top.querySelector('.top-actions'), main);
    this.main = main;
    // In play mode only the stage shows, so the ludant's chat messages surface over it.
    this.toasts = el('div', { class: 'toasts' });
    main.querySelector('.stage-pane').append(this.toasts);
    this.bus.on('chat.posted', (e) => { if (this.playing && e.who !== this.seat) this.toast(e.who, e.text); }, 'frame');
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
    this.stage.fit();
    if (on) this.stage.wrap?.focus();
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
        el('div', { class: 'history-head' }, 'checkpoints: go back to any of them'),
        ...cps.slice().reverse().map((cp) => el('div', { class: 'history-row' },
          el('span', { class: 'history-n' }, `#${cp.n}`),
          el('span', { class: 'history-label' }, cp.label || '(no label)', el('em', {}, ` ${cp.by ? `${cp.by} · ` : ''}${when(cp.at)}`)),
          el('button', { class: 'wb-btn', onclick: () => {
            if (confirm(`Put ${this.actant.name} back to checkpoint #${cp.n}? How it is now is kept as a checkpoint too, and the chat stays.`)) { history.classList.remove('on'); this.restore(cp.n); }
          } }, 'restore'))),
      );
    };
    root.append(
      el('button', { class: 'top-btn', onclick: async () => {
        const label = prompt('Label for this checkpoint (optional):', '');
        if (label !== null) await this.takeCheckpoint(label);
      } }, 'checkpoint'),
      el('button', { class: 'top-btn', onclick: toggleHistory }, 'history'),
      el('button', { class: 'top-btn primary', onclick: async () => {
        const given = this.actant.soma.given;
        const title = prompt(`Publish under the name ${given}-<title>. Each name belongs to one snapshot, so a new publication needs a new title. Title:`, this.actant.soma.sections.title ?? '');
        if (!title?.trim()) return;
        const note = prompt('A note for whoever takes a copy (optional):', '') ?? '';
        try {
          const { url, name } = await this.publish(note, title);
          prompt(`Published as ${name}. Anyone can take a copy here:`, url);
        } catch (err) { alert(err.message); }
      } }, 'publish'),
      this.playBtn = el('button', { class: `top-btn${this.playing ? ' on' : ''}`, title: 'show only the stage', onclick: () => this.setPlaying(!this.playing) }, this.playing ? 'show all' : 'play'),
      el('button', { class: 'top-btn', title: 'fold the inspector away', onclick: () => {
        const f = main.classList.toggle('folded');
        try { localStorage.setItem('gactant-fold', f ? '1' : '0'); } catch {}
      } }, 'inside'),
      history,
    );
  }

  /** Who the ludant is to the person who just sat down, in a sentence. */
  arrivalNote(arrival) {
    const who = this.seat, l = this.record.lineage ?? {};
    if (this.record.fresh && l.from) {
      const took = l.takenBy && l.takenBy !== who ? `${l.takenBy} took this copy; ${who} is here with you.` : `${who} took this copy and is here with you.`;
      return `You are a new copy of ${l.from.name}, published by ${l.from.by ?? 'someone'}. ${took}`;
    }
    if (this.record.fresh) return `You have just been seeded by ${who}. They are here with you.`;
    if (arrival.firstVisit) return `${who} has sat down with you for the first time.`;
    return `${who} is back (visit ${arrival.visits}).`;
  }

  async start() {
    // The sandbox gets the ludant and what it needs to read at frame rate. The frame's
    // surfaces it reaches through their actions, which it's told the names of.
    const actions = Object.fromEntries(this.surfaces.filter((s) => s.id !== 'stage' && s.id !== 'inspector').map((s) => [s.id, Object.keys(s.actions(''))]));
    await this.sandbox.call('init', {
      soma: this.actant.soma, stage: this.stage.toJSON(), chat: this.chat.messages, store: this.store.data, people: [...this.people], actions,
    });
    this.stage.live = true;
    this.status.render();
    const arrival = await api('POST', `ludants/${this.recordId}/arrive`, { who: this.seat });
    this.record.visitors = Object.fromEntries(arrival.people.map((p) => [p, true]));
    this.bus.emit('frame.arrived', { who: this.seat, firstVisit: arrival.firstVisit, visits: arrival.visits, fresh: Boolean(this.record.fresh), note: this.arrivalNote(arrival) });
    if (this.record.fresh) this.changed();
  }
}

async function boot() {
  const id = new URLSearchParams(location.search).get('l');
  if (!id) { location.href = '/'; return; }
  const seat = myName() || prompt('What should the ludants here call you?', '')?.trim() || 'someone';
  try { localStorage.setItem('gactant-name', seat); } catch {}
  const record = await api('GET', `ludants/${id}`);
  const frame = new Frame(record, seat);
  frame.noticeName();
  frame.mount();
  await frame.hold();
  await frame.start();
  installExplorer(frame);
  const brief = new URLSearchParams(location.search).get('shard');
  if (brief) window.explorer.shard(brief).then((r) => console.log('[shard]', r));
}

boot().catch((err) => {
  document.body.append(el('pre', { class: 'boot-fault' }, `couldn't open the frame: ${err.message}`));
});
