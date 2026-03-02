// src/main.ts
import * as THREE3 from "three";

// src/map.ts
function idx(x, z, w) {
  return z * w + x;
}
function getTile(map2, x, z) {
  if (x < 0 || x >= map2.width || z < 0 || z >= map2.height) return 1 /* WALL */;
  return map2.tiles[idx(x, z, map2.width)];
}
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function countWallNeighbors(tiles, x, z, w, h) {
  let count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= w || nz < 0 || nz >= h) {
        count++;
      } else if (tiles[idx(nx, nz, w)] === 1 /* WALL */) {
        count++;
      }
    }
  }
  return count;
}
function floodFill(tiles, x, z, w, h) {
  const visited = /* @__PURE__ */ new Set();
  const stack = [idx(x, z, w)];
  while (stack.length > 0) {
    const i = stack.pop();
    if (visited.has(i)) continue;
    if (tiles[i] === 1 /* WALL */) continue;
    visited.add(i);
    const cx = i % w;
    const cz = Math.floor(i / w);
    if (cx > 0) stack.push(idx(cx - 1, cz, w));
    if (cx < w - 1) stack.push(idx(cx + 1, cz, w));
    if (cz > 0) stack.push(idx(cx, cz - 1, w));
    if (cz < h - 1) stack.push(idx(cx, cz + 1, w));
  }
  return visited;
}
function generateReef(width, height, seed = 42) {
  const rand = mulberry32(seed);
  const total = width * height;
  const tiles = new Array(total);
  for (let i = 0; i < total; i++) {
    const x = i % width;
    const z = Math.floor(i / width);
    if (x === 0 || x === width - 1 || z === 0 || z === height - 1) {
      tiles[i] = 1 /* WALL */;
    } else {
      tiles[i] = rand() < 0.42 ? 1 /* WALL */ : 0 /* OPEN */;
    }
  }
  for (let iter = 0; iter < 5; iter++) {
    const next = new Array(total);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || z === 0 || z === height - 1) {
          next[idx(x, z, width)] = 1 /* WALL */;
        } else {
          const walls = countWallNeighbors(tiles, x, z, width, height);
          next[idx(x, z, width)] = walls >= 5 ? 1 /* WALL */ : 0 /* OPEN */;
        }
      }
    }
    for (let i = 0; i < total; i++) tiles[i] = next[i];
  }
  const cx = Math.floor(width / 2);
  const cz = Math.floor(height / 2);
  let spawnX = cx, spawnZ = cz;
  if (tiles[idx(cx, cz, width)] === 1 /* WALL */) {
    let found = false;
    for (let r = 1; r < Math.max(width, height) && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = cx + dx, nz = cz + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height && tiles[idx(nx, nz, width)] !== 1 /* WALL */) {
            spawnX = nx;
            spawnZ = nz;
            found = true;
          }
        }
      }
    }
  }
  const mainRegion = floodFill(tiles, spawnX, spawnZ, width, height);
  for (let i = 0; i < total; i++) {
    if (tiles[i] !== 1 /* WALL */ && !mainRegion.has(i)) {
      tiles[i] = 1 /* WALL */;
    }
  }
  const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]];
  const alcoveCandidates = [];
  for (let z = 2; z < height - 2; z++) {
    for (let x = 2; x < width - 2; x++) {
      if (tiles[idx(x, z, width)] !== 1 /* WALL */) continue;
      for (const [dx, dz] of dirs) {
        const ox = x + dx, oz = z + dz;
        if (ox < 1 || ox >= width - 1 || oz < 1 || oz >= height - 1) continue;
        if (tiles[idx(ox, oz, width)] !== 0 /* OPEN */) continue;
        const ix = x - dx, iz = z - dz;
        if (ix < 1 || ix >= width - 1 || iz < 1 || iz >= height - 1) continue;
        if (tiles[idx(ix, iz, width)] !== 1 /* WALL */) continue;
        let wallCount = 0;
        for (const [ndx, ndz] of dirs) {
          const nx = ix + ndx, nz = iz + ndz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) {
            wallCount++;
            continue;
          }
          if (tiles[idx(nx, nz, width)] === 1 /* WALL */) wallCount++;
        }
        if (wallCount >= 3) {
          alcoveCandidates.push({ ex: x, ez: z, dx, dz, ix, iz });
        }
      }
    }
  }
  for (let i = alcoveCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [alcoveCandidates[i], alcoveCandidates[j]] = [alcoveCandidates[j], alcoveCandidates[i]];
  }
  const dens = [];
  const targetDens = 18;
  const minDenDist = 7;
  for (const c of alcoveCandidates) {
    if (dens.length >= targetDens) break;
    const tooClose = dens.some((d) => Math.abs(d.x - c.ix) + Math.abs(d.z - c.iz) < minDenDist);
    if (tooClose) continue;
    if (Math.abs(c.ix - spawnX) + Math.abs(c.iz - spawnZ) < 4) continue;
    tiles[idx(c.ex, c.ez, width)] = 0 /* OPEN */;
    tiles[idx(c.ix, c.iz, width)] = 4 /* DEN */;
    dens.push({ x: c.ix, z: c.iz });
  }
  for (let z = 1; z < height - 1; z++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[idx(x, z, width)] !== 0 /* OPEN */) continue;
      let cardinalWalls = 0;
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) {
          cardinalWalls++;
          continue;
        }
        if (tiles[idx(nx, nz, width)] === 1 /* WALL */) cardinalWalls++;
      }
      if (cardinalWalls >= 2) {
        tiles[idx(x, z, width)] = 2 /* CREVICE */;
      }
    }
  }
  const kelpSeeds = 6 + Math.floor(rand() * 4);
  for (let k = 0; k < kelpSeeds; k++) {
    const kx = 3 + Math.floor(rand() * (width - 6));
    const kz = 3 + Math.floor(rand() * (height - 6));
    if (tiles[idx(kx, kz, width)] !== 0 /* OPEN */) continue;
    const size = 2 + Math.floor(rand() * 3);
    for (let dz = -size; dz <= size; dz++) {
      for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dz * dz > size * size) continue;
        const nx = kx + dx, nz = kz + dz;
        if (nx > 0 && nx < width - 1 && nz > 0 && nz < height - 1) {
          if (tiles[idx(nx, nz, width)] === 0 /* OPEN */ && rand() < 0.6) {
            tiles[idx(nx, nz, width)] = 3 /* KELP */;
          }
        }
      }
    }
  }
  return {
    width,
    height,
    tiles,
    playerSpawn: { x: spawnX, z: spawnZ },
    dens
  };
}
function isPassable(map2, x, z, isSmall = true) {
  const tile = getTile(map2, x, z);
  if (tile === 1 /* WALL */) return false;
  if (tile === 2 /* CREVICE */ && !isSmall) return false;
  return true;
}
function worldToTile(wx, wz, tileSize, mapW, mapH) {
  return {
    tx: Math.floor(wx / tileSize + mapW / 2),
    tz: Math.floor(wz / tileSize + mapH / 2)
  };
}
function tileToWorld(tx, tz, tileSize, mapW, mapH) {
  return {
    wx: (tx - mapW / 2 + 0.5) * tileSize,
    wz: (tz - mapH / 2 + 0.5) * tileSize
  };
}

// src/reef.ts
import * as THREE from "three";
function mulberry322(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var coralPalette = [
  { h: 0.55, s: 0.5, l: 0.35 },
  { h: 0.85, s: 0.55, l: 0.4 },
  { h: 0.95, s: 0.55, l: 0.35 },
  { h: 0.08, s: 0.6, l: 0.4 },
  { h: 0.75, s: 0.45, l: 0.38 },
  { h: 0.12, s: 0.5, l: 0.42 }
];
function buildReef(scene2, map2, tileSize, gradientMap2) {
  const rand = mulberry322(777);
  const result = {
    swayItems: [],
    kelpMeshes: [],
    anemones: [],
    denLights: []
  };
  function pickColor() {
    const p = coralPalette[Math.floor(rand() * coralPalette.length)];
    return new THREE.Color().setHSL(p.h + (rand() - 0.5) * 0.05, p.s, p.l);
  }
  const floorSize = Math.max(map2.width, map2.height) * tileSize;
  const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
  const floorMat = new THREE.MeshToonMaterial({ color: 1387066, gradientMap: gradientMap2 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene2.add(floor);
  for (let i = 0; i < 60; i++) {
    const r = 0.3 + rand() * 1.5;
    const geo = new THREE.CircleGeometry(r, 8);
    const mat = new THREE.MeshToonMaterial({ color: 2439754, gradientMap: gradientMap2 });
    const patch = new THREE.Mesh(geo, mat);
    patch.rotation.x = -Math.PI / 2;
    const wx = (rand() - 0.5) * map2.width * tileSize;
    const wz = (rand() - 0.5) * map2.height * tileSize;
    patch.position.set(wx, -0.48, wz);
    scene2.add(patch);
  }
  for (let tz = 0; tz < map2.height; tz++) {
    for (let tx = 0; tx < map2.width; tx++) {
      const tile = getTile(map2, tx, tz);
      const { wx, wz } = tileToWorld(tx, tz, tileSize, map2.width, map2.height);
      switch (tile) {
        case 1 /* WALL */:
          placeWallCoral(wx, wz);
          break;
        case 2 /* CREVICE */:
          placeCreviceDetail(wx, wz);
          break;
        case 3 /* KELP */:
          placeKelp(wx, wz);
          break;
        case 4 /* DEN */:
          placeDen(wx, wz);
          break;
        case 0 /* OPEN */:
          if (rand() < 0.12) placeOpenDecor(wx, wz);
          break;
      }
    }
  }
  function placeWallCoral(x, z) {
    const type = rand();
    if (type < 0.35) placeBranching(x, z);
    else if (type < 0.55) placeBrain(x, z);
    else if (type < 0.75) placeTube(x, z);
    else placeShelf(x, z);
    if (rand() < 0.25) {
      const s = 0.4 + rand() * 0.5;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.55, 0.08, 0.15),
        gradientMap: gradientMap2
      });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x + (rand() - 0.5) * 0.6, -0.5 + s * 0.35, z + (rand() - 0.5) * 0.6);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene2.add(rock);
    }
  }
  function placeBranching(x, z) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const tipColor = baseColor.clone().offsetHSL(0.03, 0.1, 0.15);
    const trunkH = 1.4 + rand() * 1.6;
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.3, trunkH, 5);
    const trunkMat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap: gradientMap2 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);
    const branchCount = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < branchCount; i++) {
      const bh = 0.6 + rand() * 1;
      const bGeo = new THREE.CylinderGeometry(0.05, 0.12, bh, 4);
      const bMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0.02, 0, 0.05), gradientMap: gradientMap2 });
      const branch = new THREE.Mesh(bGeo, bMat);
      const angle = i / branchCount * Math.PI * 2 + rand() * 0.5;
      const tilt = 0.3 + rand() * 0.5;
      branch.position.set(Math.cos(angle) * 0.25, trunkH * (0.4 + rand() * 0.4), Math.sin(angle) * 0.25);
      branch.rotation.set(Math.cos(angle) * tilt, 0, Math.sin(angle) * tilt);
      branch.castShadow = true;
      group.add(branch);
      const tipGeo = new THREE.SphereGeometry(0.07 + rand() * 0.05, 4, 3);
      const tipMat = new THREE.MeshStandardMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.5 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.copy(branch.position);
      tip.position.y += bh * 0.7;
      group.add(tip);
    }
    group.position.set(x + (rand() - 0.5) * 0.4, -0.5, z + (rand() - 0.5) * 0.4);
    scene2.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.03 + rand() * 0.025 });
  }
  function placeBrain(x, z) {
    const color = pickColor();
    const s = 0.7 + rand() * 0.6;
    const geo = new THREE.IcosahedronGeometry(s, 1);
    const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (rand() - 0.5) * 0.3, -0.5 + s * 0.35, z + (rand() - 0.5) * 0.3);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    mesh.scale.y = 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene2.add(mesh);
  }
  function placeTube(x, z) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const tipColor = baseColor.clone().offsetHSL(0.05, 0.1, 0.2);
    const tubeCount = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < tubeCount; i++) {
      const h = 0.8 + rand() * 1.8;
      const r = 0.06 + rand() * 0.06;
      const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 5);
      const mat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap: gradientMap2 });
      const tube = new THREE.Mesh(geo, mat);
      tube.position.set((rand() - 0.5) * 0.5, h / 2, (rand() - 0.5) * 0.5);
      tube.castShadow = true;
      group.add(tube);
      const rimGeo = new THREE.TorusGeometry(r, r * 0.5, 4, 6);
      const rimMat = new THREE.MeshStandardMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.6 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(tube.position.x, h, tube.position.z);
      rim.rotation.x = Math.PI / 2;
      group.add(rim);
    }
    group.position.set(x + (rand() - 0.5) * 0.3, -0.5, z + (rand() - 0.5) * 0.3);
    scene2.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.025 + rand() * 0.02 });
  }
  function placeShelf(x, z) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const layers = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < layers; i++) {
      const r = 0.5 + rand() * 0.5 - i * 0.05;
      const geo = new THREE.CylinderGeometry(r, r * 0.9, 0.08, 8);
      const mat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(i * 0.02, 0, i * 0.03), gradientMap: gradientMap2 });
      const disc = new THREE.Mesh(geo, mat);
      disc.position.y = 0.35 + i * 0.45;
      disc.rotation.set((rand() - 0.5) * 0.15, rand() * Math.PI, (rand() - 0.5) * 0.15);
      disc.castShadow = true;
      disc.receiveShadow = true;
      group.add(disc);
    }
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.35 + layers * 0.45, 5);
    const stemMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0, -0.1, -0.1), gradientMap: gradientMap2 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = (0.35 + layers * 0.45) / 2;
    group.add(stem);
    group.position.set(x + (rand() - 0.5) * 0.3, -0.5, z + (rand() - 0.5) * 0.3);
    scene2.add(group);
  }
  function placeCreviceDetail(x, z) {
    if (rand() < 0.5) {
      const s = 0.1 + rand() * 0.15;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({ color: 1714741, gradientMap: gradientMap2 });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x + (rand() - 0.5) * 0.3, -0.5 + s * 0.3, z + (rand() - 0.5) * 0.3);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      scene2.add(rock);
    }
  }
  function placeKelp(x, z) {
    const count = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const totalH = 1.5 + rand() * 2.5;
      const segments = 5 + Math.floor(rand() * 3);
      const segH = totalH / segments;
      const baseR = 0.1 + rand() * 0.06;
      const color = new THREE.Color().setHSL(0.3 + rand() * 0.1, 0.45, 0.15 + rand() * 0.08);
      const waveMag = 0.08 + rand() * 0.06;
      const waveFreq = 1.5 + rand() * 1;
      const wavePhase = rand() * Math.PI * 2;
      const group = new THREE.Group();
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const r = baseR * (1 - t * 0.6);
        const geo = new THREE.CylinderGeometry(r * 0.7, r, segH, 4);
        const mat = new THREE.MeshToonMaterial({
          color: color.clone().offsetHSL(0, 0, t * 0.06),
          gradientMap: gradientMap2
        });
        const seg = new THREE.Mesh(geo, mat);
        const ox = Math.sin(t * Math.PI * waveFreq + wavePhase) * waveMag;
        const oz = Math.cos(t * Math.PI * waveFreq * 0.7 + wavePhase) * waveMag * 0.5;
        seg.position.set(ox, segH * s + segH / 2, oz);
        seg.castShadow = true;
        group.add(seg);
      }
      group.position.set(x + (rand() - 0.5) * 1.4, -0.5, z + (rand() - 0.5) * 1.4);
      scene2.add(group);
      result.kelpMeshes.push(group);
    }
  }
  function placeDen(x, z) {
    const group = new THREE.Group();
    const archGeo = new THREE.TorusGeometry(0.8, 0.25, 6, 10, Math.PI);
    const archColor = new THREE.Color().setHSL(0.55, 0.12, 0.18);
    const archMat = new THREE.MeshToonMaterial({ color: archColor, gradientMap: gradientMap2 });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.y = 0.3;
    arch.rotation.x = Math.PI / 2;
    arch.castShadow = true;
    group.add(arch);
    for (let side = -1; side <= 1; side += 2) {
      const s = 0.35 + rand() * 0.2;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({ color: archColor.clone().offsetHSL(0, 0, -0.03), gradientMap: gradientMap2 });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(side * 0.7, s * 0.3, 0.1 * side);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      rock.castShadow = true;
      group.add(rock);
    }
    const light = new THREE.PointLight(16755268, 2, 7);
    light.position.set(0, 0.3, 0);
    group.add(light);
    result.denLights.push(light);
    const anemColor = new THREE.Color().setHSL(0.08, 0.65, 0.42);
    const tendrils = [];
    const tendrilCount = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < tendrilCount; i++) {
      const th = 0.4 + rand() * 0.6;
      const tGeo = new THREE.CylinderGeometry(0.02, 0.05, th, 4);
      const tMat = new THREE.MeshStandardMaterial({
        color: anemColor,
        emissive: anemColor.clone().offsetHSL(0, 0.2, 0.15),
        emissiveIntensity: 0.6
      });
      const tendril = new THREE.Mesh(tGeo, tMat);
      const angle = i / tendrilCount * Math.PI * 2;
      const spread = 0.25 + rand() * 0.15;
      tendril.position.set(Math.cos(angle) * spread, th / 2, Math.sin(angle) * spread);
      tendril.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
      group.add(tendril);
      tendrils.push(tendril);
    }
    result.anemones.push({ tendrils });
    group.position.set(x, -0.5, z);
    scene2.add(group);
  }
  function placeOpenDecor(x, z) {
    const type = rand();
    if (type < 0.35) {
      const group = new THREE.Group();
      const starColor = new THREE.Color().setHSL(0.05 + rand() * 0.1, 0.6, 0.45);
      for (let i = 0; i < 5; i++) {
        const armLen = 0.3 + rand() * 0.15;
        const geo = new THREE.CylinderGeometry(0.04, 0.08, armLen, 3);
        const mat = new THREE.MeshToonMaterial({ color: starColor, gradientMap: gradientMap2 });
        const arm = new THREE.Mesh(geo, mat);
        const angle = i / 5 * Math.PI * 2;
        arm.position.set(Math.cos(angle) * armLen * 0.4, 0, Math.sin(angle) * armLen * 0.4);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = angle;
        group.add(arm);
      }
      group.position.set(x + (rand() - 0.5) * 1.2, -0.46, z + (rand() - 0.5) * 1.2);
      scene2.add(group);
    } else if (type < 0.6) {
      const s = 0.15 + rand() * 0.1;
      const geo = new THREE.SphereGeometry(s, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.1 + rand() * 0.05, 0.35, 0.5),
        gradientMap: gradientMap2
      });
      const shell = new THREE.Mesh(geo, mat);
      shell.position.set(x + (rand() - 0.5) * 1.2, -0.47, z + (rand() - 0.5) * 1.2);
      shell.rotation.y = rand() * Math.PI * 2;
      scene2.add(shell);
    } else if (type < 0.8) {
      for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
        const r = 0.5 + rand() * 0.4;
        const geo = new THREE.TorusGeometry(r, 0.04, 3, 8, Math.PI * (0.5 + rand() * 0.5));
        const mat = new THREE.MeshToonMaterial({ color: 2439754, gradientMap: gradientMap2 });
        const ripple = new THREE.Mesh(geo, mat);
        ripple.position.set(
          x + (rand() - 0.5) * 1,
          -0.47,
          z + (rand() - 0.5) * 1 + i * 0.35
        );
        ripple.rotation.x = -Math.PI / 2;
        ripple.rotation.z = rand() * 0.3;
        scene2.add(ripple);
      }
    } else {
      const h = 0.3 + rand() * 0.4;
      const geo = new THREE.CylinderGeometry(0.04, 0.1, h, 4);
      const color = pickColor();
      const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap2 });
      const nub = new THREE.Mesh(geo, mat);
      nub.position.set(x + (rand() - 0.5) * 1.2, -0.5 + h / 2, z + (rand() - 0.5) * 1.2);
      nub.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      scene2.add(nub);
    }
  }
  for (let i = 0; i < 10; i++) {
    const tx = Math.floor(rand() * map2.width);
    const tz = Math.floor(rand() * map2.height);
    if (getTile(map2, tx, tz) === 1 /* WALL */) continue;
    const { wx, wz } = tileToWorld(tx, tz, tileSize, map2.width, map2.height);
    const color = new THREE.Color().setHSL(0.45 + rand() * 0.25, 0.8, 0.5);
    const light = new THREE.PointLight(color, 0.6, 8);
    light.position.set(wx, 0.5 + rand() * 2, wz);
    scene2.add(light);
  }
  return result;
}

// src/squid.ts
import * as THREE2 from "three";
function createSquid(gradientMap2) {
  const group = new THREE2.Group();
  const mantleGeo = new THREE2.SphereGeometry(0.35, 8, 8);
  const mantleMat = new THREE2.MeshToonMaterial({ color: 4508927, gradientMap: gradientMap2 });
  const mantle = new THREE2.Mesh(mantleGeo, mantleMat);
  mantle.scale.set(0.8, 1.1, 1);
  mantle.position.y = 0.2;
  mantle.castShadow = true;
  group.add(mantle);
  const finGeo = new THREE2.ConeGeometry(0.12, 0.2, 4);
  const finMat = new THREE2.MeshToonMaterial({ color: 5627391, gradientMap: gradientMap2 });
  const finL = new THREE2.Mesh(finGeo, finMat);
  finL.position.set(-0.28, 0.25, 0);
  finL.rotation.z = 0.8;
  group.add(finL);
  const finR = new THREE2.Mesh(finGeo, finMat);
  finR.position.set(0.28, 0.25, 0);
  finR.rotation.z = -0.8;
  group.add(finR);
  const bodyGeo = new THREE2.CylinderGeometry(0.22, 0.15, 0.2, 8);
  const bodyMat = new THREE2.MeshToonMaterial({ color: 3390446, gradientMap: gradientMap2 });
  const body = new THREE2.Mesh(bodyGeo, bodyMat);
  body.position.y = -0.12;
  group.add(body);
  const eyeWhiteGeo = new THREE2.SphereGeometry(0.12, 8, 6);
  const eyeWhiteMat = new THREE2.MeshStandardMaterial({
    color: 16777215,
    emissive: 8969727,
    emissiveIntensity: 1
  });
  const pupilGeo = new THREE2.SphereGeometry(0.06, 6, 4);
  const pupilMat = new THREE2.MeshStandardMaterial({ color: 1118515 });
  const eyeL = new THREE2.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeL.position.set(-0.22, 0.1, 0.18);
  group.add(eyeL);
  const pupilL = new THREE2.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.28, 0.1, 0.22);
  group.add(pupilL);
  const eyeR = new THREE2.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeR.position.set(0.22, 0.1, 0.18);
  group.add(eyeR);
  const pupilR = new THREE2.Mesh(pupilGeo, pupilMat);
  pupilR.position.set(0.28, 0.1, 0.22);
  group.add(pupilR);
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const tLen = 0.35 + Math.random() * 0.2;
    const tGeo = new THREE2.CylinderGeometry(0.015, 0.035, tLen, 4);
    const tMat = new THREE2.MeshToonMaterial({ color: 3386077, gradientMap: gradientMap2 });
    const tentacle = new THREE2.Mesh(tGeo, tMat);
    const angle = i / 8 * Math.PI * 2;
    tentacle.position.set(Math.cos(angle) * 0.1, -0.25, Math.sin(angle) * 0.1);
    tentacle.rotation.x = 0.3;
    group.add(tentacle);
    tentacles.push(tentacle);
  }
  const glow = new THREE2.PointLight(4508927, 2.5, 12);
  group.add(glow);
  group.position.set(0, 1, 0);
  return { group, glow, tentacles, finL, finR };
}
var keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});
function readGamepad() {
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
var isoRight = new THREE2.Vector3(1, 0, -1).normalize();
var isoUp = new THREE2.Vector3(-1, 0, -1).normalize();
var MOVE_SPEED = 6;
var SPRINT_MULT = 1.6;
var COLLISION_RADIUS = 0.3;
function updateSquid(squid2, dt, t, map2, tileSize) {
  let dx = 0, dz = 0;
  if (keys["w"] || keys["arrowup"]) dz -= 1;
  if (keys["s"] || keys["arrowdown"]) dz += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  const gp = readGamepad();
  if (gp.x !== 0 || gp.z !== 0) {
    dx = gp.x;
    dz = gp.z;
  }
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }
  let sprinting = keys["shift"];
  if (!sprinting) {
    const gamepads = navigator.getGamepads();
    for (const gp2 of gamepads) {
      if (gp2 && gp2.buttons[7]?.pressed) {
        sprinting = true;
        break;
      }
    }
  }
  const speed = MOVE_SPEED * (sprinting ? SPRINT_MULT : 1);
  const moveDir = new THREE2.Vector3().addScaledVector(isoRight, dx).addScaledVector(isoUp, -dz);
  const newX = squid2.group.position.x + moveDir.x * speed * dt;
  const newZ = squid2.group.position.z + moveDir.z * speed * dt;
  const curX = squid2.group.position.x;
  const curZ = squid2.group.position.z;
  if (canMoveTo(newX, curZ, map2, tileSize)) {
    squid2.group.position.x = newX;
  }
  if (canMoveTo(squid2.group.position.x, newZ, map2, tileSize)) {
    squid2.group.position.z = newZ;
  }
  if (len > 0) {
    squid2.group.rotation.y = Math.atan2(moveDir.x, moveDir.z);
  }
  squid2.group.position.y = 1 + Math.sin(t * 1.5) * 0.15;
  squid2.finL.rotation.z = 0.8 + Math.sin(t * 4) * 0.2;
  squid2.finR.rotation.z = -0.8 - Math.sin(t * 4) * 0.2;
  for (let i = 0; i < squid2.tentacles.length; i++) {
    const phase = i / squid2.tentacles.length * Math.PI * 2;
    const swaySpeed = len > 0 ? 6 : 1.5;
    const swayAmp = len > 0 ? 0.15 : 0.25;
    squid2.tentacles[i].rotation.x = 0.4 + Math.sin(t * swaySpeed + phase) * swayAmp;
    squid2.tentacles[i].rotation.z = Math.sin(t * 2 + phase) * 0.15;
  }
  squid2.glow.intensity = 2 + Math.sin(t * 2) * 0.6;
}
function canMoveTo(wx, wz, map2, tileSize) {
  const offsets = [
    { dx: -COLLISION_RADIUS, dz: -COLLISION_RADIUS },
    { dx: COLLISION_RADIUS, dz: -COLLISION_RADIUS },
    { dx: -COLLISION_RADIUS, dz: COLLISION_RADIUS },
    { dx: COLLISION_RADIUS, dz: COLLISION_RADIUS }
  ];
  for (const off of offsets) {
    const { tx, tz } = worldToTile(wx + off.dx, wz + off.dz, tileSize, map2.width, map2.height);
    if (!isPassable(map2, tx, tz, true)) return false;
  }
  return true;
}

// src/main.ts
var RENDER_W = 320;
var RENDER_H = 240;
var PIXEL_SCALE = 3;
var TILE_SIZE = 2;
var MAP_W = 50;
var MAP_H = 50;
function makeToonGradient() {
  const data = new Uint8Array([60, 120, 220]);
  const tex = new THREE3.DataTexture(data, 3, 1, THREE3.RedFormat);
  tex.minFilter = THREE3.NearestFilter;
  tex.magFilter = THREE3.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
var gradientMap = makeToonGradient();
var renderer = new THREE3.WebGLRenderer({ antialias: false });
renderer.setSize(RENDER_W, RENDER_H);
renderer.domElement.style.width = `${RENDER_W * PIXEL_SCALE}px`;
renderer.domElement.style.height = `${RENDER_H * PIXEL_SCALE}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE3.BasicShadowMap;
renderer.setClearColor(133136);
document.body.appendChild(renderer.domElement);
var scene = new THREE3.Scene();
scene.fog = new THREE3.FogExp2(397856, 0.018);
var aspect = RENDER_W / RENDER_H;
var viewSize = 16;
var camera = new THREE3.OrthographicCamera(
  -viewSize * aspect / 2,
  viewSize * aspect / 2,
  viewSize / 2,
  -viewSize / 2,
  0.1,
  100
);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);
var ambient = new THREE3.AmbientLight(1716304, 0.8);
scene.add(ambient);
var hemi = new THREE3.HemisphereLight(3368618, 662058, 0.6);
scene.add(hemi);
var sun = new THREE3.DirectionalLight(4491468, 1);
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
var map = generateReef(MAP_W, MAP_H, 42);
var reef = buildReef(scene, map, TILE_SIZE, gradientMap);
var PARTICLE_COUNT = 300;
var particleGeo = new THREE3.BufferGeometry();
var particlePositions = new Float32Array(PARTICLE_COUNT * 3);
var particleSpeeds = new Float32Array(PARTICLE_COUNT);
var pRand = /* @__PURE__ */ (() => {
  let s = 999;
  return () => {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
})();
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particlePositions[i * 3] = (pRand() - 0.5) * MAP_W * TILE_SIZE;
  particlePositions[i * 3 + 1] = pRand() * 6;
  particlePositions[i * 3 + 2] = (pRand() - 0.5) * MAP_H * TILE_SIZE;
  particleSpeeds[i] = 0.1 + pRand() * 0.3;
}
particleGeo.setAttribute("position", new THREE3.BufferAttribute(particlePositions, 3));
var particleMat = new THREE3.PointsMaterial({
  color: 8965358,
  size: 0.08,
  transparent: true,
  opacity: 0.6
});
scene.add(new THREE3.Points(particleGeo, particleMat));
var jellies = [];
for (let i = 0; i < 8; i++) {
  const color = new THREE3.Color().setHSL(0.45 + pRand() * 0.25, 0.8, 0.5);
  const geo = new THREE3.SphereGeometry(0.15, 6, 4);
  const mat = new THREE3.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7
  });
  const mesh = new THREE3.Mesh(geo, mat);
  const pos = new THREE3.Vector3(
    (pRand() - 0.5) * MAP_W * TILE_SIZE * 0.6,
    1 + pRand() * 3,
    (pRand() - 0.5) * MAP_H * TILE_SIZE * 0.6
  );
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE3.PointLight(color, 0.8, 10);
  light.position.copy(pos);
  scene.add(light);
  jellies.push({ mesh, light, basePos: pos.clone(), phase: pRand() * Math.PI * 2 });
}
var squid = createSquid(gradientMap);
var spawn = tileToWorld(map.playerSpawn.x, map.playerSpawn.z, TILE_SIZE, MAP_W, MAP_H);
squid.group.position.set(spawn.wx, 1, spawn.wz);
scene.add(squid.group);
window.__glint = { map, squid, tileToWorld, TILE_SIZE, MAP_W, MAP_H };
var clock = new THREE3.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  updateSquid(squid, dt, t, map, TILE_SIZE);
  camera.position.set(squid.group.position.x + 20, 20, squid.group.position.z + 20);
  camera.lookAt(squid.group.position);
  sun.position.set(squid.group.position.x + 5, 15, squid.group.position.z + 5);
  sun.target.position.copy(squid.group.position);
  sun.target.updateMatrixWorld();
  for (const kelp of reef.kelpMeshes) {
    kelp.rotation.x = Math.sin(t * 0.6 + kelp.position.x * 0.3) * 0.15;
    kelp.rotation.z = Math.cos(t * 0.4 + kelp.position.z * 0.3) * 0.1;
  }
  for (const item of reef.swayItems) {
    item.obj.rotation.x = Math.sin(t * 0.7 + item.phase) * item.amplitude;
    item.obj.rotation.z = Math.cos(t * 0.5 + item.phase * 1.3) * item.amplitude * 0.7;
  }
  for (const a of reef.anemones) {
    for (let i = 0; i < a.tendrils.length; i++) {
      const phase = i / a.tendrils.length * Math.PI * 2;
      a.tendrils[i].rotation.x = Math.sin(t * 1 + phase) * 0.35;
      a.tendrils[i].rotation.z = Math.cos(t * 0.7 + phase) * 0.25;
    }
  }
  for (const light of reef.denLights) {
    light.intensity = 1.2 + Math.sin(t * 1.5 + light.position.x) * 0.5;
  }
  for (const j of jellies) {
    j.mesh.position.y = j.basePos.y + Math.sin(t * 0.4 + j.phase) * 0.5;
    j.mesh.position.x = j.basePos.x + Math.sin(t * 0.15 + j.phase * 2) * 1;
    j.mesh.position.z = j.basePos.z + Math.cos(t * 0.12 + j.phase) * 0.5;
    j.light.position.copy(j.mesh.position);
    j.light.intensity = 0.5 + Math.sin(t * 1.5 + j.phase) * 0.3;
  }
  const posArr = particleGeo.attributes.position.array;
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
//# sourceMappingURL=main.js.map
