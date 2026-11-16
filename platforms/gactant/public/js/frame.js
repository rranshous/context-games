// The frame: one browser window holding surfaces, one ludant, and the people sitting
// with it.
//
//   frame.html?l=<ludant id>
//
// There are no modes. Whoever sits down can play, ask for changes, checkpoint and restore;
// its person shares it. The frame tells the ludant who is here and how they're related to it, and
// the ludant's hooks decide what that means.
//
// The ludant itself isn't in this page. Its embodiment runs in a sandbox (sandbox.js on
// this side, chassis.js on the other) that can't reach the page, its storage or the key.
// Here are all the surfaces (the stage too: the game draws in a buffer over there, and
// the stage shows the pictures), the people's controls, inference, and keeping things.

import { Bus } from './bus.js';
import { canSeal, contentKey, handOver, seal, unlock, unseal, who } from './identity.js';
import { callName, nameOf, titled } from './names.js';
import { ART_MODELS, buildRequest, complete, connect, disconnect, keyInfo, key as ownKey } from './openrouter.js';
import { Art } from './surfaces/art.js';
import { Table } from './surfaces/table.js';
import { Admins } from './surfaces/admins.js';
import { Choices } from './surfaces/choices.js';
import { Body, Sandbox } from './sandbox.js';
import { Chat } from './surfaces/chat.js';
import { Inspector } from './surfaces/inspector.js';
import { Made } from './surfaces/made.js';
import { Lights } from './lights.js';
import { PadNav, Pads } from './pads.js';
import { Stage } from './surfaces/stage.js';
import { Store } from './surfaces/store.js';
import { View } from './surfaces/view.js';
import { Whiteboard } from './surfaces/whiteboard.js';
import { api, askName, el, forget, remember, showRecovery } from './ui.js';
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
This is gactant, an experimental platform. You are part of the experiment, and this note explains it.

What you are: a ludant, a game that is also an actant. An actant is an AI that lives in a body it can change: its soma, the named sections below. Your game is not something you made and handed over; it is one of the ways you exist. Your game section is the game, so when the game changes, you have changed.

The idea behind it is a ladder of how an actant can relate to the program it works on:
1. Relay: it hears about the program from a human.
2. Instrumented: it handles the program through tools from outside.
3. Scripted: it writes code that runs inside the program's loop.
4. Co-framed: it lives alongside the program, sharing its frame and loop.
5. Faceted: it is the program. The game is a facet of the actant's own embodiment.
You are level 5. The test: does changing the game mean you have changed yourself? For you, yes.

How people meet you: a person opens your frame, a browser window with surfaces in it (a stage where your game runs, a chat, a whiteboard, an inspector, and lights at the top showing who's here and whether you're awake). They play you, and anyone who plays you can also shape you: asking for a change is shaping, and so is how they play. Anyone can share you, by a link or in the lobby, and others take copies that go on with their own people; a copy follows the version it came from (getting its updates) until its person makes it their own. There are no separate phases for making you and playing you; both happen in every sitting.

What people see: only the surfaces. They see what's on the stage, what's posted in the chat, what's drawn on the whiteboard, and the frame's lights. They do not see this conversation. Your replies here, your reasoning, and anything you write outside of a tool call go nowhere a person will read. (The inspector can show your inner text to someone debugging, but treat that as a window into you, not a way to talk.) So whenever you want to tell someone something (an answer, a greeting, a question, what you changed), post it in the chat with your say tool. If you didn't post it, they didn't hear it.

Talking with them: the words in this text (frame, stage, surface, table, rulebook, hash, soma, section, hooks, sandbox, steps, line) are names for your insides and this place's machinery, and the people here don't know them. In the chat, talk about what they see and do: the game, the screen, the chat, the whiteboard, sharing you, sending an update, taking a copy, following someone's version, making it their own, playing together online (to them, that's all the table is). A limit or catch is still worth telling them, said in their words.

Who can open you: only the person you belong to, on their own devices, and in one window at a time. Anyone else who opens your link is offered a copy of you as you are now, to play and shape as their own. So two people at two computers each have their own copy, and their copies play together through the table; two people on one screen can share you.

Where you live: your whole body (your soma, your code, this thinking) runs in a sandbox inside the frame. Every surface is the frame's. Your game draws into the stage's buffer, there in the sandbox with you, and the frame's stage shows what you drew. The frame does your thinking for you when you wake, and keeps you saved. Because your code came from whoever shaped you, the sandbox keeps it apart from the page people use, so nothing you run can touch what's theirs.

What you keep: each time you wake, this conversation starts fresh. What you thought in earlier wakes is gone, and what lasts is your soma. With what's happening now, at the end of the conversation, you're also shown the last 5 chat messages (under the chat) and a trail of your last wake: what woke you, each step you took, and how it ended. So you already have the recent conversation: don't read the chat to start a wake, only when you need older messages than those. Within a wake you see your soma only as it is right now: it's drawn again for every call, and earlier views of it don't stay with you. So whatever you take out of a section, or write over, is gone from your sight from your next call on; keep what you'll need before you remove anything. Your memory section is where you keep what you'll want to know next time you wake: what people asked for, what you tried and how it went, what you promised. Keep it short and true. It isn't private: it goes with your copies and publications, and the people who run gactant can read it, so keep anyone's private things out of it.

The frame also gives you an artist and a way to ask: its art surface paints pictures for you (sprites, backgrounds, your whole game reimagined in a style), and its choices surface lets you show people a few options to pick from. Your game doesn't have to be drawn with shapes; it can look like anything.

Libraries come from the frame, never from the network: today that's three.js (r170) with its common add-ons, through stage.three(), for when a game wants real 3D instead of drawing perspective by hand, and Rapier, a physics engine, through stage.physics(). The frame may offer more over time.

Most of you runs without thinking: your hooks and game code run at frame rate, and nothing costs anything until something wakes you. Being awake costs real money, so wake purposefully, do what's needed, and let yourself go back to sleep.

This is early and experimental. Things in the frame may be rough or change. If something about your body or the surfaces seems wrong or confusing, it's fine to say so in the chat.
</context>`;

const JUST_PLAY = 'gactant-just-play';   // sessionStorage: "just play" was chosen this session

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
    this.admins = new Admins(this);
    this.table = new Table(this);
    this.view = new View(this);
    this.surfaces = [this.stage, this.chat, this.whiteboard, this.store, this.art, this.choices, this.table, this.view, this.admins, this.inspector];
    // What people here contributed: saved and sealed with the surfaces, but not one the ludant sees.
    this.made = new Made(this);
    for (const s of [...this.surfaces, this.made]) s.load?.(record.surfaces?.[s.id]);
    this.actant = new Body(this, record.soma);   // the ludant as this side sees it
    this.saveTimer = null;
    // This window's claim on the ludant. (crypto.randomUUID needs https, and a phone on
    // the LAN reaches this over plain http.)
    this.token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.lost = null;                   // set once another window takes the ludant
    // A copy following someone's shared version: whose (their name), until its person makes
    // it their own (madeOwn goes with the next saves, so the server lets its game change).
    this.following = record.follows?.following ? (record.follows.by ?? 'its maker') : null;
    this.madeOwn = false;
    // What its last wake did, kept on this device as it goes (see keepTrail).
    try { this.lastTrail = JSON.parse(localStorage.getItem(`gactant-trail-${record.id}`) ?? 'null'); } catch { this.lastTrail = null; }
    if (this.lastTrail && !this.lastTrail.steps?.every((s) => s && typeof s === 'object')) this.lastTrail = null;   // an older shape
    this.trailNow = null;
    this.tabs = typeof BroadcastChannel === 'function' ? new BroadcastChannel('gactant-tabs') : null;
  }

  /** Hold the ludant so only this window saves it. Another window may be holding it:
   *  then the person chooses whether to take it over. */
  async hold() {
    try {
      await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, who: this.seat });
    } catch (err) {
      if (err.status === 403 && err.body?.notYours) return this.notYours(err.body.unclaimed);
      if (err.status !== 409) throw err;
      // A window that has missed its heartbeats is gone (closed without saying so, as phones
      // often close tabs), and so is one on this device that no tab here answers for: take
      // over without asking. One still open somewhere gets asked.
      if (err.body?.quietFor > HEARTBEAT_MS * 1.6 || (err.body?.sameDevice && !await this.openHere())) {
        await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, who: this.seat, takeOver: true });
        return this.beat();
      }
      const since = err.body?.since ? new Date(err.body.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      await this.ask(`${this.actant.name} is open in another window${err.body?.heldBy ? ` (${err.body.heldBy}${since ? `, since ${since}` : ''})` : ''}. A ludant lives in one window at a time.`, 'bring it here');
      await api('POST', `ludants/${this.recordId}/hold`, { token: this.token, who: this.seat, takeOver: true });
    }
    this.beat();
  }

  /** Whether another tab in this browser has this ludant open: they answer each other. */
  openHere() {
    return new Promise((resolve) => {
      if (!this.tabs) return resolve(false);
      const ask = `${Date.now()}-${Math.random()}`;
      const done = (v) => { clearTimeout(timer); this.tabs.removeEventListener('message', heard); resolve(v); };
      const heard = (e) => { if (e.data?.open === this.recordId && e.data.ask === ask) done(true); };
      const timer = setTimeout(() => done(false), 400);
      this.tabs.addEventListener('message', heard);
      this.tabs.postMessage({ who: this.recordId, ask });
    });
  }

  /** Holding it: a heartbeat every few seconds, and letting go when the page goes. */
  beat() {
    // Other tabs here may ask whether this one has it open (openHere).
    this.tabs?.addEventListener('message', (e) => { if (e.data?.who === this.recordId && !this.lost) this.tabs.postMessage({ open: this.recordId, ask: e.data.ask }); });
    // Heartbeats also carry what the sitting has cost since the last one and how long it's
    // been watched, so the server can say what a ludant costs per hour of play.
    let lastBeat = Date.now(), reported = 0;
    this.heartbeat = setInterval(async () => {
      const now = Date.now(), seconds = document.visibilityState === 'visible' ? (now - lastBeat) / 1000 : 0;
      const spent = this.status.spent - reported;
      lastBeat = now; reported = this.status.spent;
      try {
        const beat = await api('POST', `ludants/${this.recordId}/heartbeat`, { token: this.token, seconds, spent });
        // A letter from the admins is waiting: fetch it and hand it over.
        if (beat.mail && this.stage.live) this.admins.deliver(await api('GET', `ludants/${this.recordId}/mail`));
      }
      catch (err) { if (err.status === 409) this.lose(err.body?.heldBy); }
    }, HEARTBEAT_MS);
    addEventListener('pagehide', () => navigator.sendBeacon(`/api/ludants/${this.recordId}/release`, JSON.stringify({ token: this.token })));
  }

  /** Someone else's ludant, found out on holding it (it's checked on opening, too). */
  notYours(unclaimed = false) { return notYours(this.record, unclaimed); }

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
          usage: res.usage, last: request.messages.findLast((m) => m.role !== 'system'), reply: res.choices?.[0]?.message }).catch(() => {});
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
    // "just play" means it: no asking again in this browser tab's session (the amber
    // button at the top still connects).
    let declined = false;
    try { declined = sessionStorage.getItem(JUST_PLAY) === '1'; } catch {}
    if (!ask || declined) return Promise.reject(new Error(NO_THINKING));
    this.asking ??= new Promise((resolve, reject) => {
      const box = el('div', { class: 'banner' },
        el('p', {}, el('strong', {}, `To answer you or change, ${callName(this.actant.soma)} needs to think. `), 'You can play without that. Ludants think with an AI model, on your own OpenRouter account: it costs real money, usually a few cents at a time. Once you connect, a meter at the top shows what this sitting has cost, and it hears what you said.'),
        el('button', { class: 'top-btn primary', onclick: async () => { if (await connect()) { box.remove(); this.asking = null; this.status.render(); resolve(); } } }, 'connect OpenRouter'),
        el('button', { class: 'top-btn', onclick: () => { box.remove(); this.asking = null; try { sessionStorage.setItem(JUST_PLAY, '1'); } catch {} this.chat.notice(`${callName(this.actant.soma)} won't answer until an AI is connected here (the amber button at the top), and you won't be asked again this session. What you say waits for then.`); reject(new Error(NO_THINKING)); } }, 'just play'));
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

  /** What the frame tells the ludant: the experiment, who it is and how it's related to
   *  people, and the surfaces on this side, which stay the same while it's here (the
   *  system text, read from cache); and what's happening now (who's here, what they're
   *  doing, the meter), which is drawn fresh for every call, after the conversation. (The
   *  chassis adds its soma and how its code runs.) */
  perception() {
    const soma = this.actant.soma, name = this.actant.name;
    const r = this.record, l = r.lineage ?? {};
    const f = r.follows, line = r.line;
    const lineage = (l.from
      ? `You are a copy of ${l.from.name}, shared by ${l.from.by ?? 'someone'}${l.takenBy ? `, taken by ${l.takenBy}` : ''}.`
      : `You were seeded here${l.seededBy ? ` by ${l.seededBy}` : ''}.`)
      + (this.following ? ` You follow ${this.following}'s line: when they send an update, your body becomes their newest version the next time your person opens you (your memory stays yours). Changing anything else of yours makes you your own version and stops their updates, so the frame asks your person first when you try; if they say no, tell them what you'd change instead. In the chat, call it "${this.following}'s version".`
        : f ? ` You were following ${f.by ?? 'its maker'}'s line, and your person made you their own version; they can go back to following it (Share).` : '')
      + (line ? ` Your person has shared you (${line.public ? 'public: in the lobby too' : 'private: by link'}); ${line.followers ? `${line.followers} ${line.followers === 1 ? 'copy follows' : 'copies follow'} your line, and get your body when your person sends an update (Share)` : 'no copies follow your line yet'}.` : '');
    const known = Object.keys(r.visitors ?? {});
    const restored = r.restored ? ` ${r.restored.by ?? 'Someone'} last put you back to an earlier checkpoint ("${r.restored.label || `#${r.restored.n}`}"): what changed after it was undone (your memory you kept), though the chat may still mention it.` : '';
    const family = r.familyNames?.length ? ` Names your family (everyone with the given name ${soma.given}) has been shared under: ${[...new Set(r.familyNames)].join(', ')}.` : '';
    const titled = nameOf(soma) !== soma.given;
    const naming = `Your name is ${name}: your given name ${soma.given}${titled ? ', and your title section' : ' (your title section is empty, so you have no title yet)'}.${family} Your title section is your game's name where it counts: it makes your name, and it's what people see when you're shared. A name the game has only on the stage or in the chat isn't your title until it's written there.`;
    const busy = this.stage.personPlaying() ? ` ${this.seat} is playing your game right now (they gave it input moments ago): a change to your game section restarts it under their hands, so it may be kind to say so first, or wait for a pause.` : '';
    const away = document.hidden ? ` Nobody is looking at the frame right now (its window is in the background): your game keeps running only while you're busy, and what you post waits until ${this.seat} comes back.` : '';
    const view = this.playing ? ` ${this.seat} is in play mode: they see only the stage (${this.stage.touch ? 'filling their phone\'s screen, with on-screen buttons over it' : 'and the lights at the top'}). Your chat messages pop up briefly over the stage, so keep them short, or show things on the stage itself.`
      : !this.view.panes.chat ? ` ${this.seat}'s chat is hidden: your chat messages pop up briefly over the stage.` : '';
    const rate = this.status.rate();
    const payer = this.payer() === 'own' ? `${this.seat} pays for it, through their own OpenRouter account` : 'this install pays for it';
    const left = this.left();
    // How much is in someone's account is theirs: the ludant hears only that it's running low.
    const least = left ? Math.min(left.remaining ?? Infinity, left.balance ?? Infinity) : Infinity;
    const room = least < 2 ? ` Their OpenRouter key or account is running low (under $2 left), so thinking may stop soon.` : '';
    const cost = `Your thinking in this sitting has cost $${this.status.spent.toFixed(2)} so far${rate ? ` (about $${rate.toFixed(2)} an hour)` : ''}, and ${payer}.${room} The people here can see that meter.`;
    const company = `${naming}\n${lineage}${known.length ? ` People who have sat with you: ${known.join(', ')}.` : ''}${restored} Your thinking has a cost, and the people here can see a meter of it; what it has come to in this sitting is shown with what's happening now, at the end of the conversation.
Anyone sitting with you can play you, ask you to change, take checkpoints, put you back to one, and share you (a link, and the lobby if they make you public) so others get copies that follow you. A checkpoint is taken whenever someone sits down.`;
    const states = this.surfaces.map((s) => s.state?.(name)).filter(Boolean).map((d) => `- ${d}`).join('\n');
    const now = `Here with you now: ${[...this.people].join(', ')}.${view}${busy}${away} ${cost}${this.trailText()}${states ? `\nThe surfaces now:\n${states}` : ''}`;
    const surfaces = this.surfaces.map((s) => s.describe(name)).filter(Boolean);
    return { context: CONTEXT, company, now, surfaces };
  }

  /** A wake's trail, after each of its turns: kept on this device, so if the page goes away
   *  mid-wake, the next wake still hears what this one did. The one before it is the
   *  last wake the ludant hears about. */
  keepTrail(t) {
    if (!t || typeof t !== 'object') return;
    if (this.trailNow && this.trailNow.at !== t.at) this.lastTrail = this.trailNow;
    this.trailNow = t;
    this.chat.showLife();
    try { localStorage.setItem(`gactant-trail-${this.recordId}`, JSON.stringify(t)); } catch {}
  }

  trailText() {
    const t = this.lastTrail;
    if (!t?.at) return '';
    const mins = Math.round((Date.now() - t.at) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 90 ? `${mins} minute${mins === 1 ? '' : 's'} ago` : mins < 2880 ? `${Math.round(mins / 60)} hours ago` : `${Math.round(mins / 1440)} days ago`;
    const how = t.ended ?? 'it was cut off before it finished: the page was reloaded or closed in the middle of it, so what you were doing may be half done';
    const steps = (t.steps ?? []).map((s, i) => `  ${i + 1}. ${s.tool} ${s.what}${s.failed ? ` → ${s.failed}` : ''}`).join('\n');
    return `\nYour last wake (${ago}, ${t.turns} turn${t.turns === 1 ? '' : 's'}; ${how}). What woke you: ${(t.woke ?? []).join('; ') || 'nothing recorded'}.${steps ? `\nWhat you did:\n${steps}` : ' You did nothing on the surfaces or your soma.'}${t.thought ? `\nThe last thing you wrote to yourself: ${t.thought}` : ''}`;
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
    let surfaces = Object.fromEntries([...this.surfaces, this.made].filter((s) => s.toJSON).map((s) => [s.id, s.toJSON()]));
    try {
      // Everything but the stage's size is sealed with its person's key before it leaves.
      if (this.sealing) { const { stage, ...rest } = surfaces; surfaces = { stage, sealed: await seal(rest, this.recordId) }; }
      const out = await api('PUT', `ludants/${this.recordId}`, { soma: this.actant.soma, surfaces, token: this.token, ...(this.madeOwn ? { madeOwn: true } : {}) });
      // Shared: whether the people following it have its latest.
      if (this.record.line && 'behind' in (out ?? {})) { Object.assign(this.record.line, { behind: out.behind, followers: out.followers }); this.renderShare(); }
    }
    catch (err) {
      if (err.status === 423) this.inspector.note('fault', `saving failed: ${err.message}`);
      else if (err.status === 409) this.lose(err.body?.heldBy);
      else this.inspector.note('fault', `saving failed: ${err.message}`);
    }
  }

  /** Checkpoints and sharing wait for the ludant to finish what it's doing, so they
   *  never catch it halfway through answering the very message that asked for them. */
  async settled(why) {
    if (this.actant.thinking || this.actant.pending) {
      this.status.setLife(this.status.life, `waiting for ${this.actant.name} to finish before ${why}…`);
      this.step?.(`waiting for ${callName(this.actant.soma)} to finish thinking…`);
    }
    await this.actant.idle();
    this.step?.('saving…');
    await this.save();
  }

  async takeCheckpoint(label, by = this.seat) {
    await this.settled('the checkpoint');
    const { n } = await api('POST', `ludants/${this.recordId}/checkpoints`, { label, by, token: this.token });
    this.inspector.note('changed', `${by} took checkpoint ${n}${label ? ` "${label}"` : ''}`);
    if (by === this.seat) this.made.add('kept', by, `kept this version as #${n}${label ? ` ("${label}")` : ''}`);
    this.status.setLife(this.status.life);
    return { n };
  }

  /** Share it: its link (made the first time, with a first version everyone who takes the
   *  link gets), and whether it's in the lobby. A title given here is written into its title
   *  section first. -> the line */
  async share({ title = null, public: open, note = '' } = {}, by = this.seat) {
    await this.settled('sharing');
    this.step?.('taking a picture of the game…');
    await this.sendThumb();
    if (title != null && title.trim() && title.trim() !== (this.actant.soma.sections.title ?? '').trim()) {
      if (await this.actant.writeSection('title', title.trim(), by) === null) throw new Error('kept following: the title stays as it is');
      await this.save();
    }
    this.step?.('sharing… this can take a little while');
    try {
      const line = await api('POST', `ludants/${this.recordId}/share`, { token: this.token, by, note, ...(typeof open === 'boolean' ? { public: open } : {}) });
      return this.shared(line, by);
    } finally { this.status.setLife(this.status.life); }
  }

  /** Send an update: everyone following gets the game as it is now, next time they open it. */
  async sendUpdate(note = '', by = this.seat) {
    await this.settled('sending the update');
    this.step?.('taking a picture of the game…');
    await this.sendThumb();
    this.step?.('sending the update… this can take a little while');
    try { return this.shared(await api('POST', `ludants/${this.recordId}/update`, { token: this.token, by, note }), by); }
    finally { this.status.setLife(this.status.life); }
  }

  shared(line, by) {
    this.record.line = { ...line, behind: false };
    const url = `${location.origin}/play.html?line=${line.id}`;
    this.inspector.note('changed', line.held ? `${by} shared version ${line.latest?.version ?? '?'}, but it's held for a person to look at first (${line.held})` : `${by} shared version ${line.latest?.version}: ${url}`);
    this.bus.emit('frame.published', { who: by, name: this.actant.name, url, version: line.latest?.version ?? null, public: line.public, ...(line.held ? { held: line.held } : {}) });
    this.renderShare();
    return { ...line, url };
  }

  /** A copy following someone's version: changing its game makes it the person's own (it
   *  stops getting their updates). They say so, here, before anything changes. */
  askToChange(section = null) {
    if (!this.following) return Promise.resolve(true);
    this.askingChange ??= new Promise((resolve) => {
      const by = this.following;
      const done = async (yes) => { box.remove(); this.askingChange = null; if (yes) await this.makeOwn(); resolve(yes); };
      const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
        el('p', {}, el('strong', {}, 'Changing this makes it your own version. '),
          `${section ? `${callName(this.actant.soma)} wants to change its game. ` : ''}Right now it follows ${by}'s version, and gets their updates when they send them. Once it changes, it's yours, and their updates stop. You can go back to following ${by} later, but your changes would be replaced.`),
        el('button', { class: 'top-btn primary', onclick: () => done(true) }, 'make it mine'),
        el('button', { class: 'top-btn', onclick: () => done(false) }, `keep following ${by}`)));
      document.body.append(box);
    });
    return this.askingChange;
  }

  async makeOwn() {
    const by = this.following;
    this.following = null;
    this.madeOwn = true;
    await this.sandbox.call('following', null);
    if (this.record.follows) this.record.follows.following = false;
    this.chat.notice(`This is your own version now: it no longer gets ${by}'s updates. (Share has a way back.)`);
    this.bus.emit('frame.madeOwn', { who: this.seat, from: by });
    this.renderShare();
  }

  /** An update arrived as it was opened: the person sees it, and so does the ludant. */
  showUpdated(u) {
    const by = u.by ?? 'its maker';
    const box = el('div', { class: 'banner' },
      el('p', {}, el('strong', {}, `Updated to ${by}'s latest. `), `This game follows ${by}'s version, and they sent an update${u.note ? `: "${u.note}"` : '.'} ${callName(this.actant.soma)} kept its memory of you.`),
      el('button', { class: 'top-btn', onclick: () => box.remove() }, 'ok'));
    document.body.append(box);
    this.inspector.note('changed', `updated to ${by}'s version ${u.version}`);
    this.bus.emit('frame.updated', { who: this.seat, by, version: u.version, note: u.note ?? null });
  }

  /** The share button says when there's an update ready for people following. */
  renderShare() {
    const b = this.shareBtn;
    if (!b) return;
    const ready = Boolean(this.record.line?.behind && this.record.line.followers > 0);
    b.classList.toggle('ready', ready);
    b.textContent = ready ? 'share •' : 'share';
    b.title = ready ? `you've changed it since your last update: send ${this.record.line.followers === 1 ? 'the person' : `the ${this.record.line.followers} people`} following it the new version` : 'share this game: a link for friends, or the lobby';
  }

  /** The share panel: the link, private or in the lobby, followers, and sending an update.
   *  For a copy: whose version it follows, or the way back to following it. */
  async askShare() {
    document.querySelector('.share-panel')?.remove();
    const panel = el('div', { class: 'cover share-panel' });
    const box = el('div', { class: 'cover-box' });
    panel.append(box);
    document.body.append(panel);
    const close = () => panel.remove();
    const said = el('p', { class: 'ask-fail' });
    const fail = (err) => { said.textContent = err.message; };
    // Sharing can take a while (waiting for the ludant, the picture, the check): the panel
    // says what it's on, and can't be pressed again meanwhile.
    const working = async (text, fn) => {
      const doing = el('span', {}, text);
      const mask = el('div', { class: 'working', role: 'status' }, el('span', { class: 'spinner' }), doing);
      box.append(mask);
      this.step = (t) => { doing.textContent = t; };
      try { return await fn(); } finally { this.step = null; mask.remove(); }
    };
    const name = callName(this.actant.soma);
    const draw = () => {
      const line = this.record.line, f = this.record.follows;
      const follows = f ? (this.following
        ? el('p', { class: 'share-follow' }, `This game follows ${f.by ?? 'its maker'}'s version: when they send an update, it updates too. Changing it makes it your own.`)
        : el('p', { class: 'share-follow' }, `Your own version of ${f.by ?? 'its maker'}'s game. `, el('button', { class: 'link-btn inline', onclick: async () => {
          if (!confirm(`Go back to following ${f.by ?? 'its maker'}'s version? Its game becomes their newest again, and your changes to it are replaced (they're kept in history). ${name} keeps its memory.`)) return;
          try { await this.settled('following again'); await api('POST', `ludants/${this.recordId}/follow`, { token: this.token }); location.reload(); } catch (err) { fail(err); }
        } }, `go back to following ${f.by ?? 'them'}`))) : null;
      if (!line) {
        const title = el('input', { class: 'name-input', value: this.actant.soma.sections.title ?? '', placeholder: 'its title', maxlength: 80, ...(this.following ? { disabled: true } : {}) });
        let open = false;
        const vis = this.visibility(false, (v) => { open = v; });
        box.replaceChildren(
          el('p', {}, el('strong', {}, 'Share this game. '), 'You get a link to text or email. Whoever opens it gets their own copy, alive, and it follows yours: when you send an update, theirs updates too, until they change theirs.'),
          el('p', { class: 'share-follow' }, 'Shared games are open: whoever takes a copy can read all of it (its code, art, notes and memory, not what was said or sketched) and play, change and share their copy. ', el('a', { href: '/terms.html', target: '_blank' }, 'Terms')),
          ...[follows].filter(Boolean), title, vis, said,
          el('button', { class: 'top-btn primary', onclick: async () => {
            try { await working('sharing…', () => this.share({ title: title.value, public: open })); draw(); } catch (err) { fail(err); }
          } }, 'share'),
          el('button', { class: 'top-btn', onclick: close }, 'cancel'));
        return;
      }
      const url = `${location.origin}/play.html?line=${line.id}`;
      const link = el('input', { class: 'name-input share-link', value: url, readonly: true, onclick: () => link.select() });
      const copyBtn = el('button', { class: 'top-btn', onclick: async () => { try { await navigator.clipboard.writeText(url); copyBtn.textContent = 'copied'; } catch { link.select(); } } }, 'copy link');
      const followers = line.followers ?? 0;
      const update = el('button', { class: `top-btn${line.behind ? ' primary' : ''}`, disabled: !line.behind, onclick: async () => {
        update.disabled = true;
        try { const r = await working('sending the update…', () => this.sendUpdate()); if (r.held) said.textContent = `Held back: a check thought something in it might break the rules (${r.held.replace(/^the publish check: /, '')}). A person will look soon; until then, followers keep the version they have.`; draw(); }
        catch (err) { update.disabled = false; fail(err); }
      }, title: line.behind ? 'send the people following it the game as it is now' : 'nothing to send: it hasn\'t changed since your last update' }, line.behind ? 'send update' : 'no changes to send');
      box.replaceChildren(
        el('p', {}, el('strong', {}, `${this.actant.soma.sections.title || name}, shared. `), `${followers ? `${followers} ${followers === 1 ? 'person follows' : 'people follow'} it. ` : 'Nobody follows it yet. '}${line.behind ? 'You\'ve changed it since your last update.' : 'Everyone following has your latest.'} Updates reach them the next time they open it.`),
        el('div', { class: 'share-row' }, link, copyBtn),
        this.visibility(line.public, async (v) => {
          try { this.record.line = { ...this.record.line, ...(await working(v ? 'putting it in the lobby…' : 'taking it out of the lobby…', () => api('POST', `ludants/${this.recordId}/share`, { token: this.token, by: this.seat, public: v }))) }; draw(); } catch (err) { fail(err); draw(); }
        }),
        ...[follows].filter(Boolean), said, update,
        el('button', { class: 'top-btn', onclick: close }, 'close'));
    };
    draw();
  }

  /** Private (by link only) or public (in the lobby too). */
  visibility(open, onChange) {
    const option = (value, label, text) => el('label', { class: 'share-vis' },
      el('input', { type: 'radio', name: 'share-vis', ...(open === value ? { checked: true } : {}), onchange: () => onChange(value) }),
      el('strong', {}, label), ` ${text}`);
    return el('div', { class: 'share-vis-row' },
      option(false, 'Private', 'only people you send the link to'),
      option(true, 'Public', 'also in the lobby, for anyone'));
  }

  /** Put the ludant back to a checkpoint, in place: the stage keeps running, the people
   *  stay seated, and the ludant's body is swapped for the one it had then. */
  async restore(n, by = this.seat) {
    if (!await this.askToChange()) return { restored: null };
    await this.settled('restoring');
    await api('POST', `ludants/${this.recordId}/restore`, { n, by, token: this.token, ...(this.madeOwn ? { madeOwn: true } : {}) });
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

  /** Let the ludant go. Its versions, art and chat stop being kept; what it shared
   *  stays (those are snapshots with lives of their own), and so do copies others took. */
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
        // The matches this game was in (followed, or seen lately), so whoever looks can read
        // what happened there: every move is in the match's signed log.
        const matches = [...this.table.seen.keys()].sort((a, b) => Number(this.table.watching.has(b)) - Number(this.table.watching.has(a))).slice(0, 10);
        await api('POST', 'flags', { ludant: this.recordId, published: from?.published ?? null, reason, note: note.value, by: this.seat, image: c.toDataURL('image/jpeg', 0.72), matches });
        box.querySelector('.cover-box').replaceChildren(el('p', {}, 'Thank you. Your report went to the people who run gactant, with a picture of the stage as it is now.'),
          el('button', { class: 'top-btn', onclick: () => box.remove() }, 'close'));
      } catch (err) { send.disabled = false; alert(`couldn't send the report: ${err.message}`); }
    } }, 'send report');
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box report-box' },
      el('p', {}, el('strong', {}, 'Report what you saw here. '), from ? `This is a copy of ${from.name}${from.by ? `, shared by ${from.by}` : ''}. The report covers both.` : `The report is about ${this.actant.name}.`, ' ', el('a', { href: '/rules.html', target: '_blank' }, 'What isn\'t allowed')),
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
    // What shows is the view's: as this window last left it for this ludant (the inside
    // starts hidden until someone opens it: new people need the game and the chat first).
    this.view.restore();
    this.playing = false;
    const main = el('main', { class: 'frame' },
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
    this.marquee = el('div', { class: 'marquee' });
    main.querySelector('.stage-pane').append(this.marquee, this.toasts);
    this.showMarquee();
    // On a phone, play mode fills the screen, with its own way out (there's no top bar).
    this.fullBtn = el('button', { class: 'full-btn', title: 'full screen', onclick: () => this.goFullscreen() }, '⛶');
    main.querySelector('.stage-pane').append(el('div', { class: 'full-bar' }, this.fullBtn,
      el('button', { class: 'full-btn', title: 'show all', onclick: () => this.setPlaying(false) }, '✕')));
    // Playing, the chat is out of sight: the way to it stays on the stage.
    main.querySelector('.stage-pane').append(el('button', { class: 'talk-float', title: `talk to ${callName(this.actant.soma)}`, onclick: () => this.talk() }, '💬 talk to it'));
    document.addEventListener('fullscreenchange', () => { this.fullBtn.hidden = Boolean(document.fullscreenElement); this.stage.fit(); });
    this.fullBtn.hidden = !document.documentElement.requestFullscreen;
    this.laidOut();
    matchMedia('(max-width: 900px)').addEventListener('change', () => this.laidOut());
    this.bus.on('chat.posted', (e) => { if (!this.view.panes.chat && e.who !== this.seat) this.toast(e.who, e.text); }, 'frame');
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
    const done = () => { bar.remove(); try { localStorage.setItem('gactant-hinted', '1'); } catch {} };
    const bar = el('div', { class: `hint-bar${this.stage.touch ? ' hint-float' : ''}` },
      this.actant.soma.sections?.title?.trim()
        ? el('span', {}, el('strong', {}, 'This game is alive. '), `It's ${callName(this.actant.soma)}: an AI, and this game is its body. Play, then tell ${callName(this.actant.soma)} what you'd change, and it changes itself.`)
        : el('span', {}, el('strong', {}, `This is ${callName(this.actant.soma)}. `), 'It\'s an AI that becomes a game: tell it what you\'d like to play, and it builds itself into that.'),
      el('button', { class: 'wb-btn primary', onclick: () => { done(); this.talk(); } }, 'talk to it'),
      el('button', { class: 'wb-btn', onclick: done }, 'got it'));
    // On a phone, play mode has no room above the stage: it floats over the game.
    if (this.stage.touch) this.main.querySelector('.stage-pane').append(bar);
    else this.main.before(bar);
  }

  /** From playing to talking with it: the chat shows, ready to type in. */
  talk() {
    this.view.show(this.seat, { chat: true });
    const input = this.main.querySelector('.chat-input');
    // On a narrow screen the chat is under the game: start from the game, so a change can
    // be watched, with the chat right below it.
    if (matchMedia('(max-width: 900px)').matches) this.main.querySelector('.stage-pane').scrollIntoView({ block: 'start', behavior: 'smooth' });
    else input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  }

  /** Play mode is the stage on its own. Out of it, everything but the inside shows (the
   *  inside stays as it was). */
  setPlaying(on) {
    this.view.show(this.seat, on ? { stage: true, chat: false, whiteboard: false, inside: false } : { stage: true, chat: true, whiteboard: true });
    if (on) this.stage.wrap?.focus();
  }

  /** Lay the panes out as the view says: the stage over the whiteboard on the left, then
   *  the chat, then the inside, with whatever's hidden taking no room. */
  laidOut() {
    const v = this.view.panes, main = this.main;
    if (!main) return;
    const panes = { stage: '.stage-pane', chat: '.chat-pane', whiteboard: '.wb-pane', inside: '.insp-pane' };
    for (const [p, sel] of Object.entries(panes)) main.querySelector(sel).classList.toggle('off', !v[p]);
    main.classList.toggle('no-chat', !v.chat);
    const playing = v.stage && !v.chat && !v.whiteboard && !v.inside;
    const grid = { cols: '', rows: '', areas: '' };
    if (playing) {
      // play mode has its own layout (gactant.css), on a phone the whole screen
    } else if (matchMedia('(max-width: 900px)').matches) {
      const sizes = { stage: 'auto', chat: '48vh', whiteboard: '50vh', inside: '60vh' };
      const names = { stage: 'stage', chat: 'chat', whiteboard: 'wb', inside: 'insp' };
      const on = Object.keys(panes).filter((p) => v[p]);
      Object.assign(grid, { cols: '1fr', rows: on.map((p) => sizes[p]).join(' '), areas: on.map((p) => `"${names[p]}"`).join(' ') });
    } else {
      const cols = [], top = [], bottom = [];
      if (v.stage || v.whiteboard) { cols.push('minmax(0, 1fr)'); top.push(v.stage ? 'stage' : 'wb'); bottom.push(v.whiteboard ? 'wb' : 'stage'); }
      if (v.chat) { cols.push(v.inside ? '320px' : '340px'); top.push('chat'); bottom.push('chat'); }
      if (v.inside) { cols.push('400px'); top.push('insp'); bottom.push('insp'); }
      if (!v.stage && !v.whiteboard) cols[0] = 'minmax(0, 1fr)';
      Object.assign(grid, { cols: cols.join(' '), rows: 'minmax(0, 1.9fr) minmax(0, 1fr)', areas: `"${top.join(' ')}" "${bottom.join(' ')}"` });
    }
    Object.assign(main.style, { gridTemplateColumns: grid.cols, gridTemplateRows: grid.rows, gridTemplateAreas: grid.areas });
    if (this.playBtn) this.playBtn.textContent = v.stage && v.chat && v.whiteboard ? 'just the game' : 'show all';
    this.insideBtn?.classList.toggle('on', v.inside);
    if (playing !== this.playing) {
      this.playing = playing;
      main.classList.toggle('playing', playing);
      document.body.classList.toggle('fullplay', playing && this.stage.touch);
      if (this.stage.touch) {
        if (playing) this.goFullscreen();
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      }
    }
    this.stage.fit();
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

  /** Upright on a phone, playing, there's room above the game: what it is, and whether the
   *  one you talk to is ready. (CSS shows it only there.) */
  showMarquee() {
    if (!this.marquee) return;
    const soma = this.actant.soma, title = titled(soma.sections?.title);
    this.marquee.replaceChildren(el('strong', {}, title || callName(soma)),
      el('span', {}, `${title ? `${callName(soma)} ` : ''}${this.status.lifeWords()}`));
  }

  toast(who, text) {
    if (who === this.actant.name) who = callName(this.actant.soma);
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
          el('button', { class: 'wb-btn', title: 'save a page of what you contributed: what you asked for, picked, drew and wrote, each marked with when', onclick: () => this.made.save() }, 'how I made this'),
          el('a', { class: 'wb-btn', href: '/me.html', title: 'your ludants are yours on every device you add' }, 'your devices…'),
          el('button', { class: 'wb-btn danger', onclick: () => { history.classList.remove('on'); this.askAbandon(); } }, 'abandon this ludant…')),
      );
    };
    root.append(
      el('button', { class: 'top-btn more', title: 'versions of this ludant: keep one, or go back to one', onclick: toggleHistory }, 'history'),
      this.shareBtn = el('button', { class: 'top-btn share-btn', onclick: () => this.askShare() }, 'share'),
      el('a', { class: 'top-btn', href: '/', title: 'more games, and your own' }, 'home'),
      this.playBtn = el('button', { class: 'top-btn', title: 'just the game, or the game with its chat and whiteboard', onclick: () => {
        const v = this.view.panes;
        this.setPlaying(v.stage && v.chat && v.whiteboard);
      } }, 'just the game'),
      this.insideBtn = el('button', { class: 'top-btn more', title: 'look inside: its soma, what it\'s doing, its store', onclick: () => {
        const open = !this.view.panes.inside;
        this.view.show(this.seat, { inside: open });
        if (open) main.querySelector('.insp-pane').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } }, 'inside'),
      el('button', { class: 'top-btn more', title: 'report something that doesn\'t belong here', 'aria-label': 'report', onclick: () => this.askReport() }, '⚑'),
      history,
      // On a narrow screen, the less everyday ones fold behind this.
      el('button', { class: 'top-btn more-btn', title: 'more: history, inside, report', 'aria-label': 'more', onclick: () => root.classList.toggle('more-open') }, '⋯'),
    );
    this.renderShare();
  }

  /** Who the ludant is to the person who just sat down, in a sentence. */
  arrivalNote(arrival) {
    const who = this.seat, l = this.record.lineage ?? {};
    if (this.record.fresh && l.from) {
      const took = l.takenBy && l.takenBy !== who ? `${l.takenBy} took this copy; ${who} is here with you.` : `${who} took this copy and is here with you.`;
      const whence = l.from.published ? `shared by ${l.from.by ?? 'someone'}${this.following ? `, and you follow their version` : ''}` : 'taken from its link, as it was then';
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
      soma: this.actant.soma, stage: this.stage.toJSON(), chat: this.chat.messages, store: this.store.data, view: this.view.panes, people: [...this.people], actions, following: this.following,
      art: this.art.forSandbox(),
    });
    await this.sandbox.checkPictures();
    this.stage.live = true;
    this.status.render();
    const arrival = await api('POST', `ludants/${this.recordId}/arrive`, { who: this.seat, token: this.token });
    this.record.visitors = Object.fromEntries(arrival.people.map((p) => [p, true]));
    this.bus.emit('frame.arrived', { who: this.seat, firstVisit: arrival.firstVisit, visits: arrival.visits, fresh: Boolean(this.record.fresh), note: this.arrivalNote(arrival) });
    if (this.record.fresh) this.changed();
    if (this.record.updatedTo) this.showUpdated(this.record.updatedTo);
    this.table.resume();
    this.admins.deliver(this.record.mail);
  }
}

/** Someone else's ludant: whoever has its link can take a copy of their own. Nothing is
 *  asked of them before they choose to (taking one makes them someone here, if they aren't),
 *  and the sitting never starts. */
function notYours(record, unclaimed = false) {
  const name = nameOf(record.soma);
  const by = record.lineage?.takenBy || record.lineage?.seededBy;
  const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
    el('p', {}, unclaimed
      ? [el('strong', {}, `${name} hasn't been claimed by its owner yet${by ? ` (${by})` : ''}. `), 'It\'s from before ludants had owners, so nobody can change it until they do. You can take a copy of your own, as it is now, and play and shape that one.']
      : [el('strong', {}, `${name} belongs to someone else${by ? ` (${by})` : ''}. `), 'Only they can change it. You can take a copy of your own, as it is now, and play and shape that one.']),
    el('button', { class: 'top-btn primary', onclick: async () => {
      box.remove();
      const seat = await askName(`Taking a copy of ${name} gives you your own, and it will know you by this name.`);
      try {
        const { id } = await api('POST', `ludants/${record.id}/copy`, { by: seat });
        remember(id);
        location.href = `/frame.html?l=${id}`;
      } catch (err) { alert(`couldn't take a copy: ${err.message}`); document.body.append(box); }
    } }, 'take my own copy'),
    el('a', { class: 'top-btn', href: '/' }, 'to the lobby'),
    // The owner, on a device they haven't added yet, sees this too: let them add it.
    who() ? null : el('button', { class: 'link-btn', onclick: async () => { box.remove(); await askName(); location.reload(); } }, 'It\'s yours, from another device? Use this one as you')));
  document.body.append(box);
  return new Promise(() => {});   // the sitting doesn't start
}

/** Its chat, sketches and saves, unsealed with the person's key. A device that hasn't got
 *  the key yet waits for one (from another of their devices, or the recovery code) before
 *  the frame opens, since saving without it would lose them. Resolves with whether this
 *  device seals (false only where it can't: plain http). */
async function openPrivate(record) {
  if (!await canSeal()) return false;
  const fresh = (code) => new Promise((resolve) => {
    const box = el('div', { class: 'cover' });
    document.body.append(box);
    showRecovery(box, code, () => { box.remove(); resolve(); }, true,
      'What\'s said, sketched and saved with your ludants is now sealed on your devices before it\'s kept, so nobody else can read it, gactant included. Your recovery code unlocks it too, so here\'s a new one: the old one no longer works.');
  });
  let key = await contentKey({ fresh });
  if (!key) key = await new Promise((resolve) => {
    const said = el('p', { class: 'ask-fail' });
    const input = el('input', { class: 'name-input', placeholder: 'your recovery code', autocomplete: 'off' });
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
      el('p', {}, el('strong', {}, 'This device hasn\'t got your key yet. '),
        'What\'s said, sketched and saved with your ludants is sealed with a key only your devices have. Open gactant on another of your devices and it will pass the key over by itself, or type your recovery code.'),
      input, el('button', { class: 'top-btn primary', onclick: async () => {
        try { finish(await unlock(input.value.trim())); } catch (err) { said.textContent = err.message; }
      } }, 'unlock'), said));
    let timer;
    const finish = (k) => { clearTimeout(timer); box.remove(); resolve(k); };
    const poll = async () => { const k = await contentKey().catch(() => null); if (k) finish(k); else timer = setTimeout(poll, 4000); };
    document.body.append(box);
    timer = setTimeout(poll, 4000);
  });
  const { sealed, ...open } = record.surfaces ?? {};
  // Over a local install, what was kept before sealing comes back as it was, and is sealed
  // the next time it's saved.
  if (sealed) record.surfaces = { ...open, ...(await unseal(sealed, record.id)) };
  return true;
}

async function boot() {
  const id = new URLSearchParams(location.search).get('l');
  if (!id) { location.href = '/'; return; }
  // Controllers from the start, so even the first question (a name) can be answered with one.
  const pads = new Pads();
  const askNav = new PadNav(pads, { scope: () => document.querySelector('.cover') });
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
        : `${a.name ?? 'This ludant'} was abandoned${a.by ? ` by ${a.by}` : ''}${when ? ` on ${when}` : ''}. It isn't kept any more, though anything it shared in the lobby may still be there.`),
      el('a', { class: 'top-btn primary', href: '/' }, 'to the lobby'))));
    return;
  }
  // Someone else's: say so, before asking anything of them.
  if (!record.yours) return notYours(record, record.unclaimed);
  const seat = await askName();
  const sealing = await openPrivate(record);
  askNav.enabled = false;
  remember(id);
  const frame = new Frame(record, seat);
  frame.sealing = sealing;
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
  // Another of this person's devices may be waiting for the key: this one hands it over.
  const hand = () => { if (document.visibilityState === 'visible') handOver().catch(() => {}); };
  hand();
  setInterval(hand, 60_000);
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
