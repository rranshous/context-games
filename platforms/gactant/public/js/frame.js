// The frame: one browser window holding surfaces, one actant, and one human seat.
//
//   frame.html?a=<actant id>    shaping: the human is the shaper
//   frame.html?i=<install id>   hosting: the human is a player
//
// The two are the same frame with the same surfaces. Only the audience differs.

import { Actant } from './actant.js';
import { Bus } from './bus.js';
import { Chat } from './surfaces/chat.js';
import { Inspector } from './surfaces/inspector.js';
import { Stage } from './surfaces/stage.js';
import { Status } from './surfaces/status.js';
import { Whiteboard } from './surfaces/whiteboard.js';
import { api, el } from './ui.js';
import { installExplorer } from './explorer.js';

const SAVE_MS = 800;

class Frame {
  constructor(kind, record) {
    this.kind = kind;                       // 'actants' | 'installs'
    this.recordId = record.id;
    this.record = record;
    this.audience = kind === 'actants' ? 'shaper' : 'player';
    this.seat = this.audience;              // the human's name on the surfaces
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
  }

  isHuman(who) { return who === 'shaper' || who === 'player'; }

  /** The surfaces' actions, done as `who`. */
  surfacesFor(who) {
    return Object.fromEntries(this.surfaces.map((s) => [s.id, s.actions(who)]));
  }

  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_MS);
  }

  async save() {
    const surfaces = Object.fromEntries(this.surfaces.filter((s) => s.toJSON).map((s) => [s.id, s.toJSON()]));
    try { await api('PUT', `${this.kind}/${this.recordId}`, { soma: this.actant.soma, surfaces }); }
    catch (err) { this.inspector.note('fault', `saving failed: ${err.message}`); }
  }

  mount() {
    const top = el('header', { class: 'top' },
      el('a', { class: 'brand', href: '/' }, 'gactant'),
      el('div', { class: 'status' }),
      el('div', { class: 'top-actions' }));
    const main = el('main', { class: `frame ${this.audience}` },
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
    const peek = el('button', { class: 'top-btn', onclick: () => main.classList.toggle('peek') }, 'inside');
    if (this.audience === 'player') { root.append(peek); return; }
    const checkpoint = el('button', { class: 'top-btn', onclick: async () => {
      const label = prompt('Checkpoint label (optional):', '');
      if (label === null) return;
      await this.save();
      const { n } = await api('POST', `actants/${this.recordId}/checkpoints`, { label });
      this.inspector.note('changed', `checkpoint ${n}${label ? ` "${label}"` : ''} taken`);
    } }, 'checkpoint');
    const release = el('button', { class: 'top-btn', onclick: async () => {
      const cps = await api('GET', `actants/${this.recordId}/checkpoints`);
      if (!cps.length) { alert('Take a checkpoint first: a release ships a checkpoint.'); return; }
      const last = cps.at(-1);
      const n = prompt(`Release which checkpoint? (1–${last.n})`, String(last.n));
      if (!n) return;
      const title = prompt('Title for players:', this.actant.name);
      if (!title) return;
      const { id } = await api('POST', 'releases', { actant: this.recordId, n: Number(n), title });
      this.inspector.note('changed', `released checkpoint ${n} as "${title}": ${location.origin}/play.html?r=${id}`);
      prompt('Released. Players start here:', `${location.origin}/play.html?r=${id}`);
    } }, 'release');
    root.append(checkpoint, release);
  }

  start() {
    this.actant.rebuild();
    this.status.render();
    if (this.record.fresh) {
      const note = this.audience === 'shaper'
        ? 'You have just been seeded. Your shaper is here with you.'
        : 'You have been handed off and installed for a player. It is time to be the game. Your player is here.';
      this.bus.emit('frame.audience', { audience: this.audience, note });
      this.changed();
    }
  }
}

async function boot() {
  const q = new URLSearchParams(location.search);
  const [kind, id] = q.get('a') ? ['actants', q.get('a')] : q.get('i') ? ['installs', q.get('i')] : [];
  if (!kind) { location.href = '/'; return; }
  const record = await api('GET', `${kind}/${id}`);
  document.title = `${record.soma.name} · gactant`;
  const frame = new Frame(kind, record);
  frame.mount();
  frame.start();
  installExplorer(frame);
}

boot().catch((err) => {
  document.body.append(el('pre', { class: 'boot-fault' }, `couldn't open the frame: ${err.message}`));
});
