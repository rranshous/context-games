// Messages between the MeditationPool (main thread) and its workers.
// Bigints travel as decimal strings so structured clone is never a question.

export type WorkChunk =
  | { kind: 'scry'; taskId: string; prefix: string; extra: number; start: string; count: string }
  | { kind: 'name'; taskId: string; cell: string; aura: string /* field element, decimal */; startNonce: string; count: number; facets: number; bests: number[] };

export interface WireSpirit {
  cell: string;
  depth: number;
  magnitude: number;
  element: number;
  aspect: number;
  tradition: number;
  traits: { form: number; formStep: number; weightIdx: number; generosityIdx: number; temperIdx: number; flavor: string };
}

export type WorkerReply =
  | { kind: 'ready'; engine?: 'wasm' | 'bigint' }
  | { kind: 'scried'; taskId: string; start: string; count: string; hits: WireSpirit[]; hashes: number; ms: number }
  | { kind: 'named'; taskId: string; improved: { nonce: string; strength: number; facet: number }[]; count: number; hashes: number; ms: number }
  | { kind: 'error'; message: string; chunk?: WorkChunk };
