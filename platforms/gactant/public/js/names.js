// Ludant names. Shared by the server and the pages.
//
// A seed gets a random given name (Ornal, Georina, Franton) that no other lineage uses;
// copies keep it. The ludant keeps its game's title in its `title` section. Its name is
// the two together: Georina-Monopoly-Clone. Each published name belongs to exactly one
// snapshot, so publishing again takes a change and a new title: Georina-Monopoly-Speed-Game.

const ONSETS = ['b', 'br', 'd', 'f', 'fr', 'g', 'gr', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'th', 'v', 'w', 'z', 'or', 'el', 'is', 'an', 'ul', 'ev'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'eo', 'ia'];
const MIDDLES = ['n', 'l', 'r', 'rn', 'nt', 'v', 'm', 's', 'th', 'd'];
const ENDS = ['a', 'ina', 'on', 'al', 'ek', 'is', 'o', 'en', 'ar', 'ith', 'ette', 'us', 'el', 'an'];

/** An invented given name: Ornal, Georina, Franton. */
export function randomGiven(rand = Math.random) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  let name = pick(ONSETS) + pick(VOWELS) + pick(MIDDLES) + pick(ENDS);
  name = name.replace(/([aeiou])\1+/g, '$1');
  return name[0].toUpperCase() + name.slice(1);
}

/** "the black abyss!" -> "The-Black-Abyss" */
export function titleSlug(title) {
  return String(title ?? '').trim()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/[\s-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('-')
    .replace(/'/g, '')
    .slice(0, 60);
}

/** A ludant's name right now: its given name, plus its game's title once it has one. */
export function nameOf(soma) {
  const t = titleSlug(soma?.sections?.title);
  return t ? `${soma.given}-${t}` : soma?.given ?? '?';
}

/** How people see a ludant: its game's title as people would write it ("lazy-drive" reads
 *  "Lazy Drive"), and its given name, the one you talk to. Its full name stays what it's
 *  called everywhere it's kept. */
export function titled(t) {
  t = String(t ?? '').trim();
  return /^[a-z0-9]+(-[a-z0-9]+)+$/.test(t) ? t.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : t;
}
export const callName = (soma) => soma?.given ?? nameOf(soma);
