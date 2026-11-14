// The rules engine on a thread of its own, for the Node server. Rules run synchronously, and
// one built-in on big data (indexOf over megabytes) can run seconds between the interpreter's
// checks; in Node's one thread, that would stall every request. Here the server waits at most
// MAX_WAIT_MS for an answer, then ends the thread (and starts another), and the rulebook is
// broken. (Hosted, each match is its own object, so a slow call holds up only its own match.)
//
//   const rules = await createRulesThread(wasmPath)   // the same call() and check() as rules.mjs

import { MessageChannel, Worker, isMainThread, parentPort, receiveMessageOnPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { RuleError, createRules } from './rules.mjs';

const MAX_WAIT_MS = 5000;

if (!isMainThread) {
  // The thread: a rules engine, answering each call on its port and waking the server.
  const rules = await createRules(await WebAssembly.compile(readFileSync(workerData.wasm)));
  const flag = new Int32Array(workerData.flag);
  parentPort.on('message', ({ port, how, args }) => {
    let answer;
    try { answer = { value: how === 'check' ? rules.check(...args) : rules.call(...args) }; } catch (err) {
      answer = { error: { message: err.message, kind: err.kind ?? 'broken', line: err.line, column: err.column, steps: err.steps ?? 0 } };
    }
    port.postMessage(answer);
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
  });
  parentPort.postMessage('ready');
}

export async function createRulesThread(wasm) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  let thread = null, starting = null;
  const start = () => (starting ??= new Promise((resolve, reject) => {
    const t = new Worker(new URL(import.meta.url), { workerData: { wasm, flag: flag.buffer } });
    t.once('message', () => { thread = t; starting = null; resolve(); });
    t.once('error', (err) => { starting = null; reject(err); });
  }));
  await start();

  function ask(how, args) {
    if (!thread) { start().catch(() => {}); throw new RuleError('the rules engine is restarting; try again in a moment', { kind: 'broken', steps: 0 }); }
    const { port1, port2 } = new MessageChannel();
    Atomics.store(flag, 0, 0);
    thread.postMessage({ port: port2, how, args }, [port2]);
    const waited = Atomics.wait(flag, 0, 0, MAX_WAIT_MS);
    const got = receiveMessageOnPort(port1)?.message;
    port1.close();
    if (waited === 'timed-out' && !got) {
      // Still running: end it, and have a fresh engine for the next call.
      const t = thread; thread = null; t.terminate(); start().catch(() => {});
      throw new RuleError(`the rules ran too long (over ${MAX_WAIT_MS / 1000} seconds in one call)`, { kind: 'broken', steps: 1000 });
    }
    if (got.error) throw new RuleError(got.error.message, got.error);
    return got.value;
  }

  return {
    call: (source, fn, args) => ask('call', [source, fn, args]),
    check: (source) => ask('check', [source]),
  };
}
