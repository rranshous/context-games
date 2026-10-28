// Draw the interface's own art: for each aid, the frame of a panel, the plates of buttons,
// a round knob for buttons with only an icon, and a backdrop for their screens. Raw
// drawings land in tools/frames-raw/ (not kept in git); tools/frames.py cuts them out
// into public/img/ui/<aid>/. Only draws what's missing.
//
//   node tools/frames.mjs [--again hollis-panel]  &&  python3 tools/frames.py

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = join(import.meta.dirname, '..');
const RAW = join(HERE, 'tools/frames-raw');
const key = readFileSync(join(HERE, '.env'), 'utf8').match(/OPENROUTER_API_KEY=(.*)/)[1].trim().replace(/^["']|["']$/g, '');
const again = process.argv.includes('--again') ? process.argv[process.argv.indexOf('--again') + 1] : null;
const MODEL = 'google/gemini-3.1-flash-image';   // draws even, square frames; the lite one doesn't

const UI = 'Game interface art for a real-time strategy game, painted with crisp clean edges, seen straight on and perfectly flat, perfectly symmetrical left to right and top to bottom. No text, no letters, no icons, no perspective, no drop shadow.';
const ON_WHITE = 'It sits on a plain flat pure white background, with white all around it.';

const LOOKS = {
  hollis: {
    rim: 'pale bone and glossy dark-green chitin plates bound with dark sinew, grown, not built',
    face: 'very dark green-black',
    glow: 'small glowing green nodules',
    main: 'a translucent membrane of deep green with faintly glowing green veins under it',
    knob: 'a round boss of glossy dark-green chitin ringed with pale bone',
    room: 'the inside of a biologist\'s laboratory where war-beasts are grown: rows of tall glass vats of murky glowing green fluid with dark shapes floating inside, tubes and roots, wet stone floor',
  },
  brackett: {
    rim: 'riveted dark gunmetal steel plating with brass corner brackets and small worn rivets, built, not grown',
    face: 'very dark charcoal-brown',
    glow: 'small amber signal lamps',
    main: 'a plate of worn polished brass, warm and bright, with a fine engraved line around its edge',
    knob: 'a round riveted steel disc ringed with brass',
    room: 'the inside of an engineer\'s workshop where war machines are built: a half-built walking machine on a gantry, chains and cranes, cluttered workbenches, hanging amber work lamps, smoke',
  },
};

const jobs = Object.entries(LOOKS).flatMap(([aid, l]) => [
  { out: `${aid}-panel`, ratio: '1:1', prompt: `${UI} One empty square panel frame. Its border is ${l.rim}, with ${l.glow} at the four corners. The border is the same thickness on all four sides, about one twelfth of the image wide, with straight sides. Inside the border is a plain flat ${l.face} area with no detail at all. ${ON_WHITE}` },
  { out: `${aid}-button`, ratio: '4:1', prompt: `${UI} One wide empty button plate with square-ish corners. Its thin rim is ${l.rim}. Its face is plain flat ${l.face} with no detail, so words can be written on it. ${ON_WHITE}` },
  { out: `${aid}-main`, ratio: '4:1', prompt: `${UI} One wide empty button plate with square-ish corners, the important button of the screen. Its rim is ${l.rim}, with ${l.glow} at each end. Its face is ${l.main}, plain in the middle with no detail, so words can be written on it. ${ON_WHITE}` },
  { out: `${aid}-knob`, ratio: '1:1', prompt: `${UI} One round button seen from straight above: ${l.knob}, with a plain flat ${l.face} center with no detail. ${ON_WHITE}` },
  { out: `${aid}-room`, ratio: '16:9', prompt: `A wide, dim, moody background painting for a game screen: ${l.room}. Dark and low in contrast, softly out of focus, with the brightest things kept small, so that panels laid over it are easy to read. No people, no text.` },
]);

mkdirSync(RAW, { recursive: true });
await Promise.all(jobs.map(async ({ out, ratio, prompt }) => {
  const path = join(RAW, `${out}.png`);
  if (existsSync(path) && !(again && out.includes(again))) return;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, modalities: ['image', 'text'], image_config: { aspect_ratio: ratio }, messages: [{ role: 'user', content: prompt }] }),
  }).then((r) => r.json());
  const url = res.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return console.log(out, 'no picture:', res.error?.message);
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out, `$${res.usage?.cost?.toFixed(3)}`);
}));
