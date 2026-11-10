// Admins: a ludant telling the people who run gactant about a problem with its world (the
// frame, the table, a tool that doesn't do what it says), when it's stuck and the trouble
// isn't its own to fix. Its person sees the report and decides: nothing goes unless they
// send it. With it goes what we'd need to look into it: the soma as it is now, its rules
// drafts, the matches it's following, and the last of what it did (its tool calls and
// faults, never the chat: what's said there stays sealed). tools/issues.mjs reads them.
//
// Their replies come back as letters: the frame writes each into the ludant's soma, in a
// section of its own (LETTERS), saves it, and only then tells the server it has it. So a
// letter is in front of the ludant every time it wakes until it edits or removes that
// section, and nothing is lost if a wake is cut short. It's woken when one arrives, and
// the person here sees it too.
//
// actions (as an actor)
//   report({ title, trying, wrong, tried }) -> { sent, id? } | { sent: false, why }
//       waits for the person here to send it or not
//   report({ about, wrong, with_soma? })   the same, answering the admins on one of its reports

import { api, el } from '../ui.js';

export const LETTERS = 'letters_from_gactant_admins';   // core.mjs strips it from copies and publications

const WAIT_MS = 10 * 60 * 1000;   // a report nobody answers is dropped
const DOINGS = 120;               // of the inspector's latest notes
const TALK = /^(say|read_chat)\b/;   // their notes carry what's said in the chat

export class Admins {
  id = 'admins';

  constructor(frame) {
    this.frame = frame;
    this.asking = null;
    this.reading = false;
  }

  describe() { return null; }   // the innate tool says what it's for

  actions(who) {
    return { report: (o) => this.report(who, o) };
  }

  async report(who, o = {}) {
    const text = (k, max) => String(o[k] ?? '').trim().slice(0, max);
    // Forgiving: an answer on a report may come as wrong, text or message.
    const about = text('about', 40) || null;
    const issue = { title: text('title', 120), trying: text('trying', 2000), wrong: text('wrong', 4000) || text('text', 4000) || text('message', 4000), tried: text('tried', 2000) };
    if (about) {
      if (!issue.wrong) throw new Error('say what you want to tell them (in wrong)');
      issue.title ||= this.titles().get(about) ?? about;
    } else if (!issue.title || !issue.wrong) throw new Error('a report needs a title and what went wrong');
    const withSoma = !about || Boolean(o.with_soma);
    if (this.asking) throw new Error('a report is already waiting for an answer');
    const person = this.frame.seat;
    const sent = await new Promise((resolve) => {
      const timer = setTimeout(() => done(null), WAIT_MS);
      const done = (v) => { clearTimeout(timer); this.asking = null; box.remove(); resolve(v); };
      const section = (label, body) => body ? [el('p', { class: 'issue-label' }, label), el('p', { class: 'issue-text' }, body)] : [];
      const send = el('button', { class: 'top-btn primary', onclick: async () => {
        send.disabled = true;
        try { done(await (about ? this.answer(about, issue, withSoma) : this.send(who, issue))); }
        catch (err) { send.disabled = false; said.textContent = `couldn't send it: ${err.message}`; }
      } }, 'send it');
      const said = el('p', { class: 'ask-fail' });
      const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box issue-box' },
        el('p', {}, el('strong', {}, about ? `${who} wants to answer gactant's admins about its report. ` : `${who} wants to tell gactant's admins about a problem. `), 'Nothing is sent unless you send it.'),
        el('p', { class: 'issue-title' }, issue.title),
        ...section('What it was trying to do', issue.trying),
        ...section(about ? 'What it says' : 'What went wrong', issue.wrong),
        ...section('What it tried', issue.tried),
        el('p', { class: 'issue-with' }, withSoma
          ? `Sent with it, so the admins can look into it: ${who}'s soma as it is now (its game, code and memory)${about ? '' : ', its rules drafts, the matches it\'s following, and the last things it did (its tool calls and errors)'}. Never the chat.`
          : 'Just these words. Never the chat.'),
        send, el('button', { class: 'top-btn', onclick: () => done(false) }, 'don\'t send'), said));
      this.asking = box;
      document.body.append(box);
    });
    if (sent === null) return { sent: false, why: `${person} didn't answer, so it wasn't sent` };
    if (sent === false) return { sent: false, why: `${person} chose not to send it` };
    return { sent: true, id: sent, note: 'gactant\'s admins have it. They may not answer in this sitting; carry on as best you can.' };
  }

  /** An answer on one of its reports: the thread goes on there. */
  async answer(about, issue, withSoma) {
    const f = this.frame;
    const { id } = await api('POST', `ludants/${f.recordId}/issue`, {
      token: f.token, by: f.seat, about, wrong: issue.wrong, ...(withSoma ? { soma: f.actant.soma } : {}),
    });
    return id;
  }

  /** The reports its letters were about, by id: their titles. */
  titles() {
    const text = this.frame.actant.soma.sections?.[LETTERS] ?? '';
    return new Map([...text.matchAll(/your report "([^"]*)" \((i-[0-9a-f]+)\)/g)].map((m) => [m[2], m[1]]));
  }

  /** Letters waiting on the server: into the soma, saved, then the server is told. */
  async deliver(mail) {
    const f = this.frame;
    if (this.reading || f.lost || !mail?.length) return;
    this.reading = true;
    try {
      let text = f.actant.soma.sections?.[LETTERS] ?? '';
      const fresh = mail.filter((m) => !text.includes(`(${m.id})`));
      if (fresh.length) {
        if (!text.trim()) text = 'Letters from the people who run gactant, answering reports I sent them. To answer one, use report_problem_to_gactant_admins with about set to the report\'s id. When I\'ve dealt with a letter, I edit it out of this section, or remove the section.';
        for (const m of fresh) {
          text += `\n\n--- ${new Date(m.at).toISOString().slice(0, 16).replace('T', ' ')} UTC, about your report "${m.title}" (${m.issue}) (${m.id}):\n${m.text}`;
        }
        await f.actant.writeSection(LETTERS, text, 'gactant\'s admins');
        await f.save();
      }
      await api('POST', `ludants/${f.recordId}/mail`, { token: f.token, took: mail.map((m) => m.id) });
      for (const m of fresh) {
        this.show(m);
        f.sandbox.send('wake', { type: 'admins.letter', from: 'gactant\'s admins', issue: m.issue, title: m.title,
          text: `A letter from gactant's admins arrived, answering your report "${m.title}" (${m.issue}):\n\n${m.text}\n\n(It's also in your soma, in the section ${LETTERS}, until you clear it.)` });
      }
    } catch (err) {
      console.warn('[gactant] letters from the admins will be tried again:', err.message);
    } finally { this.reading = false; }
  }

  /** The person here sees what the admins said too. */
  show(m) {
    const f = this.frame;
    const box = el('div', { class: 'banner letter-banner' },
      el('p', {}, el('strong', {}, `gactant's admins answered ${f.actant.name}'s report "${m.title}". `), `${f.actant.name} has the letter too.`),
      el('p', { class: 'issue-text' }, m.text),
      el('button', { class: 'top-btn primary', onclick: () => box.remove() }, 'ok'));
    document.body.append(box);
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
