import { Position, RunRecording } from './types';

export class RunRecorder {
  private recording: RunRecording;
  private tickCount: number = 0;

  // Terrain tracking
  private terrainTicks: Record<string, number> = {};
  private rockHits: number = 0;
  private lastTerrain: string = 'sand';

  constructor() {
    this.recording = {
      driverPath: [],
      pursuerPaths: {},
      radioTranscript: [],
      pursuerRadioLog: [],
      events: [],
      startTime: Date.now(),
      endTime: 0,
      outcome: 'timeout',
      durationSeconds: 0,
      distanceCovered: 0,
      objectiveDistance: 0,
      terrainSummary: '',
    };
  }

  recordDriverPosition(pos: Position, speed: number, angle: number): void {
    // Record every 3rd tick to save memory
    if (this.tickCount % 3 === 0) {
      this.recording.driverPath.push({
        tick: this.tickCount,
        pos: { ...pos },
        speed,
        angle,
      });
    }
    this.tickCount++;
  }

  recordPursuerPosition(id: string, pos: Position): void {
    if (this.tickCount % 3 !== 0) return;
    if (!this.recording.pursuerPaths[id]) {
      this.recording.pursuerPaths[id] = [];
    }
    this.recording.pursuerPaths[id].push({
      tick: this.tickCount,
      pos: { ...pos },
    });
  }

  recordRadio(text: string): void {
    const time = (Date.now() - this.recording.startTime) / 1000;
    this.recording.radioTranscript.push({ time, text });
  }

  recordPursuerRadio(from: string, signalType: string, data: string): void {
    const time = (Date.now() - this.recording.startTime) / 1000;
    this.recording.pursuerRadioLog.push({ time, from, type: signalType, data });
  }

  recordEvent(type: string, description: string, pos?: Position): void {
    this.recording.events.push({
      tick: this.tickCount,
      type,
      description,
      pos: pos ? { ...pos } : undefined,
    });
  }

  recordTerrain(type: string): void {
    this.terrainTicks[type] = (this.terrainTicks[type] || 0) + 1;
    this.lastTerrain = type;
  }

  recordRockHit(): void {
    this.rockHits++;
  }

  finish(outcome: RunRecording['outcome'], objectiveDistance: number): RunRecording {
    this.recording.endTime = Date.now();
    this.recording.outcome = outcome;
    this.recording.durationSeconds = (this.recording.endTime - this.recording.startTime) / 1000;
    this.recording.objectiveDistance = objectiveDistance;

    // Calculate distance covered
    let dist = 0;
    const path = this.recording.driverPath;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].pos.x - path[i - 1].pos.x;
      const dy = path[i].pos.y - path[i - 1].pos.y;
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    this.recording.distanceCovered = dist;

    // Build terrain summary
    this.recording.terrainSummary = this.buildTerrainSummary();

    return this.recording;
  }

  private buildTerrainSummary(): string {
    const totalTicks = Object.values(this.terrainTicks).reduce((a, b) => a + b, 0);
    if (totalTicks === 0) return 'No terrain data.';

    const parts: string[] = [];
    const pct = (type: string) => {
      const t = this.terrainTicks[type] || 0;
      return Math.round((t / totalTicks) * 100);
    };

    // Only mention terrain types the driver actually encountered
    const sandPct = pct('sand');
    const roadPct = pct('road');
    const waterPct = pct('water');
    const cactusPct = pct('cactus');
    const roughPct = pct('rough_sand');

    if (roadPct > 0) parts.push(`${roadPct}% on roads`);
    if (sandPct > 0) parts.push(`${sandPct}% on open sand`);
    if (roughPct > 0) parts.push(`${roughPct}% on rough sand`);
    if (waterPct > 0) parts.push(`${waterPct}% through water oases`);
    if (cactusPct > 0) parts.push(`${cactusPct}% through cactus thickets`);
    if (this.rockHits > 0) parts.push(`hit ${this.rockHits} rock${this.rockHits > 1 ? 's' : ''}`);

    return parts.join(', ') + '.';
  }
}
