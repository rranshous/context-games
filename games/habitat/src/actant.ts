// actant.ts — Tick scheduling, thinkAbout(), me API, tool compilation

import { type Soma, serializeSoma, extractToolSchemas } from './soma';
import { type World } from './world';
import { agenticLoop } from './inference';

export type ActantStatus = 'idle' | 'thinking';

export interface MeSectionAPI {
  read(): string;
  write(content: string): void;
}

export interface MeAPI {
  thinkAbout(prompt: string): Promise<void>;
  gamer_handle: MeSectionAPI;
  identity: MeSectionAPI;
  on_tick: MeSectionAPI;
  memory: MeSectionAPI;
  custom_tools: MeSectionAPI;
}

export class Actant {
  soma: Soma;
  status: ActantStatus = 'idle';
  tickCount = 0;
  lastThinkPrompt = '';

  private world: World;
  private tickInterval: number;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;

  constructor(soma: Soma, world: World, tickInterval: number = 15000) {
    this.soma = soma;
    this.world = world;
    this.tickInterval = tickInterval;
  }

  get tag(): string {
    return this.soma.id.toUpperCase();
  }

  // ── me API ────────────────────────────────────────────────

  private buildMeAPI(): MeAPI {
    const soma = this.soma;
    const actant = this;

    const makeSection = (
      getter: () => string,
      setter: (s: string) => void,
      name: string,
    ): MeSectionAPI => ({
      read: () => getter(),
      write: (content: string) => {
        setter(content);
        console.log(`[${actant.tag}] ✏️ ${name} updated (${content.length} chars)`);
      },
    });

    return {
      thinkAbout: (prompt: string) => this.thinkAbout(prompt),

      gamer_handle: makeSection(
        () => soma.gamer_handle,
        (s) => { soma.gamer_handle = s; },
        'gamer_handle',
      ),
      identity: makeSection(
        () => soma.identity,
        (s) => { soma.identity = s; },
        'identity',
      ),
      on_tick: makeSection(
        () => soma.on_tick,
        (s) => { soma.on_tick = s; },
        'on_tick',
      ),
      memory: makeSection(
        () => soma.memory,
        (s) => { soma.memory = s; },
        'memory',
      ),
      custom_tools: makeSection(
        () => JSON.stringify(soma.custom_tools),
        (s) => { soma.custom_tools = JSON.parse(s); },
        'custom_tools',
      ),
    };
  }

  // ── Tool compilation ──────────────────────────────────────

  private compileTool(functionBody: string): ((input: Record<string, unknown>, me: MeAPI, world: World) => unknown) | null {
    try {
      return new Function('return ' + functionBody)() as
        (input: Record<string, unknown>, me: MeAPI, world: World) => unknown;
    } catch (err) {
      console.error(`[${this.tag}] Tool compilation error:`, err);
      return null;
    }
  }

  // ── thinkAbout ────────────────────────────────────────────

  private async thinkAbout(prompt: string): Promise<void> {
    this.lastThinkPrompt = prompt;
    console.log(`[${this.tag}] thinkAbout("${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}")`);

    const system = serializeSoma(this.soma);
    const tools = extractToolSchemas(this.soma);
    const me = this.buildMeAPI();
    const world = this.world;
    const tag = this.tag;

    // Build tool executor
    const toolMap = new Map<string, string>();
    for (const tool of this.soma.custom_tools) {
      toolMap.set(tool.name, tool.function_body);
    }

    const executeTool = (name: string, input: Record<string, unknown>): unknown => {
      const body = toolMap.get(name);
      if (!body) throw new Error(`Unknown tool: ${name}`);
      const fn = this.compileTool(body);
      if (!fn) throw new Error(`Failed to compile tool: ${name}`);
      return fn(input, me, world);
    };

    await agenticLoop(tag, system, prompt, tools, executeTool);
  }

  // ── Tick loop ─────────────────────────────────────────────

  async tick(): Promise<void> {
    if (this.ticking) return; // No parallel ticks
    this.ticking = true;
    this.tickCount++;
    this.status = 'thinking';

    console.log(`[${this.tag}] Tick #${this.tickCount} starting...`);
    const start = performance.now();

    try {
      const me = this.buildMeAPI();
      const fn = new Function('return ' + this.soma.on_tick)();
      await fn(me, this.world);
    } catch (err) {
      console.error(`[${this.tag}] Tick #${this.tickCount} error:`, err);
    }

    const elapsed = ((performance.now() - start) / 1000).toFixed(1);
    console.log(`[${this.tag}] Tick #${this.tickCount} complete (${elapsed}s)`);
    this.status = 'idle';
    this.ticking = false;
  }

  startTicking(): void {
    console.log(`[${this.tag}] Starting tick loop (interval: ${this.tickInterval}ms)`);
    const loop = async () => {
      await this.tick();
      const jitter = this.tickInterval + (Math.random() - 0.5) * this.tickInterval * 0.4;
      this.tickTimer = setTimeout(loop, jitter);
    };
    // Start first tick after a short delay (stagger actants)
    this.tickTimer = setTimeout(loop, Math.random() * 3000 + 1000);
  }

  stopTicking(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    console.log(`[${this.tag}] Tick loop stopped`);
  }
}
