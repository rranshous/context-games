// window.explorer: a seat for a Claude outside the frame (driving it through Playwright)
// to sit where the human sits. Everything here goes through the same surface actions a
// human's clicks do, as the frame's human seat. Nothing reaches into the actant.

import { runShard } from './shard.js';

export function installExplorer(frame) {
  const stage = frame.stage;
  const act = stage.actions(frame.seat);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  window.explorer = {
    frame,
    get seat() { return frame.seat; },
    say: (text) => frame.chat.post(frame.seat, text),
    chat: (n = 10) => frame.chat.messages.slice(-n).map((m) => `${m.who}: ${m.text}`),
    draw: (shapes) => frame.whiteboard.draw(frame.seat, shapes),
    pass: (note = '') => frame.whiteboard.pass(frame.seat, frame.actant.name, note),
    board: () => frame.whiteboard.look(),
    look: () => stage.look(),
    hold: act.hold,
    release: act.release,
    press: act.press,
    point: act.point,
    async click(x, y, ms = 60) { act.point(x, y, true); await wait(ms); act.point(x, y, false); },
    /** Sit a Claude shard in this seat: it shapes or plays with its own loop. */
    shard: (opts) => runShard(frame, typeof opts === 'string' ? { brief: opts } : opts),
    /** Read the game's own state if it chose to expose one as game.state. */
    gameState: () => frame.actant.game?.state,
    state: () => ({
      people: [...frame.people], lineage: frame.record.lineage,
      life: frame.status.life, detail: frame.status.detail, line: frame.status.line,
      thinking: frame.actant.thinking, pending: frame.actant.pending.length, restless: frame.actant.restless,
      faults: frame.actant.faults, halted: stage.halted, fps: Math.round(stage.fps), size: [stage.width, stage.height],
      sections: Object.fromEntries(Object.entries(frame.actant.soma.sections).map(([k, v]) => [k, v.length])),
      spent: +frame.status.spent.toFixed(4),
    }),
    doings: (n = 20) => frame.inspector.doings.slice(-n).map((d) => `[${d.kind}] ${d.text}`),
    section: (name) => frame.actant.soma.sections[name],
    /** Resolve once the actant has finished thinking (and nothing is waiting to wake it). */
    async idle(timeoutMs = 180000) {
      const end = Date.now() + timeoutMs;
      await wait(600);
      while (Date.now() < end) {
        if (!frame.actant.thinking && !frame.actant.pending.length) return window.explorer.state();
        if (frame.status.life === 'resting') return window.explorer.state();
        await wait(500);
      }
      throw new Error('actant still thinking after timeout');
    },
  };
}
