// ── TD Learner: Online Temporal-Difference Probe Updates ──
// Updates probe weights incrementally each tick using the temporal difference
// error: td_error = reward + γ * V_next - V_now.
//
// Two probes are trained:
//   1. A VALUE probe: predicts how good the current situation is (V(s)).
//      Trained on TD error every tick. Used internally for credit assignment.
//   2. ACTION probes: one per action in the vocabulary. The action that was
//      selected gets its weight updated in the direction of td_error.
//      Actions that led to positive surprises get boosted; negative get
//      suppressed.
//
// This is linear Q-learning with a frozen LLM as the feature extractor.

export interface TDConfig {
  gamma: number;           // discount factor (typically 0.99)
  valueLR: number;         // learning rate for the value probe
  actionLR: number;        // learning rate for action probes
}

export const DEFAULT_TD_CONFIG: TDConfig = {
  gamma: 0.99,
  valueLR: 0.01,
  actionLR: 0.005,
};

/** Linear probe: y = sigmoid(w·x + b). Mutable weights for online updates. */
export class OnlineProbe {
  readonly name: string;
  weights: Float32Array;
  bias: number;

  constructor(name: string, dim: number) {
    this.name = name;
    this.weights = new Float32Array(dim);
    this.bias = 0;
    // Small random init
    for (let i = 0; i < dim; i++) {
      this.weights[i] = (Math.random() - 0.5) * 0.02;
    }
  }

  /** Forward: sigmoid(w·x + b) → scalar in (0,1). */
  forward(x: Float32Array): number {
    let s = this.bias;
    for (let i = 0; i < x.length; i++) s += this.weights[i] * x[i];
    return 1 / (1 + Math.exp(-s));
  }

  /** Raw logit: w·x + b (no sigmoid). Used for value estimation. */
  logit(x: Float32Array): number {
    let s = this.bias;
    for (let i = 0; i < x.length; i++) s += this.weights[i] * x[i];
    return s;
  }

  /** Online gradient step: nudge weights by lr * error * x. */
  update(x: Float32Array, error: number, lr: number): void {
    for (let i = 0; i < x.length; i++) {
      this.weights[i] += lr * error * x[i];
    }
    this.bias += lr * error;
  }

  toJSON(): { name: string; weights: number[]; bias: number } {
    return { name: this.name, weights: Array.from(this.weights), bias: this.bias };
  }

  static fromJSON(obj: { name: string; weights: number[]; bias: number }): OnlineProbe {
    const p = new OnlineProbe(obj.name, obj.weights.length);
    p.weights = new Float32Array(obj.weights);
    p.bias = obj.bias;
    return p;
  }
}

export class TDLearner {
  readonly dim: number;
  readonly config: TDConfig;
  valueProbe: OnlineProbe;
  actionProbes: OnlineProbe[];
  actionNames: string[];

  // Per-tick state for computing TD error between consecutive ticks
  private prevActivation: Float32Array | null = null;
  private prevValue: number = 0;
  private prevActionIndex: number = -1;

  // Diagnostics
  totalUpdates: number = 0;
  recentTDErrors: number[] = [];  // last N for reporting

  constructor(dim: number, actionNames: string[], config: TDConfig = DEFAULT_TD_CONFIG) {
    this.dim = dim;
    this.config = config;
    this.actionNames = actionNames;
    this.valueProbe = new OnlineProbe('value', dim);
    this.actionProbes = actionNames.map(name => new OnlineProbe(name, dim));
  }

  /** Get priorities for all actions given current activation. */
  priorities(activation: Float32Array): Float32Array {
    const p = new Float32Array(this.actionProbes.length);
    for (let i = 0; i < this.actionProbes.length; i++) {
      p[i] = this.actionProbes[i].forward(activation);
    }
    return p;
  }

  /** Record which action was selected this tick (for next-tick update). */
  recordSelection(actionIndex: number, activation: Float32Array): void {
    this.prevActivation = activation;
    this.prevValue = this.valueProbe.logit(activation);
    this.prevActionIndex = actionIndex;
  }

  /** Online TD update: called AFTER the next tick's activation is available. */
  update(currentActivation: Float32Array, reward: number): void {
    if (!this.prevActivation) return;

    const V_now = this.prevValue;
    const V_next = this.valueProbe.logit(currentActivation);
    const tdError = reward + this.config.gamma * V_next - V_now;

    // Update value probe
    this.valueProbe.update(this.prevActivation, tdError, this.config.valueLR);

    if (this.prevActionIndex >= 0) {
      // Single action mode (legacy argmax): update only the selected probe
      this.actionProbes[this.prevActionIndex].update(
        this.prevActivation, tdError, this.config.actionLR,
      );
    } else {
      // Tendency mode (all-fire): update ALL action probes.
      // Each probe contributed proportionally via softmax, so each gets
      // the same TD error signal. The probe's own magnitude determines
      // how much it contributed, but the gradient direction is the same
      // for all — this is correct because the TD error reflects the
      // whole composition, not any individual tendency.
      for (const probe of this.actionProbes) {
        probe.update(this.prevActivation, tdError, this.config.actionLR);
      }
    }

    this.totalUpdates++;
    this.recentTDErrors.push(tdError);
    if (this.recentTDErrors.length > 100) this.recentTDErrors.shift();
  }

  /** Reset per-tick state (call on car death/respawn). */
  resetTickState(): void {
    this.prevActivation = null;
    this.prevValue = 0;
    this.prevActionIndex = -1;
  }

  /** Mean absolute TD error over recent updates. */
  meanAbsTDError(): number {
    if (this.recentTDErrors.length === 0) return 0;
    let s = 0;
    for (const e of this.recentTDErrors) s += Math.abs(e);
    return s / this.recentTDErrors.length;
  }

  /** Per-action priority statistics over recent activations. */
  actionStats(activations: Float32Array[]): Array<{ name: string; mean: number; std: number }> {
    return this.actionProbes.map((probe, i) => {
      const vals = activations.map(a => probe.forward(a));
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      return { name: this.actionNames[i], mean, std: Math.sqrt(variance) };
    });
  }

  toJSON(): unknown {
    return {
      dim: this.dim,
      actionNames: this.actionNames,
      valueProbe: this.valueProbe.toJSON(),
      actionProbes: this.actionProbes.map(p => p.toJSON()),
      totalUpdates: this.totalUpdates,
    };
  }

  static fromJSON(obj: any, config?: TDConfig): TDLearner {
    const td = new TDLearner(obj.dim, obj.actionNames, config);
    td.valueProbe = OnlineProbe.fromJSON(obj.valueProbe);
    td.actionProbes = obj.actionProbes.map((p: any) => OnlineProbe.fromJSON(p));
    td.totalUpdates = obj.totalUpdates || 0;
    return td;
  }
}
