// Types for client.mjs (for TypeScript projects).
export interface Capacity { live: number; verified: number; leased: number }
export interface Poll<O> { done: [number, O][]; cursor: number; remaining: number }

export class Potluck {
  constructor(url: string, opts?: { timeoutMs?: number });
  static connect(url: string, opts?: { timeoutMs?: number }): Promise<Potluck | null>;
  url: string;
  registerTask(name: string, code: string): Promise<string>;
  status(): Promise<unknown>;
  capacity(task: string): Promise<Capacity>;
  submit<I>(task: string, inputs?: I[], leaseMs?: number): Promise<string>;
  add<I>(job: string, inputs: I[]): Promise<number>;
  poll<O>(job: string, cursor?: number): Promise<Poll<O>>;
  cancel(job: string): Promise<unknown>;
  run<I, O>(task: string, inputs: I[]): Promise<O[]>;
}

export interface HybridStats { local: number; farm: number; rerun: number }

export function runHybrid<I, O>(o: {
  inputs: I[];
  local: (input: I) => Promise<O>;
  concurrency: number;
  farm?: Potluck | null;
  task?: string | null;
  pollMs?: number;
  /** How long a farm browser may hold one input before it goes back in the queue (server default 60 s). */
  leaseMs?: number;
  onFarmError?: (e: Error) => void;
}): Promise<{ outputs: O[]; stats: HybridStats }>;
