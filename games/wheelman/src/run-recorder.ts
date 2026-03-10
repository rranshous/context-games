import { Position, RunRecording } from './types';

export class RunRecorder {
  private recording: RunRecording;
  private tickCount: number = 0;

  constructor() {
    this.recording = {
      driverPath: [],
      pursuerPaths: {},
      radioTranscript: [],
      events: [],
      startTime: Date.now(),
      endTime: 0,
      outcome: 'timeout',
      durationSeconds: 0,
      distanceCovered: 0,
      objectiveDistance: 0,
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

  recordEvent(type: string, description: string, pos?: Position): void {
    this.recording.events.push({
      tick: this.tickCount,
      type,
      description,
      pos: pos ? { ...pos } : undefined,
    });
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

    return this.recording;
  }
}
