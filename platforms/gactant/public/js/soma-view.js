// How a ludant sees its own soma while it thinks: drawn fresh before every call, in a
// system note at the end of the conversation, so it always sees itself as it is right
// now. Text sections are shown whole. A code section too long to show whole is shown as
// an outline of where things start in it, by line number, and the ludant reads and
// searches the rest with read_section and search_sections, the way coding agents work in
// a codebase.
//
// experiments/soma-views is where this was tried against showing the whole soma in the
// system text once per wake: as good or better, at the same cost, on bodies up to 108k
// characters.

const CODE = new Set(['tools', 'game', 'hooks']);
const BIG = 3000;            // code sections longer than this are shown as an outline
const OUTLINE_ENTRIES = 150;
const RESULT_CHARS = 16000;  // what one look at the code may return

const lines = (s) => s.split('\n');
const numbered = (ls, from) => ls.map((l, i) => `${String(from + i).padStart(5)}│${l}`).join('\n');

/** Where things start in a piece of code: functions, methods, tools, banner comments. */
function outlineOf(content) {
  const out = [];
  lines(content).forEach((l, i) => {
    const t = l.trim();
    if (/^(async\s+)?function\b/.test(t) || /^(const|let|var)\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>/.test(t) || /^(const|let|var)\s+\w+\s*=\s*(async\s+)?function\b/.test(t)
      || /^(async\s+)?[a-zA-Z_]\w*\s*\([^)]*\)\s*\{\s*$/.test(t) && !/^(if|for|while|switch|catch|with)\b/.test(t)
      || /^\w+\s*:\s*(async\s*)?(function\b|\([^)]*\)\s*=>)/.test(t)
      || /^name\s*:\s*['"]/.test(t)
      || /^\/\/\s*-{2,}/.test(t)) out.push(`${String(i + 1).padStart(5)}│${l.length > 140 ? `${l.slice(0, 140)}…` : l}`);
  });
  return out.slice(0, OUTLINE_ENTRIES).join('\n');
}

/** The soma's sections as the ludant sees them now. */
export function somaView(sections) {
  return Object.entries(sections).map(([name, content]) => {
    if (CODE.has(name) && content.length > BIG) {
      return `<section name="${name}" kind="code" lines="${lines(content).length}" chars="${content.length}" shown="outline">
(Too long to show whole. Read any part with read_section, find things with search_sections. Here is where things start in it, by line number:)
${outlineOf(content)}
</section>`;
    }
    return `<section name="${name}"${CODE.has(name) ? ' kind="code"' : ''}>\n${content}\n</section>`;
  }).join('\n\n');
}

const cap = (s) => (s.length > RESULT_CHARS ? `${s.slice(0, RESULT_CHARS)}\n… (cut off: ask for less)` : s);

export function readSection(sections, { section, from, to }) {
  const c = sections[section];
  if (c == null) throw new Error(`no section ${section}; there are ${Object.keys(sections).join(', ')}`);
  const ls = lines(c), a = Math.max(1, Math.floor(from ?? 1)), b = Math.min(ls.length, Math.floor(to ?? a + 399), a + 399);
  return cap(`${section}, lines ${a}–${b} of ${ls.length}:\n${numbered(ls.slice(a - 1, b), a)}`);
}

export function searchSections(sections, { pattern, section }) {
  let re;
  try { re = new RegExp(pattern, 'i'); } catch (err) { throw new Error(`bad pattern: ${err.message}`); }
  const hits = [];
  for (const [name, c] of Object.entries(sections)) {
    if (section && name !== section) continue;
    const ls = lines(c);
    ls.forEach((l, i) => { if (re.test(l)) hits.push(`${name}:\n${numbered(ls.slice(Math.max(0, i - 1), i + 2), Math.max(1, i))}`); });
  }
  return cap(hits.length ? `${hits.length} matching lines${hits.length > 60 ? ' (the first 60)' : ''}:\n${hits.slice(0, 60).join('\n--\n')}` : 'no matches');
}

export const VIEW_TOOLS = [
  { name: 'read_section', description: 'Read lines of one of your soma sections, as it is now, numbered (the numbers and │ are not part of the text). Up to 400 lines at a time.',
    input_schema: { type: 'object', properties: { section: { type: 'string' }, from: { type: 'number', description: 'first line (default 1)' }, to: { type: 'number', description: 'last line (default from + 399)' } }, required: ['section'] } },
  { name: 'search_sections', description: 'Find lines in your soma sections, as they are now, that match a JavaScript regular expression (case-insensitive). Shows each match with its line number and a line either side.',
    input_schema: { type: 'object', properties: { pattern: { type: 'string' }, section: { type: 'string', description: 'just this section (default: all)' } }, required: ['pattern'] } },
];
