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
    const input = el('textarea', { class: 'chat-input', rows: 2, placeholder: 'say something…' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) this.post(this.frame.seat, input.value);
        input.value = '';
      }
    });
    root.append(this.log, input);
    for (const m of this.messages) this.render(m);
  }

  render(m) {
    if (!this.log) return;
    const mine = m.who === this.frame.seat;
    this.log.append(el('div', { class: `chat-msg ${mine ? 'mine' : 'theirs'}` },
      el('span', { class: 'chat-who' }, m.who), el('div', { class: 'chat-text' }, m.text)));
    this.log.scrollTop = this.log.scrollHeight;
  }

  toJSON() { return { messages: this.messages }; }
  load(json) { this.messages = json?.messages ?? []; }
}
