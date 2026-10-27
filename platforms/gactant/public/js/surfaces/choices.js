// Choices: a question for the people here, with a few options to pick from, each with a
// picture or just words. Picking is easier than typing, above all from a couch with a
// controller. The options show over the stage; a pick arrives in the chat as the
// person's own words (so any ludant hears it), and as an event.
//
// actions (as an actor)
//   offer({ question, options: [{ label, image?, note? }] }) -> { offered }   2 to 6 options;
//       image: an art name, or 'stage' (the stage as it is when offered). A new offer
//       replaces the open one.
//   withdraw() -> {}
// events
//   choices.offered { who, question, count }
//   choices.picked { who, question, choice, index }   (choice is the option's label; index -1 for "none of these")

import { el } from '../ui.js';

export class Choices {
  id = 'choices';

  constructor(frame) {
    this.frame = frame;
    this.open = null;   // { question, options, by, at, stage? }
  }

  describe() {
    return `choices: put a question to the people here with 2 to 6 options to pick from, each with a picture (an art name, or 'stage') or just words. They pick with a click, a tap or a controller, and their pick reaches you in the chat as their words. It's the easiest way for them to answer, above all from a couch, and the way to show options rather than describe them (say, three concept pictures of how you could look). Actions: offer({ question, options: [{ label, image, note }] }), withdraw().`;
  }

  state() { return this.open ? `choices: open now, "${this.open.question}" (${this.open.options.map((o) => o.label).join(' / ')}).` : null; }

  actions(who) {
    return { offer: (o) => this.offer(who, o), withdraw: () => this.withdraw(who) };
  }

  offer(who, { question, options } = {}) {
    question = String(question ?? '').trim();
    if (!question) throw new Error('an offer needs a question');
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) throw new Error('an offer has 2 to 6 options');
    const clean = options.map((o, i) => {
      const label = String(o?.label ?? '').trim();
      if (!label) throw new Error(`option ${i + 1} needs a label`);
      const image = o.image == null ? null : String(o.image);
      if (image && image !== 'stage' && !this.frame.art.assets.has(image)) throw new Error(`option ${i + 1}: no art named ${image}`);
      return { label: label.slice(0, 80), note: String(o.note ?? '').slice(0, 200), image };
    });
    // 'stage' means the stage as it is now, so keep that picture with the offer.
    const stage = clean.some((o) => o.image === 'stage') ? this.frame.stage.look().image : null;
    this.open = { question: question.slice(0, 200), options: clean, by: who, at: Date.now(), stage };
    this.render();
    this.frame.bus.emit('choices.offered', { who, question, count: clean.length });
    this.frame.changed();
    return { offered: clean.length };
  }

  withdraw() {
    this.open = null;
    this.render();
    this.frame.changed();
    return {};
  }

  pick(index) {
    const open = this.open;
    if (!open) return;
    const who = this.frame.seat;
    const choice = index >= 0 ? open.options[index].label : 'none of these';
    this.open = null;
    this.render(`${who} picked: ${choice}`);
    this.frame.chat.post(who, index >= 0 ? `${choice} (for "${open.question}")` : `None of these (for "${open.question}")`);
    this.frame.bus.emit('choices.picked', { who, question: open.question, choice, index });
    this.frame.changed();
  }

  picture(image) {
    if (!image) return null;
    if (image === 'stage') return this.open?.stage;
    return this.frame.art.assets.get(image)?.image ?? null;
  }

  mount(root) {
    this.root = root;
    this.render();
  }

  render(said = null) {
    this.panel?.remove();
    this.panel = null;
    if (!this.root) return;
    if (said) {
      this.panel = el('div', { class: 'choices-said' }, said);
      this.root.append(this.panel);
      const p = this.panel;
      setTimeout(() => { if (this.panel === p) { p.remove(); this.panel = null; } }, 2200);
      return;
    }
    if (!this.open) return;
    const o = this.open;
    this.panel = el('div', { class: 'choices-panel' },
      el('div', { class: 'choices-head' }, el('span', { class: 'choices-who' }, o.by), el('strong', {}, o.question)),
      el('div', { class: `choices-grid n${o.options.length}` }, ...o.options.map((opt, i) => {
        const pic = this.picture(opt.image);
        return el('button', { class: `choice${pic ? ' pictured' : ''}`, onclick: () => this.pick(i) },
          pic ? el('img', { src: pic, alt: opt.label }) : null,
          el('span', { class: 'choice-label' }, opt.label),
          opt.note ? el('span', { class: 'choice-note' }, opt.note) : null);
      })),
      el('div', { class: 'choices-foot' }, el('button', { class: 'wb-btn', onclick: () => this.pick(-1) }, 'none of these')));
    this.root.append(this.panel);
  }

  toJSON() { return { open: this.open ? { ...this.open, stage: null } : null }; }
  load(json) { this.open = json?.open ?? null; }
}
