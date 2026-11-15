// A game's moves, gathered and sent together: table.queue(match, options) in the game
// (chassis.js). Moves added within a short while go as ONE move, { batch: [action, ...] },
// so a game that moves often (walking, aiming) spends one action, not one per step. The
// rules decide what a batch means; the table description asks them to apply it in order and
// stop at the first action that isn't allowed, keeping the ones before it (walk until
// blocked), and to refuse the move only if none applies.
//
//   const q = table.queue(match, { every: 250, max: 20, key })
//   q.add(action) -> Promise<{ view, result, now }>   the answer to the move it went in
//                    (rejected with the refusal if that move was refused; resolves
//                    { replaced: true } if a later action with the same key took its place)
//   q.flush()     -> Promise   send what's waiting now
//   q.pending     -> how many are waiting
//   q.stop()      -> stop sending on a timer (what's waiting is sent first)
// key(action): actions with the same key replace each other while they wait, for absolute
// ones ("go to x,y": only the latest matters). Never for steps ("one to the left").

const MAX_JSON = 3_500;   // a batch stays under an action's 4,000 characters of JSON

export function moveQueue(send, { every = 250, max = 20, key = null } = {}) {
  let waiting = [];          // { action, key, resolve, reject }
  let sending = null;        // the flush in flight: one at a time, so they arrive in order
  let timer = null;
  let stopped = false;

  const size = (list) => JSON.stringify({ batch: list.map((w) => w.action) }).length;

  async function flush() {
    clearTimeout(timer); timer = null;
    while (sending) await sending.catch(() => {});
    if (!waiting.length) return;
    // As many as fit in one action, oldest first; the rest wait for the next.
    let take = Math.min(waiting.length, max);
    while (take > 1 && size(waiting.slice(0, take)) > MAX_JSON) take--;
    const batch = waiting.splice(0, take);
    sending = send({ batch: batch.map((w) => w.action) });
    try {
      const answer = await sending;
      for (const w of batch) w.resolve(answer);
    } catch (err) {
      for (const w of batch) w.reject(err);
    } finally {
      sending = null;
    }
    if (waiting.length) schedule();
  }

  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(() => { flush().catch(() => {}); }, every);
  }

  return {
    add(action) {
      return new Promise((resolve, reject) => {
        const k = key ? key(action) : null;
        if (k != null) {
          const i = waiting.findIndex((w) => w.key === k);
          if (i >= 0) { waiting[i].resolve({ replaced: true }); waiting.splice(i, 1); }
        }
        waiting.push({ action, key: k, resolve, reject });
        if (waiting.length >= max) flush().catch(() => {});
        else schedule();
      });
    },
    flush,
    get pending() { return waiting.length; },
    stop() { stopped = true; return flush(); },
  };
}
