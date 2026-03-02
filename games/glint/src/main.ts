import * as THREE from 'three';
import { generateReef, Tile, getTile, tileToWorld, worldToTile } from './map.js';
import { buildReef } from './reef.js';
import { createSquid, updateSquid } from './squid.js';
import { Predator, readSensors, checkCatch, dispatchStimulus } from './predator.js';
import { createShark } from './shark.js';
import { clearInstinctCache } from './instinct-executor.js';
import { HuntTracker, HuntSummary } from './hunt-tracker.js';
import { reflectPredator, shouldReflect } from './reflection.js';
import { savePredatorSomas, loadPredatorSomas, resetPredatorSomas } from './persistence.js';

// --- Config ---
const RENDER_W = 320;
const RENDER_H = 240;
const PIXEL_SCALE = 3;
const TILE_SIZE = 2; // world units per tile
const MAP_W = 50;
const MAP_H = 50;

// --- Toon gradient ---
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([60, 120, 220]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const gradientMap = makeToonGradient();

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(RENDER_W, RENDER_H);
renderer.domElement.style.width = `${RENDER_W * PIXEL_SCALE}px`;
renderer.domElement.style.height = `${RENDER_H * PIXEL_SCALE}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setClearColor(0x020810);
document.body.appendChild(renderer.domElement);

// --- Scene ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x061220, 0.018);

// --- Camera ---
const aspect = RENDER_W / RENDER_H;
const viewSize = 16;
const camera = new THREE.OrthographicCamera(
  -viewSize * aspect / 2, viewSize * aspect / 2,
  viewSize / 2, -viewSize / 2,
  0.1, 100
);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);

// --- Lighting ---
const ambient = new THREE.AmbientLight(0x1a3050, 0.8);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x3366aa, 0x0a1a2a, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0x4488cc, 1.0);
sun.position.set(5, 15, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// --- Generate map ---
const map = generateReef(MAP_W, MAP_H, 42);

// --- Build reef visuals ---
const reef = buildReef(scene, map, TILE_SIZE, gradientMap);

// --- Floating particles ---
const PARTICLE_COUNT = 300;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleSpeeds = new Float32Array(PARTICLE_COUNT);
const pRand = (() => {
  let s = 999;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
})();
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particlePositions[i * 3] = (pRand() - 0.5) * MAP_W * TILE_SIZE;
  particlePositions[i * 3 + 1] = pRand() * 6;
  particlePositions[i * 3 + 2] = (pRand() - 0.5) * MAP_H * TILE_SIZE;
  particleSpeeds[i] = 0.1 + pRand() * 0.3;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0x88ccee, size: 0.08, transparent: true, opacity: 0.6,
});
scene.add(new THREE.Points(particleGeo, particleMat));

// --- Jellyfish ---
type JellyData = { mesh: THREE.Mesh; light: THREE.PointLight; basePos: THREE.Vector3; phase: number };
const jellies: JellyData[] = [];
for (let i = 0; i < 8; i++) {
  const color = new THREE.Color().setHSL(0.45 + pRand() * 0.25, 0.8, 0.5);
  const geo = new THREE.SphereGeometry(0.15, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const pos = new THREE.Vector3(
    (pRand() - 0.5) * MAP_W * TILE_SIZE * 0.6,
    1 + pRand() * 3,
    (pRand() - 0.5) * MAP_H * TILE_SIZE * 0.6,
  );
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE.PointLight(color, 0.8, 10);
  light.position.copy(pos);
  scene.add(light);
  jellies.push({ mesh, light, basePos: pos.clone(), phase: pRand() * Math.PI * 2 });
}

// --- Player squid ---
const squid = createSquid(gradientMap);
const spawn = tileToWorld(map.playerSpawn.x, map.playerSpawn.z, TILE_SIZE, MAP_W, MAP_H);
squid.group.position.set(spawn.wx, 1, spawn.wz);
scene.add(squid.group);

// --- Predators ---
const predators: Predator[] = [];
let invulnTimer = 0; // seconds of catch immunity after respawn

// Seeded RNG for shark behavior (waypoint picking, etc.)
const sharkRng = (() => {
  let s = 54321;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
})();

// Load saved somas (if any) for this map seed
const MAP_SEED = 42;
const savedSomas = loadPredatorSomas(MAP_SEED);

// Spawn sharks in open tiles far from player
function spawnSharks(count: number) {
  const spawnRng = (() => {
    let s = 98765;
    return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  })();

  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tx = Math.floor(spawnRng() * MAP_W);
      const tz = Math.floor(spawnRng() * MAP_H);
      const tile = getTile(map, tx, tz);
      if (tile !== Tile.OPEN) continue;
      // Must be far from player spawn (tile distance)
      const dtx = tx - map.playerSpawn.x, dtz = tz - map.playerSpawn.z;
      if (dtx * dtx + dtz * dtz < 225) continue; // at least 15 tiles away
      const { wx, wz } = tileToWorld(tx, tz, TILE_SIZE, MAP_W, MAP_H);
      // Double-check world distance from spawn point
      const wdx = wx - spawn.wx, wdz = wz - spawn.wz;
      if (wdx * wdx + wdz * wdz < 400) continue; // at least 20 world units
      // Use saved soma if available for this shark index
      const existingSoma = savedSomas?.[n];
      const shark = createShark(`shark-${n}`, wx, wz, gradientMap, existingSoma);
      scene.add(shark.group);
      predators.push(shark);
      const somaStatus = existingSoma ? '(loaded soma)' : '(fresh soma)';
      console.log(`[GLINT] Spawned ${shark.id} at tile (${tx},${tz}) world (${wx.toFixed(1)},${wz.toFixed(1)}) ${somaStatus}`);
      break;
    }
  }
}
spawnSharks(3);

// --- Hunt tracking ---
const huntTracker = new HuntTracker();
const prevConcealed = new Map<string, boolean>();
const prevState = new Map<string, string>();

// API endpoint for reflection
const API_ENDPOINT = '/api/inference/anthropic/messages';

// Trigger reflection after a failed hunt
function triggerReflection(pred: Predator, summary: HuntSummary) {
  const soma = pred.predatorSoma;
  const gameTime = clock.getElapsedTime();

  if (!shouldReflect(soma, summary, gameTime)) return;

  // Record hunt in soma history (cap at 10)
  soma.huntHistory.push({
    huntId: summary.huntId,
    outcome: summary.outcome,
    durationSeconds: summary.durationSeconds,
    closestDistance: summary.closestDistance,
    preyConcealed: summary.preyConcealed,
    concealmentTile: summary.concealmentTile,
  });
  if (soma.huntHistory.length > 10) soma.huntHistory.shift();

  console.log(`[GLINT] Reflection started for ${pred.id} (hunt #${summary.huntId})`);
  soma.lastReflectionTime = gameTime;

  reflectPredator(
    soma,
    summary,
    huntTracker.getCompletedHunts(pred.id),
    API_ENDPOINT,
  ).then(result => {
    console.log(`[GLINT] Reflection complete for ${pred.id}: instinct=${result.instinctUpdated}, memory=${result.memoryUpdated}`);
    if (result.reasoning) {
      console.log(`[GLINT] Reasoning: ${result.reasoning.slice(0, 200)}`);
    }
    if (result.instinctUpdated) {
      clearInstinctCache();
    }
    savePredatorSomas(predators, MAP_SEED);
  }).catch(err => {
    console.log(`[GLINT] Reflection error for ${pred.id}: ${err}`);
    soma.reflectionPending = false;
  });
}

// Debug access
(window as any).__glint = {
  map, squid, tileToWorld, worldToTile, TILE_SIZE, MAP_W, MAP_H, predators,
  clearInstinctCache, huntTracker, readSensors, triggerReflection,
  get invulnTimer() { return invulnTimer; },
  set invulnTimer(v: number) { invulnTimer = v; },
  resetSomas: () => resetPredatorSomas(MAP_SEED),
  saveSomas: () => savePredatorSomas(predators, MAP_SEED),
};

// --- Game loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Update squid (input, movement, collision, animation)
  updateSquid(squid, dt, t, map, TILE_SIZE);

  // Update predators
  if (invulnTimer > 0) invulnTimer -= dt;
  for (const pred of predators) {
    // During invulnerability, squid is "invisible" — forces chasers into SEARCH→PATROL
    const sensors = invulnTimer > 0
      ? { squidDetected: false, squidWorldPos: { x: 0, z: 0 }, squidDist: 999 }
      : readSensors(pred, squid, map, TILE_SIZE);

    const wasState = prevState.get(pred.id) ?? 'patrol';
    const wasConcealed = prevConcealed.get(pred.id) ?? false;

    dispatchStimulus(pred, sensors, dt, map, TILE_SIZE, sharkRng);
    pred.animate(pred, t);

    // --- Hunt tracking ---
    // Start hunt when predator first detects prey
    if (sensors.squidDetected && !huntTracker.isHunting(pred.id)) {
      huntTracker.startHunt(pred.id, t);
      huntTracker.recordEvent(pred.id, {
        type: 'detected',
        predPos: { x: pred.group.position.x, z: pred.group.position.z },
        preyPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
        distance: sensors.squidDist,
      }, t);
    }

    if (huntTracker.isHunting(pred.id)) {
      // Record pursuing events (throttled inside tracker)
      if (sensors.squidDetected) {
        huntTracker.recordEvent(pred.id, {
          type: 'pursuing',
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
          distance: sensors.squidDist,
        }, t);
      }

      // Lost LOS transition
      if (wasState === 'chase' && pred.physical.state === 'search') {
        huntTracker.recordEvent(pred.id, {
          type: 'lost_los',
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
        }, t);
      }

      // Concealment transitions
      if (squid.concealed && !wasConcealed) {
        const { tx, tz } = worldToTile(
          squid.group.position.x, squid.group.position.z, TILE_SIZE, MAP_W, MAP_H
        );
        const tile = getTile(map, tx, tz);
        const tileName = tile === Tile.KELP ? 'kelp' : tile === Tile.CREVICE ? 'crevice' : tile === Tile.DEN ? 'den' : 'unknown';
        huntTracker.recordEvent(pred.id, {
          type: 'prey_concealed',
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: squid.group.position.x, z: squid.group.position.z },
          note: `Prey entered ${tileName} at (${squid.group.position.x.toFixed(1)}, ${squid.group.position.z.toFixed(1)})`,
        }, t);
      }
      if (!squid.concealed && wasConcealed) {
        huntTracker.recordEvent(pred.id, {
          type: 'prey_revealed',
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: squid.group.position.x, z: squid.group.position.z },
        }, t);
      }

      // End hunt: predator gave up (returned to patrol)
      if (pred.physical.state === 'patrol' && wasState !== 'patrol') {
        const summary = huntTracker.endHunt(pred.id, 'lost', t);
        if (summary) triggerReflection(pred, summary);
      }
    }

    prevState.set(pred.id, pred.physical.state);
    prevConcealed.set(pred.id, squid.concealed);

    // Catch — respawn squid at spawn (with invulnerability)
    if (invulnTimer <= 0 && checkCatch(pred, squid)) {
      // End hunt as catch for this predator
      if (huntTracker.isHunting(pred.id)) {
        huntTracker.endHunt(pred.id, 'catch', t);
      }
      console.log(`[GLINT] Caught by ${pred.id}!`);
      squid.group.position.set(spawn.wx, 1, spawn.wz);
      invulnTimer = 2.0; // 2 seconds immunity
      // Reset all predators to patrol + end any active hunts
      for (const p of predators) {
        if (p.id !== pred.id && huntTracker.isHunting(p.id)) {
          const lostSummary = huntTracker.endHunt(p.id, 'lost', t);
          if (lostSummary) triggerReflection(p, lostSummary);
        }
        p.physical.state = 'patrol';
        p.physical.waypoint = null;
        p.physical.lastSeenPos = null;
        prevState.set(p.id, 'patrol');
      }
      break;
    }
  }

  // Camera follow
  camera.position.set(squid.group.position.x + 20, 20, squid.group.position.z + 20);
  camera.lookAt(squid.group.position);

  // Shadow light follows player
  sun.position.set(squid.group.position.x + 5, 15, squid.group.position.z + 5);
  sun.target.position.copy(squid.group.position);
  sun.target.updateMatrixWorld();

  // Kelp sway
  for (const kelp of reef.kelpMeshes) {
    kelp.rotation.x = Math.sin(t * 0.6 + kelp.position.x * 0.3) * 0.15;
    kelp.rotation.z = Math.cos(t * 0.4 + kelp.position.z * 0.3) * 0.1;
  }

  // Coral sway
  for (const item of reef.swayItems) {
    item.obj.rotation.x = Math.sin(t * 0.7 + item.phase) * item.amplitude;
    item.obj.rotation.z = Math.cos(t * 0.5 + item.phase * 1.3) * item.amplitude * 0.7;
  }

  // Anemone tendrils
  for (const a of reef.anemones) {
    for (let i = 0; i < a.tendrils.length; i++) {
      const phase = (i / a.tendrils.length) * Math.PI * 2;
      a.tendrils[i].rotation.x = Math.sin(t * 1.0 + phase) * 0.35;
      a.tendrils[i].rotation.z = Math.cos(t * 0.7 + phase) * 0.25;
    }
  }

  // Den light pulse
  for (const light of reef.denLights) {
    light.intensity = 1.2 + Math.sin(t * 1.5 + light.position.x) * 0.5;
  }

  // Jellyfish drift
  for (const j of jellies) {
    j.mesh.position.y = j.basePos.y + Math.sin(t * 0.4 + j.phase) * 0.5;
    j.mesh.position.x = j.basePos.x + Math.sin(t * 0.15 + j.phase * 2) * 1.0;
    j.mesh.position.z = j.basePos.z + Math.cos(t * 0.12 + j.phase) * 0.5;
    j.light.position.copy(j.mesh.position);
    j.light.intensity = 0.5 + Math.sin(t * 1.5 + j.phase) * 0.3;
  }

  // Particles
  const posArr = particleGeo.attributes.position.array as Float32Array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    posArr[i * 3 + 1] += particleSpeeds[i] * dt * 0.3;
    posArr[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.08;
    posArr[i * 3 + 2] += Math.cos(t * 0.3 + i * 0.7) * dt * 0.05;
    if (posArr[i * 3 + 1] > 7) {
      posArr[i * 3 + 1] = -0.5;
      posArr[i * 3] = squid.group.position.x + (pRand() - 0.5) * 30;
      posArr[i * 3 + 2] = squid.group.position.z + (pRand() - 0.5) * 30;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();
