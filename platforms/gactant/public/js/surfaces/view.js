// View: which parts of the frame show in this window: the stage, the chat, the whiteboard,
// the inside. The person's switches and the ludant both set it, and whoever set it last
// wins. It's this window's, kept for each ludant on this device.
//
// actions (as an actor)   shown() -> { stage, chat, whiteboard, inside }   show(changes) -> shown
// events                  view.changed { who, shown }

export const PANES = ['stage', 'chat', 'whiteboard', 'inside'];
const ALL = { stage: true, chat: true, whiteboard: true };

export class View {
  id = 'view';

  constructor(frame) {
    this.frame = frame;
    this.panes = { ...ALL, inside: false };
  }

  /** What this window showed last time for this ludant. With nothing kept, the inside is
   *  as this person last left it on any ludant. A play link (&play) starts on the stage alone. */
  restore() {
    let kept = null, inside = false;
    try {
      kept = JSON.parse(localStorage.getItem(this.key()) ?? 'null');
      inside = localStorage.getItem('gactant-fold') === '0';
    } catch {}
    this.panes = PANES.every((p) => typeof kept?.[p] === 'boolean') && PANES.some((p) => kept[p]) ? kept : { ...ALL, inside };
    if (new URLSearchParams(location.search).has('play')) this.panes = { stage: true, chat: false, whiteboard: false, inside: false };
  }

  key() { return `gactant-view-${this.frame.recordId}`; }

  describe() {
    return `view: which parts of the frame show in ${this.frame.seat}'s window: the stage, the chat, the whiteboard, the inside (where they see your soma). shown() says which; show({ chat: false, whiteboard: true }) changes them, and returns what shows. At least one shows. ${this.frame.seat} has switches for it too (just the game, show all, inside), and whoever changed it last wins: view.changed tells you when they do. What you set is kept for this window: the next time ${this.frame.seat} opens you here, it shows the same, until something changes it. Only the stage on its own is play mode, which fills a phone's screen; with the chat hidden, your chat messages pop up briefly over the stage.`;
  }

  state() {
    const on = PANES.filter((p) => this.panes[p]);
    return `view: ${this.frame.seat}'s window shows ${on.join(', ')}${on.length < PANES.length ? `; hidden: ${PANES.filter((p) => !this.panes[p]).join(', ')}` : ''}.`;
  }

  actions(who) {
    return {
      shown: () => ({ ...this.panes }),
      show: (changes) => this.show(who, changes),
    };
  }

  show(who, changes) {
    if (!changes || typeof changes !== 'object') throw new Error('view.show needs which parts to show, like { chat: false }');
    const next = { ...this.panes };
    for (const [p, on] of Object.entries(changes)) {
      if (!PANES.includes(p)) throw new Error(`view has no ${p}: it has ${PANES.join(', ')}`);
      if (typeof on !== 'boolean') throw new Error(`view.show: ${p} should be true or false`);
      next[p] = on;
    }
    if (!PANES.some((p) => next[p])) throw new Error('view.show: something has to show');
    if (PANES.every((p) => next[p] === this.panes[p])) return { ...next };
    this.panes = next;
    try {
      localStorage.setItem(this.key(), JSON.stringify(next));
      localStorage.setItem('gactant-fold', next.inside ? '0' : '1');
    } catch {}
    this.frame.laidOut();
    this.frame.bus.emit('view.changed', { who, shown: { ...next } });
    return { ...next };
  }
}
