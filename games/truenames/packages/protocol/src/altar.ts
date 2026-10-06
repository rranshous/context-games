// What passes between a sanctum and an altar (a gathering place: a choir, its talk, shared signs, round calls,
// and in development the issue inbox). Sealed in transit (packages/channel). The altar relays; it decides nothing.

/** What a sanctum tells its altars about itself, every few seconds. Counts only: no secrets, no cells. */
export interface ChoirPresence {
  hum: number; // utterances per second
  words: number; // grasped words held
  beings: number; // beings known
  truest: number; // truths of the truest word
  actant: 'none' | 'asleep' | 'waiting' | 'thinking'; // whether a mind tends this sanctum
}
export interface ChoirMember extends ChoirPresence { aura: string; handle: string; element: number; since: number }
export interface Speaker { aura: string; handle: string }

export type AltarClientMsg =
  | { t: 'join'; aura: string; handle: string; element: number }
  | { t: 'presence'; presence: ChoirPresence }
  | { t: 'say'; text: string }
  | { t: 'share'; cell: string; note?: string } // a being's sign, for the choir
  | { t: 'call'; world: string; level: number; dungeon: string; closesIn: number } // a shared round is gathering at that dungeon (its shareable address)
  | { t: 'issue'; from: string; text: string; where?: string }; // development: something seems broken (needs no join)

export type AltarServerMsg =
  | { t: 'roster'; name: string; members: ChoirMember[] }
  | { t: 'said'; from: Speaker; text: string; at: number }
  | { t: 'shared'; from: Speaker; cell: string; note?: string; at: number }
  | { t: 'called'; from: Speaker; world: string; level: number; dungeon: string; closesIn: number; at: number }
  | { t: 'error'; message: string };
