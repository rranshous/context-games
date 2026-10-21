// The bridge between the frame and the sandbox: one MessagePort, carrying calls that
// answer (call) and notices that don't (send). Both sides use it.
//
//   const bridge = new Bridge(port, { method(...args) { ... } })
//   await bridge.call('method', ...args)   -> whatever the other side's handler returned
//   bridge.send('method', ...args)          -> nothing comes back
//   bridge.sendWith([bitmap], 'method', ...args)   a notice that moves things (pictures)
//
// Messages on one port arrive in order, so anything sent before a call's answer is
// handled before the answer arrives.

export class Bridge {
  constructor(port, handlers) {
    this.port = port;
    this.handlers = handlers;
    this.next = 1;
    this.waiting = new Map();   // id -> { resolve, reject }
    port.onmessage = (e) => this.receive(e.data);
  }

  call(method, ...args) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.post({ id, method, args });
    });
  }

  send(method, ...args) { this.post({ method, args }); }
  sendWith(transfer, method, ...args) { this.post({ method, args }, transfer); }

  post(message, transfer = []) {
    try { this.port.postMessage(message, transfer); }
    catch (err) {
      // Something that can't be copied across (a function, a DOM node). Say so instead.
      const reply = { re: message.re, error: `couldn't cross to the other side: ${err.message}` };
      if (message.re) this.port.postMessage(reply);
      else if (message.id) this.receive({ re: message.id, error: reply.error });
      else console.warn('[bridge]', reply.error);
    }
  }

  async receive(m) {
    if (m.re) {
      const w = this.waiting.get(m.re);
      if (!w) return;
      this.waiting.delete(m.re);
      if ('error' in m) w.reject(new Error(m.error)); else w.resolve(m.result);
      return;
    }
    const fn = this.handlers[m.method];
    try {
      if (!fn) throw new Error(`nothing here answers ${m.method}`);
      const result = await fn(...(m.args ?? []));
      if (m.id) this.post({ re: m.id, result });
    } catch (err) {
      if (m.id) this.post({ re: m.id, error: err?.message ?? String(err) });
      else console.warn(`[bridge] ${m.method}: ${err?.message ?? err}`);
    }
  }
}
