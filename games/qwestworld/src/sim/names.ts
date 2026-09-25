// names.ts — syllable-based fantasy names

import { Rng, pick } from './rng.js';

const PLACE_START = ['Ash', 'Bar', 'Cor', 'Dun', 'El', 'Fen', 'Gal', 'Har', 'Isk', 'Kel', 'Lor', 'Mar', 'Nor', 'Os', 'Pell', 'Quen', 'Rav', 'Sel', 'Thorn', 'Ul', 'Var', 'Wen', 'Yr', 'Zan', 'Brak', 'Cald', 'Dre', 'Gris', 'Hol', 'Mor'];
const PLACE_END = ['ford', 'hold', 'mere', 'wick', 'stead', 'gate', 'vale', 'mouth', 'crag', 'haven', 'moor', 'fell', 'by', 'ton', 'dun', 'march', 'reach', 'wall', 'barrow', 'holm'];

const PERSON_START = ['Al', 'Bran', 'Cas', 'Dor', 'Ed', 'Fal', 'Gar', 'Hal', 'Ior', 'Jor', 'Ka', 'Leo', 'Mal', 'Ne', 'Os', 'Per', 'Ros', 'Sig', 'Tor', 'Ul', 'Val', 'Wyn', 'Ys', 'Ber', 'Cyn', 'Dag', 'Mer', 'Ro'];
const PERSON_END = ['dric', 'wen', 'mund', 'ric', 'ra', 'thas', 'vin', 'bert', 'rin', 'da', 'ya', 'gar', 'wald', 'is', 'on', 'eth', 'wyn', 'hild', 'ard', 'mir'];

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
    const n = make() + ' ' + Math.floor(this.rng() * 90 + 10);
    this.used.add(n);
    return n;
  }

  place(): string {
    return this.unique(() => {
      const s = pick(this.rng, PLACE_START), e = pick(this.rng, PLACE_END);
      return s + e;
    });
  }

  person(): string {
    return this.unique(() => pick(this.rng, PERSON_START) + pick(this.rng, PERSON_END));
  }

  realm(root: string): string {
    return pick(this.rng, REALM_PATTERNS).replace('{}', root);
  }
}
