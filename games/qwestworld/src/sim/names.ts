// names.ts — syllable-based fantasy names

import { Rng, pick } from './rng.js';

const PLACE_START = ['Ash', 'Bar', 'Cor', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Isk', 'Kel', 'Lor', 'Mar', 'Nor', 'Os', 'Pell', 'Quen', 'Rav', 'Sel', 'Thorn', 'Ul', 'Var', 'Wen', 'Yr', 'Zan', 'Brak', 'Cald', 'Dre', 'Gris', 'Hol', 'Mor'];
const PLACE_END = ['ford', 'hold', 'mere', 'wick', 'stead', 'gate', 'vale', 'mouth', 'crag', 'haven', 'moor', 'fell', 'by', 'ton', 'dun', 'march', 'reach', 'wall', 'barrow', 'holm'];

const PERSON_START = ['Al', 'Bran', 'Cas', 'Dor', 'Ed', 'Fal', 'Gar', 'Hal', 'Ior', 'Jor', 'Ka', 'Leo', 'Mal', 'Ne', 'Os', 'Per', 'Ros', 'Sig', 'Tor', 'Ul', 'Val', 'Wyn', 'Ys', 'Ber', 'Cyn', 'Dag', 'Mer', 'Ro',
  'Aed', 'Bel', 'Cor', 'Del', 'El', 'Fen', 'Gwen', 'Hes', 'Ith', 'Lan', 'Mor', 'Nym', 'Or', 'Quin', 'Ren', 'Sel', 'Tam', 'Vor', 'Wil', 'Yor', 'Zan', 'Ash', 'Bryn', 'Cael'];
const PERSON_MID = ['a', 'e', 'i', 'o', 'an', 'el', 'or', 'is', 'ar'];
const PERSON_END = ['dric', 'wen', 'mund', 'ric', 'ra', 'thas', 'vin', 'bert', 'rin', 'da', 'ya', 'gar', 'wald', 'is', 'on', 'eth', 'wyn', 'hild', 'ard', 'mir',
  'leth', 'wine', 'stan', 'gild', 'fric', 'nor', 'mar', 'dis', 'ric', 'weth', 'lyn', 'dor', 'bald', 'sa', 'na', 'ven', 'thel', 'gard'];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** "Caswyn" → "Caswyn II"; "Caswyn II" → "Caswyn III". */
export function regnal(name: string): string {
  const m = name.match(/^(.*) ([IVX]+)$/);
  if (!m) return `${name} II`;
  const k = ROMAN.indexOf(m[2]);
  return `${m[1]} ${ROMAN[k + 1] ?? `${k + 1}`}`;
}

const REALM_PATTERNS = ['Kingdom of {}', '{} Realm', 'Crown of {}', 'Principality of {}'];

export class NameGen {
  used = new Set<string>();
  constructor(private rng: Rng) {}

  private unique(make: () => string): string {
    for (let i = 0; i < 50; i++) {
      const n = make();
      if (!this.used.has(n)) {
        this.used.add(n);
        return n;
      }
    }
    // The pool is exhausted for this shape: a numeral, as if named for an ancestor
    const base = make();
    for (let k = 2; ; k++) {
      const n = `${base} ${ROMAN[k] ?? k}`;
      if (!this.used.has(n)) { this.used.add(n); return n; }
    }
  }

  place(): string {
    return this.unique(() => {
      const s = pick(this.rng, PLACE_START), e = pick(this.rng, PLACE_END);
      return s + e;
    });
  }

  person(): string {
    return this.unique(() => pick(this.rng, PERSON_START) + (this.rng() < 0.3 ? pick(this.rng, PERSON_MID) : '') + pick(this.rng, PERSON_END));
  }

  realm(root: string): string {
    return pick(this.rng, REALM_PATTERNS).replace('{}', root);
  }
}
