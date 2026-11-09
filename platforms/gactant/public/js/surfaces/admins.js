// Admins: a ludant telling the people who run gactant about a problem with its world (the
// frame, the table, a tool that doesn't do what it says), when it's stuck and the trouble
// isn't its own to fix. Its person sees the report and decides: nothing goes unless they
// send it. With it goes what we'd need to look into it: the soma as it is now, its rules
// drafts, the matches it's following, and the last of what it did (its tool calls and
// faults, never the chat: what's said there stays sealed). tools/issues.mjs reads them.
//
// actions (as an actor)
//   report({ title, trying, wrong, tried }) -> { sent, id? } | { sent: false, why }
//       waits for the person here to send it or not

import { api, el } from '../ui.js';

const WAIT_MS = 10 * 60 * 1000;   // a report nobody answers is dropped
const DOINGS = 120;               // of the inspector's latest notes
const TALK = /^(say|read_chat)\b/;   // their notes carry what's said in the chat

export class Admins {
  id = 'admins';

  constructor(frame) {
    this.frame = frame;
    this.asking = null;
  }

  describe() { return null; }   // the innate tool says what it's for

  actions(who) {
    return { report: (o) => this.report(who, o) };
  }

  async report(who, o = {}) {
    const text = (k, max) => String(o[k] ?? '').trim().slice(0, max);
    const issue = { title: text('title', 120), trying: text('trying', 2000), wrong: text('wrong', 4000), tried: text('tried', 2000) };
    if (!issue.title || !issue.wrong) throw new Error('a report needs a title and what went wrong');
    if (this.asking) throw new Error('a report is already waiting for an answer');
    const person = this.frame.seat;
    const sent = await new Promise((resolve) => {
      const timer = setTimeout(() => done(null), WAIT_MS);
      const done = (v) => { clearTimeout(timer); this.asking = null; box.remove(); resolve(v); };
      const section = (label, body) => body ? [el('p', { class: 'issue-label' }, label), el('p', { class: 'issue-text' }, body)] : [];
      const send = el('button', { class: 'top-btn primary', onclick: async () => {
        send.disabled = true;
        try { done(await this.send(who, issue)); }
        catch (err) { send.disabled = false; said.textContent = `couldn't send it: ${err.message}`; }
      } }, 'send it');
      const said = el('p', { class: 'ask-fail' });
      const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box issue-box' },
        el('p', {}, el('strong', {}, `${who} wants to tell gactant's admins about a problem. `), 'Nothing is sent unless you send it.'),
        el('p', { class: 'issue-title' }, issue.title),
        ...section('What it was trying to do', issue.trying),
        ...section('What went wrong', issue.wrong),
        ...section('What it tried', issue.tried),
        el('p', { class: 'issue-with' }, `Sent with it, so the admins can look into it: ${who}'s soma as it is now (its game, code and memory), its rules drafts, the matches it's following, and the last things it did (its tool calls and errors). Never the chat.`),
        send, el('button', { class: 'top-btn', onclick: () => done(false) }, 'don\'t send'), said));
      this.asking = box;
      document.body.append(box);
    });
    if (sent === null) return { sent: false, why: `${person} didn't answer, so it wasn't sent` };
    if (sent === false) return { sent: false, why: `${person} chose not to send it` };
    return { sent: true, id: sent, note: 'gactant\'s admins have it. They may not answer in this sitting; carry on as best you can.' };
  }

  /** The report, with what the admins need to look into it. */
  async send(who, issue) {
    const f = this.frame;
    const drafts = await api('GET', 'drafts').catch(() => []);
    const withSource = await Promise.all((Array.isArray(drafts) ? drafts : []).slice(0, 10).map((d) => api('GET', `drafts/${d.id}`).catch(() => d)));
    const matches = [...f.table.seen].map(([id, s]) => ({ id, rulebook: s.rulebook, name: s.name, n: s.n, you: s.you, over: Boolean(s.result), following: f.table.watching.has(id) }));
    const doings = f.inspector.doings.filter((d) => d.kind !== 'wake' && d.kind !== 'thought' && !(d.kind === 'did' && TALK.test(d.text)))
      .slice(-DOINGS).map((d) => ({ at: new Date(d.at).toISOString(), kind: d.kind, text: d.text }));
    const { id } = await api('POST', `ludants/${f.recordId}/issue`, {
      token: f.token, by: f.seat, ...issue, soma: f.actant.soma, table: { drafts: withSource, matches }, doings,
    });
    return id;
  }
}
