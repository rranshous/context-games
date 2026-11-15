// Made: what the people at this keyboard contributed to the ludant, kept so they can show
// it. A game here is written by AI models, and AI-made work generally isn't protected by
// copyright; what a person contributed may be (what they asked for, chose, threw out, wrote
// and drew). So each of those is noted as it happens, with what the ludant changed after,
// and marked: a fingerprint of it, signed by this device, goes to the server, which keeps
// it with the time (never the words: they stay here, sealed with the ludant's other
// surfaces). "How I made this" (history) saves it all as a page, each entry with its mark.
//
// Not a surface the ludant sees: it has no actions, and isn't in its world.
//   entry { at, who, kind, text, then?: [sections], image?, imageHash?, mark?: { hash, at } }
//   (a drawing's fingerprint covers its picture's own, so it stays checkable once the
//   picture itself has dropped off)
//   kind: asked (said in the chat), picked (from choices), drew (the whiteboard, as passed),
//         wrote (a section, by hand), kept (a version, labelled), restored (went back to one)

import { api } from '../ui.js';
import { sign } from '../identity.js';
import { markText } from '../marks.js';

const KEEP = 1000;          // entries kept (the oldest drop off)
const MAX_TEXT = 8000;      // characters of one entry
const PICTURES = 12;        // drawings kept as pictures; older ones keep their mark, not the picture

/** SHA-256 of text, in hex. */
export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class Made {
  id = 'made';

  constructor(frame) {
    this.frame = frame;
    this.entries = [];
    const bus = frame.bus, mine = (who) => who === frame.seat;
    bus.on('chat.posted', (e) => { if (mine(e.who)) this.add('asked', e.who, e.text); }, 'made');
    // A pick is said in the chat too, just before: it's the pick, not something asked.
    bus.on('choices.picked', (e) => {
      if (!mine(e.who)) return;
      const last = this.entries.at(-1);
      if (last?.kind === 'asked' && last.text.endsWith(`(for "${e.question}")`)) this.entries.pop();
      this.add('picked', e.who, `${e.question} → ${e.index >= 0 ? e.choice : 'none of these'}`);
    }, 'made');
    bus.on('whiteboard.turn', (e) => { if (mine(e.from)) this.drew(e); }, 'made');
    bus.on('frame.restored', (e) => { if (mine(e.who)) this.add('restored', e.who, `went back to version #${e.n}${e.label ? ` ("${e.label}")` : ''}`); }, 'made');
  }

  /** A section changed (sandbox.js, once the new soma is here). By a person here, by hand,
   *  it's theirs; by the ludant, it goes with the last thing a person here did. */
  sectionChanged(section, by, soma) {
    if (by === this.frame.seat) { this.add('wrote', by, `${section}:\n${soma.sections?.[section] ?? ''}`); return; }
    const last = this.entries.at(-1);
    if (last && last.kind !== 'wrote' && !last.then?.includes(section)) { (last.then ??= []).push(section); this.frame.changed(); }
  }

  load(saved) { this.entries = Array.isArray(saved?.entries) ? saved.entries : []; }
  toJSON() { return { entries: this.entries }; }

  /** Note something a person here did, and mark it. */
  add(kind, who, text, extra = {}) {
    const entry = { at: Date.now(), who, kind, text: String(text).slice(0, MAX_TEXT), ...extra };
    this.entries.push(entry);
    if (this.entries.length > KEEP) this.entries.splice(0, this.entries.length - KEEP);
    this.frame.changed();
    this.mark(entry);
    return entry;
  }

  /** The board, as it was passed: the drawing is the contribution. */
  async drew(e) {
    const image = e.image ?? this.frame.whiteboard.picture();
    this.add('drew', e.from, e.note ? `passed the board: ${e.note}` : 'passed the board', { image, imageHash: await sha256(image) });
    let pictures = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].image && ++pictures > PICTURES) delete this.entries[i].image;
  }

  /** What an entry's fingerprint is over: everything that says what was done, by whom, when. */
  static fingerprinted(ludant, e) {
    return JSON.stringify({ ludant, at: e.at, who: e.who, kind: e.kind, text: e.text, ...(e.imageHash ? { imageHash: e.imageHash } : {}) });
  }

  async mark(entry) {
    try {
      const ludant = this.frame.recordId;
      const hash = await sha256(Made.fingerprinted(ludant, entry));
      const signature = await sign(markText(ludant, hash));
      entry.mark = await api('POST', 'marks', { ludant, hash, signature });
      this.frame.changed();
    } catch {}   // unmarked (offline, or not signed in): it's still noted, just without proof of when
  }

  /** "How I made this": everything noted here, as a page of its own to keep. Each entry
   *  shows its mark (when gactant recorded it, and a link to check it), and the page can
   *  check its own fingerprints, so it can be shown to anyone. */
  page() {
    const f = this.frame, ludant = f.recordId, soma = f.actant?.soma ?? {};
    const title = soma.sections?.title || f.actant?.name || 'a game';
    const from = f.record?.lineage?.from;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const when = (at) => new Date(at).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const KIND = { asked: 'asked for', picked: 'picked', drew: 'drew', wrote: 'wrote by hand', kept: 'kept a version', restored: 'went back' };
    const people = [...new Set(this.entries.map((e) => e.who))];
    const rows = this.entries.map((e, i) => `
      <li class="entry" data-i="${i}">
        <div class="meta"><span class="kind ${e.kind}">${esc(KIND[e.kind] ?? e.kind)}</span> <strong>${esc(e.who)}</strong> · ${esc(when(e.at))}</div>
        <pre>${esc(e.text)}</pre>
        ${e.image ? `<img src="${e.image}" alt="what ${esc(e.who)} drew">` : e.imageHash ? '<p class="note">(the picture itself is no longer kept; its fingerprint is)</p>' : ''}
        ${e.then?.length ? `<p class="then">then ${esc(f.actant?.name ?? 'the game')} changed: ${e.then.map(esc).join(', ')}</p>` : ''}
        ${e.mark ? `<details><summary>the exact text fingerprinted</summary><pre>${esc(Made.fingerprinted(ludant, e))}</pre></details>` : ''}
        <p class="mark">${e.mark
          ? `marked by gactant ${esc(when(e.mark.at))} · <a href="${location.origin}/mark.html?h=${e.mark.hash}">check this mark</a> · <span class="check" data-hash="${e.mark.hash}">…</span>`
          : 'not marked (it was noted while offline, or before a device was set up)'}</p>
      </li>`).join('');
    const proofs = this.entries.map((e) => ({ text: Made.fingerprinted(ludant, e), image: e.image ?? null, imageHash: e.imageHash ?? null }));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How I made ${esc(title)}</title>
<style>
:root { --bg: #fbfaf7; --ink: #1d1c1a; --ink-2: #5b5852; --line: #e3dfd6; --accent: #9a5b12; --ok: #2f7a45; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171c; --ink: #e8e4da; --ink-2: #9da1ab; --line: #2c303a; --accent: #e8a33d; --ok: #5fc983; --bad: #f07167; } }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-left)) 64px; }
h1 { font-size: 30px; margin: 0 0 6px; text-wrap: balance; }
.lead, .note, .then, .mark, .meta { color: var(--ink-2); }
ol { list-style: none; padding: 0; margin: 28px 0 0; display: flex; flex-direction: column; gap: 14px; }
.entry { border-top: 1px solid var(--line); padding-top: 12px; }
.kind { font: 600 11px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
pre { white-space: pre-wrap; word-break: break-word; font: 14px/1.5 ui-monospace, monospace; margin: 8px 0; max-height: 360px; overflow: auto; }
img { max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.then, .mark, .note { font-size: 13px; margin: 4px 0; }
a { color: var(--accent); }
.check.ok { color: var(--ok); } .check.bad { color: var(--bad); }
</style></head><body><main>
<h1>How I made ${esc(title)}</h1>
<p class="lead">${esc(f.actant?.name ?? '')}, a game on gactant (<a href="${location.origin}/frame.html?l=${esc(ludant)}">${esc(location.host)}</a>)${from ? `, based on ${esc(from.name)}${from.by ? ` by ${esc(from.by)}` : ''}` : ''}. What ${people.length ? people.map(esc).join(', ') : 'its people'} contributed: what they asked for, picked, drew, wrote, kept and threw out, ${this.entries.length} things in all, from ${this.entries.length ? esc(when(this.entries[0].at)) : '—'} to ${this.entries.length ? esc(when(this.entries.at(-1).at)) : '—'}. Saved ${esc(when(Date.now()))}.</p>
<p class="note">The game itself was written by AI models, as these people played and asked for changes. Each thing here was marked as it happened: its fingerprint (SHA-256), signed by the device of the person who did it, was recorded by gactant with the time. gactant never saw the words; they're only here. This page checks each fingerprint against its words as it opens, and "check this mark" shows what gactant recorded.</p>
<ol>${rows}</ol>
<script type="application/json" id="proofs">${JSON.stringify(proofs).replace(/</g, '\\u003c')}</script>
<script>
(async () => {
  const proofs = JSON.parse(document.getElementById('proofs').textContent);
  const hex = async (t) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))), (b) => b.toString(16).padStart(2, '0')).join('');
  for (const li of document.querySelectorAll('.entry')) {
    const span = li.querySelector('.check');
    if (!span) continue;
    const p = proofs[Number(li.dataset.i)];
    try {
      const ok = (await hex(p.text)) === span.dataset.hash && (!p.image || (await hex(p.image)) === p.imageHash);
      span.textContent = ok ? 'matches its words' : 'does NOT match its words';
      span.className = 'check ' + (ok ? 'ok' : 'bad');
    } catch { span.textContent = 'open in a browser to check'; }
  }
})();
</script>
</main></body></html>`;
  }

  /** Save the page. */
  save() {
    const name = (this.frame.actant?.name ?? 'ludant').replace(/[^\w-]+/g, '-');
    const url = URL.createObjectURL(new Blob([this.page()], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `how-i-made-${name}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
