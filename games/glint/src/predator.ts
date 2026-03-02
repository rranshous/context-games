// Predator architecture — shared types, sensors, movement, tick dispatch.
// Each predator type (shark, eel, etc.) provides its own model + chassis + animate.
// Behavior comes from the PredatorSoma's on_tick code, compiled and executed each tick.
import * as THREE from 'three';
import { ReefMap, Tile, getTile, isPassable, worldToTile, tileToWorld } from './map.js';
import { Squid } from './squid.js';
import { PredatorSoma } from './soma.js';
import { PendingAction, WorldData, createTickAPI } from './instinct-api.js';
import { compileInstinct, executeTick } from './instinct-executor.js';

// --- Types ---

/** Chassis — the physical scaffold: what the predator's body can do */
export interface Chassis {
  speed: number;          // patrol speed (world units/s)
  chaseSpeed: number;     // pursuit speed
  turnSpeed: number;      // radians/s
  collisionRadius: number;
  sensorRange: number;    // detection range (world units)
  isSmall: boolean;       // can fit through crevices?
}

/** PhysicalState — minimal runtime state (navigation + animation hints) */
export interface PhysicalState {
  waypoint: { x: number; z: number } | null;
  stuckTimer: number;
  // Animation hints — derived from actions, not from soma internals
  lastActionType: string;         // 'pursue' | 'patrol_to' | 'patrol_random' | 'hold'
  timeSinceLastPursue: number;    // seconds since last pursue action
}

/** What the chassis's sensors report each tick */
export interface SensorData {
  squidDetected: boolean;
  squidWorldPos: { x: number; z: number };
  squidDist: number;
}

/** A predator instance. Behavior via on_tick code in predatorSoma. */
export interface Predator {
  id: string;
  type: string;
  group: THREE.Group;
  chassis: Chassis;
  physical: PhysicalState;
  predatorSoma: PredatorSoma;
  threatLight: THREE.PointLight;
  animate: (pred: Predator, t: number) => void;
}

// --- Sensors ---

/** Tile-based Bresenham LOS — returns false if any WALL tile blocks the path */
export function hasLineOfSight(
  map: ReefMap, x0: number, z0: number, x1: number, z1: number
): boolean {
  let dx = Math.abs(x1 - x0);
  let dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;

  while (true) {
    if (getTile(map, x0, z0) === Tile.WALL) return false;
    if (x0 === x1 && z0 === z1) break;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x0 += sx; }
    if (e2 < dx) { err += dx; z0 += sz; }
  }
  return true;
}

/** Read sensor data for a predator — checks range, LOS, concealment */
export function readSensors(
  pred: Predator, squid: Squid, map: ReefMap, tileSize: number
): SensorData {
  const sx = squid.group.position.x, sz = squid.group.position.z;
  const px = pred.group.position.x, pz = pred.group.position.z;
  const dist = Math.sqrt((sx - px) ** 2 + (sz - pz) ** 2);

  let detected = false;
  if (!squid.concealed && dist <= pred.chassis.sensorRange) {
    const pt = worldToTile(px, pz, tileSize, map.width, map.height);
    const st = worldToTile(sx, sz, tileSize, map.width, map.height);
    detected = hasLineOfSight(map, pt.tx, pt.tz, st.tx, st.tz);
  }

  return { squidDetected: detected, squidWorldPos: { x: sx, z: sz }, squidDist: dist };
}

// --- Movement ---

/** Steer toward a target with per-axis wall sliding */
export function moveToward(
  pred: Predator, targetX: number, targetZ: number,
  dt: number, map: ReefMap, tileSize: number, useChaseSpeed: boolean
) {
  const dx = targetX - pred.group.position.x;
  const dz = targetZ - pred.group.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) {
    pred.physical.waypoint = null;
    return;
  }

  // Turn toward target
  const targetAngle = Math.atan2(dx, dz);
  let angleDiff = targetAngle - pred.group.rotation.y;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const maxTurn = pred.chassis.turnSpeed * dt;
  pred.group.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);

  // Move forward
  const speed = useChaseSpeed ? pred.chassis.chaseSpeed : pred.chassis.speed;
  const moveX = Math.sin(pred.group.rotation.y) * speed * dt;
  const moveZ = Math.cos(pred.group.rotation.y) * speed * dt;
  const curX = pred.group.position.x;
  const curZ = pred.group.position.z;

  if (passableAt(curX + moveX, curZ, pred.chassis, map, tileSize))
    pred.group.position.x = curX + moveX;
  if (passableAt(pred.group.position.x, curZ + moveZ, pred.chassis, map, tileSize))
    pred.group.position.z = curZ + moveZ;

  // Stuck detection — pick new waypoint if wedged
  const moved = Math.abs(pred.group.position.x - curX) + Math.abs(pred.group.position.z - curZ);
  if (moved < 0.01 * dt) {
    pred.physical.stuckTimer += dt;
    if (pred.physical.stuckTimer > 1.5) {
      pred.physical.waypoint = null;
      pred.physical.stuckTimer = 0;
    }
  } else {
    pred.physical.stuckTimer = 0;
  }
}

function passableAt(
  wx: number, wz: number, ch: Chassis, map: ReefMap, tileSize: number
): boolean {
  const r = ch.collisionRadius;
  for (const off of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const { tx, tz } = worldToTile(wx + off[0], wz + off[1], tileSize, map.width, map.height);
    if (!isPassable(map, tx, tz, ch.isSmall)) return false;
  }
  return true;
}

// --- Waypoint picking ---

export function pickRandomOpenTile(
  map: ReefMap, tileSize: number, rng: () => number
): { x: number; z: number } {
  for (let i = 0; i < 50; i++) {
    const tx = Math.floor(rng() * map.width);
    const tz = Math.floor(rng() * map.height);
    const tile = getTile(map, tx, tz);
    if (tile === Tile.OPEN || tile === Tile.KELP) {
      const { wx, wz } = tileToWorld(tx, tz, tileSize, map.width, map.height);
      return { x: wx, z: wz };
    }
  }
  return { x: 0, z: 0 };
}

// --- Catch detection ---

export function checkCatch(pred: Predator, squid: Squid): boolean {
  const dx = squid.group.position.x - pred.group.position.x;
  const dz = squid.group.position.z - pred.group.position.z;
  return Math.sqrt(dx * dx + dz * dz) < pred.chassis.collisionRadius + 0.3;
}

// --- Tick dispatch ---

// Busy guard: predators currently executing on_tick code (async safety in rAF)
const busyPredators = new Set<string>();

/**
 * Compile + execute the soma's on_tick code, apply the resulting action.
 * The engine just pipes raw sensor data — all behavior logic lives in the soma.
 */
export function runTick(
  pred: Predator,
  sensors: SensorData,
  dt: number,
  t: number,
  map: ReefMap,
  tileSize: number,
  rng: () => number,
): void {
  // Skip if previous frame's on_tick is still running
  if (busyPredators.has(pred.id)) {
    // Continue current movement if we have a waypoint
    if (pred.physical.waypoint) {
      const useChase = pred.physical.lastActionType === 'pursue';
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map, tileSize, useChase);
    }
    return;
  }

  const compiled = compileInstinct(pred.predatorSoma);
  if (!compiled) {
    // Compilation failed — continue current movement as fallback
    if (pred.physical.waypoint) {
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map, tileSize, false);
    }
    return;
  }

  // Build world data (raw sensors + timing)
  const worldData: WorldData = {
    squidDetected: sensors.squidDetected,
    squidPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
    squidDist: sensors.squidDist,
    dt,
    t,
  };

  const actions: PendingAction[] = [];
  const api = createTickAPI(pred, map, tileSize, actions);

  busyPredators.add(pred.id);
  executeTick(compiled, api, worldData).then(() => {
    busyPredators.delete(pred.id);
    // Apply first queued action
    if (actions.length > 0) {
      applyAction(pred, actions[0], dt, map, tileSize, rng);
    }
  });

  // Also apply synchronously for this frame if actions were queued synchronously
  // (default on_tick code is sync despite async wrapper, so actions are ready immediately)
  if (actions.length > 0) {
    busyPredators.delete(pred.id);
    applyAction(pred, actions[0], dt, map, tileSize, rng);
  }

  // Animation hints — derived from actions, not soma state
  const actionType = actions.length > 0 ? actions[0].type : pred.physical.lastActionType;
  if (actionType === 'pursue') {
    pred.physical.timeSinceLastPursue = 0;
  } else {
    pred.physical.timeSinceLastPursue += dt;
  }
  pred.physical.lastActionType = actionType;
}

/** Map a PendingAction to movement primitives */
function applyAction(
  pred: Predator,
  action: PendingAction,
  dt: number,
  map: ReefMap,
  tileSize: number,
  rng: () => number,
): void {
  switch (action.type) {
    case 'pursue':
      if (action.target) {
        pred.physical.waypoint = { x: action.target.x, z: action.target.z };
        moveToward(pred, action.target.x, action.target.z, dt, map, tileSize, true);
      }
      break;

    case 'patrol_to':
      if (action.target) {
        pred.physical.waypoint = { x: action.target.x, z: action.target.z };
        moveToward(pred, action.target.x, action.target.z, dt, map, tileSize, false);
      }
      break;

    case 'patrol_random':
      if (!pred.physical.waypoint) {
        // Pick a waypoint far enough away for a real patrol leg
        for (let i = 0; i < 10; i++) {
          const wp = pickRandomOpenTile(map, tileSize, rng);
          const ddx = wp.x - pred.group.position.x;
          const ddz = wp.z - pred.group.position.z;
          if (ddx * ddx + ddz * ddz > 100) { pred.physical.waypoint = wp; break; }
        }
        if (!pred.physical.waypoint) pred.physical.waypoint = pickRandomOpenTile(map, tileSize, rng);
      }
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map, tileSize, false);
      break;

    case 'hold':
      // Do nothing — stay still
      break;
  }
}
