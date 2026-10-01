// Admission at the threshold, shared by every world: verify each proven word against the round's
// authority and keep only what the proof revealed (element, might, the facet and its form, traits, truths).
import { spiritStats, type LocalAuthority } from '@truenames/authority';
import { wordBar } from '@truenames/universe';
import { parsePublic, type ZkNameClaim } from '@truenames/proofs';
import type { Traits } from '@truenames/universe';
import { SLOTS } from './balance.ts';
import type { SlotInfo, WireTraits } from './protocol.ts';

export const wireTraits = (t: Traits): WireTraits => ({ ...t, flavor: t.flavor.toString() });

/** An admitted name, as a world uses it. */
export interface AdmittedSlot extends SlotInfo {
  form: number;
  generosity: number;
  lastBits: number | null;
}

export async function admitNames(
  auth: LocalAuthority,
  aura: string,
  bundle: { slot: number; claim: ZkNameClaim }[],
  maxSlots: number = SLOTS.length,
): Promise<{ slots: (AdmittedSlot | null)[]; refused: string[] }> {
  auth.registerAura(aura);
  const slots: (AdmittedSlot | null)[] = Array.from({ length: maxSlots }, () => null);
  const refused: string[] = [];
  const seen = new Set<string>();
  for (const { slot, claim } of bundle) {
    if (!(slot >= 0 && slot < maxSlots) || slots[slot]) { refused.push('no such slot'); continue; }
    if (claim.aura !== aura) { refused.push('a name for another aura'); continue; }
    let pub;
    try { pub = parsePublic(claim.publicSignals); } catch { refused.push('bad public signals'); continue; }
    const word = `${pub.roundTag}#${pub.facet}`;
    if (seen.has(word)) { refused.push('the same word twice'); continue; }
    if (pub.strength < wordBar(pub.magnitude)) { refused.push('a word not yet grasped'); continue; }
    const r = await auth.submitProvenName(claim);
    if (!r.accepted || !r.spirit) { refused.push(r.reason ?? 'unknown'); continue; }
    seen.add(word);
    // the proof revealed only the details: element, might, the facet's form, traits. Never the source.
    const traits = { ...pub.traits, formStep: 0, flavor: 0n };
    slots[slot] = {
      spirit: r.spirit, facet: pub.facet, element: pub.element, magnitude: pub.magnitude, traits: wireTraits(traits), strength: r.strength!,
      form: traits.form, generosity: spiritStats({ magnitude: pub.magnitude, traits }).generosity, lastBits: null,
    };
  }
  return { slots, refused };
}

export const publicSlots = (slots: (AdmittedSlot | null)[]): (SlotInfo | null)[] =>
  slots.map((s) => s && { spirit: s.spirit, facet: s.facet, element: s.element, magnitude: s.magnitude, traits: s.traits, strength: s.strength });
