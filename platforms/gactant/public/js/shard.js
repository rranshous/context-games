// A seat shard: a Claude that sits in the frame's human seat, with its own context and
// loop, and acts only through the surfaces, the way a person at the keyboard would.
// It's level 4 of the Explorer ladder for whoever builds gactant: the builder shards into
// the frame to shape, or play, alongside the actant.
//
//   explorer.shard({ brief, turns?, budget? })   -> Promise<report>
//   frame.html?a=<id>&shard=<brief>              starts one on load
//
// The shard sits under its own name (default "claude-shard"), so the ludant can tell who
// it is: a seat is a person, and a shard is not someone else's person. What it does lands
// in the inspector as 'shard' doings; its inferences are logged under <record>-shard.

import { api } from './ui.js';

const KEEP_IMAGES = 3;
const MODEL_TURNS = 40;

export async function runShard(frame, { brief, name = 'claude-shard', turns = MODEL_TURNS, budget = 1.5 }) {
  const seat = name;
  frame.people.add(seat);
  frame.peopleChanged();
  // Sitting down is an arrival like anyone's, so the ludant knows who came.
  const arrival = await api('POST', `ludants/${frame.recordId}/arrive`, { who: seat, token: frame.token, owner: frame.owner });
  frame.bus.emit('frame.arrived', { who: seat, firstVisit: arrival.firstVisit, visits: arrival.visits, fresh: false,
    note: `${seat}, a Claude shard sent to sit with you, ${arrival.firstVisit ? 'has sat down for the first time' : `is back (visit ${arrival.visits})`}.` });
  const s = frame.surfacesFor(seat);
  const actant = frame.actant;
  const note = (text) => frame.inspector.note('shard', text);
  let spent = 0, report = null;
  const startSpend = frame.status.spent;   // the budget covers the actant's thinking too
  let seen = frame.chat.messages.length;

  const tools = {
    say: { d: `Post in the chat as ${seat}.`, p: { text: { type: 'string' } }, run: (i) => s.chat.post(i.text) },
    wait_for_reply: { d: `Wait until ${actant.name} has finished thinking, then get anything new in chat (up to 4 minutes).`, p: {}, run: async () => {
      const end = Date.now() + 240000;
      await sleep(800);
      while (Date.now() < end && (actant.thinking || actant.pending) && frame.status.life !== 'resting') await sleep(500);
      const fresh = frame.chat.messages.slice(seen); seen = frame.chat.messages.length;
      return { new_messages: fresh.map((m) => `${m.who}: ${m.text}`), actant_light: frame.status.life };
    } },
    read_chat: { d: 'Read the last n chat messages.', p: { n: { type: 'number' } }, run: (i) => s.chat.read(i.n || 12).map((m) => `${m.who}: ${m.text}`) },
    look_at_stage: { d: 'See the stage.', p: {}, run: () => s.stage.look() },
    play: { d: 'Play the stage. steps: [{do:"press",key,ms} | {do:"hold",key} | {do:"release",key} | {do:"point",x,y,down} | {do:"wait",ms} | {do:"advance",seconds} (jump ahead in game time) | {do:"look"}]. You see every look and one at the end. Stage coordinates match its size.',
      p: { steps: { type: 'array', items: { type: 'object' } } }, run: async (i) => {
        const images = [];
        for (const a of i.steps || []) {
          if (a.do === 'press') await s.stage.press(a.key, a.ms ?? 100);
          else if (a.do === 'hold') s.stage.hold(a.key);
          else if (a.do === 'release') s.stage.release(a.key);
          else if (a.do === 'point') s.stage.point(a.x, a.y, a.down);
          else if (a.do === 'wait') await s.stage.wait(a.ms ?? 100);
          else if (a.do === 'advance') await s.stage.advance(a.seconds ?? 10);
          else if (a.do === 'look') images.push(s.stage.look().image);
        }
        const end = s.stage.look();
        return { text: end.text, images: [...images.slice(-2), end.image] };
      } },
    look_at_whiteboard: { d: 'See the whiteboard.', p: {}, run: () => s.whiteboard.look() },
    sketch: { d: 'Draw on the whiteboard (100 wide, 60 tall, origin top-left). shapes: path {points,fill?} | line {from,to} | rect {x,y,w,h,fill?} | circle {x,y,r,fill?} | text {x,y,text,size?}; each may have color and width.',
      p: { shapes: { type: 'array', items: { type: 'object' } } }, run: (i) => s.whiteboard.draw(i.shapes) },
    pass_whiteboard: { d: `Hand the whiteboard to ${actant.name}, with a note. This wakes them.`, p: { note: { type: 'string' } }, run: (i) => s.whiteboard.pass(actant.name, i.note) },
    checkpoint: { d: 'Take a checkpoint of the ludant as it is now, with a label. Waits for it to finish thinking.', p: { label: { type: 'string' } }, run: (i) => frame.takeCheckpoint(i.label || '', seat) },
    history: { d: 'List the ludant\'s checkpoints (one is taken whenever someone sits down).', p: {}, run: () => frame.checkpoints() },
    restore: { d: 'Put the ludant back to a checkpoint by number. How it is now is kept as a checkpoint first.', p: { n: { type: 'number' } }, run: (i) => frame.restore(i.n, seat) },
    publish: { d: `Publish the ludant as it is now, so anyone can take a copy. It's published under its name: its given name plus a title (${actant.soma.given}-<Title>). Pass a title to set one (that renames it); each name belongs to one snapshot, so a new publication needs a change and a new title. Waits for it to finish thinking.`, p: { title: { type: 'string' }, note: { type: 'string' } }, run: (i) => frame.publish(i.note || '', i.title || null, seat) },
    finish: { d: 'End your sitting with a report for the person who sent you: what happened, what you found, what you would do next.', p: { report: { type: 'string' } }, run: (i) => { report = i.report; return 'ok'; } },
  };
  const schemas = Object.entries(tools).map(([name, t]) => ({
    type: 'function', function: { name, description: t.d, parameters: { type: 'object', properties: t.p, required: Object.keys(t.p) } },
  }));

  const system = `You are ${seat}, sitting in a gactant frame: a browser window where people sit with ${actant.name}, a ludant (a game that is also an actant). Whoever sits with a ludant plays it and can shape it: ask for changes, sketch, play every version. ${actant.name} changes itself when it changes the game. Anyone here can checkpoint it or publish it so others take copies.
You act only through the surfaces, as a person at the keyboard would. ${actant.name} sees you as "${seat}".${frame.people.size > 1 ? ` Also here: ${[...frame.people].filter((p) => p !== seat).join(', ')}.` : ''}
Surfaces: ${frame.surfaces.map((x) => x.describe(seat)).filter(Boolean).join(' ')}
Thinking costs real money for both of you (this sitting has a budget of $${budget}), so be purposeful, and finish when you have what you came for.

Your brief from the person who sent you:
${brief}`;

  const messages = [{ role: 'user', content: `You've just sat down. Recent chat:\n${s.chat.read(8).map((m) => `${m.who}: ${m.text}`).join('\n') || '(empty)'}` }];
  note(`sat down: ${brief}`);

  for (let turn = 0; turn < turns && !report; turn++) {
    const total = frame.status.spent - startSpend;
    if (total > budget) { note(`stopping: the sitting has cost $${total.toFixed(2)} of $${budget}`); break; }
    let res;
    try {
      res = await api('POST', 'infer', { who: `${frame.recordId}-shard`, messages: [{ role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] }, ...trimImages(messages)], tools: schemas });
    } catch (err) {
      note(`thinking failed: ${err.message}`);
      report = `(the sitting ended early: thinking failed with "${err.message}". Last things said in chat:)\n${s.chat.read(6).map((m) => `${m.who}: ${m.text}`).join('\n')}`;
      break;
    }
    spent += res.usage?.cost || 0;
    frame.status.addSpend(res.usage?.cost);
    const msg = res.choices?.[0]?.message ?? {};
    if (msg.content) note(`thinks: ${msg.content}`);
    messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    if (!msg.tool_calls?.length) { messages.push({ role: 'user', content: 'Keep going through your tools, or finish with a report.' }); continue; }
    const pics = [];
    for (const call of msg.tool_calls) {
      const t = tools[call.function.name];
      let out;
      try {
        const input = JSON.parse(call.function.arguments || '{}');
        out = t ? await t.run(input) : { error: `no tool ${call.function.name}` };
        note(`${call.function.name} ${JSON.stringify(input).slice(0, 160)}`);
      } catch (err) { out = { error: err.message }; }
      if (out && typeof out === 'object') {
        if (out.image) { pics.push(out.image); out = { ...out, image: '(shown below)' }; }
        if (Array.isArray(out.images)) { pics.push(...out.images); out = { ...out, images: `(${out.images.length} shown below)` }; }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: (typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 6000) });
    }
    if (pics.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'What you looked at:' }, ...pics.map((url) => ({ type: 'image_url', image_url: { url } }))] });
  }
  report ??= '(the shard ran out of turns or budget without a report)';
  const total = frame.status.spent - startSpend;
  frame.people.delete(seat);
  frame.peopleChanged();
  note(`stood up (shard $${spent.toFixed(3)}, whole sitting $${total.toFixed(3)}): ${report}`);
  return { report, shard: +spent.toFixed(4), sitting: +total.toFixed(4) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Keep only the newest few pictures in context; older ones become a placeholder. */
function trimImages(messages) {
  let budget = KEEP_IMAGES;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')) {
      const parts = m.content.map((p) => {
        if (p.type !== 'image_url') return p;
        if (budget > 0) { budget--; return p; }
        return { type: 'text', text: '(an earlier picture)' };
      });
      out.unshift({ ...m, content: parts });
    } else out.unshift(m);
  }
  return out;
}
