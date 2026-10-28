// Draw the pictures the game ships with: the rivals' units and the bases. Only draws
// what's missing, so it's safe to run again after adding a unit.
//
//   node tools/draw.mjs [--again picket]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS, RIVAL_UNITS } from '../public/js/levels.js';
import { artPrompt } from '../public/js/aid.js';

const HERE = join(import.meta.dirname, '..');
const key = readFileSync(join(HERE, '.env'), 'utf8').match(/OPENROUTER_API_KEY=(.*)/)[1].trim().replace(/^["']|["']$/g, '');
const again = process.argv.includes('--again') ? process.argv[process.argv.indexOf('--again') + 1] : null;
const BASE = 'Building art for a real-time strategy game: a headquarters, seen in a three-quarter view from above, the whole building in view, centered, on a plain flat pure white background, with no shadow, no ground, no text and no frame. Painterly, with a strong, readable silhouette.';

// The ground of each map, seen from straight above, and the boulders that stand on it.
const GROUND = 'A seamless painted texture of open ground for a real-time strategy game battlefield, seen from straight above, filling the whole image edge to edge, evenly lit, with gentle variation and no strong features: no rocks, no paths, no water, no buildings, no plants taller than grass, no shadows, no text. Muted and slightly dark, so units stand out on it.';
const GROUNDS = {
  outskirts: 'Dry dusty plain: packed brown earth, pale dry grass in thin patches, small pebbles.',
  ford: 'Damp river-thicket ground: dark mud and moss, low tangled green weeds, wet patches.',
  gunline: 'Scorched battlefield earth: grey-brown ash and dirt, small old shell scars, scattered spent shells.',
  warren: 'Dark loose soil riddled with small burrow holes, thin pale roots and scraps of chitin.',
  crown: 'Iron-grey stony ground: gravel and flat slabs, rust-red stains and dark grit.',
};
const ROCK = 'Terrain art for a real-time strategy game: one low, wide boulder seen in a three-quarter view from above, the whole rock in view and centered, on a plain flat pure white background, with no shadow, no ground and no text. Painterly, weathered, with a strong readable silhouette.';
const ROCKS = ['A rounded grey granite boulder with lichen.', 'A cracked flat-topped slab of dark basalt.', 'A cluster of three weathered sandstone rocks.'];

const jobs = [
  ...LEVELS.map((l) => ({ out: `ground/${l.id}.jpg`, prompt: `${GROUND} ${GROUNDS[l.id]}`, ratio: '16:9' })),
  ...ROCKS.map((look, i) => ({ out: `rocks/${i + 1}.jpg`, prompt: `${ROCK} ${look}` })),
  ...Object.values(RIVAL_UNITS).map((u) => ({ out: `rivals/${u.key}.jpg`, prompt: artPrompt(u.look, u.spec.size, u.aid) })),
  { out: 'bases/hollis.jpg', prompt: `${BASE} A living headquarters grown, not built: a great domed hive of green flesh and chitin, with glowing birthing vats in its sides, sitting firmly on a broad low mound of dark soil and flesh that it has grown up out of, its thick roots running flat along the ground at its foot, nothing hanging below it.` },
  { out: 'bases/brackett.jpg', prompt: `${BASE} A machine-shop headquarters, built, not grown: a squat riveted steel factory with smokestacks, a big rolling bay door, cranes and amber work lamps.` },
  { out: 'bases/rival.jpg', prompt: `${BASE} A grim fortified stronghold of dark iron and stone, half fortress and half nest, with a red banner and a spiked wall around it.` },
];

mkdirSync(join(HERE, 'public/img/rivals'), { recursive: true });
mkdirSync(join(HERE, 'public/img/bases'), { recursive: true });
mkdirSync(join(HERE, 'public/img/ground'), { recursive: true });
mkdirSync(join(HERE, 'public/img/rocks'), { recursive: true });
await Promise.all(jobs.map(async ({ out, prompt, ratio }) => {
  const path = join(HERE, 'public/img', out);
  if (existsSync(path) && !(again && out.includes(again))) return;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-3.1-flash-lite-image', modalities: ['image', 'text'], ...(ratio ? { image_config: { aspect_ratio: ratio } } : {}), messages: [{ role: 'user', content: prompt }] }),
  }).then((r) => r.json());
  const url = res.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return console.log(out, 'no picture:', res.error?.message);
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out, `$${res.usage?.cost?.toFixed(3)}`, url.slice(5, 15));
}));
