// Naming and flavor. Display only: nothing here ever affects power.
import { ELEMENTS, region, type Spirit } from '@truenames/universe';
import { TUNABLES } from '@truenames/authority';

export const ELEMENT_NAMES = ELEMENTS;

export const ELEMENT_COLOR = ['#ff7a3d', '#a8e6ff', '#b99cff', '#c9a878', '#3fc4d0', '#9a6ad6', '#ffe89a', '#9fca5a'];
export const ELEMENT_GLYPH = ['🜂', '❄', '🜁', '🜃', '🜄', '☾', '☉', '☠'];

// [element][aspect]
export const ASPECTS: string[][] = [
  ['inferno', 'cinderfrost', 'lightning', 'magma', 'steam', 'hellfire', 'sunfire', 'ash'],
  ['frostburn', 'glacier', 'blizzard', 'permafrost', 'ice-floe', 'black ice', 'aurora', 'winterkill'],
  ['wildfire', 'hail', 'tempest', 'sandstorm', 'squall', 'thunderdark', 'skyfire', 'miasma'],
  ['obsidian', 'tundra', 'landslide', 'bedrock', 'reef', 'cavern', 'crystal', 'fossil'],
  ['geyser', 'floe', 'maelstrom', 'coral', 'the deep', 'undertow', 'moonwater', 'bog'],
  ['smoke', 'nightfrost', 'stormshade', 'tomb', 'abyss', 'void', 'twilight', 'plague'],
  ['dawn', 'prism', 'thunderglow', 'gold', 'pearl', 'eclipse', 'radiance', 'foxfire'],
  ['cinderblight', 'rime-rot', 'pestilence', 'grave', 'brackish', 'carrion', 'gloam', 'decay'],
];

const TRAD_ADJ: string[][] = [
  ['Ashen', 'Ember', 'Cinder', 'Kindled', 'Scorched', 'Smoldering', 'Blazing', 'Molten'],
  ['Rimed', 'Hoar', 'Pale', 'Frozen', 'Glacial', 'Silent', 'Wintering', 'White'],
  ['Thundering', 'Howling', 'Riven', 'Wild', 'Charged', 'Roaring', 'Gale-born', 'Grey'],
  ['Granite', 'Deep', 'Graven', 'Iron', 'Hollow', 'Unmoving', 'Buried', 'Carved'],
  ['Drowned', 'Salt', 'Tidal', 'Brine', 'Sunken', 'Pearl', 'Ebbing', 'Deepwater'],
  ['Veiled', 'Nameless', 'Hollow-eyed', 'Umbral', 'Hidden', 'Dusk', 'Whispering', 'Starless'],
  ['Gilded', 'Radiant', 'Dawn', 'Shining', 'Crowned', 'Burnished', 'Clear', 'Morning'],
  ['Blighted', 'Mouldering', 'Carrion', 'Withered', 'Festering', 'Fungal', 'Weeping', 'Grave'],
];
const TRAD_NOUN = ['Choir', 'Forge-Mothers', 'Court', 'Circle', 'Kin', 'Host', 'Litany', 'Covenant'];

export function traditionName(aspect: number, tradition: number): string {
  return `the ${TRAD_ADJ[aspect]![tradition >> 3]} ${TRAD_NOUN[tradition & 7]}`;
}

/** Human-readable address of a cell or region prefix. */
export function addressOf(cell: string): string {
  const r = region(cell);
  const parts: string[] = [];
  if (r.element !== undefined) parts.push(ELEMENT_NAMES[r.element]!);
  if (r.aspect !== undefined) parts.push(ASPECTS[r.element!]![r.aspect]!);
  if (cell.length >= 4) parts.push(traditionName(r.aspect!, r.tradition!));
  else if (cell.length === 3) parts.push(`${TRAD_ADJ[r.aspect!]![Number(cell[2])]} houses`);
  return parts.join(' / ') || 'the whole astral';
}

export const FORMS = [
  { id: 0, name: 'bolt', verb: 'hurls a bolt', desc: 'a projectile that strikes the first foe' },
  { id: 1, name: 'ring', verb: 'rings out', desc: 'a burst around you, striking all near' },
  { id: 2, name: 'ward', verb: 'wards you', desc: 'a shield that drinks harm' },
  { id: 3, name: 'lance', verb: 'lances', desc: 'a line that pierces every foe' },
  { id: 4, name: 'nova', verb: 'gathers a nova', desc: 'a delayed blast where you aim' },
  { id: 5, name: 'summon', verb: 'sends a servant', desc: 'an ally that fights beside you' },
  { id: 6, name: 'hex', verb: 'hexes', desc: 'a curse that eats a foe over time' },
  { id: 7, name: 'blink', verb: 'carries you', desc: 'a step through the astral' },
];

export const TEMPERS = ['fickle', 'proud', 'wrathful', 'sullen', 'jealous', 'capricious', 'stern', 'hungry'];

const MAG_TITLES = ['wisp', 'spirit', 'power', 'dominion', 'god', 'great god', 'elder god', 'primordial'];
export function magnitudeTitle(m: number): string {
  return MAG_TITLES[Math.min(m, MAG_TITLES.length - 1)]!;
}

export function weightWord(idx: number): string {
  return ['feather-light', 'light', 'light', 'easy', 'easy', 'even', 'even', 'even', 'weighty', 'weighty', 'heavy', 'heavy', 'heavy', 'grave', 'crushing', 'crushing'][idx]!;
}
export function generosityWord(idx: number): string {
  return ['miserly', 'miserly', 'stingy', 'stingy', 'sparing', 'sparing', 'measured', 'measured', 'fair', 'fair', 'open-handed', 'open-handed', 'generous', 'generous', 'lavish', 'lavish'][idx]!;
}

// Spirit epithets from flavor bits. Syllables tinted by element.
const ONSETS = [
  ['K', 'Z', 'Br', 'Vr', 'Ign', 'Sar', 'Esh', 'Pyr'],
  ['S', 'Vi', 'Hr', 'Is', 'Nev', 'Sk', 'Fr', 'El'],
  ['Th', 'Vol', 'Kr', 'Ar', 'Zh', 'Ul', 'Tor', 'Ras'],
  ['Gr', 'Dur', 'Mog', 'Bal', 'Og', 'Kh', 'Tul', 'Ur'],
  ['Mer', 'Nai', 'Ol', 'Wa', 'Lir', 'Qu', 'Sel', 'Aa'],
  ['N', 'Mor', 'Ves', 'Umb', 'Xa', 'Nyx', 'Sha', 'Ob'],
  ['Al', 'Sol', 'Lu', 'Ae', 'Cel', 'Ra', 'Hel', 'Ori'],
  ['Gh', 'Mul', 'Rot', 'Bl', 'Sp', 'Fu', 'Wr', 'Ny'],
];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'ae', 'ei', 'ou', 'y', 'ia', 'ua', 'oe', 'ai', 'ea', 'io', 'au'];
const CODAS = ['', 'r', 'th', 'n', 'l', 's', 'x', 'm', 'sh', 'k', 'rn', 'nd', 'z', 'v', 'lth', 'q'];
const MIDS = ['v', 'l', 'r', 'n', 'm', 'z', 'th', 'sh', 'k', 'd', 'g', 'b', 'ss', 'rr', 'ch', 'y'];

export function spiritName(s: Spirit): string {
  let f = s.traits.flavor;
  const take = (n: number) => {
    const v = Number(f & BigInt(n - 1));
    f >>= BigInt(Math.log2(n));
    return v;
  };
  const syll = 2 + take(2);
  let name = ONSETS[s.element]![take(8)]! + NUCLEI[take(16)]!;
  for (let i = 1; i < syll; i++) name += MIDS[take(16)]! + NUCLEI[take(16)]!;
  name += CODAS[take(16)]!;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function spiritTitle(s: Spirit): string {
  return `${spiritName(s)}, ${magnitudeTitle(s.magnitude)} of ${ASPECTS[s.element]![s.aspect]}`;
}

/** The "sound" of your own name for a spirit: cosmetic runes from the nonce. */
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
export function nameRunes(nonce: string, n = 7): string {
  let x = BigInt(nonce);
  let s = '';
  for (let i = 0; i < n; i++) {
    s += RUNES[Number(x % 24n)];
    x = x / 24n + BigInt(i * 7919);
  }
  return s;
}

export function spiritStatsLine(s: Spirit): string {
  const t = s.traits;
  return `${FORMS[t.form]!.name} · ${weightWord(t.weightIdx)} · ${generosityWord(t.generosityIdx)} · ${TEMPERS[t.temperIdx]}`;
}

export function expectedSeconds(bits: number, rate: number): number {
  return rate > 0 ? 2 ** bits / rate : Infinity;
}

export function fmtDuration(s: number): string {
  if (!isFinite(s)) return '—';
  if (s < 1) return 'moments';
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${(s / 3600).toFixed(1)}h`;
  return `${Math.round(s / 86400)}d`;
}

export const HEARTH_GOD = '011010';

export const TICK_MS = TUNABLES.TICK_MS;

/** The ancient layer: every spirit at depth 6 (full scan, see journal). Charted since before scholars. */
export const ANCIENTS = [
  '005420', '011010', '027345', '033121', '050465', '076656', '110062', '111553', '136143', '162033', '171163', '226140',
  '233244', '242411', '253312', '303562', '305652', '371744', '375267', '427477', '431411', '446507', '473750', '507114',
  '547533', '567171', '570476', '600212', '615043', '651063', '677662', '701422', '742340', '755517', '757057',
];

/** The mightiest ancients (magnitude >= 2), whom Wardens call upon. */
export const WARDEN_WELLS = ['011010', '567171', '570476', '615043', '651063'];

/** The in-world unit of a name's truth (internally: difficulty bits). Never say "bits" to the player. */
export function truths(n: number): string {
  return `${n} ${n === 1 ? 'truth' : 'truths'}`;
}
