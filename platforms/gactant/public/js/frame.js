// The frame: one browser window holding surfaces, one ludant, and the people sitting
// with it.
//
//   frame.html?l=<ludant id>
//
// There are no modes. Whoever sits down can play, ask for changes, checkpoint, restore,
// and publish. The frame tells the ludant who is here and how they're related to it, and
// the ludant's hooks decide what that means.

import { Actant } from './actant.js';
import { Bus } from './bus.js';
import { Chat } from './surfaces/chat.js';
import { Inspector } from './surfaces/inspector.js';
import { Stage } from './surfaces/stage.js';
import { Status } from './surfaces/status.js';
import { Whiteboard } from './surfaces/whiteboard.js';
import { api, el, myName } from './ui.js';
import { installExplorer } from './explorer.js';

const SAVE_MS = 800;
const HEARTBEAT_MS = 5000;

class Frame {
  constructor(record, seat) {
    this.recordId = record.id;
    this.record = record;
    this.seat = seat;                       // the person at this keyboard
    this.people = new Set([seat]);          // everyone sitting here: the seat, and any shard
    this.bus = new Bus();
    this.stage = new Stage(this);
    this.chat = new Chat(this);
    this.whiteboard = new Whiteboard(this);
    this.status = new Status(this);
    this.inspector = new Inspector(this);
    this.surfaces = [this.stage, this.chat, this.whiteboard, this.status, this.inspector];
    for (const s of this.surfaces) s.load?.(record.surfaces?.[s.id]);
    this.actant = new Actant(this, record.soma);
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
    this.actant.sleepForever();
    this.stage.halted = 'moved';
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
    if (this.actant.thinking || this.actant.pending.length) this.status.setLife(this.status.life, `waiting for ${this.actant.name} to finish before ${why}…`);
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
      this.actant.writeSection('title', title.trim(), by);
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
      if (retitled) { this.actant.writeSection('title', before, by); await this.save(); }
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
    this.actant.soma = record.soma;
    this.actant.rebuild();
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
    let folded = false;
    try { folded = localStorage.getItem('gactant-fold') === '1'; } catch {}
    const main = el('main', { class: `frame${folded ? ' folded' : ''}` },
      el('section', { class: 'pane stage-pane' }),
      el('section', { class: 'pane wb-pane' }),
      el('section', { class: 'pane chat-pane' }),
      el('section', { class: 'pane insp-pane' }));
    document.body.append(top, main);
    this.status.mount(top.querySelector('.status'));
    this.stage.mount(main.querySelector('.stage-pane'));
    this.whiteboard.mount(main.querySelector('.wb-pane'));
    this.chat.mount(main.querySelector('.chat-pane'));
    this.inspector.mount(main.querySelector('.insp-pane'));
    this.mountActions(top.querySelector('.top-actions'), main);
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
    this.actant.rebuild();
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
  const retitle = () => { document.title = `${frame.actant.name} · gactant`; frame.status.render(); frame.whiteboard.renderBaton(); };
  retitle();
  frame.bus.on('soma.changed', (e) => { if (e.section === 'title') retitle(); });
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
