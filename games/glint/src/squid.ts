// Player squid — model, input, movement with collision
import * as THREE from 'three';
import { ReefMap, isPassable, worldToTile } from './map.js';

export interface Squid {
  group: THREE.Group;
  glow: THREE.PointLight;
  tentacles: THREE.Mesh[];
  finL: THREE.Mesh;
  finR: THREE.Mesh;
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

  const eyeL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeL.position.set(-0.22, 0.1, 0.18);
  group.add(eyeL);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.28, 0.1, 0.22);
  group.add(pupilL);

  const eyeR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
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

  return { group, glow, tentacles, finL, finR };
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
const SPRINT_MULT = 1.6;
const COLLISION_RADIUS = 0.3;

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

  // Sprint: Shift key or gamepad right trigger
  let sprinting = keys['shift'];
  if (!sprinting) {
    const gamepads = navigator.getGamepads();
    for (const gp2 of gamepads) {
      if (gp2 && gp2.buttons[7]?.pressed) { sprinting = true; break; }
    }
  }
  const speed = MOVE_SPEED * (sprinting ? SPRINT_MULT : 1);

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

  // Tentacle animation
  for (let i = 0; i < squid.tentacles.length; i++) {
    const phase = (i / squid.tentacles.length) * Math.PI * 2;
    const swaySpeed = len > 0 ? 6 : 1.5;
    const swayAmp = len > 0 ? 0.15 : 0.25;
    squid.tentacles[i].rotation.x = 0.4 + Math.sin(t * swaySpeed + phase) * swayAmp;
    squid.tentacles[i].rotation.z = Math.sin(t * 2 + phase) * 0.15;
  }

  // Glow pulse
  squid.glow.intensity = 2.0 + Math.sin(t * 2) * 0.6;
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
