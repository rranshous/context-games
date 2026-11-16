// Chat: a rolling conversation. Knows nothing about actants; anyone in the frame can post.
//
// actions (as an actor)   post(text) -> message   read(n = 20) -> messages
// events                  chat.posted { who, text }

import { el } from '../ui.js';
import { LIFE_WORDS } from '../lights.js';
import { callName } from '../names.js';

const KEEP = 200;
const SHOWN = 7;   // messages shown with every wake
const STEPS_SHOWN = 4;   // steps done so far, under what it's on now
const SLOW_MS = 45_000, STUCK_MS = 180_000;   // waits on the AI worth saying so about

/** A step of a wake, in people's words: [under way, done]. */
function stepWords(s) {
  const part = { game: 'the game', hooks: 'how it reacts', tools: 'what it can do', memory: 'its notes', title: 'its title', origin: 'its origin' }[s.section] ?? (s.section ? `its ${s.section.replace(/_/g, ' ')}` : 'itself');
  const named = s.name ? ` “${s.name}”` : '';
  const words = {
    look_at_stage: ['looking at the game', 'looked at the game'],
    restart_stage: ['restarting the game', 'restarted the game'],
    play: ['playing the game to try it', 'played the game to try it'],
    look_at_whiteboard: ['looking at the whiteboard', 'looked at the whiteboard'],
    sketch: ['sketching on the whiteboard', 'sketched on the whiteboard'],
    pass_whiteboard: ['passing the whiteboard', 'passed the whiteboard'],
    make_art: [`painting${named || ' a picture'}`, `painted${named || ' a picture'}`],
    concept_art: ['painting concept art', 'painted concept art'],
    offer_choices: ['offering choices', 'offered choices'],
    table: ['working on online play', 'worked on online play'],
    store: ['updating saved data', 'updated saved data'],
    read_chat: ['reading the chat', 'read the chat'],
    read_section: [`reading ${part}`, `read ${part}`],
    search_sections: ['searching itself', 'searched itself'],
    write_section: [`rewriting ${part}`, `rewrote ${part}`],
    edit_section: [`changing ${part}`, `changed ${part}`],
    say: ['writing in the chat', 'wrote in the chat'],
  }[s.tool];
  const tool = String(s.tool ?? '').replace(/_/g, ' ');
  return words ?? [`using ${tool}`, `used ${tool}`];
}

const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

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

  /** The last few messages come with every wake, so a reply can follow the conversation
   *  without reading it first. */
  state() {
    const last = this.messages.slice(-SHOWN);
    const clip = (s) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);
    return `chat: ${this.messages.length} messages so far${last.length ? `. The last ${last.length === 1 ? 'one' : last.length}:\n${last.map((m) => `    ${m.who}: ${clip(m.text)}`).join('\n')}` : '.'}`;
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
    const words = doing ? `${doing}…` : (life === 'asleep' || life === 'resting') && !this.frame.payer?.() ? 'needs an AI to answer' : LIFE_WORDS[life] ?? life;
    this.head.replaceChildren(...[el('span', { class: `light life ${life}` }, el('i'), name, el('em', {}, words)),
      detail && this.frame.payer?.() ? el('span', { class: 'chat-head-detail', title: detail }, detail) : null].filter(Boolean));
    if (life === 'thinking' || painting.length) {
      const wasLast = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
      this.thinkingEl.replaceChildren(el('span', { class: 'chat-who' }, name), ...this.waiting(painting.length ? doing : null));
      if (!this.thinkingEl.isConnected) this.log.append(this.thinkingEl);
      if (wasLast) this.log.scrollTop = this.log.scrollHeight;
      // The clock ticks while it's awake.
      this.ticking ??= setInterval(() => this.showLife(), 1000);
    } else {
      this.thinkingEl.remove();
      clearInterval(this.ticking);
      this.ticking = null;
    }
  }

  /** While it's awake: what it's on now, how long this has taken, and what it has done so
   *  far, from the trail of this wake. A long wait on the AI says so, so a stall shows. */
  waiting(painting) {
    const t = this.frame.trailNow, now = Date.now();
    if (!t || t.ended) return [el('div', { class: 'chat-text' }, el('span', { class: 'dots' }, painting ?? 'thinking'))];
    const asking = t.asking ? now - t.asking : 0;
    const current = painting ?? (t.running ? stepWords(t.running)[0]
      : asking > STUCK_MS ? `still waiting on the AI (${clock(asking)}): it may be stuck`
      : asking > SLOW_MS ? `thinking (the AI is slow right now: ${clock(asking)})`
      : 'thinking');
    const done = (t.steps ?? []).filter((s) => s.tool !== 'say');
    const shown = done.slice(-STEPS_SHOWN);
    return [
      el('div', { class: 'chat-text wait-card' },
        el('div', { class: 'wait-now' }, el('span', { class: 'dots' }, current), el('span', { class: 'wait-clock', title: 'how long it has been awake' }, clock(now - t.at))),
        done.length > shown.length ? el('div', { class: 'wait-step more' }, `${done.length - shown.length} earlier step${done.length - shown.length === 1 ? '' : 's'}`) : null,
        ...shown.map((s) => el('div', { class: `wait-step${s.failed ? ' failed' : ''}`, title: s.failed ?? '' }, s.failed ? `✗ tried ${stepWords(s)[0]}` : `✓ ${stepWords(s)[1]}`))),
    ];
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
    // The log shows what's kept, no more: a long sitting's chat would otherwise stay on the page.
    const shown = this.log.querySelectorAll('.chat-msg:not(.chat-thinking)');
    for (let i = 0; i < shown.length - KEEP; i++) shown[i].remove();
    if (this.thinkingEl?.isConnected) this.log.append(this.thinkingEl);   // keep it last
    this.log.scrollTop = this.log.scrollHeight;
  }

  toJSON() { return { messages: this.messages }; }
  load(json) { this.messages = json?.messages ?? []; }
}
