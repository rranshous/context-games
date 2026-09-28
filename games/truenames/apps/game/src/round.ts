// The game side of the threshold. A round knows nothing of the sanctum: it issues a context,
// receives proofs bound to it, and reports what happened. Swap this for a remote host later.
import type { ZkNameClaim } from '@truenames/proofs';

/** Issued by the game when a journey is requested. Proofs must be bound to its context. */
export interface RoundTicket {
  context: bigint; // fresh random value: stops proofs being replayed into another round
  level: number; // descent
}

/** What the sanctum hands the game: public identity, cosmetics, and zero-knowledge proofs. No secrets. */
export interface Journey {
  ticket: RoundTicket;
  aura: string; // hex public key
  element: number; // cosmetic: the aura's chosen element
  newcomer: boolean; // show the controls hint
  bundle: { slot: number; claim: ZkNameClaim }[];
}

export interface RoundResult {
  level: number;
  won: boolean;
  wave: number; // wave reached (the one you fell in, or the last)
  kills: number;
}

/** How a round talks back to whoever launched it. */
export interface RoundHost {
  report(result: RoundResult): { unlocked: boolean };
  leave(): void;
  toast(html: string, color?: string): void;
}

export function openRound(level: number): RoundTicket {
  const b = new Uint32Array(4);
  crypto.getRandomValues(b);
  let context = 0n;
  for (const x of b) context = (context << 32n) | BigInt(x);
  return { context, level };
}
