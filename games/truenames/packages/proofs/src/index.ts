// Zero-knowledge name claims.
// The sanctum (which knows the secrets) proves "I hold a name of >= s truths on a spirit of
// magnitude >= m, whose trait hash is T and element is e", bound to one journey's context.
// The game verifies that without ever learning the spirit's address or the nonce.
import { groth16 } from 'snarkjs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { auraField, bytesToHex, hexToBytes, decodeTraits, type Cell, type Traits } from '@truenames/universe';

export { MAX_DEPTH } from './gen-circuit.ts';
import { MAX_DEPTH } from './gen-circuit.ts';

/** Public signals, in circuit order: outputs first, then public inputs. */
export interface ZkPublic {
  traitHash: string;
  element: number;
  aura: string; // auraField, decimal
  magnitude: number;
  strength: number;
  context: string;
}

export interface ZkNameClaim {
  spec: 1;
  kind: 'zk-name';
  aura: string; // hex ed25519 public key
  proof: unknown; // groth16 proof object
  publicSignals: string[];
  sig: string; // hex ed25519 signature over zkClaimMessage
}

export interface Artifacts {
  wasm: string | Uint8Array; // URL/path or bytes
  zkey: string | Uint8Array;
}

export function parsePublic(signals: readonly string[]): ZkPublic {
  if (signals.length !== 6) throw new Error('bad public signals');
  const [traitHash, element, aura, magnitude, strength, context] = signals as [string, string, string, string, string, string];
  return { traitHash, element: Number(element), aura, magnitude: Number(magnitude), strength: Number(strength), context };
}

/** Spirit id used by the game for a proven spirit: its trait hash, never its address. */
export const zkSpiritId = (traitHash: string) => `t:${traitHash}`;

export function zkClaimMessage(publicSignals: readonly string[]): Uint8Array {
  return new TextEncoder().encode(`truenames/zkname/v1|${publicSignals.join(',')}`);
}

export interface ProveInput {
  cell: Cell;
  nonce: bigint;
  secretKey: Uint8Array; // the aura's secret key: signs the claim; never enters the proof
  magnitude: number; // may understate (proofs grant, never restrict)
  strength: number; // may understate
  context: bigint; // issued by the game for this journey
}

/** Sanctum side: build the witness, prove, and sign. Runs anywhere snarkjs runs (Node, worker). */
export async function proveName(input: ProveInput, artifacts: Artifacts): Promise<ZkNameClaim> {
  const pub = ed25519.getPublicKey(input.secretKey);
  const digits = [...input.cell].map(Number);
  if (digits.length > MAX_DEPTH) throw new Error(`spirit deeper than ${MAX_DEPTH} cannot be proven yet`);
  while (digits.length < MAX_DEPTH) digits.push(0);
  const witness = {
    digits: digits.map(String),
    depth: String(input.cell.length),
    nonce: input.nonce.toString(),
    aura: auraField(pub).toString(),
    magnitude: String(input.magnitude),
    strength: String(input.strength),
    context: input.context.toString(),
  };
  const { proof, publicSignals } = await groth16.fullProve(witness, artifacts.wasm as any, artifacts.zkey as any);
  const sig = ed25519.sign(zkClaimMessage(publicSignals), input.secretKey);
  return { spec: 1, kind: 'zk-name', aura: bytesToHex(pub), proof, publicSignals, sig: bytesToHex(sig) };
}

export interface VerifiedZkName {
  aura: string;
  spirit: string; // zkSpiritId
  element: number;
  magnitude: number;
  strength: number;
  traits: Traits;
}

/** Game side: verify proof, aura binding, signature and context. Learns no address. */
export async function verifyZkName(
  claim: ZkNameClaim,
  vkey: object,
  expectedContext: bigint,
): Promise<{ ok: true; name: VerifiedZkName } | { ok: false; reason: string }> {
  if (claim.spec !== 1 || claim.kind !== 'zk-name') return { ok: false, reason: 'unknown claim kind' };
  let pub: ZkPublic;
  try {
    pub = parsePublic(claim.publicSignals);
  } catch {
    return { ok: false, reason: 'bad public signals' };
  }
  if (pub.context !== expectedContext.toString()) return { ok: false, reason: 'wrong journey' };
  let aura: Uint8Array;
  try {
    aura = hexToBytes(claim.aura);
  } catch {
    return { ok: false, reason: 'bad aura' };
  }
  if (aura.length !== 32 || auraField(aura).toString() !== pub.aura) return { ok: false, reason: 'proof is for another aura' };
  let sigOk = false;
  try {
    sigOk = ed25519.verify(hexToBytes(claim.sig), zkClaimMessage(claim.publicSignals), aura);
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, reason: 'bad signature' };
  const valid = await groth16.verify(vkey as any, claim.publicSignals, claim.proof as any);
  if (!valid) return { ok: false, reason: 'proof does not verify' };
  return {
    ok: true,
    name: {
      aura: claim.aura,
      spirit: zkSpiritId(pub.traitHash),
      element: pub.element,
      magnitude: pub.magnitude,
      strength: pub.strength,
      traits: decodeTraits(BigInt(pub.traitHash)),
    },
  };
}

