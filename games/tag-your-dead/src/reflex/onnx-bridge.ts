// ── ONNX Reservoir Bridge ──
// Loads distilgpt2 via @huggingface/transformers, runs forward passes, extracts
// pooled KV-cache activations as a 768-dim feature vector.
//
// Adapted from games/hunch/src/reservoir/onnx-bridge.ts. Same model, same pooling.

import { ReservoirBridge } from './reflex-layer';

interface Tensor {
  data: Float32Array;
  dims: number[];
}

export class OnnxReservoirBridge implements ReservoirBridge {
  readonly modelId: string;
  activationDim: number = 0;
  private tokenizer: any = null;
  private model: any = null;
  private spec: { layerCount: number; headDim: number } | null = null;

  constructor(modelId: string = 'Xenova/distilgpt2') {
    this.modelId = modelId;
  }

  async load(): Promise<void> {
    const { AutoTokenizer, AutoModel, env } = await import('@huggingface/transformers');
    env.allowLocalModels = true;
    env.allowRemoteModels = true;

    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
    this.model = await AutoModel.from_pretrained(this.modelId);

    // Warm up + detect output structure
    const warm = await this.tokenizer('warmup', { return_tensors: 'pt' });
    const out = await this.model(warm);
    let layerCount = 0;
    while (`present.${layerCount}.key` in out) layerCount++;
    if (layerCount === 0) throw new Error('No KV cache layers in model output');
    const firstK: Tensor = out['present.0.key'];
    const headDim = firstK.dims[3];
    this.spec = { layerCount, headDim };
    this.activationDim = layerCount * 2 * headDim;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.model || !this.tokenizer || !this.spec) {
      throw new Error('Bridge not loaded');
    }
    const inputs = await this.tokenizer(text, { return_tensors: 'pt' });
    const out = await this.model(inputs);
    return this.pool(out);
  }

  private pool(out: any): Float32Array {
    const { layerCount, headDim } = this.spec!;
    const result = new Float32Array(this.activationDim);
    let offset = 0;
    for (let layer = 0; layer < layerCount; layer++) {
      this.meanPoolTensor(out[`present.${layer}.key`], result, offset, headDim);
      offset += headDim;
      this.meanPoolTensor(out[`present.${layer}.value`], result, offset, headDim);
      offset += headDim;
    }
    return result;
  }

  private meanPoolTensor(t: Tensor, out: Float32Array, offset: number, headDim: number): void {
    const [, numHeads, seqLen] = t.dims;
    const data = t.data;
    for (let d = 0; d < headDim; d++) out[offset + d] = 0;
    for (let h = 0; h < numHeads; h++) {
      for (let s = 0; s < seqLen; s++) {
        const base = h * seqLen * headDim + s * headDim;
        for (let d = 0; d < headDim; d++) out[offset + d] += data[base + d];
      }
    }
    const n = numHeads * seqLen;
    for (let d = 0; d < headDim; d++) out[offset + d] /= n;
  }
}
