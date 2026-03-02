// Hunt Tracker — records predator hunt episodes for reflection input.
// A "hunt" is the lifecycle from first prey detection to resolution (catch or give-up).

export interface HuntEvent {
  time: number;           // seconds since hunt start
  type: string;           // 'detected', 'pursuing', 'lost_los', 'prey_concealed', 'prey_revealed'
  predPos: { x: number; z: number };
  preyPos?: { x: number; z: number };
  distance?: number;
  note?: string;
}

export interface HuntSummary {
  huntId: number;
  predatorId: string;
  outcome: 'catch' | 'lost';
  durationSeconds: number;
  closestDistance: number;
  preyConcealed: boolean;
  concealmentTile: string | null;
  events: HuntEvent[];
  textSummary: string;
}

interface ActiveHunt {
  huntId: number;
  predatorId: string;
  startTime: number;
  events: HuntEvent[];
  closestDistance: number;
  preyConcealed: boolean;
  concealmentTile: string | null;
}

export class HuntTracker {
  private activeHunts = new Map<string, ActiveHunt>();
  private nextHuntId = 1;
  private completed: HuntSummary[] = [];

  startHunt(predatorId: string, gameTime: number): void {
    if (this.activeHunts.has(predatorId)) return; // already hunting
    const hunt: ActiveHunt = {
      huntId: this.nextHuntId++,
      predatorId,
      startTime: gameTime,
      events: [],
      closestDistance: Infinity,
      preyConcealed: false,
      concealmentTile: null,
    };
    this.activeHunts.set(predatorId, hunt);
    console.log(`[GLINT] Hunt #${hunt.huntId} started for ${predatorId}`);
  }

  recordEvent(
    predatorId: string,
    event: Omit<HuntEvent, 'time'>,
    gameTime: number,
  ): void {
    const hunt = this.activeHunts.get(predatorId);
    if (!hunt) return;

    const elapsed = gameTime - hunt.startTime;

    // Throttle 'pursuing' events to every 0.5s
    if (event.type === 'pursuing') {
      const last = hunt.events[hunt.events.length - 1];
      if (last?.type === 'pursuing' && elapsed - last.time < 0.5) return;
    }

    // Track closest approach
    if (event.distance !== undefined && event.distance < hunt.closestDistance) {
      hunt.closestDistance = event.distance;
    }

    // Track concealment
    if (event.type === 'prey_concealed') {
      hunt.preyConcealed = true;
      if (event.note) {
        // Extract tile type from note like "prey entered kelp at ..."
        const match = event.note.match(/entered (\w+)/);
        if (match) hunt.concealmentTile = match[1];
      }
    }

    hunt.events.push({ ...event, time: elapsed });
  }

  endHunt(
    predatorId: string,
    outcome: 'catch' | 'lost',
    gameTime: number,
  ): HuntSummary | null {
    const hunt = this.activeHunts.get(predatorId);
    if (!hunt) return null;
    this.activeHunts.delete(predatorId);

    const duration = gameTime - hunt.startTime;
    const textSummary = this.buildTextSummary(hunt, outcome, duration);

    const summary: HuntSummary = {
      huntId: hunt.huntId,
      predatorId: hunt.predatorId,
      outcome,
      durationSeconds: duration,
      closestDistance: hunt.closestDistance === Infinity ? 0 : hunt.closestDistance,
      preyConcealed: hunt.preyConcealed,
      concealmentTile: hunt.concealmentTile,
      events: hunt.events,
      textSummary,
    };

    this.completed.push(summary);
    console.log(`[GLINT] Hunt #${hunt.huntId} ended: ${outcome} (${duration.toFixed(1)}s)`);
    return summary;
  }

  isHunting(predatorId: string): boolean {
    return this.activeHunts.has(predatorId);
  }

  getCompletedHunts(predatorId: string): HuntSummary[] {
    return this.completed.filter(h => h.predatorId === predatorId);
  }

  getAllCompleted(): HuntSummary[] {
    return this.completed;
  }

  private buildTextSummary(hunt: ActiveHunt, outcome: string, duration: number): string {
    const lines: string[] = [];
    lines.push(`Hunt #${hunt.huntId} (${outcome}, ${duration.toFixed(1)}s):`);

    for (const ev of hunt.events) {
      switch (ev.type) {
        case 'detected':
          lines.push(`- Detected prey at (${ev.preyPos!.x.toFixed(1)}, ${ev.preyPos!.z.toFixed(1)}), distance ${ev.distance!.toFixed(1)}`);
          break;
        case 'pursuing':
          lines.push(`- Pursuing at t+${ev.time.toFixed(1)}s, distance ${ev.distance!.toFixed(1)}`);
          break;
        case 'lost_los':
          lines.push(`- Lost line of sight at (${ev.predPos.x.toFixed(1)}, ${ev.predPos.z.toFixed(1)})`);
          break;
        case 'prey_concealed':
          lines.push(`- ${ev.note || 'Prey concealed'}`);
          break;
        case 'prey_revealed':
          lines.push(`- Prey revealed at (${ev.preyPos!.x.toFixed(1)}, ${ev.preyPos!.z.toFixed(1)})`);
          break;
        default:
          if (ev.note) lines.push(`- ${ev.note}`);
          break;
      }
    }

    lines.push(`- Duration: ${duration.toFixed(1)}s, closest approach: ${hunt.closestDistance === Infinity ? 'N/A' : hunt.closestDistance.toFixed(1) + 'u'}`);
    return lines.join('\n');
  }
}
