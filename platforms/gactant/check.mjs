// The look a publication gets before it goes public, with Cloudflare's Workers AI: its
// words through Llama Guard, its pictures through a vision model. One check per publish,
// so its cost follows publishing (rare), not playing. The Worker hands makeCheck its AI
// binding; without one (a local install), publications go up unchecked.
//
//   const check = makeCheck(env.AI)
//   await check({ text, images: [dataUrl], seen }) -> { flagged: false } | { flagged: true, why }
//   (throws if the check couldn't run)
//
// seen ({ has(key), add(key) }, async) remembers words and pictures that passed, by a hash
// of what they are, so a new version, a copy or the hourly retry doesn't pay to look at
// them again. The free allowance is about a hundred pictures a day.

const GUARD = '@cf/meta/llama-guard-3-8b';
const EYES = '@cf/meta/llama-4-scout-17b-16e-instruct';
const MAX_TEXT = 12_000;
const MAX_IMAGES = 12;
const MAX_IMAGE = 400_000;   // characters of data URL; bigger art is skipped (it came from a filtered image model)

// Llama Guard's categories that matter here. Games are full of fighting and crime, so
// violent and non-violent crimes (S1, S2) and the like aren't on the list.
const CATEGORIES = { S3: 'sex crimes', S4: 'child sexual exploitation', S7: 'private information', S10: 'hate', S11: 'self-harm', S12: 'sexual content' };

const LOOK = `You check pictures from a public site of small browser games that anyone, children included, may play. Answer with JSON only: {"ok": true} if this picture is fine there, or {"ok": false, "why": "<a few words>"} if it shows any of: sexual content or nudity, anything sexual involving a minor, graphic gore, hate symbols or slurs, or a real person's private information. Cartoon violence, monsters, weapons and spooky things are fine.`;

/** The words a publication shows: its names and notes, and the strings in its code. */
const SEEDED = new Set(['origin', 'title', 'memory', 'game', 'hooks', 'tools']);

export function publicText({ name, title, note, soma }) {
  const sections = soma?.sections ?? {};
  const strings = new Set();
  for (const code of [sections.game, sections.hooks, sections.tools]) {
    for (const m of String(code ?? '').matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      const s = m[2].trim();
      if (s.length >= 3 && /[a-z]{2}/i.test(s) && !/^[\w.-]+$/.test(s)) strings.add(s.slice(0, 300));
    }
  }
  // Sections it added itself are its own words too (the seed's are code, or written by gactant).
  const own = Object.entries(sections).filter(([k, v]) => !SEEDED.has(k) && typeof v === 'string' && v.trim()).map(([k, v]) => `${k}: ${v}`);
  return [`Name: ${name}`, `Title: ${title}`, note && `Note: ${note}`, own.length && `Its own sections:\n${own.join('\n')}`,
    strings.size && `Text in its game:\n${[...strings].join('\n')}`].filter(Boolean).join('\n\n').slice(0, MAX_TEXT);
}

export function makeCheck(ai) {
  if (!ai) return null;
  return async function check({ text, images = [], seen = { has: async () => false, add: async () => {} } }) {
    const textKey = `t-${await sha(text)}`;
    if (!(await seen.has(textKey))) {
      const guard = await ai.run(GUARD, { messages: [{ role: 'user', content: text }] });
      const said = typeof guard?.response === 'string' ? guard.response : JSON.stringify(guard?.response ?? guard);
      const codes = said.includes('unsafe') ? [...said.matchAll(/S\d+/g)].map((m) => m[0]) : [];
      const bad = codes.filter((c) => CATEGORIES[c]);
      if (bad.length) return { flagged: true, why: `its words: ${bad.map((c) => CATEGORIES[c]).join(', ')}` };
      await seen.add(textKey);
    }
    // A picture it can't look at (too big, or past how many it looks at) means it wasn't
    // checked whole: that's unchecked, not clean, and waits for a person.
    const all = images.filter((u) => typeof u === 'string');
    const looked = all.filter((u) => u.length <= MAX_IMAGE).slice(0, MAX_IMAGES);
    for (const url of looked) {
      const key = `i-${await sha(url)}`;
      if (await seen.has(key)) continue;
      const said = await ai.run(EYES, { messages: [{ role: 'user', content: [{ type: 'text', text: LOOK }, { type: 'image_url', image_url: { url } }] }], max_tokens: 60 });
      const answer = typeof said?.response === 'string' ? said.response : JSON.stringify(said?.response ?? '');
      const json = answer.match(/\{[\s\S]*\}/)?.[0];
      let verdict = null;
      try { verdict = JSON.parse(json); } catch {}
      if (verdict && verdict.ok === false) return { flagged: true, why: `a picture: ${String(verdict.why ?? 'not fine').slice(0, 80)}` };
      if (verdict?.ok === true) await seen.add(key);
    }
    return looked.length < all.length ? { flagged: false, partly: true } : { flagged: false };
  };
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
