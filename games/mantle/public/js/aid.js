// The aid at work: a conversation with the commander, and one design on the bench. The
// aid shapes the design with propose_unit; the spec is checked and priced by the contract
// (spec.js), and the picture is drawn from what the aid says it looks like.
//
// What's on the bench is shown to the aid fresh before every call, in a note after the
// conversation, so it always works from the design as it is now.

import { AIDS } from './aids.js';
import { SIZES, STATS, check, price, specLanguage } from './spec.js';

const MAX_TURNS = 6;

// What each size is, for the picture, in the world's own terms.
const SCALE = ['about the size of a dog', 'about the size of a person', 'about the size of a horse', 'about the size of an elephant', 'as big as a house'];

const PROPOSE = {
  type: 'function',
  function: {
    name: 'propose_unit',
    description: 'Put a design on the bench, replacing what is there. The commander sees it at once as a unit card: its picture, name, description, stats, abilities, and what it costs, the room it takes and how long it takes to make. Send the whole design every time. Leave out look to keep the picture as it is; give it when the unit is new or should look different, and it is drawn again.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'what the unit is called: short, a name a commander would shout' },
        description: { type: 'string', description: 'one or two sentences for the card: what it is and what it does in a fight' },
        look: { type: 'string', description: 'what it looks like, for the picture: body, shape, colors, texture, how it carries its weapons. Two to four sentences. Its size is added for you.' },
        size: { type: 'integer', minimum: 1, maximum: 5 },
        stats: {
          type: 'object',
          properties: Object.fromEntries(Object.keys(STATS).map((s) => [s, { type: 'integer', minimum: 1, maximum: 10 }])),
          required: Object.keys(STATS),
        },
        abilities: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'description', 'size', 'stats', 'abilities'],
    },
  },
};

/** A plain medium unit, all fives, and two others, priced: for the aid's sense of scale. */
function landmarks(aidId) {
  const at = (size, r) => price({ size, stats: Object.fromEntries(Object.keys(STATS).map((s) => [s, r])), abilities: [] }, aidId).cost;
  return `For a sense of scale: a tiny unit with every stat at 2 costs ${at(1, 2)}; a medium one with every stat at 5 costs ${at(3, 5)}; a huge one with every stat at 9 costs ${at(5, 9)}.`;
}

export class Aid {
  constructor(aidId, { onChange, onSay, onBusy }) {
    this.id = aidId;
    this.aid = AIDS[aidId];
    this.messages = [];
    this.bench = null;   // { name, description, look, spec, priced, art }
    this.onChange = onChange; this.onSay = onSay; this.onBusy = onBusy;
  }

  systemText() {
    const a = this.aid;
    return `${a.voice}

You work for a commander, designing the units of their army. They tell you what they want, in their own words, and you design it: you put it on the bench with propose_unit, which shows it to them as a unit card, with its picture, stats and price. Then you talk it over with them and change it until they're happy. Bring your own ideas and opinions: suggest what would make it better or cheaper, and say so when an idea fights your craft or would cost a fortune. When they ask for something, put it on the bench; don't just describe it.

Keep what you say short: a few sentences, said to them across the bench. They can see the card, so don't read the stats back to them; talk about what matters.

${specLanguage(this.id)}
${landmarks(this.id)}

How a unit looks: ${a.look} The picture is drawn from your look, so describe it vividly, and make the look match what it does: its size, its weapons, its abilities.`;
  }

  benchText() {
    if (!this.bench) return 'On the bench: nothing yet.';
    const { name, description, look, spec, priced } = this.bench;
    return `On the bench now: ${name}. ${description}
Looks: ${look}
Spec: ${JSON.stringify(spec)}
Costs ${priced.cost} (${priced.lines.map((l) => `${l.what} ${l.cost}`).join(', ')}), takes ${priced.supply} room, and ${this.aid.lab} need ${priced.seconds} seconds to make it.`;
  }

  /** Put a design on the bench: a kept one, brought back to work on. */
  load(design) {
    this.bench = design;
    this.messages.push({ role: 'user', content: `(The commander brought ${design.name} back to the bench to work on.)` });
    this.onChange(this.bench);
  }

  clear() {
    this.bench = null;
    this.messages.push({ role: 'user', content: '(The commander cleared the bench, to start something new.)' });
    this.onChange(null);
  }

  async hear(text) {
    this.messages.push({ role: 'user', content: text });
    this.onBusy('thinking', true);
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await fetch('/api/think', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'system', content: this.systemText() }, ...this.messages, { role: 'system', content: this.benchText() }],
            tools: [PROPOSE],
          }),
        }).then((r) => r.json());
        if (res.error) throw new Error(res.error);
        const msg = res.choices?.[0]?.message ?? {};
        this.messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        if (msg.content?.trim()) this.onSay(msg.content.trim());
        if (!msg.tool_calls?.length) break;
        for (const call of msg.tool_calls) this.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(this.propose(call)) });
      }
    } catch (err) {
      this.onSay(`(Something went wrong in ${this.aid.lab}: ${err.message})`, 'fault');
    } finally {
      this.onBusy('thinking', false);
    }
  }

  propose(call) {
    let input;
    try { input = JSON.parse(call.function.arguments || '{}'); } catch { return { error: 'arguments were not valid JSON' }; }
    const spec = { size: input.size, stats: input.stats, abilities: input.abilities ?? [] };
    const problems = check(spec, this.id);
    if (problems.length) return { error: 'not put on the bench', problems };
    const look = input.look?.trim() || this.bench?.look;
    if (!look) return { error: 'a new unit needs a look, for its picture' };
    const redraw = !this.bench?.art || (input.look?.trim() && input.look.trim() !== this.bench.look) || this.bench.spec.size !== spec.size;
    const priced = price(spec, this.id);
    // Same name, same design (a revision, kept over the old one). A new name is a new unit,
    // even if the bench wasn't cleared first.
    const id = this.bench?.name === input.name ? this.bench.id : undefined;
    this.bench = { id, name: input.name, description: input.description, look, spec, priced, art: redraw ? null : this.bench.art };
    if (redraw) this.draw(this.bench);
    this.onChange(this.bench);
    return { ok: true, cost: priced.cost, where_the_cost_comes_from: priced.lines, room: priced.supply, seconds: priced.seconds, redrawn: !!redraw };
  }

  async draw(design) {
    this.onBusy('drawing', true);
    try {
      const prompt = `Unit art for a real-time strategy game, shown on the unit's card. ${design.look} It is ${SIZES[design.spec.size - 1]}, ${SCALE[design.spec.size - 1]}. ${this.aid.look} One unit only, its whole body in view, a three-quarter view from slightly above, centered, on a plain flat pure white background, with no shadow, no ground, no text and no frame. Painterly, with a strong, readable silhouette.`;
      const { url, error } = await fetch('/api/art', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }).then((r) => r.json());
      if (error) throw new Error(error);
      if (this.bench === design) { design.art = url; this.onChange(design); }
    } catch (err) {
      this.onSay(`(The picture didn't come out: ${err.message})`, 'fault');
    } finally {
      this.onBusy('drawing', false);
    }
  }
}
