// Chat: a rolling conversation. Knows nothing about actants; anyone in the frame can post.
//
// actions (as an actor)   post(text) -> message   read(n = 20) -> messages
// events                  chat.posted { who, text }

import { el } from '../ui.js';

const KEEP = 200;

export class Chat {
  id = 'chat';

  constructor(frame) {
    this.frame = frame;
    /** @type {{ who: string, text: string, at: number }[]} */
    this.messages = [];
    this.thinkingEl = null;
  }

  describe() {
    return `chat: a conversation shared by everyone in the frame (${this.messages.length} messages so far).`;
  }

  actions(who) {
    return {
      post: (text) => this.post(who, text),
      read: (n = 20) => this.messages.slice(-n),
    };
  }

  post(who, text) {
    text = String(text ?? '').trim();
    if (!text) throw new Error('chat.post needs text');
    const message = { who, text, at: Date.now() };
    this.messages.push(message);
    if (this.messages.length > KEEP) this.messages.splice(0, this.messages.length - KEEP);
    this.render(message);
    this.frame.bus.emit('chat.posted', { who, text });
    this.frame.changed();
    return message;
  }

  mount(root) {
    this.log = el('div', { class: 'chat-log' });
    const input = el('textarea', { class: 'chat-input', rows: 2, placeholder: `talk to ${this.frame.actant?.name ?? 'the ludant'}…` });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) this.post(this.frame.seat, input.value);
        input.value = '';
        // Typed with a controller (on a console's keyboard): let go once it's sent.
        if (input.dataset.padTyping) { delete input.dataset.padTyping; input.blur(); }
      }
    });
    // Who you're talking to, and whether it's awake: where people look when nothing seems
    // to be happening.
    this.head = el('div', { class: 'chat-head' });
    this.thinkingEl = el('div', { class: 'chat-msg theirs chat-thinking' });
    root.append(this.head, this.log, input);
    for (const m of this.messages) this.render(m);
    this.showLife();
  }

  /** The ludant's life light, beside its name, and a line in the log while it thinks. */
  showLife() {
    if (!this.head) return;
    const { life, detail } = this.frame.status;
    const name = this.frame.actant?.name ?? 'the ludant';
    const changing = life === 'thinking' ? this.frame.actant?.changing : null;
    const painting = [...(this.frame.art?.painting.values() ?? [])];
    const doing = painting.length ? `painting ${painting.map((n) => `“${n}”`).join(', ')}` : changing ? `changing ${changing}` : null;
    const words = doing ? `${doing}…` : { asleep: 'asleep', thinking: 'thinking…', resting: 'resting', error: 'stuck' }[life] ?? life;
    this.head.replaceChildren(...[el('span', { class: `light life ${life}` }, el('i'), name, el('em', {}, words)),
      detail ? el('span', { class: 'chat-head-detail', title: detail }, detail) : null].filter(Boolean));
    if (life === 'thinking' || painting.length) {
      this.thinkingEl.replaceChildren(el('span', { class: 'chat-who' }, name), el('div', { class: 'chat-text' }, el('span', { class: 'dots' }, doing ?? 'thinking')));
      this.log.append(this.thinkingEl);
      this.log.scrollTop = this.log.scrollHeight;
    } else this.thinkingEl.remove();
  }

  render(m) {
    if (!this.log) return;
    const mine = m.who === this.frame.seat;
    this.log.append(el('div', { class: `chat-msg ${mine ? 'mine' : 'theirs'}` },
      el('span', { class: 'chat-who' }, m.who), el('div', { class: 'chat-text' }, m.text)));
    if (this.thinkingEl?.isConnected) this.log.append(this.thinkingEl);   // keep it last
    this.log.scrollTop = this.log.scrollHeight;
  }

  toJSON() { return { messages: this.messages }; }
  load(json) { this.messages = json?.messages ?? []; }
}
