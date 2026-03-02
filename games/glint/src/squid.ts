// Player squid — model, input, movement with collision
import * as THREE from 'three';
import { ReefMap, Tile, getTile, isPassable, worldToTile } from './map.js';

export interface Squid {
  group: THREE.Group;
  glow: THREE.PointLight;
  tentacles: THREE.Mesh[];
  finL: THREE.Mesh;
  finR: THREE.Mesh;
  mantle: THREE.Mesh;
  body: THREE.Mesh;
  eyes: THREE.Mesh[];
  concealed: boolean;
}

export function createSquid(gradientMap: THREE.DataTexture): Squid {
  const group = new THREE.Group();

  // Mantle — big bulbous dome
  const mantleGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const mantleMat = new THREE.MeshToonMaterial({ color: 0x44ccff, gradientMap });
  const mantle = new THREE.Mesh(mantleGeo, mantleMat);
  mantle.scale.set(0.8, 1.1, 1.0);
  mantle.position.y = 0.2;
  mantle.castShadow = true;
  group.add(mantle);

  // Side fins
  const finGeo = new THREE.ConeGeometry(0.12, 0.2, 4);
  const finMat = new THREE.MeshToonMaterial({ color: 0x55ddff, gradientMap });
  const finL = new THREE.Mesh(finGeo, finMat);
  finL.position.set(-0.28, 0.25, 0);
  finL.rotation.z = 0.8;
  group.add(finL);
  const finR = new THREE.Mesh(finGeo, finMat);
  finR.position.set(0.28, 0.25, 0);
  finR.rotation.z = -0.8;
  group.add(finR);

  // Body (connects mantle to tentacles)
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.15, 0.2, 8);
  const bodyMat = new THREE.MeshToonMaterial({ color: 0x33bbee, gradientMap });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = -0.12;
  group.add(body);

  // Eyes — lateral
  const eyeWhiteGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x88ddff,
    emissiveIntensity: 1.0,
  });
  const pupilGeo = new THREE.SphereGeometry(0.06, 6, 4);
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111133 });

  const eyeL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat.clone());
  eyeL.position.set(-0.22, 0.1, 0.18);
  group.add(eyeL);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.28, 0.1, 0.22);
  group.add(pupilL);

  const eyeR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat.clone());
  eyeR.position.set(0.22, 0.1, 0.18);
  group.add(eyeR);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
  pupilR.position.set(0.28, 0.1, 0.22);
  group.add(pupilR);

  // 8 tentacles in a ring
  const tentacles: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const tLen = 0.35 + Math.random() * 0.2;
    const tGeo = new THREE.CylinderGeometry(0.015, 0.035, tLen, 4);
    const tMat = new THREE.MeshToonMaterial({ color: 0x33aadd, gradientMap });
    const tentacle = new THREE.Mesh(tGeo, tMat);
    const angle = (i / 8) * Math.PI * 2;
    tentacle.position.set(Math.cos(angle) * 0.1, -0.25, Math.sin(angle) * 0.1);
    tentacle.rotation.x = 0.3;
    group.add(tentacle);
    tentacles.push(tentacle);
  }

  // Bioluminescent glow
  const glow = new THREE.PointLight(0x44ccff, 2.5, 12);
  group.add(glow);

  group.position.set(0, 1, 0);

  return { group, glow, tentacles, finL, finR, mantle, body, eyes: [eyeL, eyeR], concealed: false };
}

// Input state
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function readGamepad(): { x: number; z: number } {
  const gamepads = navigator.getGamepads();
  for (const gp of gamepads) {
    if (!gp) continue;
    const deadzone = 0.2;
    let x = gp.axes[0] ?? 0;
    let z = gp.axes[1] ?? 0;
    if (Math.abs(x) < deadzone) x = 0;
    if (Math.abs(z) < deadzone) z = 0;
    if (x !== 0 || z !== 0) return { x, z };
  }
  return { x: 0, z: 0 };
}

const isoRight = new THREE.Vector3(1, 0, -1).normalize();
const isoUp = new THREE.Vector3(-1, 0, -1).normalize();
const MOVE_SPEED = 6;
const SPRINT_MULT = 2.0;
const DEPLETED_MULT = 0.6;
const COLLISION_RADIUS = 0.3;

// Energy drain rates (per second)
const DRAIN_IDLE = 1;
const DRAIN_MOVE = 2;
const DRAIN_SPRINT = 5;

// Energy state — module-level, not on Squid (keeps interface visual-only)
let energy = 100;
export function getEnergy(): number { return energy; }
export function addEnergy(amount: number) { energy = Math.max(0, Math.min(100, energy + amount)); }
export function resetEnergy() { energy = 100; }

// Concealment colors
const CONCEALED_MANTLE = new THREE.Color(0x112233);
const CONCEALED_BODY = new THREE.Color(0x0a1a28);
const CONCEALED_GLOW_INTENSITY = 0.3;
const CONCEALMENT_SPEED = 4; // lerp speed (per second)

// Energy-driven appearance (full → depleted)
const FULL_MANTLE = new THREE.Color(0x44ccff);
const DEPLETED_MANTLE = new THREE.Color(0x1a3344);
const FULL_BODY = new THREE.Color(0x33bbee);
const DEPLETED_BODY = new THREE.Color(0x152a33);
const FULL_GLOW_INTENSITY = 2.5;
const DEPLETED_GLOW_INTENSITY = 0.4;
const FULL_GLOW_RANGE = 12;
const DEPLETED_GLOW_RANGE = 4;
const FULL_EYE_EMISSIVE = 1.0;
const DEPLETED_EYE_EMISSIVE = 0.15;
const FULL_PULSE_AMP = 0.2;
const DEPLETED_PULSE_AMP = 0.05;
// Helper for lerping between energy-driven values
const _energyMantle = new THREE.Color();
const _energyBody = new THREE.Color();
// Tracked glow base (separate from displayed intensity to avoid pulse feedback)
let _glowBase = FULL_GLOW_INTENSITY;

export function updateSquid(
  squid: Squid,
  dt: number,
  t: number,
  map: ReefMap,
  tileSize: number
) {
  // --- Input ---
  let dx = 0, dz = 0;
  if (keys['w'] || keys['arrowup']) dz -= 1;
  if (keys['s'] || keys['arrowdown']) dz += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  const gp = readGamepad();
  if (gp.x !== 0 || gp.z !== 0) { dx = gp.x; dz = gp.z; }

  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) { dx /= len; dz /= len; }

  // Sprint: Shift key or gamepad right trigger (blocked at zero energy)
  let sprinting = keys['shift'];
  if (!sprinting) {
    const gamepads = navigator.getGamepads();
    for (const gp2 of gamepads) {
      if (gp2 && gp2.buttons[7]?.pressed) { sprinting = true; break; }
    }
  }
  if (energy <= 0) sprinting = false;

  // Energy drain
  const moving = len > 0;
  const drainRate = sprinting ? DRAIN_SPRINT : moving ? DRAIN_MOVE : DRAIN_IDLE;
  energy = Math.max(0, energy - drainRate * dt);

  // Speed: depleted = 60% base, sprint = 1.6× (only when energy > 0)
  const baseMult = energy > 0 ? 1 : DEPLETED_MULT;
  const speed = MOVE_SPEED * baseMult * (sprinting ? SPRINT_MULT : 1);

  const moveDir = new THREE.Vector3()
    .addScaledVector(isoRight, dx)
    .addScaledVector(isoUp, -dz);

  // --- Movement with collision ---
  const newX = squid.group.position.x + moveDir.x * speed * dt;
  const newZ = squid.group.position.z + moveDir.z * speed * dt;

  // Check collision per axis (slide along walls)
  const curX = squid.group.position.x;
  const curZ = squid.group.position.z;

  // Try X movement
  if (canMoveTo(newX, curZ, map, tileSize)) {
    squid.group.position.x = newX;
  }
  // Try Z movement
  if (canMoveTo(squid.group.position.x, newZ, map, tileSize)) {
    squid.group.position.z = newZ;
  }

  // Face movement direction
  if (len > 0) {
    squid.group.rotation.y = Math.atan2(moveDir.x, moveDir.z);
  }

  // Gentle bob
  squid.group.position.y = 1 + Math.sin(t * 1.5) * 0.15;

  // Fin flutter
  squid.finL.rotation.z = 0.8 + Math.sin(t * 4) * 0.2;
  squid.finR.rotation.z = -0.8 - Math.sin(t * 4) * 0.2;

  // Energy percentage (used by tentacles + bioluminescence below)
  const energyPct = energy / 100;

  // Tentacle animation (dampened when energy low)
  const tentacleMult = 0.5 + 0.5 * energyPct; // 1.0 at full → 0.5 at empty
  for (let i = 0; i < squid.tentacles.length; i++) {
    const phase = (i / squid.tentacles.length) * Math.PI * 2;
    const swaySpeed = len > 0 ? 6 : 1.5;
    const swayAmp = (len > 0 ? 0.15 : 0.25) * tentacleMult;
    squid.tentacles[i].rotation.x = 0.4 + Math.sin(t * swaySpeed + phase) * swayAmp;
    squid.tentacles[i].rotation.z = Math.sin(t * 2 + phase) * 0.15 * tentacleMult;
  }

  // --- Concealment ---
  const { tx, tz } = worldToTile(squid.group.position.x, squid.group.position.z, tileSize, map.width, map.height);
  const currentTile = getTile(map, tx, tz);
  const onHidingTile = currentTile === Tile.DEN || currentTile === Tile.CREVICE || currentTile === Tile.KELP;
  // Only conceal when still (not moving)
  squid.concealed = onHidingTile && len === 0;

  // --- Energy-driven bioluminescence ---
  // Compute energy-modulated "normal" appearance
  _energyMantle.copy(DEPLETED_MANTLE).lerp(FULL_MANTLE, energyPct);
  _energyBody.copy(DEPLETED_BODY).lerp(FULL_BODY, energyPct);
  const energyGlow = DEPLETED_GLOW_INTENSITY + (FULL_GLOW_INTENSITY - DEPLETED_GLOW_INTENSITY) * energyPct;
  const energyRange = DEPLETED_GLOW_RANGE + (FULL_GLOW_RANGE - DEPLETED_GLOW_RANGE) * energyPct;
  const energyEyeEmissive = DEPLETED_EYE_EMISSIVE + (FULL_EYE_EMISSIVE - DEPLETED_EYE_EMISSIVE) * energyPct;
  const energyPulseAmp = DEPLETED_PULSE_AMP + (FULL_PULSE_AMP - DEPLETED_PULSE_AMP) * energyPct;

  // Concealment overrides energy appearance when hiding
  const targetMantle = squid.concealed ? CONCEALED_MANTLE : _energyMantle;
  const targetBody = squid.concealed ? CONCEALED_BODY : _energyBody;
  const targetGlow = squid.concealed ? CONCEALED_GLOW_INTENSITY : energyGlow;

  const lerpT = 1 - Math.exp(-CONCEALMENT_SPEED * dt);

  const mantleMat = squid.mantle.material as THREE.MeshToonMaterial;
  mantleMat.color.lerp(targetMantle, lerpT);
  const bodyMat = squid.body.material as THREE.MeshToonMaterial;
  bodyMat.color.lerp(targetBody, lerpT);

  // Glow: intensity + range (tracked base avoids pulse feedback into lerp)
  _glowBase += (targetGlow - _glowBase) * lerpT;
  const pulseAmp = squid.concealed ? 0.08 : energyPulseAmp;
  squid.glow.intensity = Math.max(0, _glowBase + Math.sin(t * 2) * pulseAmp);
  squid.glow.distance = squid.glow.distance + (energyRange - squid.glow.distance) * lerpT;

  // Eye emissive intensity
  for (const eye of squid.eyes) {
    const eyeMat = eye.material as THREE.MeshStandardMaterial;
    eyeMat.emissiveIntensity += (energyEyeEmissive - eyeMat.emissiveIntensity) * lerpT;
  }
}

function canMoveTo(wx: number, wz: number, map: ReefMap, tileSize: number): boolean {
  // Check corners of collision box
  const offsets = [
    { dx: -COLLISION_RADIUS, dz: -COLLISION_RADIUS },
    { dx: COLLISION_RADIUS, dz: -COLLISION_RADIUS },
    { dx: -COLLISION_RADIUS, dz: COLLISION_RADIUS },
    { dx: COLLISION_RADIUS, dz: COLLISION_RADIUS },
  ];
  for (const off of offsets) {
    const { tx, tz } = worldToTile(wx + off.dx, wz + off.dz, tileSize, map.width, map.height);
    if (!isPassable(map, tx, tz, true)) return false;
  }
  return true;
}
