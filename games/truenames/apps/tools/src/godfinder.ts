// god-finder: scan a whole layer (or a prefix) and list spirits, mightiest first.
import { elementName, type Spirit } from '@truenames/universe';
import { parallelScan } from './par.ts';
import { writeFileSync } from 'node:fs';

export async function godFinder(args: string[]) {
  const prefix = args[0] === '-' || !args[0] ? '' : args[0];
  const depth = Number(args[1] ?? 6);
  const out = args[2];
  const { hits, hashes, secs } = await parallelScan(prefix, depth - prefix.length);
  console.log(`scanned depth ${depth} under "${prefix}": ${hits.length} spirits, ${hashes.toLocaleString()} hashes in ${secs.toFixed(1)}s (${Math.round(hashes / secs).toLocaleString()}/s)`);
  const sorted = [...hits].sort((a, b) => b.magnitude - a.magnitude);
  for (const s of sorted) console.log(fmt(s));
  if (out) writeFileSync(out, JSON.stringify(hits.map((s) => ({ ...s, traits: { ...s.traits, flavor: s.traits.flavor.toString() } })), null, 1));
}

export function fmt(s: Spirit) {
  const t = s.traits;
  return `${s.cell.padEnd(10)} mag ${String(s.magnitude).padStart(2)}  ${elementName(s.element).padEnd(6)}/${elementName(s.aspect).padEnd(6)} form ${t.form} weight ${t.weightIdx} gen ${t.generosityIdx} temper ${t.temperIdx}`;
}
