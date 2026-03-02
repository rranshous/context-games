import * as THREE from 'three';

// --- Config ---
const RENDER_W = 320;
const RENDER_H = 240;
const PIXEL_SCALE = 3;

// --- Toon gradient (3-step cel shading, like dark-rider) ---
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
scene.fog = new THREE.FogExp2(0x061220, 0.015);

// --- Camera (isometric orthographic, like dark-rider) ---
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
// Dim ambient — deep ocean
const ambient = new THREE.AmbientLight(0x1a3050, 0.8);
scene.add(ambient);

// Hemisphere: blue above, dark teal below
const hemi = new THREE.HemisphereLight(0x3366aa, 0x0a1a2a, 0.6);
scene.add(hemi);

// Directional "god ray" from above
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

// --- Ocean floor ---
const floorGeo = new THREE.PlaneGeometry(60, 60);
const floorMat = new THREE.MeshToonMaterial({
  color: 0x152a3a,
  gradientMap,
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.5;
floor.receiveShadow = true;
scene.add(floor);

// --- Sand patches ---
for (let i = 0; i < 30; i++) {
  const r = 0.5 + Math.random() * 1.5;
  const geo = new THREE.CircleGeometry(r, 8);
  const mat = new THREE.MeshToonMaterial({
    color: 0x253a4a,
    gradientMap,
  });
  const patch = new THREE.Mesh(geo, mat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(
    (Math.random() - 0.5) * 40,
    -0.48,
    (Math.random() - 0.5) * 40
  );
  scene.add(patch);
}

// --- Coral formations (chunky boxes/cylinders) ---
function makeCoralCluster(x: number, z: number) {
  const group = new THREE.Group();
  const hue = 0.55 + Math.random() * 0.15; // blue-purple range
  const baseColor = new THREE.Color().setHSL(hue, 0.5, 0.35);

  // Main column
  const h = 1 + Math.random() * 2.5;
  const geo = new THREE.CylinderGeometry(0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.3, h, 6);
  const mat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
  const col = new THREE.Mesh(geo, mat);
  col.position.y = h / 2;
  col.castShadow = true;
  col.receiveShadow = true;
  group.add(col);

  // Branch or two
  const branches = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < branches; i++) {
    const bh = 0.5 + Math.random() * 1.2;
    const bGeo = new THREE.CylinderGeometry(0.15, 0.25, bh, 5);
    const bMat = new THREE.MeshToonMaterial({
      color: baseColor.clone().offsetHSL(0.05, 0, 0.05),
      gradientMap,
    });
    const branch = new THREE.Mesh(bGeo, bMat);
    branch.position.set(
      (Math.random() - 0.5) * 0.8,
      h * 0.4 + Math.random() * h * 0.3,
      (Math.random() - 0.5) * 0.8
    );
    branch.rotation.z = (Math.random() - 0.5) * 0.6;
    branch.castShadow = true;
    group.add(branch);
  }

  group.position.set(x, -0.5, z);
  scene.add(group);
}

// Scatter coral clusters
for (let i = 0; i < 20; i++) {
  makeCoralCluster(
    (Math.random() - 0.5) * 30,
    (Math.random() - 0.5) * 30
  );
}

// --- Rock formations (dodecahedrons, like dark-rider) ---
for (let i = 0; i < 10; i++) {
  const s = 0.4 + Math.random() * 0.8;
  const geo = new THREE.DodecahedronGeometry(s);
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(0.58, 0.15, 0.15),
    gradientMap,
  });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(
    (Math.random() - 0.5) * 35,
    -0.5 + s * 0.4,
    (Math.random() - 0.5) * 35
  );
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

// --- Kelp (tall thin cones swaying) ---
const kelpGroup: THREE.Mesh[] = [];
for (let i = 0; i < 15; i++) {
  const h = 2 + Math.random() * 3;
  const geo = new THREE.ConeGeometry(0.15, h, 4);
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(0.35, 0.4, 0.15),
    gradientMap,
  });
  const kelp = new THREE.Mesh(geo, mat);
  kelp.position.set(
    (Math.random() - 0.5) * 30,
    -0.5 + h / 2,
    (Math.random() - 0.5) * 30
  );
  kelp.castShadow = true;
  scene.add(kelp);
  kelpGroup.push(kelp);
}

// --- Baby squid (the player — simple blocky shape) ---
const squidGroup = new THREE.Group();

// Body (elongated box)
const bodyGeo = new THREE.BoxGeometry(0.5, 0.4, 0.8);
const bodyMat = new THREE.MeshToonMaterial({
  color: 0x44ccff,
  gradientMap,
});
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow = true;
squidGroup.add(body);

// Eyes (two small bright spheres)
const eyeGeo = new THREE.SphereGeometry(0.08, 6, 4);
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x88ddff,
  emissiveIntensity: 0.8,
});
const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
eyeL.position.set(-0.15, 0.1, 0.35);
squidGroup.add(eyeL);
const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
eyeR.position.set(0.15, 0.1, 0.35);
squidGroup.add(eyeR);

// Tentacles (thin boxes trailing behind)
for (let i = 0; i < 4; i++) {
  const tGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
  const tMat = new THREE.MeshToonMaterial({
    color: 0x33aadd,
    gradientMap,
  });
  const tentacle = new THREE.Mesh(tGeo, tMat);
  tentacle.position.set(
    (i - 1.5) * 0.12,
    -0.1,
    -0.55
  );
  squidGroup.add(tentacle);
}

// Bioluminescent glow (point light on the squid)
const squidGlow = new THREE.PointLight(0x44ccff, 2.5, 12);
squidGlow.position.set(0, 0, 0);
squidGroup.add(squidGlow);

squidGroup.position.set(0, 1, 0);
scene.add(squidGroup);

// --- Ambient bioluminescence (scattered point lights) ---
for (let i = 0; i < 8; i++) {
  const color = new THREE.Color().setHSL(
    0.45 + Math.random() * 0.2,
    0.8,
    0.5
  );
  const light = new THREE.PointLight(color, 0.8, 10);
  light.position.set(
    (Math.random() - 0.5) * 25,
    0.5 + Math.random() * 2,
    (Math.random() - 0.5) * 25
  );
  scene.add(light);
}

// --- Input ---
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// --- Gamepad ---
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

// --- Game loop ---
const MOVE_SPEED = 4;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // --- Input: keyboard + gamepad ---
  let dx = 0, dz = 0;
  if (keys['w'] || keys['arrowup']) dz -= 1;
  if (keys['s'] || keys['arrowdown']) dz += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  const gp = readGamepad();
  if (gp.x !== 0 || gp.z !== 0) {
    dx = gp.x;
    dz = gp.z;
  }

  // Normalize diagonal
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }

  // Isometric-corrected movement: screen-right = (+1,0,-1), screen-up = (-1,0,-1)
  const isoRight = new THREE.Vector3(1, 0, -1).normalize();
  const isoUp = new THREE.Vector3(-1, 0, -1).normalize();
  const moveDir = new THREE.Vector3()
    .addScaledVector(isoRight, dx)
    .addScaledVector(isoUp, -dz);

  squidGroup.position.x += moveDir.x * MOVE_SPEED * dt;
  squidGroup.position.z += moveDir.z * MOVE_SPEED * dt;

  // Face movement direction
  if (len > 0) {
    squidGroup.rotation.y = Math.atan2(moveDir.x, moveDir.z);
  }

  // Gentle bob
  squidGroup.position.y = 1 + Math.sin(t * 1.5) * 0.15;

  // Camera follows squid
  camera.position.set(
    squidGroup.position.x + 20,
    20,
    squidGroup.position.z + 20
  );
  camera.lookAt(squidGroup.position);

  // Kelp sway
  for (const kelp of kelpGroup) {
    kelp.rotation.x = Math.sin(t * 0.8 + kelp.position.x) * 0.1;
    kelp.rotation.z = Math.cos(t * 0.6 + kelp.position.z) * 0.08;
  }

  // Squid glow pulse
  squidGlow.intensity = 1.2 + Math.sin(t * 2) * 0.4;

  renderer.render(scene, camera);
}

animate();
