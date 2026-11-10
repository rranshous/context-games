// Chat: a rolling conversation. Knows nothing about actants; anyone in the frame can post.
//
// actions (as an actor)   post(text) -> message   read(n = 20) -> messages
// events                  chat.posted { who, text }

import { el } from '../ui.js';
import { LIFE_WORDS } from '../lights.js';
import { callName } from '../names.js';

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
    return 'chat: a conversation shared by everyone in the frame.';
  }

  state() { return `chat: ${this.messages.length} messages so far.`; }

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
    const input = this.input = el('textarea', { class: 'chat-input', rows: 2, placeholder: `talk to ${callName(this.frame.actant?.soma) ?? 'the ludant'}…` });
    const send = () => {
      if (input.value.trim()) this.post(this.frame.seat, input.value);
      input.value = '';
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
        // Typed with a controller (on a console's keyboard): let go once it's sent.
        if (input.dataset.padTyping) { delete input.dataset.padTyping; input.blur(); }
      }
    });
    // Who you're talking to, and whether it's awake: where people look when nothing seems
    // to be happening.
    this.head = el('div', { class: 'chat-head' });
    this.thinkingEl = el('div', { class: 'chat-msg theirs chat-thinking' });
    root.append(this.head, this.log, el('div', { class: 'chat-send-row' }, input, el('button', { class: 'chat-send', title: 'send', onclick: () => { send(); input.focus(); } }, 'send')));
    for (const m of this.messages) this.render(m);
    if (!this.messages.length) this.log.append(this.starter());
    this.showLife();
  }

  /** The ludant's life light, beside its name, and a line in the log while it thinks. */
  showLife() {
    if (!this.head) return;
    const { life, detail } = this.frame.status;
    const name = callName(this.frame.actant?.soma) ?? 'the ludant';
    const busy = life === 'thinking' ? this.frame.actant?.doing : null;
    const painting = [...(this.frame.art?.painting.values() ?? [])];
    const doing = painting.length ? `painting ${painting.map((n) => `“${n}”`).join(', ')}` : busy;
    const words = doing ? `${doing}…` : LIFE_WORDS[life] ?? life;
    this.head.replaceChildren(...[el('span', { class: `light life ${life}` }, el('i'), name, el('em', {}, words)),
      detail ? el('span', { class: 'chat-head-detail', title: detail }, detail) : null].filter(Boolean));
    if (life === 'thinking' || painting.length) {
      this.thinkingEl.replaceChildren(el('span', { class: 'chat-who' }, name), el('div', { class: 'chat-text' }, el('span', { class: 'dots' }, doing ?? 'thinking')));
      this.log.append(this.thinkingEl);
      this.log.scrollTop = this.log.scrollHeight;
    } else this.thinkingEl.remove();
  }

  /** Before anything has been said: what you might say, and, if nobody here has connected
   *  an AI, what its answering takes. */
  starter() {
    const soma = this.frame.actant?.soma, name = callName(soma) ?? 'it';
    // A suggestion goes into the box, to send as it is or change first.
    const ask = (text) => el('button', { class: 'chat-chip', onclick: () => { this.input.value = text; this.input.focus(); } }, text);
    // Nothing yet (no title: it hasn't become a game): what it could become.
    const fresh = !soma?.sections?.title?.trim();
    return el('div', { class: 'chat-starter' },
      fresh
        ? el('p', {}, `${name} isn't a game yet. Tell it what you'd like to play, and it builds itself into that.`)
        : el('p', {}, `Tell ${name} what you'd change, in your own words. It answers here, and changes itself while you play.`),
      fresh
        ? el('div', { class: 'chat-chips' }, ask('a fishing game'), ask('a racing game'), ask('something spooky'), ask('surprise me'))
        : el('div', { class: 'chat-chips' }, ask('make it harder'), ask('change the colors'), ask('add something new'), ask('what are you?')),
      this.frame.payer?.() ? null : el('p', { class: 'chat-starter-fine' },
        'To answer, it thinks with an AI model on your own OpenRouter account, usually a few cents at a time. ',
        el('button', { class: 'link-btn inline', onclick: () => this.frame.connectThinking() }, 'connect an AI')));
  }

  /** A line from the frame, not a message: kept out of the conversation. */
  notice(text) {
    if (!this.log) return;
    this.log.querySelector('.chat-notice')?.remove();
    this.log.append(el('div', { class: 'chat-notice' }, text));
    this.log.scrollTop = this.log.scrollHeight;
  }

  render(m) {
    if (!this.log) return;
    this.log.querySelector('.chat-starter')?.remove();
    const mine = m.who === this.frame.seat;
    this.log.append(el('div', { class: `chat-msg ${mine ? 'mine' : 'theirs'}` },
      el('span', { class: 'chat-who' }, m.who === this.frame.actant?.name ? callName(this.frame.actant.soma) : m.who), el('div', { class: 'chat-text' }, m.text)));
    if (this.thinkingEl?.isConnected) this.log.append(this.thinkingEl);   // keep it last
    this.log.scrollTop = this.log.scrollHeight;
  }

  toJSON() { return { messages: this.messages }; }
  load(json) { this.messages = json?.messages ?? []; }
}
