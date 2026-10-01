// Grasped words on the hearth for the two test auras, ground once with the golden vectors (a wisp's bar is
// 22 truths: minutes on every core, so tests read these instead of grinding).
import vectors from '../../universe/test/vectors.json' with { type: 'json' };

export const HEARTH_NONCE = BigInt(vectors.words[0]!.nonce); // for the secret 1, 2, 3 … 32
export const HEARTH_NONCE_2 = BigInt(vectors.words[1]!.nonce); // for the secret 200, 199 … 169
