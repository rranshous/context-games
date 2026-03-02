import * as THREE from 'three';

// --- Config ---
const RENDER_W = 320;
const RENDER_H = 240;
const PIXEL_SCALE = 3;
const MOVE_SPEED = 4;

// --- Toon gradient (3-step cel shading) ---
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([60, 120, 220]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const gradientMap = makeToonGradient();

// --- Seeded random for deterministic reef ---
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

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
scene.fog = new THREE.FogExp2(0x061220, 0.015);

// --- Camera (isometric orthographic) ---
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
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

// ============================================================
// OCEAN FLOOR
// ============================================================
const floorGeo = new THREE.PlaneGeometry(80, 80);
const floorMat = new THREE.MeshToonMaterial({ color: 0x152a3a, gradientMap });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.5;
floor.receiveShadow = true;
scene.add(floor);

// Sand patches
for (let i = 0; i < 40; i++) {
  const r = 0.5 + rand() * 2;
  const geo = new THREE.CircleGeometry(r, 8);
  const mat = new THREE.MeshToonMaterial({ color: 0x253a4a, gradientMap });
  const patch = new THREE.Mesh(geo, mat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set((rand() - 0.5) * 50, -0.48, (rand() - 0.5) * 50);
  scene.add(patch);
}

// ============================================================
// REEF LAYOUT — structured coral labyrinth
// ============================================================

// Coral palette — warm accents mixed with cool
const coralPalette = [
  { h: 0.55, s: 0.5, l: 0.35 },   // blue-purple
  { h: 0.65, s: 0.5, l: 0.30 },   // indigo
  { h: 0.85, s: 0.5, l: 0.35 },   // pink-magenta
  { h: 0.95, s: 0.5, l: 0.30 },   // coral-red
  { h: 0.08, s: 0.6, l: 0.35 },   // orange
  { h: 0.75, s: 0.4, l: 0.35 },   // purple
];

function pickCoralColor(): THREE.Color {
  const p = coralPalette[Math.floor(rand() * coralPalette.length)];
  return new THREE.Color().setHSL(p.h + (rand() - 0.5) * 0.05, p.s, p.l);
}

// --- Coral types ---
function makeColumnCoral(x: number, z: number) {
  const group = new THREE.Group();
  const baseColor = pickCoralColor();
  const h = 1.2 + rand() * 2.5;
  const geo = new THREE.CylinderGeometry(0.25 + rand() * 0.35, 0.35 + rand() * 0.3, h, 6);
  const mat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
  const col = new THREE.Mesh(geo, mat);
  col.position.y = h / 2;
  col.castShadow = true;
  col.receiveShadow = true;
  group.add(col);

  // Branches
  const branches = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < branches; i++) {
    const bh = 0.4 + rand() * 1.0;
    const bGeo = new THREE.CylinderGeometry(0.1, 0.2, bh, 5);
    const bMat = new THREE.MeshToonMaterial({
      color: baseColor.clone().offsetHSL(0.05, 0, 0.08),
      gradientMap,
    });
    const branch = new THREE.Mesh(bGeo, bMat);
    branch.position.set((rand() - 0.5) * 0.7, h * 0.4 + rand() * h * 0.4, (rand() - 0.5) * 0.7);
    branch.rotation.z = (rand() - 0.5) * 0.7;
    branch.castShadow = true;
    group.add(branch);
  }

  group.position.set(x, -0.5, z);
  return group;
}

function makeBrainCoral(x: number, z: number) {
  const color = pickCoralColor();
  const s = 0.5 + rand() * 0.8;
  const geo = new THREE.IcosahedronGeometry(s, 0);
  const mat = new THREE.MeshToonMaterial({ color, gradientMap });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, -0.5 + s * 0.5, z);
  mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
  mesh.scale.y = 0.6; // squash into a dome
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFanCoral(x: number, z: number) {
  const color = pickCoralColor();
  const w = 0.8 + rand() * 1.2;
  const h = 1.0 + rand() * 1.5;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshToonMaterial({ color, gradientMap, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, -0.5 + h / 2, z);
  mesh.rotation.y = rand() * Math.PI;
  mesh.castShadow = true;
  return mesh;
}

type AnemoneData = { mesh: THREE.Group; tendrils: THREE.Mesh[]; baseY: number };
const anemones: AnemoneData[] = [];

function makeAnemone(x: number, z: number) {
  const group = new THREE.Group();
  const baseColor = pickCoralColor();
  const tendrils: THREE.Mesh[] = [];

  // Base
  const baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8);
  const baseMat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.15;
  group.add(base);

  // Tendrils with glowing tips
  const count = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const th = 0.5 + rand() * 0.8;
    const tGeo = new THREE.CylinderGeometry(0.02, 0.04, th, 4);
    const tMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone().offsetHSL(0, 0.2, 0.2),
      emissiveIntensity: 0.6,
    });
    const tendril = new THREE.Mesh(tGeo, tMat);
    const angle = (i / count) * Math.PI * 2;
    const r = 0.15 + rand() * 0.1;
    tendril.position.set(Math.cos(angle) * r, 0.3 + th / 2, Math.sin(angle) * r);
    group.add(tendril);
    tendrils.push(tendril);
  }

  group.position.set(x, -0.5, z);
  scene.add(group);
  anemones.push({ mesh: group, tendrils, baseY: 0.3 });
  return group;
}

// --- Reef structure: walls, channels, clearings ---
// Outer walls (dense coral forming boundary)
function placeWall(x1: number, z1: number, x2: number, z2: number, density: number) {
  const dist = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
  const count = Math.floor(dist * density);
  for (let i = 0; i < count; i++) {
    const t = i / count + (rand() - 0.5) * 0.3 / count;
    const x = x1 + (x2 - x1) * t + (rand() - 0.5) * 1.5;
    const z = z1 + (z2 - z1) * t + (rand() - 0.5) * 1.5;
    const type = rand();
    if (type < 0.5) scene.add(makeColumnCoral(x, z));
    else if (type < 0.75) scene.add(makeBrainCoral(x, z));
    else scene.add(makeFanCoral(x, z));
  }
}

// Outer boundary — ring of coral
placeWall(-15, -15, 15, -15, 1.5);  // north
placeWall(15, -15, 15, 15, 1.5);    // east
placeWall(15, 15, -15, 15, 1.5);    // south
placeWall(-15, 15, -15, -15, 1.5);  // west

// Interior walls — create channels
placeWall(-10, -5, 5, -5, 1.2);     // horizontal divider
placeWall(0, 0, 0, 10, 1.0);        // vertical divider
placeWall(-8, 5, -3, 8, 0.8);       // diagonal pocket
placeWall(5, -10, 8, 0, 0.8);       // east passage wall

// Scattered coral in clearings (sparse)
for (let i = 0; i < 10; i++) {
  const x = (rand() - 0.5) * 24;
  const z = (rand() - 0.5) * 24;
  const type = rand();
  if (type < 0.4) scene.add(makeColumnCoral(x, z));
  else if (type < 0.7) scene.add(makeBrainCoral(x, z));
  else scene.add(makeFanCoral(x, z));
}

// Anemone clusters (in sheltered spots)
makeAnemone(-5, -8);
makeAnemone(-6, -7);
makeAnemone(8, 6);
makeAnemone(9, 7);
makeAnemone(-3, 3);
makeAnemone(3, -2);
makeAnemone(-10, 10);
makeAnemone(10, -10);

// --- Rocks ---
for (let i = 0; i < 15; i++) {
  const s = 0.3 + rand() * 0.8;
  const geo = new THREE.DodecahedronGeometry(s);
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(0.58, 0.15, 0.18),
    gradientMap,
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set((rand() - 0.5) * 30, -0.5 + s * 0.35, (rand() - 0.5) * 30);
  rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

// --- Kelp groves ---
const kelpGroup: THREE.Mesh[] = [];
function placeKelpGrove(cx: number, cz: number, count: number, spread: number) {
  for (let i = 0; i < count; i++) {
    const h = 2 + rand() * 3;
    const geo = new THREE.ConeGeometry(0.12, h, 4);
    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color().setHSL(0.3 + rand() * 0.1, 0.45, 0.18),
      gradientMap,
    });
    const kelp = new THREE.Mesh(geo, mat);
    kelp.position.set(cx + (rand() - 0.5) * spread, -0.5 + h / 2, cz + (rand() - 0.5) * spread);
    kelp.castShadow = true;
    scene.add(kelp);
    kelpGroup.push(kelp);
  }
}
placeKelpGrove(-10, 0, 6, 3);
placeKelpGrove(8, -8, 5, 3);
placeKelpGrove(3, 10, 4, 2);
placeKelpGrove(-5, 12, 4, 2);

// ============================================================
// FLOATING PARTICLES — marine snow / plankton
// ============================================================
const PARTICLE_COUNT = 200;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
const particleSpeeds = new Float32Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particlePositions[i * 3] = (rand() - 0.5) * 40;
  particlePositions[i * 3 + 1] = rand() * 6;
  particlePositions[i * 3 + 2] = (rand() - 0.5) * 40;
  particleSpeeds[i] = 0.1 + rand() * 0.3;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0x88ccee,
  size: 0.08,
  transparent: true,
  opacity: 0.6,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// ============================================================
// AMBIENT BIOLUMINESCENCE — glowing jellyfish-like orbs
// ============================================================
type JellyData = { mesh: THREE.Mesh; light: THREE.PointLight; basePos: THREE.Vector3; phase: number };
const jellies: JellyData[] = [];

for (let i = 0; i < 6; i++) {
  const color = new THREE.Color().setHSL(0.45 + rand() * 0.25, 0.8, 0.5);
  const geo = new THREE.SphereGeometry(0.15, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const pos = new THREE.Vector3((rand() - 0.5) * 25, 1 + rand() * 3, (rand() - 0.5) * 25);
  mesh.position.copy(pos);
  scene.add(mesh);

  const light = new THREE.PointLight(color, 0.8, 10);
  light.position.copy(pos);
  scene.add(light);

  jellies.push({ mesh, light, basePos: pos.clone(), phase: rand() * Math.PI * 2 });
}

// ============================================================
// BABY SQUID (player)
// ============================================================
const squidGroup = new THREE.Group();

// Mantle (dome top)
const mantleGeo = new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const mantleMat = new THREE.MeshToonMaterial({ color: 0x44ccff, gradientMap });
const mantle = new THREE.Mesh(mantleGeo, mantleMat);
mantle.position.y = 0.1;
mantle.castShadow = true;
squidGroup.add(mantle);

// Body
const bodyGeo = new THREE.SphereGeometry(0.3, 8, 6);
const bodyMat = new THREE.MeshToonMaterial({ color: 0x33bbee, gradientMap });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.scale.set(1, 0.7, 1.2);
body.castShadow = true;
squidGroup.add(body);

// Eyes (big, expressive)
const eyeGeo = new THREE.SphereGeometry(0.1, 8, 6);
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x88ddff,
  emissiveIntensity: 1.0,
});
const pupilGeo = new THREE.SphereGeometry(0.05, 6, 4);
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111133 });

const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
eyeL.position.set(-0.18, 0.08, 0.28);
squidGroup.add(eyeL);
const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
pupilL.position.set(-0.18, 0.08, 0.34);
squidGroup.add(pupilL);

const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
eyeR.position.set(0.18, 0.08, 0.28);
squidGroup.add(eyeR);
const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
pupilR.position.set(0.18, 0.08, 0.34);
squidGroup.add(pupilR);

// Tentacles (animated)
const tentacles: THREE.Mesh[] = [];
for (let i = 0; i < 6; i++) {
  const tLen = 0.4 + rand() * 0.2;
  const tGeo = new THREE.CylinderGeometry(0.02, 0.04, tLen, 4);
  const tMat = new THREE.MeshToonMaterial({ color: 0x33aadd, gradientMap });
  const tentacle = new THREE.Mesh(tGeo, tMat);
  const angle = ((i - 2.5) / 5) * 0.8;
  tentacle.position.set(Math.sin(angle) * 0.15, -0.15, -0.25);
  tentacle.rotation.x = 0.3;
  squidGroup.add(tentacle);
  tentacles.push(tentacle);
}

// Bioluminescent glow
const squidGlow = new THREE.PointLight(0x44ccff, 2.5, 12);
squidGroup.add(squidGlow);

squidGroup.position.set(0, 1, 0);
scene.add(squidGroup);

// ============================================================
// INPUT
// ============================================================
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

// ============================================================
// GAME LOOP
// ============================================================
const clock = new THREE.Clock();
const isoRight = new THREE.Vector3(1, 0, -1).normalize();
const isoUp = new THREE.Vector3(-1, 0, -1).normalize();
let lastMoveDir = new THREE.Vector3(0, 0, 1);

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

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

  const moveDir = new THREE.Vector3()
    .addScaledVector(isoRight, dx)
    .addScaledVector(isoUp, -dz);

  squidGroup.position.x += moveDir.x * MOVE_SPEED * dt;
  squidGroup.position.z += moveDir.z * MOVE_SPEED * dt;

  if (len > 0) {
    squidGroup.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    lastMoveDir.copy(moveDir);
  }

  // Gentle bob
  squidGroup.position.y = 1 + Math.sin(t * 1.5) * 0.15;

  // --- Tentacle animation ---
  for (let i = 0; i < tentacles.length; i++) {
    const phase = (i / tentacles.length) * Math.PI * 2;
    // Trail behind when moving, wave gently when idle
    const trailAngle = len > 0 ? 0.4 + Math.sin(t * 6 + phase) * 0.15 : 0.2 + Math.sin(t * 1.5 + phase) * 0.2;
    tentacles[i].rotation.x = trailAngle;
    tentacles[i].rotation.z = Math.sin(t * 2 + phase) * 0.1;
  }

  // --- Squid glow pulse ---
  squidGlow.intensity = 2.0 + Math.sin(t * 2) * 0.6;

  // --- Camera follow ---
  camera.position.set(squidGroup.position.x + 20, 20, squidGroup.position.z + 20);
  camera.lookAt(squidGroup.position);

  // --- Kelp sway ---
  for (const kelp of kelpGroup) {
    kelp.rotation.x = Math.sin(t * 0.8 + kelp.position.x) * 0.12;
    kelp.rotation.z = Math.cos(t * 0.6 + kelp.position.z) * 0.08;
  }

  // --- Anemone tendrils wave ---
  for (const a of anemones) {
    for (let i = 0; i < a.tendrils.length; i++) {
      const phase = (i / a.tendrils.length) * Math.PI * 2;
      a.tendrils[i].rotation.x = Math.sin(t * 1.2 + phase) * 0.3;
      a.tendrils[i].rotation.z = Math.cos(t * 0.9 + phase) * 0.2;
    }
  }

  // --- Jellyfish drift ---
  for (const j of jellies) {
    j.mesh.position.y = j.basePos.y + Math.sin(t * 0.4 + j.phase) * 0.5;
    j.mesh.position.x = j.basePos.x + Math.sin(t * 0.2 + j.phase * 2) * 0.3;
    j.light.position.copy(j.mesh.position);
    j.light.intensity = 0.5 + Math.sin(t * 1.5 + j.phase) * 0.3;
  }

  // --- Floating particles drift ---
  const posArr = particleGeo.attributes.position.array as Float32Array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    posArr[i * 3 + 1] += particleSpeeds[i] * dt * 0.3;
    posArr[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.05;
    // Reset when they float above camera
    if (posArr[i * 3 + 1] > 7) {
      posArr[i * 3 + 1] = -0.5;
      posArr[i * 3] = squidGroup.position.x + (rand() - 0.5) * 30;
      posArr[i * 3 + 2] = squidGroup.position.z + (rand() - 0.5) * 30;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();
