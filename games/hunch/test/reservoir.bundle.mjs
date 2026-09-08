// src/reservoir/onnx-bridge.ts
var OnnxReservoirBridge = class {
  modelId;
  activationDim = 0;
  tokenizer = null;
  model = null;
  transformers = null;
  spec = null;
  cacheDir;
  constructor(modelId = "Xenova/distilgpt2", cacheDir = "./bench/models") {
    this.modelId = modelId;
    this.cacheDir = cacheDir;
  }
  async load() {
    this.transformers = await import("@huggingface/transformers");
    const { AutoTokenizer, AutoModel, env } = this.transformers;
    if (typeof process !== "undefined") {
      env.cacheDir = this.cacheDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
    }
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
    this.model = await AutoModel.from_pretrained(this.modelId);
    const warm = await this.tokenizer("warmup", { return_tensors: "pt" });
    const out = await this.model(warm);
    this.spec = this.deriveSpec(out);
    this.activationDim = this.spec.activationDim;
  }
  async embed(text) {
    if (!this.model || !this.tokenizer || !this.spec) {
      throw new Error("OnnxReservoirBridge not loaded \u2014 call load() first");
    }
    const inputs = await this.tokenizer(text, { return_tensors: "pt" });
    const out = await this.model(inputs);
    return this.pool(out, this.spec);
  }
  /** Introspect the model output to figure out how many layers + head_dim. */
  deriveSpec(out) {
    const keys = Object.keys(out);
    let layerCount = 0;
    while (`present.${layerCount}.key` in out) layerCount++;
    if (layerCount === 0) {
      throw new Error(`No present.*.key outputs found in model. Keys: ${keys.join(",")}`);
    }
    const firstK = out["present.0.key"];
    if (!firstK.dims || firstK.dims.length !== 4) {
      throw new Error(`Unexpected key tensor shape: ${JSON.stringify(firstK.dims)}`);
    }
    const headDim = firstK.dims[3];
    const activationDim = layerCount * 2 * headDim;
    return { layerCount, headDim, activationDim };
  }
  /** Mean-pool each layer's K and V tensors across tokens + heads, concat. */
  pool(out, spec) {
    const result = new Float32Array(spec.activationDim);
    let offset = 0;
    for (let layer = 0; layer < spec.layerCount; layer++) {
      const K = out[`present.${layer}.key`];
      const V = out[`present.${layer}.value`];
      this.meanPoolTensor(K, result, offset, spec.headDim);
      offset += spec.headDim;
      this.meanPoolTensor(V, result, offset, spec.headDim);
      offset += spec.headDim;
    }
    return result;
  }
  /** Mean-pool a [1, num_heads, seq_len, head_dim] tensor to [head_dim]. */
  meanPoolTensor(t, out, offset, headDim) {
    const [, numHeads, seqLen] = t.dims;
    const data = t.data;
    for (let d = 0; d < headDim; d++) out[offset + d] = 0;
    for (let h = 0; h < numHeads; h++) {
      for (let s = 0; s < seqLen; s++) {
        const base = h * seqLen * headDim + s * headDim;
        for (let d = 0; d < headDim; d++) {
          out[offset + d] += data[base + d];
        }
      }
    }
    const n = numHeads * seqLen;
    for (let d = 0; d < headDim; d++) out[offset + d] /= n;
  }
};

// src/reservoir/state-to-text.ts
function fmt(p) {
  return `(${p.x.toFixed(0)},${p.y.toFixed(0)})`;
}
function nearestPoint(from, points) {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const dx = from.x - p.x, dy = from.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
function stateToText(me, world) {
  const parts = [];
  parts.push(`t${world.tick}.`);
  parts.push(`${me.role} at ${fmt(me.pos)}.`);
  if (me.visibleEnemies.length > 0) {
    const nearest = me.visibleEnemies.reduce((a, b) => {
      const da = (a.pos.x - me.pos.x) ** 2 + (a.pos.y - me.pos.y) ** 2;
      const db = (b.pos.x - me.pos.x) ** 2 + (b.pos.y - me.pos.y) ** 2;
      return da < db ? a : b;
    });
    parts.push(`enemy visible at ${fmt(nearest.pos)}.`);
  } else if (me.lastKnownEnemy) {
    parts.push(`enemy last seen at ${fmt(me.lastKnownEnemy)}.`);
  } else {
    parts.push("no enemy.");
  }
  const ne = nearestPoint(me.pos, world.extractionPoints);
  if (ne) parts.push(`nearest extract ${fmt(ne)}.`);
  return parts.join(" ");
}

// test/reservoir.mjs
function makeFakeState(tick, copPos, evaderVisible, lastKnown) {
  const me = {
    id: "cop-0",
    role: "cop",
    pos: copPos,
    facing: { x: 0, y: 1 },
    visibleEnemies: evaderVisible ? [{ id: "evader-0", pos: { x: 5, y: 3 } }] : [],
    lastKnownEnemy: lastKnown,
    visibleFriends: [],
    confidence: 0.5,
    readiness: 0.5
  };
  const world = {
    tick,
    time: tick / 60,
    mapCols: 40,
    mapRows: 30,
    extractionPoints: [{ x: -18, y: -12 }, { x: 18, y: 12 }, { x: 0, y: 14 }],
    otherActantIds: ["evader-0"],
    threatLevel: 0.5,
    distanceUrgency: 0.5,
    terrainRead: 0.5
  };
  return { me, world };
}
async function main() {
  console.log("\u2500\u2500 Phase 3 reservoir integration test \u2500\u2500");
  console.log();
  const bridge = new OnnxReservoirBridge("Xenova/distilgpt2", "./bench/models");
  console.log("Loading reservoir...");
  const t0 = Date.now();
  await bridge.load();
  console.log(`  loaded in ${Date.now() - t0}ms  dim=${bridge.activationDim}`);
  console.log();
  console.log("TEST 1: state-to-text samples");
  const samples = [
    makeFakeState(10, { x: 0, y: 0 }, false, null),
    makeFakeState(120, { x: 3, y: -5 }, true, null),
    makeFakeState(240, { x: -7, y: 8 }, false, { x: 2, y: 1 })
  ];
  for (const { me, world } of samples) {
    const s = stateToText(me, world);
    console.log(`  [${s.length} chars] ${s}`);
  }
  console.log();
  console.log("TEST 2: embed output shape");
  const e0 = await bridge.embed(stateToText(samples[0].me, samples[0].world));
  console.log(`  embed shape: ${e0.length}  expected: ${bridge.activationDim}  match=${e0.length === bridge.activationDim}`);
  console.log(`  first 8 values: [${Array.from(e0.slice(0, 8)).map((x) => x.toFixed(4)).join(", ")}]`);
  console.log(`  has NaN: ${Array.from(e0).some((v) => Number.isNaN(v))}`);
  console.log(`  l2 norm: ${Math.sqrt(Array.from(e0).reduce((s, v) => s + v * v, 0)).toFixed(4)}`);
  console.log();
  console.log("TEST 3: determinism");
  const text = stateToText(samples[1].me, samples[1].world);
  const e1a = await bridge.embed(text);
  const e1b = await bridge.embed(text);
  let maxDiff = 0;
  for (let i = 0; i < e1a.length; i++) {
    const d = Math.abs(e1a[i] - e1b[i]);
    if (d > maxDiff) maxDiff = d;
  }
  console.log(`  max |e1a - e1b| = ${maxDiff.toExponential(3)}  (should be 0 or ~1e-7 float noise)`);
  console.log(`  deterministic: ${maxDiff < 1e-5}`);
  console.log();
  console.log("TEST 4: reactivity");
  const e0v = await bridge.embed(stateToText(samples[0].me, samples[0].world));
  const e1v = await bridge.embed(stateToText(samples[1].me, samples[1].world));
  const e2v = await bridge.embed(stateToText(samples[2].me, samples[2].world));
  const pairs = [["0-1", e0v, e1v], ["0-2", e0v, e2v], ["1-2", e1v, e2v]];
  for (const [label, a, b] of pairs) {
    let diff = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      diff += (a[i] - b[i]) ** 2;
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const cosine = Array.from({ length: a.length }, (_, i) => a[i] * b[i]).reduce((s, v) => s + v, 0) / (Math.sqrt(na) * Math.sqrt(nb));
    console.log(`  pair ${label}: l2diff=${Math.sqrt(diff).toFixed(4)}  cos=${cosine.toFixed(4)}`);
  }
  console.log();
  console.log("TEST 5: latency (20 iterations, realistic state)");
  const gameText = stateToText(samples[1].me, samples[1].world);
  console.log(`  input: "${gameText}"`);
  for (let i = 0; i < 3; i++) await bridge.embed(gameText);
  const times = [];
  for (let i = 0; i < 20; i++) {
    const t = performance.now();
    await bridge.embed(gameText);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)] || times[times.length - 1];
  console.log(`  p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  min=${times[0].toFixed(1)}  max=${times[times.length - 1].toFixed(1)}`);
  console.log();
  console.log("\u2500\u2500 reservoir integration test done \u2500\u2500");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
