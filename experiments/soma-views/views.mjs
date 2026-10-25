// Views of a soma: how a ludant sees its own body when it wakes, and the tools it gets for
// what it can't see at once. Every view shows the same body and changes it the same way
// (edit_section and write_section, the platform's own); only what's on show differs.
//
//   full      everything, as gactant does it now (level 5)
//   outline   big code sections as an outline of where things are, with tools to read
//             lines and search, the way coding agents work in a codebase
//   skeleton  big code sections as code with the bodies of long functions folded away,
//             and a tool to unfold one
//
// The page asks Node for these (see body.js and run.mjs), so the parsing lives here.

import * as acorn from 'acorn';

const CODE = new Set(['tools', 'game', 'hooks']);
const BIG = 3000;            // code sections longer than this are shown folded
const FOLD_LINES = 6;        // in the skeleton, function bodies longer than this are folded
const RESULT_CHARS = 16000;  // what one look at the code may return

export const APPROACHES = ['full', 'outline', 'skeleton'];

const folded = (name, content) => CODE.has(name) && content.length > BIG;
const lines = (s) => s.split('\n');
const numbered = (ls, from) => ls.map((l, i) => `${String(from + i).padStart(5)}│${l}`).join('\n');

// ---------- outline ----------

/** Where things start in a piece of code: functions, methods, big declarations, banner comments. */
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
  return out.slice(0, 150).join('\n');
}

function outlineSection(name, content) {
  const n = lines(content).length;
  return `<section name="${name}" kind="code" lines="${n}" chars="${content.length}" shown="outline">
(Too long to show whole. Read any part with read_section, find things with search_sections. Here is where things start in it, by line number:)
${outlineOf(content)}
</section>`;
}

// ---------- skeleton ----------

/** The functions in a piece of code that are worth folding: start/end offsets of their
 *  bodies, a name to unfold them by, and how many lines they hide. */
function foldable(content) {
  const src = `(${content}\n)`;
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true }); }
  catch { return null; }   // code that doesn't parse is shown whole
  const fns = [];
  const visit = (node, parent, owner) => {
    if (!node || typeof node.type !== 'string') return;
    const isFn = /Function/.test(node.type) && node.body?.type === 'BlockStatement';
    if (isFn) {
      let name = node.id?.name;
      if (!name && parent?.type === 'VariableDeclarator') name = parent.id?.name;
      if (!name && (parent?.type === 'Property' || parent?.type === 'MethodDefinition')) name = parent.key?.name ?? parent.key?.value;
      if (!name && parent?.type === 'AssignmentExpression') name = src.slice(parent.left.start, parent.left.end);
      if (owner && name) name = `${owner}.${name}`;
      fns.push({ node, name: name ?? `line ${node.loc.start.line}` });
    }
    // A tool's run is named after its tool: "look_at_stage.run".
    let nextOwner = owner;
    if (node.type === 'ObjectExpression') {
      const named = node.properties.find((p) => p.key?.name === 'name' && p.value?.type === 'Literal');
      if (named) nextOwner = named.value.value;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'loc') continue;
      if (Array.isArray(v)) for (const c of v) visit(c, node, nextOwner);
      else if (v && typeof v.type === 'string') visit(v, node, nextOwner);
    }
  };
  visit(ast, null, null);
  const seen = new Map();
  for (const f of fns) {
    const k = f.name, n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) f.name = `${k}@${f.node.loc.start.line - 0}`;
  }
  // Offsets back into the section's own text (the parse wrapped it in a parenthesis).
  return fns.map((f) => ({
    name: f.name,
    start: f.node.start - 1, end: f.node.end - 1,
    bodyStart: f.node.body.start - 1, bodyEnd: f.node.body.end - 1,
    hides: f.node.body.loc.end.line - f.node.body.loc.start.line - 1,
    line: f.node.loc.start.line,
  }));
}

/** The code with long function bodies folded: the outermost ones that are long enough,
 *  except a function that is the whole section (its body is the section). */
function skeletonOf(name, content) {
  const fns = foldable(content);
  if (!fns) return null;
  const whole = fns.filter((f) => content.slice(0, f.start).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim() === '' && content.slice(f.end).trim() === '');
  const fold = fns.filter((f) => f.hides > FOLD_LINES && !whole.includes(f))
    .filter((f, _, all) => !all.some((g) => g !== f && g.bodyStart <= f.start && f.end <= g.bodyEnd && g.hides > FOLD_LINES && !whole.includes(g)));
  fold.sort((a, b) => a.bodyStart - b.bodyStart);
  let out = '', at = 0;
  for (const f of fold) {
    out += content.slice(at, f.bodyStart) + `{ /* ${f.hides} lines folded: expand_code("${name}", "${f.name}") */ }`;
    at = f.bodyEnd;
  }
  return out + content.slice(at);
}

function skeletonSection(name, content) {
  const sk = skeletonOf(name, content);
  if (!sk) return `<section name="${name}" kind="code" shown="whole (it doesn't parse, so it can't be folded)">\n${content}\n</section>`;
  return `<section name="${name}" kind="code" lines="${lines(content).length}" chars="${content.length}" shown="folded">
(Long function bodies are folded away to save room; each fold says how to unfold it with expand_code. Folded text isn't in the section as shown: to edit inside a fold, unfold it first and edit what you see there.)
${sk}
</section>`;
}

// ---------- what a view shows, and its tools ----------

export function renderSections(approach, sections) {
  return Object.entries(sections).map(([name, content]) => {
    if (approach !== 'full' && folded(name, content)) return approach === 'outline' ? outlineSection(name, content) : skeletonSection(name, content);
    return `<section name="${name}"${CODE.has(name) ? ' kind="code"' : ''}>\n${content}\n</section>`;
  }).join('\n\n');
}

const schema = (properties, required) => ({ type: 'object', properties, required });

export function navTools(approach) {
  if (approach === 'outline') return [
    { name: 'read_section', description: 'Read lines of one of your soma sections, as it is now, numbered (the numbers and │ are not part of the text). Up to 400 lines at a time.',
      input_schema: schema({ section: { type: 'string' }, from: { type: 'number', description: 'first line (default 1)' }, to: { type: 'number', description: 'last line (default from + 399)' } }, ['section']) },
    { name: 'search_sections', description: 'Find lines in your soma sections, as they are now, that match a JavaScript regular expression (case-insensitive). Shows each match with its line number and a line either side.',
      input_schema: schema({ pattern: { type: 'string' }, section: { type: 'string', description: 'just this section (default: all)' } }, ['pattern']) },
  ];
  if (approach === 'skeleton') return [
    { name: 'expand_code', description: 'Unfold a folded function in one of your code sections: its whole text, exactly as it is now, ready to edit with edit_section.',
      input_schema: schema({ section: { type: 'string' }, name: { type: 'string', description: 'the name the fold gives' } }, ['section', 'name']) },
  ];
  return [];
}

export function runNav(approach, tool, input, sections) {
  const cap = (s) => (s.length > RESULT_CHARS ? `${s.slice(0, RESULT_CHARS)}\n… (cut off: ask for less)` : s);
  if (tool === 'read_section') {
    const c = sections[input.section];
    if (c == null) return { error: `no section ${input.section}; there are ${Object.keys(sections).join(', ')}` };
    const ls = lines(c), from = Math.max(1, Math.floor(input.from ?? 1)), to = Math.min(ls.length, Math.floor(input.to ?? from + 399), from + 399);
    return cap(`${input.section}, lines ${from}–${to} of ${ls.length}:\n${numbered(ls.slice(from - 1, to), from)}`);
  }
  if (tool === 'search_sections') {
    let re;
    try { re = new RegExp(input.pattern, 'i'); } catch (err) { return { error: `bad pattern: ${err.message}` }; }
    const hits = [];
    for (const [name, c] of Object.entries(sections)) {
      if (input.section && name !== input.section) continue;
      const ls = lines(c);
      ls.forEach((l, i) => { if (re.test(l)) hits.push(`${name}:\n${numbered(ls.slice(Math.max(0, i - 1), i + 2), Math.max(1, i))}`); });
    }
    return cap(hits.length ? `${hits.length} matching lines${hits.length > 60 ? ' (the first 60)' : ''}:\n${hits.slice(0, 60).join('\n--\n')}` : 'no matches');
  }
  if (tool === 'expand_code') {
    const c = sections[input.section];
    if (c == null) return { error: `no section ${input.section}` };
    const fns = foldable(c);
    if (!fns) return { error: `${input.section} doesn't parse right now, so it can't be unfolded; read the fault and fix what you last changed` };
    const f = fns.find((x) => x.name === input.name) ?? fns.find((x) => x.name.endsWith(`.${input.name}`) || x.name.split('@')[0] === input.name);
    if (!f) return { error: `no function ${input.name} in ${input.section}; folds name: ${fns.filter((x) => x.hides > FOLD_LINES).map((x) => x.name).slice(0, 40).join(', ')}` };
    return cap(`${input.section}, ${f.name} (line ${f.line}), exactly as it is now:\n${c.slice(f.start, f.end)}`);
  }
  return { error: `no tool ${tool}` };
}
