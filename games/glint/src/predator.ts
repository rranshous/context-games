// Predator architecture — shared types, sensors, movement
// Each predator type (shark, eel, etc.) provides its own soma + chassis + model.
// This file is the shared scaffold.
import * as THREE from 'three';
import { ReefMap, Tile, getTile, isPassable, worldToTile, tileToWorld } from './map.js';
import { Squid } from './squid.js';

// --- Types ---

export const enum PredatorState {
  PATROL = 0,
  CHASE = 1,
  SEARCH = 2,
}

/** Chassis — the physical scaffold: what the predator's body can do */
export interface Chassis {
  speed: number;          // patrol speed (world units/s)
  chaseSpeed: number;     // pursuit speed
  turnSpeed: number;      // radians/s
  collisionRadius: number;
  sensorRange: number;    // detection range (world units)
  isSmall: boolean;       // can fit through crevices?
}

/** Soma — the experienced aspect: state, memory, intentions */
export interface Soma {
  state: PredatorState;
  waypoint: { x: number; z: number } | null;
  lastSeenPos: { x: number; z: number } | null;
  searchTimer: number;
  stuckTimer: number;
}

/** What the chassis's sensors report each tick */
export interface SensorData {
  squidDetected: boolean;
  squidWorldPos: { x: number; z: number };
  squidDist: number;
}

/** A predator instance. Type-specific behavior via updateSoma/animate hooks. */
export interface Predator {
  id: string;
  type: string;
  group: THREE.Group;
  chassis: Chassis;
  soma: Soma;
  threatLight: THREE.PointLight;
  updateSoma: (pred: Predator, sensors: SensorData, dt: number, map: ReefMap, tileSize: number) => void;
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
  dt: number, map: ReefMap, tileSize: number
) {
  const dx = targetX - pred.group.position.x;
  const dz = targetZ - pred.group.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) {
    if (pred.soma.state === PredatorState.PATROL) pred.soma.waypoint = null;
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
  const speed = pred.soma.state === PredatorState.CHASE
    ? pred.chassis.chaseSpeed : pred.chassis.speed;
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
    pred.soma.stuckTimer += dt;
    if (pred.soma.stuckTimer > 1.5) {
      pred.soma.waypoint = null;
      pred.soma.stuckTimer = 0;
    }
  } else {
    pred.soma.stuckTimer = 0;
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
