// src/main.ts
import * as THREE4 from "three";

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
  return { group, glow, tentacles, finL, finR, mantle, body, concealed: false };
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
var NORMAL_MANTLE = new THREE2.Color(4508927);
var NORMAL_BODY = new THREE2.Color(3390446);
var CONCEALED_MANTLE = new THREE2.Color(1122867);
var CONCEALED_BODY = new THREE2.Color(662056);
var NORMAL_GLOW_INTENSITY = 2.5;
var CONCEALED_GLOW_INTENSITY = 0.3;
var CONCEALMENT_SPEED = 4;
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
  const { tx, tz } = worldToTile(squid2.group.position.x, squid2.group.position.z, tileSize, map2.width, map2.height);
  const currentTile = getTile(map2, tx, tz);
  const onHidingTile = currentTile === 4 /* DEN */ || currentTile === 2 /* CREVICE */ || currentTile === 3 /* KELP */;
  squid2.concealed = onHidingTile && len === 0;
  const lerpT = 1 - Math.exp(-CONCEALMENT_SPEED * dt);
  const targetMantle = squid2.concealed ? CONCEALED_MANTLE : NORMAL_MANTLE;
  const targetBody = squid2.concealed ? CONCEALED_BODY : NORMAL_BODY;
  const targetGlow = squid2.concealed ? CONCEALED_GLOW_INTENSITY : NORMAL_GLOW_INTENSITY;
  const mantleMat = squid2.mantle.material;
  mantleMat.color.lerp(targetMantle, lerpT);
  const bodyMat = squid2.body.material;
  bodyMat.color.lerp(targetBody, lerpT);
  const baseGlow = squid2.glow.intensity + (targetGlow - squid2.glow.intensity) * lerpT;
  const pulseAmp = squid2.concealed ? 0.08 : 0.2;
  squid2.glow.intensity = baseGlow + Math.sin(t * 2) * pulseAmp;
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

// src/instinct-api.ts
var TILE_NAMES = {
  open: 0 /* OPEN */,
  wall: 1 /* WALL */,
  crevice: 2 /* CREVICE */,
  kelp: 3 /* KELP */,
  den: 4 /* DEN */
};
function createInstinctAPI(pred, map2, tileSize, actions) {
  const px = () => pred.group.position.x;
  const pz = () => pred.group.position.z;
  return {
    pursue(target) {
      actions.push({ type: "pursue", target: { x: target.x, z: target.z } });
    },
    patrol_to(target) {
      actions.push({ type: "patrol_to", target: { x: target.x, z: target.z } });
    },
    patrol_random() {
      actions.push({ type: "patrol_random" });
    },
    hold() {
      actions.push({ type: "hold" });
    },
    check_los(target) {
      const pt = worldToTile(px(), pz(), tileSize, map2.width, map2.height);
      const st = worldToTile(target.x, target.z, tileSize, map2.width, map2.height);
      return hasLineOfSight(map2, pt.tx, pt.tz, st.tx, st.tz);
    },
    nearby_tiles(tileType) {
      const tileEnum = TILE_NAMES[tileType.toLowerCase()];
      if (tileEnum === void 0) return [];
      const results = [];
      const center = worldToTile(px(), pz(), tileSize, map2.width, map2.height);
      const rangeTiles = Math.ceil(pred.chassis.sensorRange / tileSize);
      for (let dtz = -rangeTiles; dtz <= rangeTiles; dtz++) {
        for (let dtx = -rangeTiles; dtx <= rangeTiles; dtx++) {
          const ttx = center.tx + dtx;
          const ttz = center.tz + dtz;
          if (ttx < 0 || ttx >= map2.width || ttz < 0 || ttz >= map2.height) continue;
          if (getTile(map2, ttx, ttz) !== tileEnum) continue;
          const { wx, wz } = tileToWorld(ttx, ttz, tileSize, map2.width, map2.height);
          const ddx = wx - px(), ddz = wz - pz();
          const dist = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dist <= pred.chassis.sensorRange) {
            results.push({ x: wx, z: wz, dist });
          }
        }
      }
      results.sort((a, b) => a.dist - b.dist);
      return results;
    },
    distance_to(target) {
      const ddx = target.x - px(), ddz = target.z - pz();
      return Math.sqrt(ddx * ddx + ddz * ddz);
    },
    getState: () => pred.physical.state,
    setState: (s) => {
      pred.physical.state = s;
    },
    getLastKnown: () => pred.physical.lastSeenPos ? { x: pred.physical.lastSeenPos.x, z: pred.physical.lastSeenPos.z } : null,
    setLastKnown: (pos) => {
      pred.physical.lastSeenPos = pos ? { x: pos.x, z: pos.z } : null;
    },
    getTimeSinceLost: () => pred.physical.lostTime,
    getPosition: () => ({ x: px(), z: pz() }),
    memory: {
      read: () => pred.predatorSoma.memory,
      write: (s) => {
        pred.predatorSoma.memory = s;
      }
    }
  };
}

// src/instinct-executor.ts
var INSTINCT_TIMEOUT_MS = 50;
var instinctCache = /* @__PURE__ */ new Map();
function compileInstinct(soma) {
  const cached = instinctCache.get(soma.id);
  if (cached && cached.code === soma.instinctCode) {
    return cached.instinct;
  }
  try {
    const wrappedCode = `
      ${soma.instinctCode}
      return onStimulus(type, data, me);
    `;
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction("type", "data", "me", wrappedCode);
    const instinct = { predatorId: soma.id, fn };
    instinctCache.set(soma.id, { code: soma.instinctCode, instinct });
    return instinct;
  } catch (err) {
    console.log(`[GLINT] Instinct compile error for ${soma.id}: ${err}`);
    return null;
  }
}
async function executeStimulus(instinct, stimulusType, stimulusData, api) {
  try {
    const result = await Promise.race([
      instinct.fn(stimulusType, stimulusData, api),
      new Promise(
        (resolve) => setTimeout(() => resolve("timeout"), INSTINCT_TIMEOUT_MS)
      )
    ]);
    if (result === "timeout") {
      console.log(`[GLINT] Instinct timeout for ${instinct.predatorId} on ${stimulusType}`);
    }
  } catch (err) {
    console.log(`[GLINT] Instinct runtime error for ${instinct.predatorId}: ${err}`);
  }
}
function clearInstinctCache() {
  instinctCache.clear();
}

// src/predator.ts
function hasLineOfSight(map2, x0, z0, x1, z1) {
  let dx = Math.abs(x1 - x0);
  let dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  while (true) {
    if (getTile(map2, x0, z0) === 1 /* WALL */) return false;
    if (x0 === x1 && z0 === z1) break;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      z0 += sz;
    }
  }
  return true;
}
function readSensors(pred, squid2, map2, tileSize) {
  const sx = squid2.group.position.x, sz = squid2.group.position.z;
  const px = pred.group.position.x, pz = pred.group.position.z;
  const dist = Math.sqrt((sx - px) ** 2 + (sz - pz) ** 2);
  let detected = false;
  if (!squid2.concealed && dist <= pred.chassis.sensorRange) {
    const pt = worldToTile(px, pz, tileSize, map2.width, map2.height);
    const st = worldToTile(sx, sz, tileSize, map2.width, map2.height);
    detected = hasLineOfSight(map2, pt.tx, pt.tz, st.tx, st.tz);
  }
  return { squidDetected: detected, squidWorldPos: { x: sx, z: sz }, squidDist: dist };
}
function moveToward(pred, targetX, targetZ, dt, map2, tileSize, useChaseSpeed) {
  const dx = targetX - pred.group.position.x;
  const dz = targetZ - pred.group.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) {
    if (pred.physical.state === "patrol") pred.physical.waypoint = null;
    return;
  }
  const targetAngle = Math.atan2(dx, dz);
  let angleDiff = targetAngle - pred.group.rotation.y;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const maxTurn = pred.chassis.turnSpeed * dt;
  pred.group.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);
  const speed = useChaseSpeed ? pred.chassis.chaseSpeed : pred.chassis.speed;
  const moveX = Math.sin(pred.group.rotation.y) * speed * dt;
  const moveZ = Math.cos(pred.group.rotation.y) * speed * dt;
  const curX = pred.group.position.x;
  const curZ = pred.group.position.z;
  if (passableAt(curX + moveX, curZ, pred.chassis, map2, tileSize))
    pred.group.position.x = curX + moveX;
  if (passableAt(pred.group.position.x, curZ + moveZ, pred.chassis, map2, tileSize))
    pred.group.position.z = curZ + moveZ;
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
function passableAt(wx, wz, ch, map2, tileSize) {
  const r = ch.collisionRadius;
  for (const off of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const { tx, tz } = worldToTile(wx + off[0], wz + off[1], tileSize, map2.width, map2.height);
    if (!isPassable(map2, tx, tz, ch.isSmall)) return false;
  }
  return true;
}
function pickRandomOpenTile(map2, tileSize, rng) {
  for (let i = 0; i < 50; i++) {
    const tx = Math.floor(rng() * map2.width);
    const tz = Math.floor(rng() * map2.height);
    const tile = getTile(map2, tx, tz);
    if (tile === 0 /* OPEN */ || tile === 3 /* KELP */) {
      const { wx, wz } = tileToWorld(tx, tz, tileSize, map2.width, map2.height);
      return { x: wx, z: wz };
    }
  }
  return { x: 0, z: 0 };
}
function checkCatch(pred, squid2) {
  const dx = squid2.group.position.x - pred.group.position.x;
  const dz = squid2.group.position.z - pred.group.position.z;
  return Math.sqrt(dx * dx + dz * dz) < pred.chassis.collisionRadius + 0.3;
}
var busyPredators = /* @__PURE__ */ new Set();
function dispatchStimulus(pred, sensors, dt, map2, tileSize, rng) {
  if (busyPredators.has(pred.id)) {
    if (pred.physical.waypoint) {
      const useChase = pred.physical.state === "chase";
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map2, tileSize, useChase);
    }
    return;
  }
  const instinct = compileInstinct(pred.predatorSoma);
  if (!instinct) {
    if (pred.physical.waypoint) {
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map2, tileSize, false);
    }
    return;
  }
  const wasTracking = pred.physical.wasPursuing;
  let stimulusType;
  let stimulusData;
  if (sensors.squidDetected) {
    stimulusType = "prey_detected";
    stimulusData = {
      prey_position: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
      prey_distance: sensors.squidDist,
      own_position: { x: pred.group.position.x, z: pred.group.position.z }
    };
    pred.physical.lostTime = 0;
  } else if (wasTracking) {
    stimulusType = "prey_lost";
    stimulusData = {
      last_known_position: pred.physical.lastSeenPos ? { x: pred.physical.lastSeenPos.x, z: pred.physical.lastSeenPos.z } : void 0,
      own_position: { x: pred.group.position.x, z: pred.group.position.z }
    };
    pred.physical.lostTime = 0;
  } else {
    stimulusType = "tick";
    pred.physical.lostTime += dt;
    stimulusData = {
      own_position: { x: pred.group.position.x, z: pred.group.position.z },
      current_state: pred.physical.state,
      time_since_lost: pred.physical.lostTime
    };
  }
  const actions = [];
  const api = createInstinctAPI(pred, map2, tileSize, actions);
  busyPredators.add(pred.id);
  executeStimulus(instinct, stimulusType, stimulusData, api).then(() => {
    busyPredators.delete(pred.id);
    if (actions.length > 0) {
      applyAction(pred, actions[0], dt, map2, tileSize, rng);
    }
  });
  if (actions.length > 0) {
    busyPredators.delete(pred.id);
    applyAction(pred, actions[0], dt, map2, tileSize, rng);
  }
  pred.physical.wasPursuing = actions.length > 0 && actions[0].type === "pursue";
}
function applyAction(pred, action, dt, map2, tileSize, rng) {
  switch (action.type) {
    case "pursue":
      if (action.target) {
        pred.physical.waypoint = { x: action.target.x, z: action.target.z };
        moveToward(pred, action.target.x, action.target.z, dt, map2, tileSize, true);
      }
      break;
    case "patrol_to":
      if (action.target) {
        pred.physical.waypoint = { x: action.target.x, z: action.target.z };
        moveToward(pred, action.target.x, action.target.z, dt, map2, tileSize, false);
      }
      break;
    case "patrol_random":
      if (!pred.physical.waypoint) {
        for (let i = 0; i < 10; i++) {
          const wp = pickRandomOpenTile(map2, tileSize, rng);
          const ddx = wp.x - pred.group.position.x;
          const ddz = wp.z - pred.group.position.z;
          if (ddx * ddx + ddz * ddz > 100) {
            pred.physical.waypoint = wp;
            break;
          }
        }
        if (!pred.physical.waypoint) pred.physical.waypoint = pickRandomOpenTile(map2, tileSize, rng);
      }
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map2, tileSize, false);
      break;
    case "hold":
      break;
  }
}

// src/shark.ts
import * as THREE3 from "three";

// src/soma.ts
var DEFAULT_SHARK_INSTINCT = `
async function onStimulus(type, data, me) {
  switch (type) {
    case 'prey_detected': {
      me.setState('chase');
      me.setLastKnown(data.prey_position);
      me.pursue(data.prey_position);
      break;
    }
    case 'prey_lost': {
      me.setState('search');
      me.patrol_to(data.last_known_position);
      break;
    }
    case 'tick': {
      const state = me.getState();
      if (state === 'search') {
        if (me.getTimeSinceLost() > 5.0) {
          me.setState('patrol');
        } else {
          const lk = me.getLastKnown();
          if (lk) me.patrol_to(lk);
        }
      } else {
        me.patrol_random();
      }
      break;
    }
  }
}
`.trim();
function createDefaultSharkSoma(id) {
  return {
    id,
    species: "shark",
    nature: "The reef shark hunts by sight and speed \u2014 a torpedo with teeth, closing distance before prey can reach cover.",
    instinctCode: DEFAULT_SHARK_INSTINCT,
    memory: "No hunts yet. Patrol the reef, chase what moves.",
    huntHistory: [],
    lastReflectionTime: 0,
    reflectionPending: false
  };
}

// src/shark.ts
function sharkChassis() {
  return {
    speed: 3.5,
    chaseSpeed: 5.5,
    turnSpeed: 2,
    collisionRadius: 0.5,
    sensorRange: 16,
    isSmall: false
  };
}
function createShark(id, spawnX, spawnZ, gradientMap2, existingSoma) {
  const group = new THREE3.Group();
  const bodyGeo = new THREE3.SphereGeometry(0.5, 8, 6);
  const bodyMat = new THREE3.MeshToonMaterial({ color: 2767434, gradientMap: gradientMap2 });
  const body = new THREE3.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.6, 0.5, 1.4);
  body.castShadow = true;
  group.add(body);
  const snoutGeo = new THREE3.ConeGeometry(0.22, 0.5, 6);
  const snoutMat = new THREE3.MeshToonMaterial({ color: 3359829, gradientMap: gradientMap2 });
  const snout = new THREE3.Mesh(snoutGeo, snoutMat);
  snout.rotation.x = -Math.PI / 2;
  snout.position.z = 0.8;
  group.add(snout);
  const dorsalGeo = new THREE3.ConeGeometry(0.1, 0.45, 4);
  const dorsalMat = new THREE3.MeshToonMaterial({ color: 1714741, gradientMap: gradientMap2 });
  const dorsal = new THREE3.Mesh(dorsalGeo, dorsalMat);
  dorsal.position.set(0, 0.35, -0.1);
  group.add(dorsal);
  const tailGeo = new THREE3.ConeGeometry(0.18, 0.4, 4);
  const tailMat = new THREE3.MeshToonMaterial({ color: 2438469, gradientMap: gradientMap2 });
  const tail = new THREE3.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.1, -0.9);
  tail.rotation.x = Math.PI / 6;
  group.add(tail);
  for (let side = -1; side <= 1; side += 2) {
    const finGeo = new THREE3.ConeGeometry(0.08, 0.25, 3);
    const finMat = new THREE3.MeshToonMaterial({ color: 2438469, gradientMap: gradientMap2 });
    const fin = new THREE3.Mesh(finGeo, finMat);
    fin.position.set(side * 0.28, -0.12, 0.2);
    fin.rotation.z = side * 1.2;
    fin.rotation.x = -0.3;
    group.add(fin);
  }
  for (let side = -1; side <= 1; side += 2) {
    const eyeGeo = new THREE3.SphereGeometry(0.055, 5, 4);
    const eyeMat = new THREE3.MeshStandardMaterial({
      color: 16729088,
      emissive: 16729088,
      emissiveIntensity: 1.5
    });
    const eye = new THREE3.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.18, 0.08, 0.55);
    group.add(eye);
  }
  const threatLight = new THREE3.PointLight(16729088, 0.5, 10);
  threatLight.position.set(0, 0, 0.3);
  group.add(threatLight);
  group.position.set(spawnX, 1, spawnZ);
  group.rotation.y = Math.random() * Math.PI * 2;
  const physical = {
    state: "patrol",
    waypoint: null,
    lastSeenPos: null,
    lostTime: 0,
    stuckTimer: 0,
    wasPursuing: false
  };
  const predatorSoma = existingSoma ?? createDefaultSharkSoma(id);
  function animate2(pred, t) {
    body.rotation.y = Math.sin(t * 3 + pred.group.position.x) * 0.08;
    const tailSpeed = pred.physical.state === "chase" ? 8 : 2.5;
    tail.rotation.y = Math.sin(t * tailSpeed) * 0.3;
    switch (pred.physical.state) {
      case "chase":
        pred.threatLight.intensity = 1.5 + Math.sin(t * 4) * 0.5;
        pred.threatLight.color.setHex(16720384);
        break;
      case "search":
        pred.threatLight.intensity = 0.8 + Math.sin(t * 2) * 0.3;
        pred.threatLight.color.setHex(16729088);
        break;
      default:
        pred.threatLight.intensity = 0.3 + Math.sin(t) * 0.15;
        pred.threatLight.color.setHex(16737792);
        break;
    }
    pred.group.position.y = 1 + Math.sin(t * 0.8 + pred.group.position.x * 0.5) * 0.1;
  }
  return {
    id,
    type: "shark",
    group,
    chassis: sharkChassis(),
    physical,
    predatorSoma,
    threatLight,
    animate: animate2
  };
}

// src/hunt-tracker.ts
var HuntTracker = class {
  activeHunts = /* @__PURE__ */ new Map();
  nextHuntId = 1;
  completed = [];
  startHunt(predatorId, gameTime) {
    if (this.activeHunts.has(predatorId)) return;
    const hunt = {
      huntId: this.nextHuntId++,
      predatorId,
      startTime: gameTime,
      events: [],
      closestDistance: Infinity,
      preyConcealed: false,
      concealmentTile: null
    };
    this.activeHunts.set(predatorId, hunt);
    console.log(`[GLINT] Hunt #${hunt.huntId} started for ${predatorId}`);
  }
  recordEvent(predatorId, event, gameTime) {
    const hunt = this.activeHunts.get(predatorId);
    if (!hunt) return;
    const elapsed = gameTime - hunt.startTime;
    if (event.type === "pursuing") {
      const last = hunt.events[hunt.events.length - 1];
      if (last?.type === "pursuing" && elapsed - last.time < 0.5) return;
    }
    if (event.distance !== void 0 && event.distance < hunt.closestDistance) {
      hunt.closestDistance = event.distance;
    }
    if (event.type === "prey_concealed") {
      hunt.preyConcealed = true;
      if (event.note) {
        const match = event.note.match(/entered (\w+)/);
        if (match) hunt.concealmentTile = match[1];
      }
    }
    hunt.events.push({ ...event, time: elapsed });
  }
  endHunt(predatorId, outcome, gameTime) {
    const hunt = this.activeHunts.get(predatorId);
    if (!hunt) return null;
    this.activeHunts.delete(predatorId);
    const duration = gameTime - hunt.startTime;
    const textSummary = this.buildTextSummary(hunt, outcome, duration);
    const summary = {
      huntId: hunt.huntId,
      predatorId: hunt.predatorId,
      outcome,
      durationSeconds: duration,
      closestDistance: hunt.closestDistance === Infinity ? 0 : hunt.closestDistance,
      preyConcealed: hunt.preyConcealed,
      concealmentTile: hunt.concealmentTile,
      events: hunt.events,
      textSummary
    };
    this.completed.push(summary);
    console.log(`[GLINT] Hunt #${hunt.huntId} ended: ${outcome} (${duration.toFixed(1)}s)`);
    return summary;
  }
  isHunting(predatorId) {
    return this.activeHunts.has(predatorId);
  }
  getCompletedHunts(predatorId) {
    return this.completed.filter((h) => h.predatorId === predatorId);
  }
  getAllCompleted() {
    return this.completed;
  }
  buildTextSummary(hunt, outcome, duration) {
    const lines = [];
    lines.push(`Hunt #${hunt.huntId} (${outcome}, ${duration.toFixed(1)}s):`);
    for (const ev of hunt.events) {
      switch (ev.type) {
        case "detected":
          lines.push(`- Detected prey at (${ev.preyPos.x.toFixed(1)}, ${ev.preyPos.z.toFixed(1)}), distance ${ev.distance.toFixed(1)}`);
          break;
        case "pursuing":
          lines.push(`- Pursuing at t+${ev.time.toFixed(1)}s, distance ${ev.distance.toFixed(1)}`);
          break;
        case "lost_los":
          lines.push(`- Lost line of sight at (${ev.predPos.x.toFixed(1)}, ${ev.predPos.z.toFixed(1)})`);
          break;
        case "prey_concealed":
          lines.push(`- ${ev.note || "Prey concealed"}`);
          break;
        case "prey_revealed":
          lines.push(`- Prey revealed at (${ev.preyPos.x.toFixed(1)}, ${ev.preyPos.z.toFixed(1)})`);
          break;
        default:
          if (ev.note) lines.push(`- ${ev.note}`);
          break;
      }
    }
    lines.push(`- Duration: ${duration.toFixed(1)}s, closest approach: ${hunt.closestDistance === Infinity ? "N/A" : hunt.closestDistance.toFixed(1) + "u"}`);
    return lines.join("\n");
  }
};

// src/reflection.ts
var SCAFFOLD_TOOLS = [
  {
    name: "update_instinct",
    description: "Rewrite your hunting instincts. This is the code that runs when you detect prey, lose it, or patrol between hunts. Write the complete onStimulus(type, data, me) function.",
    input_schema: {
      type: "object",
      properties: {
        instinct_code: {
          type: "string",
          description: "The complete async function onStimulus(type, data, me) { ... } function body."
        },
        reasoning: {
          type: "string",
          description: "What you changed and why."
        }
      },
      required: ["instinct_code", "reasoning"]
    }
  },
  {
    name: "update_memory",
    description: "Update what you remember about this reef and its prey. Your memory persists across hunts. Keep it focused on spatial patterns and prey behavior.",
    input_schema: {
      type: "object",
      properties: {
        memory_content: {
          type: "string",
          description: "Your updated memory. Replaces current memory entirely."
        }
      },
      required: ["memory_content"]
    }
  },
  {
    name: "recall_hunt",
    description: "Review the details of a specific past hunt.",
    input_schema: {
      type: "object",
      properties: {
        hunt_id: {
          type: "number",
          description: "The hunt number to recall."
        }
      },
      required: ["hunt_id"]
    }
  }
];
function buildSystemPrompt(soma) {
  return `You are a ${soma.species} in a coral reef. You hunt a small bioluminescent squid.

<nature>
${soma.nature}
</nature>

<current_instincts>
This is the code that controls your hunting behavior. When you detect prey, lose it, or patrol, this code runs.
\`\`\`javascript
${soma.instinctCode}
\`\`\`
</current_instincts>

<memory>
${soma.memory}
</memory>

<hunt_record>
${soma.huntHistory.length === 0 ? "No previous hunts." : soma.huntHistory.map(
    (h) => `Hunt #${h.huntId}: ${h.outcome} (${h.durationSeconds.toFixed(1)}s) closest: ${h.closestDistance.toFixed(1)}u${h.preyConcealed ? ` \u2014 prey hid in ${h.concealmentTile}` : ""}`
  ).join("\n")}
</hunt_record>

<reef_knowledge>
The reef is a maze of coral walls, open water channels, kelp forests, narrow crevices, and dens.
- Walls block movement and line of sight
- Kelp: passable but prey can hide here (concealment \u2014 becomes invisible to sensors)
- Crevices: narrow passages \u2014 you CANNOT fit through (too big), but the squid can
- Dens: alcoves carved into walls \u2014 prey hides here, you cannot enter
- The squid conceals itself by going still on hiding tiles (kelp, crevice, den). When concealed, your sensors cannot detect it.
- You must catch the squid in open water or while it's moving through kelp.
</reef_knowledge>

<sensing>
Your sensors detect prey within 16 world units if line of sight is clear AND prey is not concealed.
- me.check_los(pos) \u2014 checks if you can see a position (walls block)
- me.nearby_tiles(type) \u2014 returns nearby tiles of a given type ('kelp', 'den', 'crevice', 'open') within sensor range, sorted by distance. Each has {x, z, dist}.
- me.distance_to(pos) \u2014 returns distance to a position
</sensing>

<movement>
Available in onStimulus(type, data, me):
- me.pursue(target) \u2014 chase speed, beeline toward target position {x, z}
- me.patrol_to(target) \u2014 patrol speed, move toward specific position {x, z}
- me.patrol_random() \u2014 pick a random open tile and patrol toward it (picks a new waypoint only if current one is null)
- me.hold() \u2014 stay still
- me.getState() / me.setState(s) \u2014 your behavioral state (string, you define the states)
- me.getLastKnown() / me.setLastKnown(pos) \u2014 last known prey position {x, z}
- me.getTimeSinceLost() \u2014 seconds since prey was last detected
- me.getPosition() \u2014 your current position {x, z}
- me.memory.read() / me.memory.write(s) \u2014 read/write your persistent memory string
</movement>

<stimuli>
Your onStimulus function receives one of three stimulus types:
- 'prey_detected' \u2014 you can see the prey right now. data.prey_position = {x, z}, data.prey_distance = number
- 'prey_lost' \u2014 you were pursuing (called me.pursue() last frame) but can no longer see the prey. data.last_known_position = {x, z}
- 'tick' \u2014 nothing detected and you weren't pursuing. data.current_state = your state string, data.time_since_lost = seconds since last detection
Only one stimulus fires per frame, in priority order: prey_detected > prey_lost > tick.
Note: 'prey_lost' only fires if you called me.pursue() on the previous frame. If you were patrolling and the prey disappears, you just get 'tick'.
</stimuli>

IMPORTANT: You MUST call update_instinct to change your behavior. Thinking about improvements without calling the tool changes nothing. Your instinct code is what actually runs during hunts.`;
}
function buildReflectionPrompt(summary, huntCount) {
  return `A hunt just failed. The prey escaped.

<hunt_replay>
${summary.textSummary}
</hunt_replay>

${huntCount <= 1 ? "This was your first failed hunt. Your default instincts are basic \u2014 chase on sight, go to last-known on loss, random patrol otherwise. Think about what you could do differently when the prey hides or breaks line of sight." : `You have completed ${huntCount} hunts total. Review whether your previous changes helped. If your hunt duration or closest approach is improving, keep refining. If not, try a different approach.`}

Reflect on this hunt:

1. **What happened?** Why did the prey escape? Did it hide? Where? Could you have predicted it?

2. **Call update_instinct**: Rewrite your onStimulus function with specific improvements. Ideas:
   - After losing prey, check nearby hiding tiles (me.nearby_tiles('kelp'), me.nearby_tiles('den')) instead of just going to last-known position
   - Use memory to track where prey hides repeatedly
   - Patrol routes that pass near known hiding spots instead of random waypoints
   - Search patterns (check nearby tiles systematically) instead of standing at last-known
   - Predict which direction the prey fled based on your approach angle

3. **Call update_memory**: Record spatial knowledge \u2014 where are the good hiding spots? Where does prey tend to go?

DO NOT just describe improvements. CALL THE TOOLS.`;
}
var MAX_INSTINCT_LENGTH = 1e4;
function validateInstinctCode(code) {
  const errors = [];
  if (code.length > MAX_INSTINCT_LENGTH) {
    errors.push(`Instinct code is ${code.length} chars, max is ${MAX_INSTINCT_LENGTH}`);
  }
  if (!code.includes("onStimulus")) {
    errors.push("Must contain an onStimulus function");
  }
  if (!code.match(/(?:async\s+)?function\s+onStimulus\s*\(\s*type\s*,\s*data\s*,\s*me\s*\)/)) {
    errors.push("onStimulus must accept (type, data, me) parameters");
  }
  const forbidden = [
    { pattern: /\beval\s*\(/, msg: "eval() not allowed" },
    { pattern: /\bFunction\s*\(/, msg: "Function constructor not allowed" },
    { pattern: /\bimport\s*\(/, msg: "Dynamic import not allowed" },
    { pattern: /\bfetch\s*\(/, msg: "fetch() not allowed" },
    { pattern: /\bwindow\b/, msg: "window access not allowed" },
    { pattern: /\bdocument\b/, msg: "document access not allowed" }
  ];
  for (const { pattern, msg } of forbidden) {
    if (pattern.test(code)) errors.push(msg);
  }
  try {
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    new AsyncFunction("type", "data", "me", `${code}
return onStimulus(type, data, me);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }
  return { valid: errors.length === 0, errors };
}
function processToolCall(toolName, input, soma, allHunts, result) {
  switch (toolName) {
    case "update_instinct": {
      const code = input.instinct_code;
      const reasoning = input.reasoning;
      if (!code) return { success: false, error: "instinct_code is required" };
      const validation = validateInstinctCode(code);
      if (!validation.valid) {
        console.log(`[GLINT] Instinct validation failed for ${soma.id}: ${validation.errors.join(", ")}`);
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(", ")}. Fix and try again.`
        };
      }
      soma.instinctCode = code;
      result.instinctUpdated = true;
      console.log(`[GLINT] Instinct updated for ${soma.id}: ${reasoning} (${code.length} chars)`);
      return {
        success: true,
        data: { message: "Instincts updated. They will execute on the next hunt." }
      };
    }
    case "update_memory": {
      const content = input.memory_content;
      if (!content) return { success: false, error: "memory_content is required" };
      soma.memory = content;
      result.memoryUpdated = true;
      console.log(`[GLINT] Memory updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: "Memory updated." } };
    }
    case "recall_hunt": {
      const huntId = input.hunt_id;
      if (huntId === void 0) return { success: false, error: "hunt_id is required" };
      const hunt = allHunts.find((h) => h.huntId === huntId);
      if (!hunt) return { success: false, error: `Hunt #${huntId} not found.` };
      return { success: true, data: { summary: hunt.textSummary } };
    }
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
async function callAPI(endpoint, body) {
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      console.log(`[GLINT] Reflection API error: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.log(`[GLINT] Reflection API fetch error: ${err}`);
    return null;
  }
}
var REFLECTION_MAX_TURNS = 3;
async function reflectPredator(soma, huntSummary, allHunts, apiEndpoint) {
  soma.reflectionPending = true;
  const result = {
    predatorId: soma.id,
    success: false,
    instinctUpdated: false,
    memoryUpdated: false,
    reasoning: ""
  };
  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(huntSummary, soma.huntHistory.length);
    let messages = [
      { role: "user", content: userPrompt }
    ];
    let turns = 0;
    while (turns < REFLECTION_MAX_TURNS) {
      turns++;
      const response = await callAPI(apiEndpoint, {
        model: "claude-haiku-4-5-20251001",
        system: systemPrompt,
        messages,
        tools: SCAFFOLD_TOOLS,
        max_tokens: 2048
      });
      if (!response) {
        result.error = "API call failed";
        break;
      }
      const toolResults = [];
      let hasToolUse = false;
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          result.reasoning += block.text + "\n";
        }
        if (block.type === "tool_use" && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(block.name, block.input, soma, allHunts, result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          });
        }
      }
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults }
      ];
    }
    result.success = true;
  } catch (err) {
    result.error = String(err);
    console.log(`[GLINT] Reflection error for ${soma.id}: ${err}`);
  } finally {
    soma.reflectionPending = false;
  }
  return result;
}
var REFLECTION_COOLDOWN = 60;
var MIN_HUNT_DURATION = 2;
function shouldReflect(soma, summary, gameTime) {
  if (soma.reflectionPending) return false;
  if (soma.lastReflectionTime > 0 && gameTime - soma.lastReflectionTime < REFLECTION_COOLDOWN) return false;
  if (summary.durationSeconds < MIN_HUNT_DURATION) return false;
  return true;
}

// src/persistence.ts
var STORAGE_KEY_PREFIX = "glint-predators-";
function savePredatorSomas(predators2, mapSeed) {
  const key = `${STORAGE_KEY_PREFIX}${mapSeed}`;
  const data = predators2.map((p) => p.predatorSoma);
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[GLINT] Saved ${data.length} predator somas for seed ${mapSeed}`);
  } catch (err) {
    console.log(`[GLINT] Save error: ${err}`);
  }
}
function loadPredatorSomas(mapSeed) {
  const key = `${STORAGE_KEY_PREFIX}${mapSeed}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`[GLINT] Loaded ${parsed.length} predator somas for seed ${mapSeed}`);
      return parsed;
    }
  } catch (err) {
    console.log(`[GLINT] Load error: ${err}`);
  }
  return null;
}
function resetPredatorSomas(mapSeed) {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${mapSeed}`);
  console.log(`[GLINT] Reset predator somas for seed ${mapSeed}`);
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
  const tex = new THREE4.DataTexture(data, 3, 1, THREE4.RedFormat);
  tex.minFilter = THREE4.NearestFilter;
  tex.magFilter = THREE4.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
var gradientMap = makeToonGradient();
var renderer = new THREE4.WebGLRenderer({ antialias: false });
renderer.setSize(RENDER_W, RENDER_H);
renderer.domElement.style.width = `${RENDER_W * PIXEL_SCALE}px`;
renderer.domElement.style.height = `${RENDER_H * PIXEL_SCALE}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE4.BasicShadowMap;
renderer.setClearColor(133136);
document.body.appendChild(renderer.domElement);
var scene = new THREE4.Scene();
scene.fog = new THREE4.FogExp2(397856, 0.018);
var aspect = RENDER_W / RENDER_H;
var viewSize = 16;
var camera = new THREE4.OrthographicCamera(
  -viewSize * aspect / 2,
  viewSize * aspect / 2,
  viewSize / 2,
  -viewSize / 2,
  0.1,
  100
);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);
var ambient = new THREE4.AmbientLight(1716304, 0.8);
scene.add(ambient);
var hemi = new THREE4.HemisphereLight(3368618, 662058, 0.6);
scene.add(hemi);
var sun = new THREE4.DirectionalLight(4491468, 1);
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
var particleGeo = new THREE4.BufferGeometry();
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
particleGeo.setAttribute("position", new THREE4.BufferAttribute(particlePositions, 3));
var particleMat = new THREE4.PointsMaterial({
  color: 8965358,
  size: 0.08,
  transparent: true,
  opacity: 0.6
});
scene.add(new THREE4.Points(particleGeo, particleMat));
var jellies = [];
for (let i = 0; i < 8; i++) {
  const color = new THREE4.Color().setHSL(0.45 + pRand() * 0.25, 0.8, 0.5);
  const geo = new THREE4.SphereGeometry(0.15, 6, 4);
  const mat = new THREE4.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7
  });
  const mesh = new THREE4.Mesh(geo, mat);
  const pos = new THREE4.Vector3(
    (pRand() - 0.5) * MAP_W * TILE_SIZE * 0.6,
    1 + pRand() * 3,
    (pRand() - 0.5) * MAP_H * TILE_SIZE * 0.6
  );
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE4.PointLight(color, 0.8, 10);
  light.position.copy(pos);
  scene.add(light);
  jellies.push({ mesh, light, basePos: pos.clone(), phase: pRand() * Math.PI * 2 });
}
var squid = createSquid(gradientMap);
var spawn = tileToWorld(map.playerSpawn.x, map.playerSpawn.z, TILE_SIZE, MAP_W, MAP_H);
squid.group.position.set(spawn.wx, 1, spawn.wz);
scene.add(squid.group);
var predators = [];
var invulnTimer = 0;
var sharkRng = /* @__PURE__ */ (() => {
  let s = 54321;
  return () => {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
})();
var MAP_SEED = 42;
var savedSomas = loadPredatorSomas(MAP_SEED);
function spawnSharks(count) {
  const spawnRng = /* @__PURE__ */ (() => {
    let s = 98765;
    return () => {
      s |= 0;
      s = s + 1831565813 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })();
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const tx = Math.floor(spawnRng() * MAP_W);
      const tz = Math.floor(spawnRng() * MAP_H);
      const tile = getTile(map, tx, tz);
      if (tile !== 0 /* OPEN */) continue;
      const dtx = tx - map.playerSpawn.x, dtz = tz - map.playerSpawn.z;
      if (dtx * dtx + dtz * dtz < 225) continue;
      const { wx, wz } = tileToWorld(tx, tz, TILE_SIZE, MAP_W, MAP_H);
      const wdx = wx - spawn.wx, wdz = wz - spawn.wz;
      if (wdx * wdx + wdz * wdz < 400) continue;
      const existingSoma = savedSomas?.[n];
      const shark = createShark(`shark-${n}`, wx, wz, gradientMap, existingSoma);
      scene.add(shark.group);
      predators.push(shark);
      const somaStatus = existingSoma ? "(loaded soma)" : "(fresh soma)";
      console.log(`[GLINT] Spawned ${shark.id} at tile (${tx},${tz}) world (${wx.toFixed(1)},${wz.toFixed(1)}) ${somaStatus}`);
      break;
    }
  }
}
spawnSharks(3);
var huntTracker = new HuntTracker();
var prevConcealed = /* @__PURE__ */ new Map();
var prevState = /* @__PURE__ */ new Map();
var API_ENDPOINT = "/api/inference/anthropic/messages";
function triggerReflection(pred, summary) {
  const soma = pred.predatorSoma;
  const gameTime = clock.getElapsedTime();
  if (!shouldReflect(soma, summary, gameTime)) return;
  soma.huntHistory.push({
    huntId: summary.huntId,
    outcome: summary.outcome,
    durationSeconds: summary.durationSeconds,
    closestDistance: summary.closestDistance,
    preyConcealed: summary.preyConcealed,
    concealmentTile: summary.concealmentTile
  });
  if (soma.huntHistory.length > 10) soma.huntHistory.shift();
  console.log(`[GLINT] Reflection started for ${pred.id} (hunt #${summary.huntId})`);
  soma.lastReflectionTime = gameTime;
  reflectPredator(
    soma,
    summary,
    huntTracker.getCompletedHunts(pred.id),
    API_ENDPOINT
  ).then((result) => {
    console.log(`[GLINT] Reflection complete for ${pred.id}: instinct=${result.instinctUpdated}, memory=${result.memoryUpdated}`);
    if (result.reasoning) {
      console.log(`[GLINT] Reasoning: ${result.reasoning.slice(0, 200)}`);
    }
    if (result.instinctUpdated) {
      clearInstinctCache();
    }
    savePredatorSomas(predators, MAP_SEED);
  }).catch((err) => {
    console.log(`[GLINT] Reflection error for ${pred.id}: ${err}`);
    soma.reflectionPending = false;
  });
}
window.__glint = {
  map,
  squid,
  tileToWorld,
  worldToTile,
  TILE_SIZE,
  MAP_W,
  MAP_H,
  predators,
  clearInstinctCache,
  huntTracker,
  readSensors,
  triggerReflection,
  get invulnTimer() {
    return invulnTimer;
  },
  set invulnTimer(v) {
    invulnTimer = v;
  },
  resetSomas: () => resetPredatorSomas(MAP_SEED),
  saveSomas: () => savePredatorSomas(predators, MAP_SEED)
};
var clock = new THREE4.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  updateSquid(squid, dt, t, map, TILE_SIZE);
  if (invulnTimer > 0) invulnTimer -= dt;
  for (const pred of predators) {
    const sensors = invulnTimer > 0 ? { squidDetected: false, squidWorldPos: { x: 0, z: 0 }, squidDist: 999 } : readSensors(pred, squid, map, TILE_SIZE);
    const wasState = prevState.get(pred.id) ?? "patrol";
    const wasConcealed = prevConcealed.get(pred.id) ?? false;
    dispatchStimulus(pred, sensors, dt, map, TILE_SIZE, sharkRng);
    pred.animate(pred, t);
    if (sensors.squidDetected && !huntTracker.isHunting(pred.id)) {
      huntTracker.startHunt(pred.id, t);
      huntTracker.recordEvent(pred.id, {
        type: "detected",
        predPos: { x: pred.group.position.x, z: pred.group.position.z },
        preyPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
        distance: sensors.squidDist
      }, t);
    }
    if (huntTracker.isHunting(pred.id)) {
      if (sensors.squidDetected) {
        huntTracker.recordEvent(pred.id, {
          type: "pursuing",
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
          distance: sensors.squidDist
        }, t);
      }
      if (wasState === "chase" && pred.physical.state === "search") {
        huntTracker.recordEvent(pred.id, {
          type: "lost_los",
          predPos: { x: pred.group.position.x, z: pred.group.position.z }
        }, t);
      }
      if (squid.concealed && !wasConcealed) {
        const { tx, tz } = worldToTile(
          squid.group.position.x,
          squid.group.position.z,
          TILE_SIZE,
          MAP_W,
          MAP_H
        );
        const tile = getTile(map, tx, tz);
        const tileName = tile === 3 /* KELP */ ? "kelp" : tile === 2 /* CREVICE */ ? "crevice" : tile === 4 /* DEN */ ? "den" : "unknown";
        huntTracker.recordEvent(pred.id, {
          type: "prey_concealed",
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: squid.group.position.x, z: squid.group.position.z },
          note: `Prey entered ${tileName} at (${squid.group.position.x.toFixed(1)}, ${squid.group.position.z.toFixed(1)})`
        }, t);
      }
      if (!squid.concealed && wasConcealed) {
        huntTracker.recordEvent(pred.id, {
          type: "prey_revealed",
          predPos: { x: pred.group.position.x, z: pred.group.position.z },
          preyPos: { x: squid.group.position.x, z: squid.group.position.z }
        }, t);
      }
      if (pred.physical.state === "patrol" && wasState !== "patrol") {
        const summary = huntTracker.endHunt(pred.id, "lost", t);
        if (summary) triggerReflection(pred, summary);
      }
    }
    prevState.set(pred.id, pred.physical.state);
    prevConcealed.set(pred.id, squid.concealed);
    if (invulnTimer <= 0 && checkCatch(pred, squid)) {
      if (huntTracker.isHunting(pred.id)) {
        huntTracker.endHunt(pred.id, "catch", t);
      }
      console.log(`[GLINT] Caught by ${pred.id}!`);
      squid.group.position.set(spawn.wx, 1, spawn.wz);
      invulnTimer = 2;
      for (const p of predators) {
        if (p.id !== pred.id && huntTracker.isHunting(p.id)) {
          const lostSummary = huntTracker.endHunt(p.id, "lost", t);
          if (lostSummary) triggerReflection(p, lostSummary);
        }
        p.physical.state = "patrol";
        p.physical.waypoint = null;
        p.physical.lastSeenPos = null;
        prevState.set(p.id, "patrol");
      }
      break;
    }
  }
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
