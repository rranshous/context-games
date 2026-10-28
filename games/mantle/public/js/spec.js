// The contract every unit is held to. Players describe anything, and their aid turns the
// description into a spec in this small, fixed language. The price comes from the spec and
// this formula, never from the aid's judgment, so two units built the same way cost the
// same, whoever designed them.
//
// Stats are ratings, 1 to 10. Size is 1 (tiny) to 5 (huge). Range 1 means it fights up
// close. The ratings are what players see: the match turns them into the simulation's own
// numbers, which never show.

import { AIDS } from './aids.js';

export const STATS = {
  health: { word: 'health', weight: 6, about: 'how much harm it can take' },
  armor: { word: 'armor', weight: 7, about: 'how much of each hit it shrugs off' },
  speed: { word: 'speed', weight: 7, about: 'how fast it moves' },
  damage: { word: 'damage', weight: 8, about: 'how hard each attack hits' },
  rate: { word: 'attack rate', weight: 6, about: 'how often it attacks' },
  range: { word: 'range', weight: 6, about: 'how far away it can hit from (1 is up close)' },
  sight: { word: 'sight', weight: 3, about: 'how far it sees' },
};

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge'];
const SUPPLY = [1, 1, 2, 3, 5];   // what a unit takes of your army's room, by size

// Physics, roughly: bigger bodies hold more and are cheaper to make tough, but cost more to
// make quick. Each step from medium shifts a stat's price by this fraction.
const SIZE_LEAN = { health: -0.12, armor: -0.08, speed: 0.15, sight: -0.05 };

export const MAX_ABILITIES = 3;
const ALL_ROUND = ['health', 'armor', 'damage', 'rate', 'range'];

/** A spec, checked against the contract and the aid's own limits. Returns the problems, if any. */
export function check(spec, aidId) {
  const aid = AIDS[aidId], problems = [];
  if (!spec || typeof spec !== 'object') return ['no spec'];
  if (!Number.isInteger(spec.size) || spec.size < 1 || spec.size > 5) problems.push('size must be a whole number from 1 (tiny) to 5 (huge)');
  for (const s of Object.keys(STATS)) {
    const r = spec.stats?.[s];
    if (!Number.isInteger(r) || r < 1 || r > 10) problems.push(`${s} must be a whole number from 1 to 10`);
  }
  const abilities = spec.abilities ?? [];
  if (!Array.isArray(abilities)) problems.push('abilities must be a list');
  else {
    if (abilities.length > MAX_ABILITIES) problems.push(`at most ${MAX_ABILITIES} abilities`);
    if (new Set(abilities).size !== abilities.length) problems.push('an ability is listed twice');
    for (const a of abilities) if (!aid.abilities[a]) problems.push(`${a} is not something ${aid.name}'s lab can make (it can make: ${Object.keys(aid.abilities).join(', ')})`);
  }
  for (const rule of aid.rules ?? []) { const p = rule(spec); if (p) problems.push(p); }
  return problems;
}

/** What a checked spec costs to make, the room it takes, and how long the lab needs for it. */
export function price(spec, aidId) {
  const aid = AIDS[aidId], lean = spec.size - 3;
  const lines = [];
  let total = 10 * spec.size;
  lines.push({ what: `${SIZES[spec.size - 1]} body`, cost: 10 * spec.size });
  for (const [s, { weight }] of Object.entries(STATS)) {
    // Rises faster than the rating: piling everything into one stat gets expensive.
    const cost = weight * spec.stats[s] ** 1.4 * (1 + (SIZE_LEAN[s] ?? 0) * lean) * (aid.lean[s] ?? 1);
    lines.push({ what: STATS[s].word, cost });
    total += cost;
  }
  for (const a of spec.abilities ?? []) {
    const cost = aid.abilities[a].cost * (0.7 + 0.15 * spec.size);
    lines.push({ what: aid.abilities[a].word, cost });
    total += cost;
  }
  // Strength in a fight multiplies (tough, and hard-hitting, and long-reaching) where the
  // price above only adds, so a unit strong all round pays again for being so.
  const allRound = ALL_ROUND.reduce((n, s) => n + spec.stats[s], 0) / ALL_ROUND.length;
  if (allRound > 5) {
    const cost = total * ((allRound / 5) ** 1.5 - 1);
    lines.push({ what: 'strong all round', cost });
    total += cost;
  }
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
  // The more there is to it, the longer it takes to grow or build.
  const seconds = round5(8 + total * 0.06 + (spec.abilities?.length ?? 0) * 5);
  return { cost: round5(total), supply: SUPPLY[spec.size - 1], seconds, lines: lines.map((l) => ({ ...l, cost: Math.round(l.cost) })) };
}

/** The spec language, as the aid is taught it. */
export function specLanguage(aidId) {
  const aid = AIDS[aidId];
  return `A unit's spec:
- size: 1 to 5 (${SIZES.map((w, i) => `${i + 1} ${w}`).join(', ')}). Bigger bodies are cheaper to make tough and dearer to make fast, and take more room in an army (${SUPPLY.join(', ')}).
- stats, each a whole number from 1 to 10:
${Object.entries(STATS).map(([s, { about }]) => `  - ${s}: ${about}`).join('\n')}
- abilities: up to ${MAX_ABILITIES}, from what your lab can make:
${Object.entries(aid.abilities).map(([a, { about }]) => `  - ${a}: ${about}`).join('\n')}
${aid.rules?.length ? `- your lab's limits: ${aid.ruleText}\n` : ''}
Price: every rating costs more than the one before it, so a unit that is great at everything is very dear, and one great at one thing and plain at the rest is a bargain. On top of that, a unit whose health, armor, damage, attack rate and range average above 5 pays extra for being strong all round, and more the higher they go: specialists don't. ${aid.leanText} The price, the room it takes and the time to make it are worked out from the spec, the same for everyone: you can't set them, only see them.`;
}
