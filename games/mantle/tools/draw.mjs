// Draw the pictures the game ships with: the rivals' units and the bases. Only draws
// what's missing, so it's safe to run again after adding a unit.
//
//   node tools/draw.mjs [--again picket]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RIVAL_UNITS } from '../public/js/levels.js';
import { artPrompt } from '../public/js/aid.js';

const HERE = join(import.meta.dirname, '..');
const key = readFileSync(join(HERE, '.env'), 'utf8').match(/OPENROUTER_API_KEY=(.*)/)[1].trim().replace(/^["']|["']$/g, '');
const again = process.argv.includes('--again') ? process.argv[process.argv.indexOf('--again') + 1] : null;
const BASE = 'Building art for a real-time strategy game: a headquarters, seen in a three-quarter view from above, the whole building in view, centered, on a plain flat pure white background, with no shadow, no ground, no text and no frame. Painterly, with a strong, readable silhouette.';

const jobs = [
  ...Object.values(RIVAL_UNITS).map((u) => ({ out: `rivals/${u.key}.jpg`, prompt: artPrompt(u.look, u.spec.size, u.aid) })),
  { out: 'bases/hollis.jpg', prompt: `${BASE} A living headquarters grown, not built: a great domed hive of green flesh and chitin, with glowing birthing vats in its sides and roots spreading from its base.` },
  { out: 'bases/brackett.jpg', prompt: `${BASE} A machine-shop headquarters, built, not grown: a squat riveted steel factory with smokestacks, a big rolling bay door, cranes and amber work lamps.` },
  { out: 'bases/rival.jpg', prompt: `${BASE} A grim fortified stronghold of dark iron and stone, half fortress and half nest, with a red banner and a spiked wall around it.` },
];

mkdirSync(join(HERE, 'public/img/rivals'), { recursive: true });
mkdirSync(join(HERE, 'public/img/bases'), { recursive: true });
await Promise.all(jobs.map(async ({ out, prompt }) => {
  const path = join(HERE, 'public/img', out);
  if (existsSync(path) && !(again && out.includes(again))) return;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-3.1-flash-lite-image', modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }),
  }).then((r) => r.json());
  const url = res.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return console.log(out, 'no picture:', res.error?.message);
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out, `$${res.usage?.cost?.toFixed(3)}`, url.slice(5, 15));
}));
