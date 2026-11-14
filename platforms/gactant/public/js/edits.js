// Edits to a text (a soma section, a rulebook draft) in one call, each saying where by as
// little as it can: so a ludant changes what needs changing without writing out (or
// quoting) the rest. Output is the slowest and dearest part of thinking; a whole game
// rewritten for a small change took 35-55 seconds.
//
// Every edit names a place one of four ways, and gives `new` (the text that goes there):
//   { old, new }            exact text, appearing once (if it doesn't appear exactly, a
//                           match that differs only in spacing and indentation will do)
//   { from, to, new }       from the start of `from` through the end of `to` (the first `to`
//                           after `from`), each appearing once: a whole function or block
//                           replaced by quoting only its first and last lines
//   { lines: [a, b], new }  lines a to b, as numbered by read_section
//   { after, new }          inserted after a line number, or after a piece of text that
//                           appears once (0 inserts at the top)
// All of one call's edits name places in the text as it was before the call (line numbers
// too), may not overlap, and apply together or not at all.

/** The edits applied: { text, spans: [{ edit, lines: [a, b] }] }, where each span is the
 *  lines its new text sits on afterwards. Throws, saying which edit and why, if any can't. */
export function applyEdits(text, edits) {
  if (!Array.isArray(edits)) edits = [edits];
  if (!edits.length) throw new Error('no edits');
  const where = edits.map((e, i) => locate(text, e, i + 1));
  const order = where.map((w, i) => ({ ...w, i })).sort((a, b) => a.start - b.start);
  for (let k = 1; k < order.length; k++) {
    if (order[k].start < order[k - 1].end) throw new Error(`edits ${order[k - 1].i + 1} and ${order[k].i + 1} overlap; make them one edit`);
  }
  let out = '', at = 0;
  const placed = [];
  for (const w of order) {
    out += text.slice(at, w.start);
    const replacement = w.text;
    const shown = replacement.startsWith('\n') ? replacement.slice(1) : replacement;   // an insertion's own line
    const startLine = lineOf(out) + (shown === replacement ? 0 : 1);
    out += replacement;
    placed.push({ edit: w.i + 1, lines: [startLine, startLine + Math.max(0, shown.replace(/\n$/, '').split('\n').length - 1)] });
    at = w.end;
  }
  out += text.slice(at);
  return { text: out, spans: placed.sort((a, b) => a.edit - b.edit) };
}

const lineOf = (before) => before.split('\n').length;   // the line a position starts on

/** Where an edit lands, and what goes there: { start, end, text }. */
function locate(text, e, n) {
  if (!e || typeof e !== 'object') throw new Error(`edit ${n} isn't an object`);
  if (typeof e.new !== 'string') throw new Error(`edit ${n} needs new: the text that goes there ("" to delete)`);
  return { text: e.new, ...place(text, e, n) };
}

function place(text, e, n) {
  if (Array.isArray(e.lines)) {
    const lines = text.split('\n');
    const [a, b] = e.lines.map(Number);
    if (!(a >= 1 && b >= a && b <= lines.length)) throw new Error(`edit ${n}: lines ${a}-${b} aren't in it (it has ${lines.length} lines)`);
    const start = lines.slice(0, a - 1).join('\n').length + (a > 1 ? 1 : 0);
    const end = start + lines.slice(a - 1, b).join('\n').length;
    return { start, end };
  }
  if (e.after !== undefined) {
    if (typeof e.after === 'number') {
      const lines = text.split('\n');
      if (!(e.after >= 0 && e.after <= lines.length)) throw new Error(`edit ${n}: there's no line ${e.after} (it has ${lines.length} lines)`);
      if (e.after === 0) return insertion(0, e, true);
      const end = lines.slice(0, e.after).join('\n').length;
      return insertion(end, e, false);
    }
    const { end } = find(text, String(e.after), n, 'after');
    return insertion(end, e, false);
  }
  if (e.from !== undefined || e.to !== undefined) {
    if (!e.from || !e.to) throw new Error(`edit ${n} needs both from and to`);
    const a = find(text, String(e.from), n, 'from');
    const rest = text.slice(a.start);
    const b = find(rest, String(e.to), n, 'to', true);
    return { start: a.start, end: a.start + b.end };
  }
  if (typeof e.old === 'string' && e.old) return find(text, e.old, n, 'old');
  throw new Error(`edit ${n} says where by old, from and to, lines, or after`);
}

/** An insertion lands on a line of its own: a newline is added between it and its neighbours. */
function insertion(at, e, top) {
  const text = top ? (e.new.endsWith('\n') ? e.new : `${e.new}\n`) : (e.new.startsWith('\n') ? e.new : `\n${e.new}`);
  return { start: at, end: at, text };
}

/** Find a piece of text that appears once (or, with first, the first time), exactly or,
 *  failing that, ignoring how spaces and indentation fall. */
function find(text, piece, n, what, first = false) {
  let at = text.indexOf(piece);
  if (at >= 0) {
    if (!first && text.indexOf(piece, at + 1) >= 0) throw new Error(`edit ${n}: ${what} appears more than once; quote a little more around it`);
    return { start: at, end: at + piece.length };
  }
  // Loosely: any run of spaces and tabs (and indentation after a newline) matches any other.
  const words = piece.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length && words[0]) {
    const loose = new RegExp(words.join('\\s+'), 'g');
    const hits = [...text.matchAll(loose)];
    if (hits.length === 1 || (first && hits.length)) return { start: hits[0].index, end: hits[0].index + hits[0][0].length };
    if (hits.length > 1) throw new Error(`edit ${n}: ${what} appears more than once; quote a little more around it`);
  }
  throw new Error(`edit ${n}: ${what} isn't in it${what === 'to' ? ' after from' : ''} (read_section or search_sections shows it as it is now)`);
}
