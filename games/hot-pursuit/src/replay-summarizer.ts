// ── Replay Summarizer ──
// Condenses a full ChaseReplay into a focused summary for reflection.
// The implementation guide warns: full tick-by-tick is too much context.
// We provide stats, key moments, simplified paths, and a query mechanism.

import { ChaseReplay, Position, ChaseEvent, DEFAULT_CONFIG } from './types';
import { Soma } from './soma';

export interface ReplaySummary {
  runId: number;
  outcome: string;
  durationSeconds: number;
  durationTicks: number;

  // Stats
  closestApproach: number;
  timesSpotted: number;
  timesLost: number;
  playerDistanceTraveled: number;

  // This officer's performance
  officerSummary: {
    id: string;
    name: string;
    spottedPlayer: boolean;
    madeCapture: boolean;
    closestDistance: number;
    distanceTraveled: number;  // pixels — how far this officer actually moved
    stateBreakdown: Record<string, number>; // seconds in each state
  };

  // Key moments — curated events
  keyMoments: Array<{
    tick: number;
    time: number;
    description: string;
    positions?: {
      player?: Position;
      officer?: Position;
    };
  }>;

  // Simplified player path (waypoints, not every tick)
  playerWaypoints: Array<{ tick: number; pos: Position }>;

  // Simplified officer path
  officerWaypoints: Array<{ tick: number; pos: Position; state: string }>;

  // Other officers' positions at key moments
  allyPositionsAtKeyMoments: Array<{
    tick: number;
    allies: Array<{ id: string; pos: Position; state: string }>;
  }>;
}

/**
 * Build a reflection-ready summary for one actant from a full replay.
 */
export function summarizeReplayForActant(
  replay: ChaseReplay,
  soma: Soma,
): ReplaySummary {
  const actantId = soma.id;

  // Calculate officer-specific stats
  const actantPath = replay.actantPaths[actantId] || [];
  const actantEvents = replay.events.filter(e => e.actantId === actantId);

  // Closest distance this officer achieved
  let closestDist = Infinity;
  for (const snap of actantPath) {
    // Find closest player position at similar tick
    const nearest = findNearestPlayerPos(replay, snap.tick);
    if (nearest) {
      const dx = snap.pos.x - nearest.x;
      const dy = snap.pos.y - nearest.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) closestDist = d;
    }
  }

  // State breakdown
  const stateBreakdown: Record<string, number> = { patrol: 0, pursuing: 0, searching: 0 };
  let prevTick = 0;
  for (const snap of actantPath) {
    const dt = (snap.tick - prevTick) / 60; // approximate seconds
    stateBreakdown[snap.state] = (stateBreakdown[snap.state] || 0) + dt;
    prevTick = snap.tick;
  }

  // Officer distance traveled
  let officerDistance = 0;
  for (let i = 1; i < actantPath.length; i++) {
    const dx = actantPath[i].pos.x - actantPath[i - 1].pos.x;
    const dy = actantPath[i].pos.y - actantPath[i - 1].pos.y;
    officerDistance += Math.sqrt(dx * dx + dy * dy);
  }

  // Did this officer spot the player?
  const spottedPlayer = actantEvents.some(e => e.type === 'player_spotted');
  const madeCapture = replay.outcome === 'captured' &&
    actantEvents.some(e => e.type === 'near_capture');

  // Key moments — all events involving this officer, plus global events
  const keyMoments = replay.events
    .filter(e => !e.actantId || e.actantId === actantId)
    .filter(e => e.type !== 'chase_start') // skip noise
    .map(e => ({
      tick: e.tick,
      time: e.time,
      description: describeEvent(e, actantId),
      positions: extractPositions(e),
    }));

  // Simplify player path — keep every 10th point
  const playerWaypoints = replay.playerPath
    .filter((_, i) => i % 10 === 0)
    .map(p => ({ tick: p.tick, pos: p.pos }));

  // Simplify officer path — keep every 10th point
  const officerWaypoints = actantPath
    .filter((_, i) => i % 10 === 0)
    .map(p => ({ tick: p.tick, pos: p.pos, state: p.state }));

  // Ally positions at key event ticks
  const keyTicks = keyMoments.map(m => m.tick);
  const allyPositionsAtKeyMoments = keyTicks.slice(0, 10).map(tick => {
    const allies: Array<{ id: string; pos: Position; state: string }> = [];
    for (const [id, path] of Object.entries(replay.actantPaths)) {
      if (id === actantId) continue;
      // Find closest tick
      const closest = path.reduce((best, p) =>
        Math.abs(p.tick - tick) < Math.abs(best.tick - tick) ? p : best,
        path[0]
      );
      if (closest) {
        allies.push({ id, pos: closest.pos, state: closest.state });
      }
    }
    return { tick, allies };
  });

  // Convert distances from pixels to tile units for the reflection prompt
  const ts = DEFAULT_CONFIG.tileSize;

  return {
    runId: replay.runId,
    outcome: replay.outcome,
    durationSeconds: Math.round(replay.durationSeconds * 10) / 10,
    durationTicks: replay.durationTicks,
    closestApproach: Math.round(replay.stats.closestApproach / ts * 10) / 10,
    timesSpotted: replay.stats.timesSpotted,
    timesLost: replay.stats.timesLost,
    playerDistanceTraveled: Math.round(replay.stats.distanceTraveled / ts),
    officerSummary: {
      id: actantId,
      name: soma.name,
      spottedPlayer,
      madeCapture,
      closestDistance: Math.round(closestDist / ts * 10) / 10,
      distanceTraveled: Math.round(officerDistance / ts),
      stateBreakdown: Object.fromEntries(
        Object.entries(stateBreakdown).map(([k, v]) => [k, Math.round(v * 10) / 10])
      ),
    },
    keyMoments,
    playerWaypoints,
    officerWaypoints,
    allyPositionsAtKeyMoments,
  };
}

function findNearestPlayerPos(replay: ChaseReplay, tick: number): Position | null {
  if (replay.playerPath.length === 0) return null;
  let best = replay.playerPath[0];
  for (const p of replay.playerPath) {
    if (Math.abs(p.tick - tick) < Math.abs(best.tick - tick)) {
      best = p;
    }
  }
  return best.pos;
}

function describeEvent(event: ChaseEvent, selfId: string): string {
  const isSelf = event.actantId === selfId;
  const who = isSelf ? 'You' : (event.actantId || 'Unknown');

  switch (event.type) {
    case 'player_spotted':
      return `${who} spotted the suspect`;
    case 'player_lost':
      return `${who} lost visual contact with the suspect`;
    case 'near_capture':
      return `${who} nearly caught the suspect (distance: ${
        Math.round(((event.data.distance as number) || 0) / DEFAULT_CONFIG.tileSize * 10) / 10
      } tiles)`;
    case 'chase_end':
      return `Chase ended: ${event.data.outcome}`;
    default:
      return `${event.type}`;
  }
}

function extractPositions(event: ChaseEvent): { player?: Position; officer?: Position } | undefined {
  const result: { player?: Position; officer?: Position } = {};
  if (event.data.playerPos) result.player = event.data.playerPos as Position;
  if (event.data.position) result.player = event.data.position as Position;
  if (event.data.officerPosition) result.officer = event.data.officerPosition as Position;
  if (event.data.officerPos) result.officer = event.data.officerPos as Position;
  if (result.player || result.officer) return result;
  return undefined;
}

/**
 * Get detailed tick data for a specific range (for query_replay tool).
 */
export function queryReplayRange(
  replay: ChaseReplay,
  actantId: string,
  startTick: number,
  endTick: number,
): {
  playerPositions: Array<{ tick: number; pos: Position; action: string }>;
  officerPositions: Array<{ tick: number; pos: Position; state: string }>;
  events: ChaseEvent[];
} {
  return {
    playerPositions: replay.playerPath.filter(p => p.tick >= startTick && p.tick <= endTick),
    officerPositions: (replay.actantPaths[actantId] || []).filter(p => p.tick >= startTick && p.tick <= endTick),
    events: replay.events.filter(e => e.tick >= startTick && e.tick <= endTick),
  };
}
