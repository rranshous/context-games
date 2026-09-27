// Hover help. One shared tooltip; every explanation lives in HELP so the words stay consistent.
// In-world language only: truths, strain, wells, divisions. Never bits, hashes or pixels.

export const HELP = {
  // --- core ideas ---
  truths: `<b>Truths</b> measure how truly you know a spirit's name. Meditation finds truer names; <em>each truth requires twice as much meditation to unveil as the last</em>. A name holding ${'12'} truths is <em>learned</em> and can be spoken.`,
  learned: `A name is <b>learned</b> once it holds 12 truths. Only learned names can be bound and spoken in the dark.`,
  nextTruth: `Roughly how long until meditation finds the next truth for this name, at your current hum and this name's share of your meditation. It's a lottery with a slope: sometimes much sooner, sometimes later.`,
  runes: `The sound of <b>your</b> name for this spirit. A name is never the same in two mouths: no one else can speak yours, though someone could find it for you.`,
  meditate: `<b>Meditate</b>: set your voices to searching for a truer name for this spirit. Meditation continues everywhere: in the sanctum, in the dark, until you close the page.`,
  focus: `<b>Focus</b>: this meditation receives four times the share of your voices.`,
  bind: `<b>Bind</b> this name to a slot so you can speak it in the dark.`,
  capacity: `<b>Capacity</b>: how much strain your aura can bear before spirits answer with backlash. It deepens with every name you hold truly (above 12 truths).`,
  hum: `<b>The hum</b>: how many utterances your voices make each second, across all meditation and scrying. Every utterance is real; nothing is imagined.`,
  voices: `<b>Voices</b>: how many voices chant at once. Fewer voices make a quieter mind, leaving more of you for everything else.`,
  descent: `<b>Descent</b>: how deep you walk. Deeper dark has more foes, harder foes, and shamans with truer names. Surviving a descent opens the next.`,
  walk: `Leave the sanctum and <b>walk into the dark</b>: five waves, shrines to wake, and a Warden at the end.`,
  aura: `Your <b>aura</b>: the mark every spirit knows you by. Every name you learn is bound to it.`,
  element: `Your chosen <b>element</b>. It only suggests where to look first; any spirit can be known by anyone.`,
  mute: `Sound on/off (also the M key).`,
  home: `Return to the title.`,

  // --- spirits ---
  magnitude: `<b>Magnitude</b>: how mighty the spirit is. Each step is half as common. Mightier spirits have deeper wells that refill faster.`,
  address: `Where the spirit dwells: <em>element / aspect / tradition</em>, then its exact division.`,
  form: `<b>Form</b>: the shape its power takes when spoken: bolt, ring, ward, lance, nova, summon, hex or blink.`,
  weight: `<b>Weight</b>: how heavily speaking it strains your aura. Truer names weigh less.`,
  generosity: `<b>Generosity</b>: how much it will give in a single evocation. Stingy spirits give little each time, however well you know them.`,
  temper: `<b>Temper</b>: its character: how it answers when you overreach.`,
  card: `Open this spirit's card.`,

  // --- scrying ---
  scryRegion: `Choose where to search. The astral divides eightfold: <em>element</em>, then <em>aspect</em>, then <em>tradition</em>, then deeper divisions where spirits dwell.`,
  depth: `<b>Depth</b>: how many divisions deep to search. Spirits dwell at depth 6 and below. Shallow layers are small and soon exhausted; each deeper layer is eight times larger and spirits there are rarer.`,
  divisions: `How many divisions lie in this layer of the region, how rare a spirit is in each, and how many spirits you should expect to find in the whole layer.`,
  scanned: `How much of this layer you have already searched, how often a spirit should answer at your current hum, and how long the rest would take.`,
  scry: `Begin searching this region and depth. Each division is examined once; what you've searched is remembered.`,
  chart: `The chart: every element and aspect, how much of each depth you've searched, and the spirits you know there.`,
  task: `A search under way. The bar is how much of the layer is done.`,
  stop: `Stop this search. Progress is kept.`,
  found: `A spirit that answered your search. Meditate on it to learn its name.`,

  // --- loadout / walks ---
  slot: `A <b>slot</b>: a name you carry into the dark. Left and right click speak the first two slots; keys 1 and 2 speak the other two. Drag a learned name here from the Name Book, or click a slot and then <em>bind</em> a name.`,
  unbind: `Remove this name from the slot.`,
  walks: `Your past walks into the dark, deepest first: the descent, how far you got, and what you banished and found.`,
  advice: `A suggestion for what to do next.`,

  // --- the dark (run HUD) ---
  life: `<b>Life</b>. The faint bar beneath is your <b>ward</b>, which absorbs harm first and slowly fades.`,
  strain: `<b>Strain</b>: every evocation tires your aura, and strain ebbs over time. Each point of strain you carry costs a truth at the moment you speak, so spamming weakens every word. Past the white mark (your <em>capacity</em>), spirits answer with <b>backlash</b>.`,
  hudSlot: `A bound name. Top right: how true your last evocation rang (after strain and crowding). The bar beneath is the spirit's <b>well</b>: its power, shared with everyone who knows it. It refills over time.`,
  rivals: `Rivals: enemy casters drawing from this same well. The truer name drinks deeper, and crowding thins what you get.`,
  wave: `Waves remaining, foes banished and remaining, and spirits the shrines found on this walk.`,
  humRun: `Your meditation keeps working while you fight. Names that grow truer take effect immediately.`,
  warden: `The <b>Warden</b>: it speaks the name of a mighty ancient spirit and calls down novas where you stand. Watch for the red circle.`,
} as const;

let tip: HTMLDivElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let current: Element | null = null;

function ensure(): HTMLDivElement {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    document.body.appendChild(tip);
  }
  return tip;
}

function place(x: number, y: number) {
  const t = ensure();
  const pad = 14;
  const r = t.getBoundingClientRect();
  let left = x + pad, top = y + pad;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}

/** Show a tooltip at a screen point (used by the canvas HUD). */
export function showTip(html: string, x: number, y: number) {
  const t = ensure();
  if (t.innerHTML !== html) t.innerHTML = html;
  t.classList.add('on');
  place(x, y);
}

export function hideTip() {
  tip?.classList.remove('on');
}

function resolve(el: Element): string | null {
  const key = el.getAttribute('data-tip');
  if (!key) return null;
  if (key.startsWith('=')) return key.slice(1); // literal text
  return (HELP as Record<string, string>)[key] ?? null;
}

/** Hover help for any element with data-tip="key" (a HELP key) or data-tip="=literal html". */
export function installTooltips() {
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest?.('[data-tip]');
    if (el === current) return;
    current = el;
    if (showTimer) clearTimeout(showTimer);
    if (!el) { hideTip(); return; }
    const html = resolve(el);
    if (!html) { hideTip(); return; }
    const { clientX, clientY } = e;
    showTimer = setTimeout(() => showTip(html, clientX, clientY), 280);
  });
  document.addEventListener('pointermove', (e) => {
    if (tip?.classList.contains('on') && current) place(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', () => { if (showTimer) clearTimeout(showTimer); hideTip(); current = null; });
}
