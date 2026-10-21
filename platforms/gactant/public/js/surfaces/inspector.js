// Inspector: a look inside the actant. Its soma sections (which a shaper may edit by
// hand: that's shaping too) and a running account of what it has been doing, which is
// kept with the ludant.
// It has no actions for actants; it's for the humans in the frame.

import { el } from '../ui.js';

const KEEP = 300;
const NOTE_CHARS = 2000;
const STORE_TAB = '▤ store';   // not a section: the store surface, shown read-only
const ART_TAB = '▧ art';       // its art, as a gallery

export class Inspector {
  id = 'inspector';

  constructor(frame) {
    this.frame = frame;
    this.tab = 'doings';
    this.doings = [];   // { kind, text, at }
    this.fresh = new Set();
  }

  describe() { return null; }   // not something the actant perceives
  actions() { return {}; }

  note(kind, text) {
    this.doings.push({ kind, text: String(text).slice(0, NOTE_CHARS), at: Date.now() });
    if (this.doings.length > KEEP) this.doings.splice(0, this.doings.length - KEEP);
    if (this.tab === 'doings') this.renderBody();
    this.frame.changed();
  }

  // What it did lasts with the ludant, like the chat: so the inside reads the same after a
  // reload, and anyone with the link (someone helping) can see what happened.
  toJSON() { return { doings: this.doings }; }
  load(json) { this.doings = json?.doings ?? []; }

  sectionChanged(name) {
    this.fresh.add(name);
    this.renderTabs();
    if (this.tab === name) this.renderBody();
  }

  artChanged() { if (this.tab === ART_TAB) this.renderBody(); else { this.fresh.add(ART_TAB); this.renderTabs(); } }

  storeChanged() { if (this.tab === STORE_TAB) this.renderBody(); else { this.fresh.add(STORE_TAB); this.renderTabs(); } }

  mount(root) {
    this.frame.bus.on('store.changed', () => { clearTimeout(this.storeTimer); this.storeTimer = setTimeout(() => this.storeChanged(), 300); }, 'inspector');
    this.tabsEl = el('div', { class: 'insp-tabs' });
    this.bodyEl = el('div', { class: 'insp-body' });
    root.append(this.tabsEl, this.bodyEl);
    this.renderTabs();
    this.renderBody();
  }

  renderTabs() {
    if (!this.tabsEl) return;
    const names = ['doings', ...Object.keys(this.frame.actant?.soma.sections ?? {}), STORE_TAB, ART_TAB];
    this.tabsEl.replaceChildren(...names.map((n) => el('button', {
      class: `insp-tab ${n === this.tab ? 'on' : ''} ${this.fresh.has(n) ? 'fresh' : ''}`,
      onclick: () => { this.tab = n; this.fresh.delete(n); this.renderTabs(); this.renderBody(); },
    }, n)));
  }

  renderBody() {
    if (!this.bodyEl) return;
    if (this.tab === 'doings') {
      const list = el('div', { class: 'doings' }, ...this.doings.slice(-120).map((d) =>
        el('div', { class: `doing ${d.kind}` }, el('span', { class: 'doing-kind' }, d.kind), el('pre', {}, d.text))));
      this.bodyEl.replaceChildren(list);
      list.scrollTop = list.scrollHeight;
      return;
    }
    if (this.tab === ART_TAB) {
      this.bodyEl.replaceChildren(this.frame.art.gallery());
      return;
    }
    if (this.tab === STORE_TAB) {
      const data = this.frame.store.data;
      this.bodyEl.replaceChildren(
        el('pre', { class: 'insp-store' }, Object.keys(data).length ? JSON.stringify(data, null, 2) : '(the store is empty)'),
        el('div', { class: 'insp-bar' }, el('span', {}, `${Object.keys(data).length} keys · ${this.frame.store.size()} chars · kept with this copy`)));
      return;
    }
    const actant = this.frame.actant;
    const content = actant?.soma.sections[this.tab] ?? '';
    const area = el('textarea', { class: 'insp-edit', spellcheck: 'false' });
    area.value = content;
    const save = el('button', { class: 'wb-btn primary', onclick: () => actant.writeSection(this.tab, area.value, this.frame.seat) }, 'save');
    const err = actant?.faults[this.tab];
    this.bodyEl.replaceChildren(...[
      err ? el('div', { class: 'insp-fault' }, err) : null,
      area,
      el('div', { class: 'insp-bar' }, el('span', {}, `${content.length} chars`), save),
    ].filter(Boolean));
  }
}
