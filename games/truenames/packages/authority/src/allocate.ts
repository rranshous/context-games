// Weighted water-filling of one spirit's pool among simultaneous casters.
// weight = 2^effective; each caster takes at most min(request, cap).

export interface AllocRequest {
  request: number;
  effective: number;
  cap: number;
}

/** Returns grants in input order. Σ grants <= pool; grants[i] <= min(request, cap). */
export function allocate(pool: number, reqs: AllocRequest[]): number[] {
  const n = reqs.length;
  const grants = new Array<number>(n).fill(0);
  if (n === 0 || pool <= 0) return grants;
  // normalize weights against the max effective so 2^x never overflows or underflows to 0 for the leader
  let maxE = -Infinity;
  for (const r of reqs) maxE = Math.max(maxE, r.effective);
  const w = reqs.map((r) => 2 ** (r.effective - maxE));
  const limit = reqs.map((r) => Math.max(0, Math.min(r.request, r.cap)));
  // Process in order of limit/weight: those who saturate first are served in full,
  // the rest split what's left proportionally. Exact water level in one pass.
  const order = [...Array(n).keys()].sort((a, b) => limit[a]! / w[a]! - limit[b]! / w[b]! || a - b);
  let remaining = pool;
  let W = 0;
  for (const i of order) W += w[i]!;
  for (let k = 0; k < n; k++) {
    const i = order[k]!;
    if (W <= 0) break;
    const share = (remaining * w[i]!) / W;
    if (limit[i]! <= share) {
      grants[i] = limit[i]!;
      remaining -= limit[i]!;
      W -= w[i]!;
    } else {
      // everyone from here on is limited by share, not by their limit
      for (let m = k; m < n; m++) {
        const j = order[m]!;
        grants[j] = (remaining * w[j]!) / W;
      }
      break;
    }
  }
  return grants;
}
