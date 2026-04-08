/**
 * Clock — the habitat's heartbeat.
 *
 * Monotonic counter, disconnected from wall time.
 * The chassis owns the wall-time interval. The clock just counts ticks.
 */

export class Clock {
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  private onTick: (tick: number) => void;

  constructor(intervalMs: number, onTick: (tick: number) => void) {
    this.intervalMs = intervalMs;
    this.onTick = onTick;
  }

  /** Current tick number. */
  now(): number {
    return this.tick;
  }

  /** Start the heartbeat. */
  start(): void {
    if (this.timer) return;
    console.log(`[clock] started — ${this.intervalMs}ms interval`);
    this.timer = setInterval(() => {
      this.tick++;
      this.onTick(this.tick);
    }, this.intervalMs);
  }

  /** Stop the heartbeat. Tick counter is preserved. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    console.log(`[clock] stopped at tick ${this.tick}`);
  }

  /** Advance one tick manually (for stepping while paused). */
  step(): void {
    this.tick++;
    this.onTick(this.tick);
  }

  /** Change the wall-time interval between ticks. */
  setRate(intervalMs: number): void {
    this.intervalMs = intervalMs;
    if (this.timer) {
      this.stop();
      this.start();
    }
    console.log(`[clock] rate changed to ${intervalMs}ms`);
  }

  /** Restore tick from persisted state. */
  restore(tick: number): void {
    this.tick = tick;
    console.log(`[clock] restored to tick ${tick}`);
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
