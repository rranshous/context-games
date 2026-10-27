// Art: pictures made for the ludant by an image model, through OpenRouter, on whoever
// pays for its thinking. They're kept with the ludant on the server (a publication carries
// them, and so do copies), and the game draws them: stage.image(name) in the sandbox.
//
// actions (as an actor)
//   make({ name, prompt, style?, transparent = true, reference?, quality?, size? }) -> { name, width, height, image }
//       a sprite, a background, anything. transparent: painted on a key color the frame
//       cuts away, then trimmed. reference: 'stage', an art name, or a list of them, as
//       pictures to match. quality: 'fast' (about 3¢, a few seconds) or 'best' (about 7¢).
//       size: the longest side in pixels (sprites 256, others 640, unless said).
//   concept({ name?, style, prompt? }) -> { name, image }   the game as it is on the stage
//       now, reimagined in a style: for showing people what it could look like
//   look(name) -> { text, image }     list() -> [{ name, w, h, prompt, by, at }]     remove(name)
// events
//   art.painting { who, name }   art.made { who, name, w, h }   art.removed { who, name }

import { api, el } from '../ui.js';

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KEY_NEAR = 60, KEY_FAR = 115;   // distance from the key color: gone, then fully kept

const dataToBytes = (url) => {
  const [head, b64] = url.split(',');
  return { type: head.match(/data:([^;]+)/)?.[1] ?? 'image/png', bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer };
};
const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('the picture could not be read'));
  img.src = url;
});

export class Art {
  id = 'art';

  constructor(frame) {
    this.frame = frame;
    this.assets = new Map();     // name -> { name, w, h, prompt, by, at, image }
    this.painting = new Map();   // job -> name, while an image is being made
    this.jobs = 0;
  }

  describe() {
    return `art: pictures made for you by an image model (sprites cut out on transparency, backgrounds, anything), kept with you, and drawn in your game with stage.image(name). Actions: make({ name, prompt, style, transparent (default true), reference ('stage', an art name, or a list), quality ('fast' about 3¢ / 'best' about 7¢), size }), concept({ name, style, prompt }) (your game as it is now, reimagined: good for showing people options), look(name), list(), remove(name). Each picture is painted fresh: the painter remembers nothing between pictures, so "the same three people" means nothing to it unless you pass the earlier picture as reference (and describe them again). Each picture costs money like thinking does, on the same meter.`;
  }

  state() {
    const names = [...this.assets.keys()];
    return `art: ${names.length ? `you have ${names.length}: ${names.slice(0, 24).join(', ')}${names.length > 24 ? ', …' : ''}` : 'you have none yet'}.`;
  }

  actions(who) {
    return {
      make: (o) => this.make(who, o),
      concept: (o) => this.concept(who, o),
      look: (name) => this.look(name),
      list: () => this.list(),
      remove: (name) => this.remove(who, name),
    };
  }

  /** The art kept for this ludant, fetched when the frame starts. */
  async fetch() {
    const list = await api('GET', `ludants/${this.frame.recordId}/assets`).catch(() => []);
    this.assets = new Map(list.map((a) => [a.name, a]));
  }

  /** The art, as the sandbox takes it: bytes it can turn into pictures. */
  forSandbox() { return [...this.assets.values()].map((a) => ({ name: a.name, ...dataToBytes(a.image) })); }

  list() { return [...this.assets.values()].map(({ image, ...meta }) => meta); }

  look(name) {
    const a = this.assets.get(name);
    if (!a) throw new Error(`no art named ${name}`);
    return { text: `${name}: ${a.w}×${a.h}, made from "${a.prompt}"`, image: a.image };
  }

  /** Pictures to match: the stage now, or art by name. { names, images } */
  references(reference) {
    const names = (reference == null ? [] : Array.isArray(reference) ? reference : [reference]).slice(0, 3).map(String);
    const images = names.map((r) => {
      if (r === 'stage') return this.frame.stage.look().image;
      const a = this.assets.get(r);
      if (!a) throw new Error(`no art named ${r} to use as a reference`);
      return a.image;
    });
    return { names, images };
  }

  /** A prompt that leans on an earlier picture the painter won't see. Said once, as it
   *  happens, so the ludant learns it now rather than from a mismatched set. */
  memoryNote(prompt, refs) {
    if (refs.names.length || !/\b(same|again|before|earlier|previous|as (in|before)|like the (first|last|other))\b/i.test(prompt)) return '';
    const earlier = [...this.assets.keys()].slice(-3);
    return ` Note: the painter didn't see any earlier picture: it remembers nothing between pictures. To keep something the same, pass it as reference${earlier.length ? ` (e.g. reference: '${earlier.at(-1)}')` : ''} and describe it again.`;
  }

  async make(who, { name, prompt, style = '', transparent = true, reference = null, quality = 'fast', size } = {}) {
    if (!NAME.test(String(name ?? ''))) throw new Error('art needs a name: lowercase words joined by -, like "boat" or "sky-night"');
    if (!String(prompt ?? '').trim()) throw new Error('art needs a prompt: what to paint');
    const refs = this.references(reference);
    const words = [
      refs.names.length ? `Attached: ${refs.names.map((n, i) => `picture ${i + 1} is ${n === 'stage' ? 'the game as it is now' : `"${n}"`}`).join('; ')}.` : '',
      String(prompt).trim(),
      style ? `Style: ${style}.` : '',
      transparent
        ? 'This is a single picture for a game: one subject, centered, the whole of it in view and nothing cut off. Paint it on a perfectly flat, solid magenta (#FF00FF) background and nothing else: no ground, no shadow, no frame, no text, no other objects.'
        : '',
      refs.names.length ? 'Match the attached pictures: keep the same characters, things and style unless asked otherwise.' : '',
    ].filter(Boolean).join('\n');
    const out = await this.paint(who, { name, words, refs: refs.images, transparent, quality, size: size ?? (transparent ? 256 : 640), prompt: String(prompt).trim() });
    return { ...out, text: out.text + this.memoryNote(String(prompt), refs) };
  }

  async concept(who, { name, style, prompt = '' } = {}) {
    if (!String(style ?? '').trim()) throw new Error('a concept needs a style: what it could look like');
    name ??= `concept-${String(style).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || this.jobs + 1}`;
    if (!NAME.test(name)) throw new Error(`concept names are lowercase words joined by -: ${name}`);
    const words = `This is a screenshot of a game. Reimagine this same game, with the same layout, the same things in it and the same moment, as ${style}.${prompt ? ` ${prompt}` : ''} Keep it a 16:9 game screen with its score and words where they are.`;
    return this.paint(who, { name, words, refs: this.references('stage').images, transparent: false, quality: 'fast', size: 640, prompt: `concept: ${style}${prompt ? `; ${prompt}` : ''}` });
  }

  async paint(who, { name, words, refs, transparent, quality, size, prompt }) {
    const job = ++this.jobs;
    this.painting.set(job, name);
    this.frame.bus.emit('art.painting', { who, name });
    this.frame.inspector.note('did', `painting "${name}": ${prompt}`);
    this.frame.chat.showLife();
    try {
      const { url } = await this.frame.imagine({ prompt: words, images: refs, quality });
      const { image, w, h } = await this.finish(url, { transparent, size });
      const meta = await api('POST', `ludants/${this.frame.recordId}/assets`, { token: this.frame.token, name, image, w, h, prompt, by: who });
      this.assets.set(name, { ...meta, image });
      const { type, bytes } = dataToBytes(image);
      this.frame.sandbox.sendWith?.([bytes], 'asset', name, bytes, type);
      this.frame.bus.emit('art.made', { who, name, w, h });
      this.frame.inspector.note('changed', `${who} made art "${name}" (${w}×${h}${transparent ? ', cut out' : ''})`);
      this.frame.inspector.artChanged?.();
      return { name, width: w, height: h, image, text: `Made "${name}", ${w}×${h}${transparent ? ' with a transparent background' : ''}. Draw it in your game with stage.image('${name}') (null until it has loaded).` };
    } finally {
      this.painting.delete(job);
      this.frame.chat.showLife();
    }
  }

  /** Cut the key color away (if asked), trim, and scale to size. */
  async finish(url, { transparent, size }) {
    const img = await loadImage(url);
    let c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    let g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    if (transparent) c = keyOut(c);
    const scale = Math.min(1, size / Math.max(c.width, c.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(c.width * scale)); out.height = Math.max(1, Math.round(c.height * scale));
    g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, out.width, out.height);
    return { image: transparent ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.86), w: out.width, h: out.height };
  }

  remove(who, name) {
    if (!this.assets.has(name)) throw new Error(`no art named ${name}`);
    this.assets.delete(name);
    api('POST', `ludants/${this.frame.recordId}/unasset`, { token: this.frame.token, name }).catch(() => {});
    this.frame.sandbox.send('assetGone', name);
    this.frame.bus.emit('art.removed', { who, name });
    this.frame.inspector.artChanged?.();
    return { removed: name };
  }

  /** A gallery, for the inspector. */
  gallery() {
    const items = [...this.assets.values()];
    if (!items.length) return el('p', { class: 'insp-empty' }, 'No art yet. A ludant makes it with its art surface; it\'s kept with the ludant.');
    return el('div', { class: 'art-grid' }, ...items.map((a) => el('figure', { class: 'art-item' },
      el('img', { src: a.image, alt: a.name }),
      el('figcaption', {}, el('strong', {}, a.name), ` ${a.w}×${a.h}`, el('span', {}, a.prompt)))));
  }
}

/** Make the background transparent: its color is whatever the border mostly is (models
 *  never paint the asked-for magenta exactly), and pixels near it fade out, with the
 *  key's tint taken back out of the edges. Then trim to what's left. */
function keyOut(c) {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, w, h), p = d.data;
  const rs = [], gs = [], bs = [];
  const sample = (x, y) => { const i = (y * w + x) * 4; rs.push(p[i]); gs.push(p[i + 1]); bs.push(p[i + 2]); };
  for (let x = 0; x < w; x += 3) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += 3) { sample(0, y); sample(w - 1, y); }
  const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
  const kr = med(rs), kg = med(gs), kb = med(bs);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = Math.hypot(p[i] - kr, p[i + 1] - kg, p[i + 2] - kb);
      const a = Math.max(0, Math.min(1, (dist - KEY_NEAR) / (KEY_FAR - KEY_NEAR)));
      if (a < 1 && a > 0.02) {
        // Take the key's share back out of the color.
        for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, (p[i + k] - [kr, kg, kb][k] * (1 - a)) / a));
      }
      p[i + 3] = Math.round(p[i + 3] * a);
      if (p[i + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  g.putImageData(d, 0, 0);
  if (maxX < 0) return c;   // nothing left: give back what there was
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const t = document.createElement('canvas');
  t.width = maxX - minX + 1; t.height = maxY - minY + 1;
  t.getContext('2d').drawImage(c, minX, minY, t.width, t.height, 0, 0, t.width, t.height);
  return t;
}
