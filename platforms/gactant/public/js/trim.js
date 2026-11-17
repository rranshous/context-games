// Trimming a long wake. A wake is one conversation that grows by every turn's reply and tool
// results; past a few turns, the old ones mostly cost time. So now and then, what's older
// than the last few turns is shrunk in place: results and pictures become a short note, long
// text the ludant wrote is cut, and a call's long arguments are cut inside their JSON (it
// must stay valid). Nothing is removed, so every tool call keeps its result. Its soma is
// shown whole on every call, so whatever it read can be read again.
//
// It goes in batches (every TRIM_EVERY turns), not every turn: trimming changes earlier
// messages, which spends the cached prefix from there on.

export const TRIM_EVERY = 8;   // turns between trims
export const KEEP_TURNS = 6;   // the latest turns, kept whole
const KEEP_CHARS = 600;        // a result this short is kept whole
const SAID_CHARS = 300;        // the ludant's own words, and a call's string arguments, cut to this
const TEXT_CHARS = 1500;       // a text part of a message from the frame ("Meanwhile")
const MARK = '(trimmed';

/** Is it time to trim, before this turn's call? */
export const trimDue = (turn) => turn >= TRIM_EVERY && turn % TRIM_EVERY === 0;

/** Shrink messages[from, to) in place. from skips what woke it (kept whole: it's the why).
 *  -> how many messages changed */
export function trimOld(messages, from, to) {
  const names = new Map();
  for (const m of messages) for (const c of m.tool_calls ?? []) names.set(c.id, c.function?.name ?? 'a tool');
  let changed = 0;
  for (let i = from; i < Math.min(to, messages.length); i++) {
    const m = messages[i], before = JSON.stringify(m);
    messages[i] = trimOne(m, names);
    if (JSON.stringify(messages[i]) !== before) changed++;
  }
  return changed;
}

function trimOne(m, names) {
  if (m.role === 'tool') {
    const text = String(m.content ?? '');
    if (text.length <= KEEP_CHARS || text.startsWith(MARK)) return m;
    return { ...m, content: `${MARK} to save room: the result of ${names.get(m.tool_call_id) ?? 'a tool'}, ${text.length.toLocaleString('en')} characters, began: ${text.slice(0, 200)}…)` };
  }
  if (m.role === 'assistant') {
    const out = { ...m };
    if (typeof m.content === 'string' && m.content.length > SAID_CHARS) out.content = cut(m.content, SAID_CHARS);
    if (m.tool_calls?.length) out.tool_calls = m.tool_calls.map((c) => ({ ...c, function: { ...c.function, arguments: shrinkArgs(c.function?.arguments) } }));
    return out;
  }
  if (m.role === 'user' && Array.isArray(m.content)) {
    return { ...m, content: m.content.map((p) => {
      if (p.type === 'image_url') return { type: 'text', text: `${MARK}: a picture you looked at earlier)` };
      if (p.type === 'text' && p.text.length > TEXT_CHARS) return { ...p, text: cut(p.text, TEXT_CHARS) };
      return p;
    }) };
  }
  return m;
}

/** A call's arguments with every long string cut, still valid JSON (what doesn't parse stays). */
function shrinkArgs(args) {
  if (typeof args !== 'string' || args.length <= SAID_CHARS) return args;
  try { return JSON.stringify(shrink(JSON.parse(args))); } catch { return args; }
}

function shrink(v) {
  if (typeof v === 'string') return v.length > SAID_CHARS && !v.startsWith(MARK) ? `${MARK}: ${v.length.toLocaleString('en')} characters, began: ${v.slice(0, 120)}…)` : v;
  if (Array.isArray(v)) return v.map(shrink);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrink(x)]));
  return v;
}

function cut(text, n) {
  return text.startsWith(MARK) || text.endsWith('(trimmed)') ? text : `${text.slice(0, n)}… (trimmed)`;
}
