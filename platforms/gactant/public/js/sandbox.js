// The frame's side of the sandbox. The ludant's embodiment runs in an iframe that can't
// reach this page: `sandbox="allow-scripts"` without allow-same-origin gives it an opaque
// origin (no cookies, no storage, no DOM of ours), and its content policy forbids the
// network. The two talk over one MessagePort (see bridge.js).
//
// Every surface stays here, the stage too. The sandbox gets ticks and events, and sends
// back pictures of what its game drew and requests for what only the frame can do.
//   Sandbox   the iframe and the bridge, and what the frame answers when the ludant asks
//   Body      the ludant as the frame sees it: a copy of its soma (to show and to save),
//             its faults, whether it's awake

import { Bridge } from './bridge.js';
import { nameOf } from './names.js';
import { el } from './ui.js';
import { report } from './telemetry.js';

// Events the sandbox may put on the frame's bus. Anything else it claims to have seen
// (a chat message from a person, say) is refused: those come from the frame's surfaces.
const FROM_SANDBOX = /^soma\./;
const INPUT = new Set(['hold', 'release', 'point']);
// A backstop against a body whose code calls for thinking in a loop: the chassis's own
// governor can be rewritten by the ludant, this can't.
const INFER_WINDOW_MS = 10 * 60 * 1000, INFER_MAX = 120;

export class Sandbox {
  constructor(frame) {
    this.frame = frame;
    this.bridge = null;
    this.inferences = [];
    this.ready = new Promise((resolve) => { this.connected = resolve; });
  }

  mount(root) {
    // The iframe shows nothing: everything the ludant shows, it shows on a surface.
    this.iframe = el('iframe', { class: 'sandbox', src: `${this.frame.config?.sandbox ?? ''}/sandbox.html`, sandbox: 'allow-scripts', title: 'the ludant', 'aria-hidden': 'true', tabindex: '-1' });
    addEventListener('message', (e) => {
      if (e.source !== this.iframe.contentWindow || e.data?.gactant !== 'ready' || this.bridge) return;
      const { port1, port2 } = new MessageChannel();
      this.bridge = new Bridge(port1, this.answers());
      this.iframe.contentWindow.postMessage({ gactant: 'bridge' }, '*', [port2]);
      this.connected(this.bridge);
    });
    root.append(this.iframe);
  }

  call(method, ...args) { return this.ready.then((b) => b.call(method, ...args)); }
  send(method, ...args) { this.ready.then((b) => b.send(method, ...args)); }
  sendWith(transfer, method, ...args) { this.ready.then((b) => b.sendWith(transfer, method, ...args)); }

  /** Stop the ludant in this window for good: the iframe goes, and everything in it. */
  remove() { this.iframe?.remove(); this.bridge = null; }

  /** What the frame does when the ludant asks. The ludant never says who it is: whatever
   *  it does on a surface, it does as itself. */
  answers() {
    const frame = this.frame;
    const proxied = () => Object.fromEntries(frame.surfaces.filter((s) => s.id !== 'inspector').map((s) => [s.id, s]));
    return {
      infer: (request) => this.infer(request),
      perceive: () => frame.perception(),
      act: (id, action, args = []) => {
        const surface = proxied()[id];
        const fn = surface?.actions(frame.actant.name)[action];
        if (!fn) throw new Error(`no ${id}.${action}`);
        return fn(...args);
      },
      store: (op, args) => {
        const s = frame.store.actions(frame.actant.name);
        if (op === 'set') s.set(...args);
        else if (op === 'delete') s.delete(...args);
      },
      soma: (report) => frame.actant.received(report),
      life: (life) => frame.actant.lived(life),
      note: (kind, text) => frame.inspector.note(kind, text),
      event: (e) => {
        if (!e || typeof e.type !== 'string' || !FROM_SANDBOX.test(e.type)) return;
        frame.bus.deliver(e);
      },
      // The stage's buffer, reporting.
      frame: (picture) => frame.stage.shown(picture),
      probe: (bitmap) => { bitmap?.close?.(); this.probed?.(); },
      size: (w, h) => frame.stage.resized(w, h),
      halt: (message) => frame.stage.halt(message),
      restart: () => frame.stage.restart(true),
      advanced: (t, count) => frame.stage.advanced(t, count),
      input: (action, args = []) => { if (INPUT.has(action)) frame.stage.ludantInput(action, args); },
    };
  }

  async infer({ messages, tools, ask }) {
    this.allow();
    return this.frame.infer({ messages, tools, ask });
  }

  /** Thinking and painting both count against the backstop. */
  allow() {
    const now = Date.now();
    this.inferences = this.inferences.filter((t) => now - t < INFER_WINDOW_MS);
    if (this.inferences.length >= INFER_MAX) throw new Error(`the frame is holding back: ${INFER_MAX} thoughts and pictures in ten minutes is more than a sitting should need`);
    this.inferences.push(now);
  }

  /** Can pictures (ImageBitmaps) get from the sandbox to here? Firefox with site isolation
   *  drops them without a word, so ask for one and see. If it doesn't come, the sandbox
   *  sends pixels instead. */
  async checkPictures() {
    const arrived = await new Promise((resolve) => {
      this.probed = () => resolve(true);
      setTimeout(() => resolve(false), 1500);
      this.send('probe');
    });
    this.probed = null;
    if (!arrived) this.usePixels('this browser doesn\'t pass pictures between the sandbox and the page');
    return arrived;
  }

  usePixels(why) {
    if (this.pixels) return;
    this.pixels = true;
    this.send('pictures', 'pixels');
    this.frame.inspector.note('changed', `the stage is getting the game's pixels instead of pictures: ${why}`);
    report('pixels', { message: why });
  }

  /** Every event on the frame's bus goes across, so the ludant's hooks hear it. */
  relay(bus) { bus.outward = (e) => this.send('event', e); }
}

/** The ludant as the frame sees it: what it last reported about itself. */
export class Body {
  constructor(frame, soma) {
    this.frame = frame;
    this.soma = soma;
    this.faults = {};
    this.state = { life: 'asleep', thinking: false, pending: 0, restless: 0 };
  }

  get name() { return nameOf(this.soma); }
  get thinking() { return this.state.thinking; }
  get pending() { return this.state.pending; }
  get restless() { return this.state.restless; }

  received({ soma, faults, changed, by }) {
    this.soma = soma;
    this.faults = faults ?? {};
    const inspector = this.frame.inspector;
    if (changed) {
      inspector.note('changed', `${by} rewrote ${changed} (${(soma.sections[changed] ?? '').length} chars)`);
      inspector.sectionChanged(changed);
    }
    inspector.renderTabs();
    if (changed === 'title' || !changed) this.frame.noticeName();
    // Changing its code while awake: people should see it's changing, not just thinking,
    // and see the moment a new game lands (it starts over).
    if (['game', 'hooks', 'tools'].includes(changed) && this.state.thinking) {
      this.changing = changed === 'game' ? 'its game' : 'itself';
      this.frame.chat.showLife();
    }
    if (changed === 'game') this.frame.stage.rebuilt(by);
    this.frame.changed();
  }

  lived(state) {
    this.state = state;
    if (!state.thinking) { this.changing = null; this.frame.stage.ludantDone(); }
    this.frame.status.setLife(state.life, state.detail);
  }

  writeSection(name, content, by) { return this.frame.sandbox.call('write', name, content, by); }
  load(soma) { return this.frame.sandbox.call('load', soma); }
  idle(ms) { return this.frame.sandbox.call('idle', ms); }
  gameState() { return this.frame.sandbox.call('gameState'); }
}
