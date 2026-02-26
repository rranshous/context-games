// ── Replay Data Capture + JSON Console Logging ──

import {
  ChaseReplay, ChaseEvent, ChaseOutcome, TickSnapshot,
  Position, PoliceEntity,
} from './types';

export class ReplayRecorder {
  private runId: number;
  private startTime: number = 0;
  private tick: number = 0;
  private events: ChaseEvent[] = [];
  private playerPath: Array<{ tick: number; pos: Position; action: string }> = [];
  private actantPaths: Record<string, Array<{ tick: number; pos: Position; state: string; canSeePlayer: boolean }>> = {};
  private snapshots: TickSnapshot[] = [];
  private closestApproach: number = Infinity;
  private timesSpotted: number = 0;
  private timesLost: number = 0;
  private distanceTraveled: number = 0;
  private lastPlayerPos: Position | null = null;
  private snapshotInterval: number = 10; // snapshot every N ticks
  private prevVisibility: Map<string, boolean> = new Map();

  constructor(runId: number) {
    this.runId = runId;
  }

  start(): void {
    this.startTime = performance.now();
    this.tick = 0;
    this.logEvent('chase_start', undefined, {
      runId: this.runId,
      timestamp: new Date().toISOString(),
    });
  }

  recordTick(
    playerPos: Position,
    playerAction: string,
    police: PoliceEntity[],
  ): void {
    this.tick++;

    // Player path (sample every 3 ticks to reduce volume)
    if (this.tick % 3 === 0) {
      this.playerPath.push({ tick: this.tick, pos: { ...playerPos }, action: playerAction });
    }

    // Distance traveled
    if (this.lastPlayerPos) {
      const dx = playerPos.x - this.lastPlayerPos.x;
      const dy = playerPos.y - this.lastPlayerPos.y;
      this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
    }
    this.lastPlayerPos = { ...playerPos };

    // Per-actant tracking
    for (const p of police) {
      if (!this.actantPaths[p.id]) {
        this.actantPaths[p.id] = [];
      }
      if (this.tick % 3 === 0) {
        this.actantPaths[p.id].push({
          tick: this.tick,
          pos: { ...p.pos },
          state: p.state,
          canSeePlayer: p.canSeePlayer,
        });
      }

      // Closest approach
      const dx = p.pos.x - playerPos.x;
      const dy = p.pos.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.closestApproach) {
        this.closestApproach = dist;
      }

      // Spot/lost tracking
      const prevSaw = this.prevVisibility.get(p.id) ?? false;
      if (p.canSeePlayer && !prevSaw) {
        this.timesSpotted++;
        this.logEvent('player_spotted', p.id, {
          position: { ...playerPos },
          officerPosition: { ...p.pos },
        });
      } else if (!p.canSeePlayer && prevSaw) {
        this.timesLost++;
        this.logEvent('player_lost', p.id, {
          lastKnown: { ...playerPos },
          officerPosition: { ...p.pos },
        });
      }
      this.prevVisibility.set(p.id, p.canSeePlayer);

      // Near capture event
      if (dist < 36) { // ~1.5 tiles
        this.logEvent('near_capture', p.id, {
          distance: dist,
          playerPos: { ...playerPos },
          officerPos: { ...p.pos },
        });
      }
    }

    // Periodic snapshot
    if (this.tick % this.snapshotInterval === 0) {
      this.snapshots.push({
        tick: this.tick,
        time: (performance.now() - this.startTime) / 1000,
        playerPos: { ...playerPos },
        playerAction,
        actants: police.map(p => ({
          id: p.id,
          pos: { ...p.pos },
          state: p.state,
          canSeePlayer: p.canSeePlayer,
          ...(p.canSeePlayer ? { playerPos: { ...playerPos } } : {}),
        })),
      });
    }
  }

  logEvent(
    type: ChaseEvent['type'],
    actantId: string | undefined,
    data: Record<string, unknown>,
  ): void {
    const event: ChaseEvent = {
      tick: this.tick,
      time: (performance.now() - this.startTime) / 1000,
      type,
      actantId,
      data,
    };
    this.events.push(event);

    // JSON console log for copy-paste analysis
    console.log(JSON.stringify({
      _hp: 'event',
      run: this.runId,
      ...event,
    }));
  }

  finish(outcome: ChaseOutcome, mapId: string): ChaseReplay {
    const durationSeconds = (performance.now() - this.startTime) / 1000;

    this.logEvent('chase_end', undefined, {
      outcome,
      durationTicks: this.tick,
      durationSeconds,
    });

    const replay: ChaseReplay = {
      runId: this.runId,
      durationTicks: this.tick,
      durationSeconds,
      outcome,
      mapId,
      playerPath: this.playerPath,
      actantPaths: this.actantPaths,
      events: this.events,
      snapshots: this.snapshots,
      stats: {
        closestApproach: this.closestApproach,
        timesSpotted: this.timesSpotted,
        timesLost: this.timesLost,
        distanceTraveled: this.distanceTraveled,
      },
    };

    // Log the full replay summary
    console.log(JSON.stringify({
      _hp: 'replay_summary',
      runId: this.runId,
      outcome,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      stats: replay.stats,
      eventCount: this.events.length,
      snapshotCount: this.snapshots.length,
    }));

    return replay;
  }
}
