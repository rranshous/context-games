import type { SimEvent, DeathCause } from '../interface/events.js';

// ── Timeline entry types ────────────────────────────────

export type TimelineEntry =
  | { type: 'born'; tick: number; generation: number; parentId: number | null }
  | { type: 'ate'; tick: number; foodValue: number; x: number; y: number }
  | { type: 'woke'; tick: number; reason: string; thoughts: string; toolsUsed: string[] }
  | { type: 'reproduced'; tick: number; childId: number }
  | { type: 'died'; tick: number; cause: DeathCause };

// ── CreatureHistoryStore ────────────────────────────────

const MAX_ENTRIES_PER_CREATURE = 200;

export class CreatureHistoryStore {
  private timelines = new Map<number, TimelineEntry[]>();

  /** Process a sim event and append to the relevant creature timeline */
  handleEvent(event: SimEvent): void {
    switch (event.type) {
      case 'creature:spawned':
        this.append(event.creature.id, {
          type: 'born',
          tick: event.tick,
          generation: event.creature.generation,
          parentId: event.creature.parentId,
        });
        break;

      case 'creature:ate':
        this.append(event.id, {
          type: 'ate',
          tick: event.tick,
          foodValue: event.foodValue,
          x: event.x,
          y: event.y,
        });
        break;

      case 'creature:woke':
        this.append(event.id, {
          type: 'woke',
          tick: event.tick,
          reason: event.reason,
          thoughts: event.thoughts,
          toolsUsed: event.toolsUsed,
        });
        break;

      case 'creature:reproduced':
        this.append(event.parentId, {
          type: 'reproduced',
          tick: event.tick,
          childId: event.childId,
        });
        break;

      case 'creature:died':
        this.append(event.id, {
          type: 'died',
          tick: event.tick,
          cause: event.cause,
        });
        break;
    }
  }

  /** Get the full timeline for a creature (oldest first) */
  getTimeline(id: number): TimelineEntry[] {
    return this.timelines.get(id) ?? [];
  }

  /** Get the most recent consciousness wake-up for a creature */
  getLastWake(id: number): (TimelineEntry & { type: 'woke' }) | null {
    const timeline = this.timelines.get(id);
    if (!timeline) return null;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'woke') return timeline[i] as TimelineEntry & { type: 'woke' };
    }
    return null;
  }

  /** Check if a creature has died */
  isDead(id: number): boolean {
    const timeline = this.timelines.get(id);
    if (!timeline || timeline.length === 0) return false;
    return timeline[timeline.length - 1].type === 'died';
  }

  private append(creatureId: number, entry: TimelineEntry): void {
    let timeline = this.timelines.get(creatureId);
    if (!timeline) {
      timeline = [];
      this.timelines.set(creatureId, timeline);
    }
    timeline.push(entry);
    // Cap to avoid unbounded growth
    if (timeline.length > MAX_ENTRIES_PER_CREATURE) {
      timeline.splice(0, timeline.length - MAX_ENTRIES_PER_CREATURE);
    }
  }
}
