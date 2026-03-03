// src/main.ts
import * as THREE5 from "three";

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
  const eyeL = new THREE2.Mesh(eyeWhiteGeo, eyeWhiteMat.clone());
  eyeL.position.set(-0.22, 0.1, 0.18);
  group.add(eyeL);
  const pupilL = new THREE2.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.28, 0.1, 0.22);
  group.add(pupilL);
  const eyeR = new THREE2.Mesh(eyeWhiteGeo, eyeWhiteMat.clone());
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
  return { group, glow, tentacles, finL, finR, mantle, body, eyes: [eyeL, eyeR], concealed: false };
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
var SPRINT_MULT = 2;
var DEPLETED_MULT = 0.6;
var COLLISION_RADIUS = 0.3;
var DRAIN_IDLE = 1;
var DRAIN_MOVE = 2;
var DRAIN_SPRINT = 5;
var energy = 100;
function getEnergy() {
  return energy;
}
function addEnergy(amount) {
  energy = Math.max(0, Math.min(100, energy + amount));
}
function resetEnergy() {
  energy = 100;
}
var CONCEALED_MANTLE = new THREE2.Color(1122867);
var CONCEALED_BODY = new THREE2.Color(662056);
var CONCEALED_GLOW_INTENSITY = 0.3;
var CONCEALMENT_SPEED = 4;
var FULL_MANTLE = new THREE2.Color(4508927);
var DEPLETED_MANTLE = new THREE2.Color(1717060);
var FULL_BODY = new THREE2.Color(3390446);
var DEPLETED_BODY = new THREE2.Color(1387059);
var FULL_GLOW_INTENSITY = 2.5;
var DEPLETED_GLOW_INTENSITY = 0.4;
var FULL_GLOW_RANGE = 12;
var DEPLETED_GLOW_RANGE = 4;
var FULL_EYE_EMISSIVE = 1;
var DEPLETED_EYE_EMISSIVE = 0.15;
var FULL_PULSE_AMP = 0.2;
var DEPLETED_PULSE_AMP = 0.05;
var _energyMantle = new THREE2.Color();
var _energyBody = new THREE2.Color();
var _glowBase = FULL_GLOW_INTENSITY;
var _smoothedSpeed = 0;
var CREEP_THRESHOLD = 3.5;
var SMOOTH_RATE = 3;
var HIDE_GRACE_DURATION = 0.3;
var _hideGraceTimer = 0;
var _wasOnHidingTile = false;
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
  if (energy <= 0) sprinting = false;
  const moving = len > 0;
  const drainRate = sprinting ? DRAIN_SPRINT : moving ? DRAIN_MOVE : DRAIN_IDLE;
  energy = Math.max(0, energy - drainRate * dt);
  const baseMult = energy > 0 ? 1 : DEPLETED_MULT;
  const speed = MOVE_SPEED * baseMult * (sprinting ? SPRINT_MULT : 1);
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
  const energyPct = energy / 100;
  const tentacleMult = 0.5 + 0.5 * energyPct;
  for (let i = 0; i < squid2.tentacles.length; i++) {
    const phase = i / squid2.tentacles.length * Math.PI * 2;
    const swaySpeed = len > 0 ? 6 : 1.5;
    const swayAmp = (len > 0 ? 0.15 : 0.25) * tentacleMult;
    squid2.tentacles[i].rotation.x = 0.4 + Math.sin(t * swaySpeed + phase) * swayAmp;
    squid2.tentacles[i].rotation.z = Math.sin(t * 2 + phase) * 0.15 * tentacleMult;
  }
  const movedX = squid2.group.position.x - curX;
  const movedZ = squid2.group.position.z - curZ;
  const actualSpeed = dt > 0 ? Math.sqrt(movedX * movedX + movedZ * movedZ) / dt : 0;
  _smoothedSpeed += (actualSpeed - _smoothedSpeed) * Math.min(1, SMOOTH_RATE * dt);
  const { tx, tz } = worldToTile(squid2.group.position.x, squid2.group.position.z, tileSize, map2.width, map2.height);
  const currentTile = getTile(map2, tx, tz);
  const onHidingTile = currentTile === 4 /* DEN */ || currentTile === 2 /* CREVICE */ || currentTile === 3 /* KELP */;
  if (onHidingTile && !_wasOnHidingTile) {
    _hideGraceTimer = HIDE_GRACE_DURATION;
  }
  _wasOnHidingTile = onHidingTile;
  _hideGraceTimer = Math.max(0, _hideGraceTimer - dt);
  squid2.concealed = onHidingTile && (_hideGraceTimer > 0 || _smoothedSpeed < CREEP_THRESHOLD);
  _energyMantle.copy(DEPLETED_MANTLE).lerp(FULL_MANTLE, energyPct);
  _energyBody.copy(DEPLETED_BODY).lerp(FULL_BODY, energyPct);
  const energyGlow = DEPLETED_GLOW_INTENSITY + (FULL_GLOW_INTENSITY - DEPLETED_GLOW_INTENSITY) * energyPct;
  const energyRange = DEPLETED_GLOW_RANGE + (FULL_GLOW_RANGE - DEPLETED_GLOW_RANGE) * energyPct;
  const energyEyeEmissive = DEPLETED_EYE_EMISSIVE + (FULL_EYE_EMISSIVE - DEPLETED_EYE_EMISSIVE) * energyPct;
  const energyPulseAmp = DEPLETED_PULSE_AMP + (FULL_PULSE_AMP - DEPLETED_PULSE_AMP) * energyPct;
  const targetMantle = squid2.concealed ? CONCEALED_MANTLE : _energyMantle;
  const targetBody = squid2.concealed ? CONCEALED_BODY : _energyBody;
  const targetGlow = squid2.concealed ? CONCEALED_GLOW_INTENSITY : energyGlow;
  const lerpT = 1 - Math.exp(-CONCEALMENT_SPEED * dt);
  const mantleMat = squid2.mantle.material;
  mantleMat.color.lerp(targetMantle, lerpT);
  const bodyMat = squid2.body.material;
  bodyMat.color.lerp(targetBody, lerpT);
  _glowBase += (targetGlow - _glowBase) * lerpT;
  const pulseAmp = squid2.concealed ? 0.08 : energyPulseAmp;
  squid2.glow.intensity = Math.max(0, _glowBase + Math.sin(t * 2) * pulseAmp);
  squid2.glow.distance = squid2.glow.distance + (energyRange - squid2.glow.distance) * lerpT;
  for (const eye of squid2.eyes) {
    const eyeMat = eye.material;
    eyeMat.emissiveIntensity += (energyEyeEmissive - eyeMat.emissiveIntensity) * lerpT;
  }
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

// src/food.ts
import * as THREE3 from "three";
var COLLECT_RADIUS = 1;
var RESPAWN_TIME = 10;
var MORSEL_Y = 0.15;
var BOB_AMP = 0.08;
var BOB_FREQ = 2;
function pickValidTile(map2, rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const tx = Math.floor(rng() * map2.width);
    const tz = Math.floor(rng() * map2.height);
    const tile = getTile(map2, tx, tz);
    if (tile === 0 /* OPEN */ || tile === 3 /* KELP */) return { tx, tz };
  }
  return { tx: Math.floor(map2.width / 2), tz: Math.floor(map2.height / 2) };
}
function createMorselMesh() {
  const group = new THREE3.Group();
  const geo = new THREE3.SphereGeometry(0.12, 6, 4);
  const mat = new THREE3.MeshStandardMaterial({
    color: 16763972,
    emissive: 11206468,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.9
  });
  const orb = new THREE3.Mesh(geo, mat);
  group.add(orb);
  const haloGeo = new THREE3.SphereGeometry(0.2, 6, 4);
  const haloMat = new THREE3.MeshStandardMaterial({
    color: 16772744,
    emissive: 16763972,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.25
  });
  const halo = new THREE3.Mesh(haloGeo, haloMat);
  group.add(halo);
  const light = new THREE3.PointLight(16763972, 1, 5);
  group.add(light);
  return { group, light };
}
function spawnMorsels(scene2, map2, tileSize, count, rng) {
  const morsels2 = [];
  for (let i = 0; i < count; i++) {
    const { tx, tz } = pickValidTile(map2, rng);
    const { wx, wz } = tileToWorld(tx, tz, tileSize, map2.width, map2.height);
    const { group, light } = createMorselMesh();
    group.position.set(wx, MORSEL_Y, wz);
    scene2.add(group);
    morsels2.push({
      group,
      light,
      tileX: tx,
      tileZ: tz,
      alive: true,
      respawnTimer: 0,
      phase: rng() * Math.PI * 2
    });
  }
  return morsels2;
}
function updateMorsels(morsels2, squid2, dt, t, scene2, map2, tileSize, rng) {
  let energyGained = 0;
  const sx = squid2.group.position.x;
  const sz = squid2.group.position.z;
  for (const m of morsels2) {
    if (m.alive) {
      m.group.position.y = MORSEL_Y + Math.sin(t * BOB_FREQ + m.phase) * BOB_AMP;
      m.light.intensity = 0.8 + Math.sin(t * 3 + m.phase) * 0.4;
      const dx = sx - m.group.position.x;
      const dz = sz - m.group.position.z;
      if (dx * dx + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        m.alive = false;
        m.group.visible = false;
        m.respawnTimer = RESPAWN_TIME;
        energyGained += 20;
      }
    } else {
      m.respawnTimer -= dt;
      if (m.respawnTimer <= 0) {
        const { tx, tz } = pickValidTile(map2, rng);
        const { wx, wz } = tileToWorld(tx, tz, tileSize, map2.width, map2.height);
        m.tileX = tx;
        m.tileZ = tz;
        m.group.position.set(wx, MORSEL_Y, wz);
        m.group.visible = true;
        m.alive = true;
      }
    }
  }
  return energyGained;
}

// src/instinct-api.ts
var TILE_NAMES = {
  open: 0 /* OPEN */,
  wall: 1 /* WALL */,
  crevice: 2 /* CREVICE */,
  kelp: 3 /* KELP */,
  den: 4 /* DEN */
};
var MAX_JOURNAL_LENGTH = 5e3;
function createTickAPI(pred, map2, tileSize, actions) {
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
    getPosition: () => ({ x: px(), z: pz() }),
    memory: {
      read: () => pred.predatorSoma.memory,
      write: (s) => {
        pred.predatorSoma.memory = s;
      }
    },
    hunt_journal: {
      read: () => pred.predatorSoma.hunt_journal,
      write: (s) => {
        if (s.length > MAX_JOURNAL_LENGTH) {
          const trimPoint = s.indexOf("\n", s.length - MAX_JOURNAL_LENGTH);
          s = trimPoint > 0 ? s.slice(trimPoint + 1) : s.slice(s.length - MAX_JOURNAL_LENGTH);
        }
        pred.predatorSoma.hunt_journal = s;
      }
    },
    on_tick: {
      read: () => pred.predatorSoma.on_tick
    },
    identity: {
      read: () => pred.predatorSoma.identity
    }
  };
}

// src/instinct-executor.ts
var TICK_TIMEOUT_MS = 50;
var tickCache = /* @__PURE__ */ new Map();
function compileInstinct(soma) {
  const cached = tickCache.get(soma.id);
  if (cached && cached.code === soma.on_tick) {
    return cached.compiled;
  }
  try {
    const wrappedCode = `
      ${soma.on_tick}
      return on_tick(me, world);
    `;
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction("me", "world", wrappedCode);
    const compiled = { predatorId: soma.id, fn };
    tickCache.set(soma.id, { code: soma.on_tick, compiled });
    return compiled;
  } catch (err) {
    console.log(`[GLINT] on_tick compile error for ${soma.id}: ${err}`);
    return null;
  }
}
async function executeTick(compiled, api, world) {
  try {
    const result = await Promise.race([
      compiled.fn(api, world),
      new Promise(
        (resolve) => setTimeout(() => resolve("timeout"), TICK_TIMEOUT_MS)
      )
    ]);
    if (result === "timeout") {
      console.log(`[GLINT] on_tick timeout for ${compiled.predatorId}`);
    }
  } catch (err) {
    console.log(`[GLINT] on_tick runtime error for ${compiled.predatorId}: ${err}`);
  }
}
function clearInstinctCache() {
  tickCache.clear();
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
    pred.physical.waypoint = null;
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
function runTick(pred, sensors, dt, t, map2, tileSize, rng) {
  if (busyPredators.has(pred.id)) {
    if (pred.physical.waypoint) {
      const useChase = pred.physical.lastActionType === "pursue";
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map2, tileSize, useChase);
    }
    return;
  }
  const compiled = compileInstinct(pred.predatorSoma);
  if (!compiled) {
    if (pred.physical.waypoint) {
      moveToward(pred, pred.physical.waypoint.x, pred.physical.waypoint.z, dt, map2, tileSize, false);
    }
    return;
  }
  const worldData = {
    squidDetected: sensors.squidDetected,
    squidPos: { x: sensors.squidWorldPos.x, z: sensors.squidWorldPos.z },
    squidDist: sensors.squidDist,
    dt,
    t
  };
  const actions = [];
  const api = createTickAPI(pred, map2, tileSize, actions);
  busyPredators.add(pred.id);
  executeTick(compiled, api, worldData).then(() => {
    busyPredators.delete(pred.id);
    if (actions.length > 0) {
      applyAction(pred, actions[0], dt, map2, tileSize, rng);
    }
  });
  if (actions.length > 0) {
    busyPredators.delete(pred.id);
    applyAction(pred, actions[0], dt, map2, tileSize, rng);
  }
  const actionType = actions.length > 0 ? actions[0].type : pred.physical.lastActionType;
  if (actionType === "pursue") {
    pred.physical.timeSinceLastPursue = 0;
  } else {
    pred.physical.timeSinceLastPursue += dt;
  }
  pred.physical.lastActionType = actionType;
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
import * as THREE4 from "three";

// src/soma.ts
var DEFAULT_SHARK_ON_TICK = `
async function on_tick(me, world) {
  const mem = me.memory.read();

  // Parse working state from memory (string matching, no JSON)
  const wasPursuing = mem.includes('pursuing:yes');
  const ltm = mem.match(/lost:([\\d.]+)/);
  const lostTime = ltm ? +ltm[1] : 999;
  const lkm = mem.match(/lastknown:([-.\\d]+),([-.\\d]+)/);
  const lastKnown = lkm ? { x: +lkm[1], z: +lkm[2] } : null;
  const llm = mem.match(/lastlog:([\\d.]+)/);
  const lastLog = llm ? +llm[1] : 0;

  // Preserve any notes (lines not matching state keys)
  const notes = mem.replace(/^(pursuing|lost|lastknown|lastlog):.*$/gm, '').trim();

  let nowPursuing = false;
  let nowLostTime = lostTime;
  let nowLastKnown = lastKnown;
  let nowLastLog = lastLog;

  if (world.squidDetected) {
    // --- PREY DETECTED ---
    if (!wasPursuing) {
      const j = me.hunt_journal.read();
      me.hunt_journal.write(j +
        '\\n[t=' + world.t.toFixed(0) + 's] Detected prey at (' +
        world.squidPos.x.toFixed(1) + ', ' + world.squidPos.z.toFixed(1) +
        '), dist ' + world.squidDist.toFixed(1));
      nowLastLog = world.t;
    }
    nowLastKnown = { x: world.squidPos.x, z: world.squidPos.z };
    nowLostTime = 0;
    nowPursuing = true;
    me.pursue(world.squidPos);
  } else if (wasPursuing) {
    // --- PREY LOST ---
    const j = me.hunt_journal.read();
    me.hunt_journal.write(j +
      '\\n[t=' + world.t.toFixed(0) + 's] Lost prey');
    nowLostTime = 0;
    nowPursuing = false;
    nowLastLog = world.t;
    if (nowLastKnown) me.patrol_to(nowLastKnown);
  } else {
    // --- TICK ---
    nowLostTime = lostTime + world.dt;
    if (nowLostTime < 5.0 && nowLastKnown) {
      me.patrol_to(nowLastKnown);
    } else {
      me.patrol_random();
    }

    // Idle journal: log patrol status every ~30s so reflection has material
    if (world.t - lastLog >= 30) {
      const pos = me.getPosition();
      const nearby = me.nearby_tiles('kelp');
      const j = me.hunt_journal.read();
      me.hunt_journal.write(j +
        '\\n[t=' + world.t.toFixed(0) + 's] Patrolling at (' +
        pos.x.toFixed(1) + ', ' + pos.z.toFixed(1) +
        '), no prey sighted. ' + nearby.length + ' kelp nearby.');
      nowLastLog = world.t;
    }
  }

  // Write state back to memory
  me.memory.write(
    (nowPursuing ? 'pursuing:yes' : 'pursuing:no') + '\\n' +
    'lost:' + nowLostTime.toFixed(1) + '\\n' +
    (nowLastKnown ? 'lastknown:' + nowLastKnown.x.toFixed(1) + ',' + nowLastKnown.z.toFixed(1) : 'lastknown:none') + '\\n' +
    'lastlog:' + nowLastLog.toFixed(1) +
    (notes ? '\\n' + notes : ''));
}
`.trim();
var DEFAULT_SHARK_IDENTITY = "The reef shark hunts by sight and speed \u2014 a torpedo with teeth, closing distance before prey can reach cover.";
var DEFAULT_SHARK_MEMORY = "pursuing:no\nlost:999\nlastknown:none\nlastlog:0\nNo hunts yet. Patrol the reef, chase what moves.";
function createDefaultSharkSoma(id) {
  return {
    id,
    species: "shark",
    identity: DEFAULT_SHARK_IDENTITY,
    on_tick: DEFAULT_SHARK_ON_TICK,
    memory: DEFAULT_SHARK_MEMORY,
    hunt_journal: "",
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
    sensorRange: 8,
    isSmall: false
  };
}
function createShark(id, spawnX, spawnZ, gradientMap2, existingSoma) {
  const group = new THREE4.Group();
  const bodyGeo = new THREE4.SphereGeometry(0.5, 8, 6);
  const bodyMat = new THREE4.MeshToonMaterial({ color: 2767434, gradientMap: gradientMap2 });
  const body = new THREE4.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.6, 0.5, 1.4);
  body.castShadow = true;
  group.add(body);
  const snoutGeo = new THREE4.ConeGeometry(0.22, 0.5, 6);
  const snoutMat = new THREE4.MeshToonMaterial({ color: 3359829, gradientMap: gradientMap2 });
  const snout = new THREE4.Mesh(snoutGeo, snoutMat);
  snout.rotation.x = -Math.PI / 2;
  snout.position.z = 0.8;
  group.add(snout);
  const dorsalGeo = new THREE4.ConeGeometry(0.1, 0.45, 4);
  const dorsalMat = new THREE4.MeshToonMaterial({ color: 1714741, gradientMap: gradientMap2 });
  const dorsal = new THREE4.Mesh(dorsalGeo, dorsalMat);
  dorsal.position.set(0, 0.35, -0.1);
  group.add(dorsal);
  const tailGeo = new THREE4.ConeGeometry(0.18, 0.4, 4);
  const tailMat = new THREE4.MeshToonMaterial({ color: 2438469, gradientMap: gradientMap2 });
  const tail = new THREE4.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.1, -0.9);
  tail.rotation.x = Math.PI / 6;
  group.add(tail);
  for (let side = -1; side <= 1; side += 2) {
    const finGeo = new THREE4.ConeGeometry(0.08, 0.25, 3);
    const finMat = new THREE4.MeshToonMaterial({ color: 2438469, gradientMap: gradientMap2 });
    const fin = new THREE4.Mesh(finGeo, finMat);
    fin.position.set(side * 0.28, -0.12, 0.2);
    fin.rotation.z = side * 1.2;
    fin.rotation.x = -0.3;
    group.add(fin);
  }
  for (let side = -1; side <= 1; side += 2) {
    const eyeGeo = new THREE4.SphereGeometry(0.055, 5, 4);
    const eyeMat = new THREE4.MeshStandardMaterial({
      color: 16729088,
      emissive: 16729088,
      emissiveIntensity: 1.5
    });
    const eye = new THREE4.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.18, 0.08, 0.55);
    group.add(eye);
  }
  const threatLight = new THREE4.PointLight(16729088, 0.5, 10);
  threatLight.position.set(0, 0, 0.3);
  group.add(threatLight);
  group.position.set(spawnX, 1, spawnZ);
  group.rotation.y = Math.random() * Math.PI * 2;
  const physical = {
    waypoint: null,
    stuckTimer: 0,
    lastActionType: "patrol_random",
    timeSinceLastPursue: 999
  };
  const predatorSoma = existingSoma ?? createDefaultSharkSoma(id);
  function animate2(pred, t) {
    const pursuing = pred.physical.lastActionType === "pursue";
    const searching = !pursuing && pred.physical.timeSinceLastPursue < 8;
    body.rotation.y = Math.sin(t * 3 + pred.group.position.x) * 0.08;
    const tailSpeed = pursuing ? 8 : 2.5;
    tail.rotation.y = Math.sin(t * tailSpeed) * 0.3;
    if (pursuing) {
      pred.threatLight.intensity = 1.5 + Math.sin(t * 4) * 0.5;
      pred.threatLight.color.setHex(16720384);
    } else if (searching) {
      pred.threatLight.intensity = 0.8 + Math.sin(t * 2) * 0.3;
      pred.threatLight.color.setHex(16729088);
    } else {
      pred.threatLight.intensity = 0.3 + Math.sin(t) * 0.15;
      pred.threatLight.color.setHex(16737792);
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

// src/reflection.ts
var SCAFFOLD_TOOLS = [
  {
    name: "edit_on_tick",
    description: "Rewrite your per-frame behavior code. This is the code that runs every tick \u2014 it reads sensors, tracks state, records events to your hunt journal, and issues movement commands. Write the complete async function on_tick(me, world) { ... } body.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The complete async function on_tick(me, world) { ... } function."
        },
        reasoning: {
          type: "string",
          description: "What you changed and why."
        }
      },
      required: ["code", "reasoning"]
    }
  },
  {
    name: "edit_memory",
    description: "Update what you remember about this reef and its prey. Your memory persists across hunts and reflections.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Your updated memory. Replaces current memory entirely."
        }
      },
      required: ["content"]
    }
  },
  {
    name: "edit_identity",
    description: "Rewrite your identity \u2014 who you are, your hunting philosophy. This shapes how you think about yourself during reflection.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Your updated identity text."
        }
      },
      required: ["content"]
    }
  },
  {
    name: "edit_hunt_journal",
    description: "Curate your hunt journal. Summarize old entries, trim noise, keep what matters. Your on_tick code appends to this during hunts; you can clean it up during reflection.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Your updated hunt journal. Replaces current journal entirely."
        }
      },
      required: ["content"]
    }
  }
];
function buildSystemPrompt(soma) {
  return `You are a ${soma.species} in a coral reef. You hunt a small bioluminescent squid.

<identity>
${soma.identity}
</identity>

<on_tick>
This is your per-frame behavior code. It runs every tick with on_tick(me, world).
\`\`\`javascript
${soma.on_tick}
\`\`\`
</on_tick>

<memory>
${soma.memory}
</memory>

<hunt_journal>
${soma.hunt_journal || "No hunt entries yet."}
</hunt_journal>

<reef_knowledge>
The reef is a maze of coral walls, open water channels, kelp forests, narrow crevices, and dens.
- Walls block movement and line of sight
- Kelp: passable but prey can hide here (concealment \u2014 becomes invisible to sensors)
- Crevices: narrow passages \u2014 you CANNOT fit through (too big), but the squid can
- Dens: alcoves carved into walls \u2014 prey hides here, you cannot enter
- The squid conceals itself by going still on hiding tiles (kelp, crevice, den). When concealed, your sensors cannot detect it.
- You must catch the squid in open water or while it's moving through kelp.
</reef_knowledge>

<sensors>
Your on_tick(me, world) receives:
- world.squidDetected \u2014 boolean, true if you can see the prey right now
- world.squidPos \u2014 {x, z} prey position (only meaningful when detected)
- world.squidDist \u2014 distance to prey
- world.dt \u2014 seconds since last frame
- world.t \u2014 total elapsed game time

The me object provides:
Movement commands (call one per tick \u2014 first one wins):
- me.pursue(target) \u2014 chase speed, beeline toward {x, z}
- me.patrol_to(target) \u2014 patrol speed, move toward {x, z}
- me.patrol_random() \u2014 pick a random open tile and go there
- me.hold() \u2014 stay still

Sensing:
- me.check_los(pos) \u2014 checks if you can see a position (walls block)
- me.nearby_tiles(type) \u2014 returns nearby tiles of a given type ('kelp', 'den', 'crevice', 'open') within sensor range, sorted by distance. Each has {x, z, dist}.
- me.distance_to(pos) \u2014 returns distance to a position
- me.getPosition() \u2014 your current position {x, z}

Sections:
- me.memory.read() / me.memory.write(s) \u2014 your persistent memory. Use this for EVERYTHING: working state (pursuing? lost time? last known position?) AND long-term notes. Write it every tick. Parse with string matching.
- me.hunt_journal.read() / me.hunt_journal.write(s) \u2014 your hunt log
- me.on_tick.read() \u2014 read your own code (read-only at runtime)
- me.identity.read() \u2014 read your identity (read-only at runtime)
</sensors>

IMPORTANT: You MUST call edit_on_tick to change your behavior. Thinking about improvements without calling the tool changes nothing. Your on_tick code is what actually runs during hunts.`;
}
function buildReflectionPrompt(soma) {
  return `Time to reflect on your recent hunting experience.

Review your hunt journal above. It contains observations your on_tick code recorded during recent hunts.

Reflect:

1. **What happened?** Why did the prey escape? Did it hide? Where? Could you have predicted it?

2. **Call edit_on_tick**: Rewrite your on_tick function with specific improvements. Ideas:
   - After losing prey, check nearby hiding tiles (me.nearby_tiles('kelp'), me.nearby_tiles('den')) instead of just going to last-known position
   - Use memory to track where prey hides repeatedly
   - Write more detailed hunt journal entries from your on_tick code so you can learn from them later
   - Add systematic search patterns instead of random patrol
   - Predict which direction the prey fled based on your approach angle
   - Use me.memory for frame-to-frame tracking (was I pursuing? how long since lost? last known position?) \u2014 parse with string matching, write every tick

3. **Call edit_memory**: Record spatial knowledge \u2014 where are the good hiding spots? Where does prey tend to go?

4. **Call edit_hunt_journal**: Curate your journal \u2014 summarize old entries, keep what matters, trim what doesn't. An overly long journal wastes your attention.

DO NOT just describe improvements. CALL THE TOOLS.`;
}
var MAX_ON_TICK_LENGTH = 1e4;
function validateOnTickCode(code) {
  const errors = [];
  if (code.length > MAX_ON_TICK_LENGTH) {
    errors.push(`on_tick code is ${code.length} chars, max is ${MAX_ON_TICK_LENGTH}`);
  }
  if (!code.includes("on_tick")) {
    errors.push("Must contain an on_tick function");
  }
  if (!code.match(/(?:async\s+)?function\s+on_tick\s*\(\s*me\s*,\s*world\s*\)/)) {
    errors.push("on_tick must accept (me, world) parameters");
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
    new AsyncFunction("me", "world", `${code}
return on_tick(me, world);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }
  return { valid: errors.length === 0, errors };
}
function processToolCall(toolName, input, soma, result) {
  switch (toolName) {
    case "edit_on_tick": {
      const code = input.code;
      const reasoning = input.reasoning;
      if (!code) return { success: false, error: "code is required" };
      const validation = validateOnTickCode(code);
      if (!validation.valid) {
        console.log(`[GLINT] on_tick validation failed for ${soma.id}: ${validation.errors.join(", ")}`);
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(", ")}. Fix and try again.`
        };
      }
      soma.on_tick = code;
      result.onTickUpdated = true;
      console.log(`[GLINT] on_tick updated for ${soma.id}: ${reasoning} (${code.length} chars)`);
      return {
        success: true,
        data: { message: "on_tick updated. It will execute on the next frame." }
      };
    }
    case "edit_memory": {
      const content = input.content;
      if (!content) return { success: false, error: "content is required" };
      soma.memory = content;
      result.memoryUpdated = true;
      console.log(`[GLINT] Memory updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: "Memory updated." } };
    }
    case "edit_identity": {
      const content = input.content;
      if (!content) return { success: false, error: "content is required" };
      soma.identity = content;
      result.identityUpdated = true;
      console.log(`[GLINT] Identity updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: "Identity updated." } };
    }
    case "edit_hunt_journal": {
      const content = input.content;
      if (content === void 0) return { success: false, error: "content is required" };
      soma.hunt_journal = content;
      result.journalUpdated = true;
      console.log(`[GLINT] Hunt journal updated for ${soma.id}: ${content.length} chars`);
      return { success: true, data: { message: "Hunt journal updated." } };
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
async function reflectPredator(soma, gameTime, apiEndpoint2) {
  soma.reflectionPending = true;
  const result = {
    predatorId: soma.id,
    success: false,
    onTickUpdated: false,
    memoryUpdated: false,
    identityUpdated: false,
    journalUpdated: false,
    reasoning: ""
  };
  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(soma);
    let messages = [
      { role: "user", content: userPrompt }
    ];
    let turns = 0;
    while (turns < REFLECTION_MAX_TURNS) {
      turns++;
      const response = await callAPI(apiEndpoint2, {
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
          const toolResult = processToolCall(block.name, block.input, soma, result);
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
function shouldReflect(soma, gameTime) {
  if (soma.reflectionPending) return false;
  if (soma.lastReflectionTime > 0 && gameTime - soma.lastReflectionTime < REFLECTION_COOLDOWN) return false;
  if (!soma.hunt_journal || soma.hunt_journal.trim().length < 20) return false;
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

// src/inspector.ts
var contentEl = null;
var refreshBtn = null;
var headerTitleEl = null;
var predatorsRef = [];
var apiEndpoint = "";
var currentView = "overview";
var detailSharkId = null;
function initInspector(predators2, endpoint) {
  predatorsRef = predators2;
  apiEndpoint = endpoint;
  contentEl = document.getElementById("inspector-content");
  refreshBtn = document.getElementById("refresh-btn");
  headerTitleEl = document.querySelector(".inspector-title");
  refreshBtn?.addEventListener("click", () => {
    if (currentView === "detail") {
      showOverview();
    } else {
      refreshInspector();
    }
  });
  contentEl?.addEventListener("click", (e) => {
    const target = e.target;
    const link = target.closest(".soma-link");
    if (link) {
      const card2 = link.closest("[data-shark-id]");
      const section = link.dataset.section;
      if (card2?.dataset.sharkId && section) {
        showDetail(card2.dataset.sharkId, section);
      }
      return;
    }
    const card = target.closest("[data-shark-id]");
    if (card && !target.closest(".soma-section")) {
      const sharkId = card.dataset.sharkId;
      if (sharkId) showDetail(sharkId);
    }
  });
}
function showOverview() {
  currentView = "overview";
  detailSharkId = null;
  if (headerTitleEl) headerTitleEl.textContent = "Shark Intel";
  if (refreshBtn) {
    refreshBtn.textContent = "REFRESH";
    refreshBtn.disabled = false;
  }
  refreshInspector();
}
function showDetail(sharkId, scrollToSection) {
  const pred = predatorsRef.find((p) => p.id === sharkId);
  if (!pred || !contentEl) return;
  currentView = "detail";
  detailSharkId = sharkId;
  if (headerTitleEl) headerTitleEl.textContent = sharkId;
  if (refreshBtn) refreshBtn.textContent = "\u2190 BACK";
  const soma = pred.predatorSoma;
  contentEl.innerHTML = renderDetail(soma);
  if (scrollToSection) {
    const el = document.getElementById("soma-" + scrollToSection);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("soma-section-highlight");
      setTimeout(() => el.classList.remove("soma-section-highlight"), 1500);
    }
  }
}
function renderDetail(soma) {
  const sections = [
    {
      key: "identity",
      label: "Identity",
      content: soma.identity,
      isCode: false,
      changed: soma.identity !== DEFAULT_SHARK_IDENTITY
    },
    {
      key: "on_tick",
      label: "on_tick",
      content: soma.on_tick,
      isCode: true,
      changed: soma.on_tick !== DEFAULT_SHARK_ON_TICK
    },
    {
      key: "memory",
      label: "Memory",
      content: soma.memory,
      isCode: false,
      changed: soma.memory !== DEFAULT_SHARK_MEMORY
    },
    {
      key: "hunt_journal",
      label: "Hunt Journal",
      content: soma.hunt_journal || "(empty)",
      isCode: false,
      changed: soma.hunt_journal.trim().length > 0
    }
  ];
  return sections.map((s) => {
    const changedBadge = s.changed ? '<span class="soma-changed">evolved</span>' : '<span class="soma-default">default</span>';
    const contentClass = s.isCode ? "soma-content soma-code" : "soma-content";
    return `<div class="soma-section" id="soma-${s.key}">
      <div class="soma-section-header">
        <span class="soma-section-label">${escapeHtml(s.label)}</span>
        ${changedBadge}
      </div>
      <div class="${contentClass}">${escapeHtml(s.content)}</div>
    </div>`;
  }).join("");
}
async function refreshInspector() {
  if (!contentEl || !refreshBtn) return;
  refreshBtn.disabled = true;
  contentEl.innerHTML = '<div class="inspector-loading">Scanning shark somas...</div>';
  const cards = [];
  const results = await Promise.allSettled(
    predatorsRef.map((pred) => briefShark(pred))
  );
  for (let i = 0; i < predatorsRef.length; i++) {
    const pred = predatorsRef[i];
    const result = results[i];
    const summary = result.status === "fulfilled" ? result.value : '<span class="unchanged">Briefing failed</span>';
    cards.push(renderCard(pred.id, summary));
  }
  contentEl.innerHTML = cards.join("");
  refreshBtn.disabled = false;
}
function renderCard(sharkId, summary) {
  const pred = predatorsRef.find((p) => p.id === sharkId);
  const changedCount = pred ? countChanges(pred.predatorSoma) : 0;
  const badge = changedCount > 0 ? `<span class="shark-card-badge">${changedCount} evolved</span>` : "";
  return `<div class="shark-card" data-shark-id="${escapeHtml(sharkId)}">
    <div class="shark-card-header">
      <span>${escapeHtml(sharkId)}</span>
      ${badge}
    </div>
    <div class="shark-card-body">${summary}</div>
  </div>`;
}
function countChanges(soma) {
  let n = 0;
  if (soma.identity !== DEFAULT_SHARK_IDENTITY) n++;
  if (soma.on_tick !== DEFAULT_SHARK_ON_TICK) n++;
  if (soma.memory !== DEFAULT_SHARK_MEMORY) n++;
  if (soma.hunt_journal.trim().length > 0) n++;
  return n;
}
async function briefShark(pred) {
  const soma = pred.predatorSoma;
  const onTickChanged = soma.on_tick !== DEFAULT_SHARK_ON_TICK;
  const identityChanged = soma.identity !== DEFAULT_SHARK_IDENTITY;
  const memoryChanged = soma.memory !== DEFAULT_SHARK_MEMORY;
  const hasJournal = soma.hunt_journal.trim().length > 0;
  if (!onTickChanged && !identityChanged && !memoryChanged && !hasJournal) {
    return '<span class="unchanged">Factory defaults \u2014 no reflections yet.</span>';
  }
  const prompt = buildBriefingPrompt(soma.id, soma.identity, soma.on_tick, soma.memory, soma.hunt_journal, identityChanged, onTickChanged, memoryChanged);
  try {
    const resp = await fetch(apiEndpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        system: "You are a marine biologist observing AI-controlled reef sharks in a simulation. Summarize behavioral evolution concisely. Use present tense. No markdown. When referencing a soma section, wrap the section name in double brackets: [[on_tick]], [[memory]], [[identity]], or [[hunt_journal]]. Always use these markers when mentioning a section.",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512
      })
    });
    if (!resp.ok) return '<span class="unchanged">API error: ' + resp.status + "</span>";
    const data = await resp.json();
    const text = data.content?.[0]?.text;
    if (!text) return '<span class="unchanged">Empty response</span>';
    return linkifySections(escapeHtml(text));
  } catch (err) {
    return '<span class="unchanged">Fetch error: ' + escapeHtml(String(err)) + "</span>";
  }
}
function buildBriefingPrompt(id, identity, onTick, memory, journal, identityChanged, onTickChanged, memoryChanged) {
  let prompt = `Shark "${id}" soma briefing.

`;
  if (identityChanged) {
    prompt += `<identity_default>
${DEFAULT_SHARK_IDENTITY}
</identity_default>

`;
    prompt += `<identity_current>
${identity}
</identity_current>

`;
  } else {
    prompt += `Identity: unchanged from default.

`;
  }
  if (onTickChanged) {
    prompt += `<on_tick_default>
${DEFAULT_SHARK_ON_TICK}
</on_tick_default>

`;
    prompt += `<on_tick_current>
${onTick}
</on_tick_current>

`;
  } else {
    prompt += `on_tick: unchanged from default.

`;
  }
  if (memoryChanged) {
    prompt += `<memory_default>
${DEFAULT_SHARK_MEMORY}
</memory_default>

`;
    prompt += `<memory_current>
${memory}
</memory_current>

`;
  } else {
    prompt += `Memory: unchanged from default.

`;
  }
  if (journal.trim().length > 0) {
    const trimmed = journal.length > 2e3 ? "..." + journal.slice(-2e3) : journal;
    prompt += `<hunt_journal>
${trimmed}
</hunt_journal>

`;
  }
  prompt += `In 3-5 sentences, describe what this shark has learned compared to its factory defaults. Focus on: new hunting strategies in its [[on_tick]] code, spatial knowledge in [[memory]], and any [[identity]] shifts. Reference the [[hunt_journal]] if it reveals patterns. Be specific about behavioral changes (e.g. "now checks kelp after losing prey" not "improved hunting"). Always wrap section names in double brackets.`;
  return prompt;
}
function linkifySections(html) {
  return html.replace(
    /\[\[(on_tick|memory|identity|hunt_journal)\]\]/g,
    (_, section) => `<span class="soma-link" data-section="${section}">${section}</span>`
  );
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const tex = new THREE5.DataTexture(data, 3, 1, THREE5.RedFormat);
  tex.minFilter = THREE5.NearestFilter;
  tex.magFilter = THREE5.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
var gradientMap = makeToonGradient();
var renderer = new THREE5.WebGLRenderer({ antialias: false });
renderer.setSize(RENDER_W, RENDER_H);
renderer.domElement.style.width = `${RENDER_W * PIXEL_SCALE}px`;
renderer.domElement.style.height = `${RENDER_H * PIXEL_SCALE}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE5.BasicShadowMap;
renderer.setClearColor(133136);
var gameContainer = document.getElementById("game-container");
(gameContainer || document.body).appendChild(renderer.domElement);
var scene = new THREE5.Scene();
scene.fog = new THREE5.FogExp2(397856, 0.018);
var aspect = RENDER_W / RENDER_H;
var viewSize = 16;
var camera = new THREE5.OrthographicCamera(
  -viewSize * aspect / 2,
  viewSize * aspect / 2,
  viewSize / 2,
  -viewSize / 2,
  0.1,
  100
);
camera.position.set(20, 20, 20);
camera.lookAt(0, 0, 0);
var ambient = new THREE5.AmbientLight(1716304, 0.8);
scene.add(ambient);
var hemi = new THREE5.HemisphereLight(3368618, 662058, 0.6);
scene.add(hemi);
var sun = new THREE5.DirectionalLight(4491468, 1);
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
var particleGeo = new THREE5.BufferGeometry();
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
particleGeo.setAttribute("position", new THREE5.BufferAttribute(particlePositions, 3));
var particleMat = new THREE5.PointsMaterial({
  color: 8965358,
  size: 0.08,
  transparent: true,
  opacity: 0.6
});
scene.add(new THREE5.Points(particleGeo, particleMat));
var jellies = [];
for (let i = 0; i < 8; i++) {
  const color = new THREE5.Color().setHSL(0.45 + pRand() * 0.25, 0.8, 0.5);
  const geo = new THREE5.SphereGeometry(0.15, 6, 4);
  const mat = new THREE5.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.7
  });
  const mesh = new THREE5.Mesh(geo, mat);
  const pos = new THREE5.Vector3(
    (pRand() - 0.5) * MAP_W * TILE_SIZE * 0.6,
    1 + pRand() * 3,
    (pRand() - 0.5) * MAP_H * TILE_SIZE * 0.6
  );
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE5.PointLight(color, 0.8, 10);
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
initInspector(predators, "/api/inference/anthropic/messages");
var foodRng = /* @__PURE__ */ (() => {
  let s = 31337;
  return () => {
    s |= 0;
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
})();
var morsels = spawnMorsels(scene, map, TILE_SIZE, 25, foodRng);
function pickRespawnDen(rng) {
  const dens = map.dens;
  if (dens.length === 0) {
    return tileToWorld(map.playerSpawn.x, map.playerSpawn.z, TILE_SIZE, MAP_W, MAP_H);
  }
  const safeDens = dens.filter((den) => {
    for (const pred of predators) {
      const { tx, tz } = worldToTile(pred.group.position.x, pred.group.position.z, TILE_SIZE, MAP_W, MAP_H);
      const dtx = den.x - tx, dtz = den.z - tz;
      if (dtx * dtx + dtz * dtz < 225) return false;
    }
    return true;
  });
  if (safeDens.length > 0) {
    const den = safeDens[Math.floor(rng() * safeDens.length)];
    return tileToWorld(den.x, den.z, TILE_SIZE, MAP_W, MAP_H);
  }
  let bestDen = dens[0];
  let bestMinDist = -1;
  for (const den of dens) {
    let minDist = Infinity;
    for (const pred of predators) {
      const { tx, tz } = worldToTile(pred.group.position.x, pred.group.position.z, TILE_SIZE, MAP_W, MAP_H);
      const dtx = den.x - tx, dtz = den.z - tz;
      const dist = dtx * dtx + dtz * dtz;
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestDen = den;
    }
  }
  return tileToWorld(bestDen.x, bestDen.z, TILE_SIZE, MAP_W, MAP_H);
}
var API_ENDPOINT = "/api/inference/anthropic/messages";
function triggerReflection(pred) {
  const soma = pred.predatorSoma;
  const gameTime = clock.getElapsedTime();
  if (!shouldReflect(soma, gameTime)) return;
  soma.lastReflectionTime = gameTime;
  console.log(`[GLINT] Reflection started for ${pred.id}`);
  reflectPredator(soma, gameTime, API_ENDPOINT).then((result) => {
    console.log(`[GLINT] Reflection complete for ${pred.id}: onTick=${result.onTickUpdated}, memory=${result.memoryUpdated}, identity=${result.identityUpdated}, journal=${result.journalUpdated}`);
    if (result.reasoning) {
      console.log(`[GLINT] Reasoning: ${result.reasoning.slice(0, 200)}`);
    }
    if (result.onTickUpdated) {
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
  morsels,
  clearInstinctCache,
  readSensors,
  triggerReflection,
  get invulnTimer() {
    return invulnTimer;
  },
  set invulnTimer(v) {
    invulnTimer = v;
  },
  getEnergy,
  addEnergy,
  resetEnergy,
  resetSomas: () => resetPredatorSomas(MAP_SEED),
  saveSomas: () => savePredatorSomas(predators, MAP_SEED)
};
var clock = new THREE5.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  updateSquid(squid, dt, t, map, TILE_SIZE);
  const gained = updateMorsels(morsels, squid, dt, t, scene, map, TILE_SIZE, foodRng);
  if (gained > 0) addEnergy(gained);
  if (invulnTimer > 0) invulnTimer -= dt;
  for (const pred of predators) {
    const sensors = invulnTimer > 0 ? { squidDetected: false, squidWorldPos: { x: 0, z: 0 }, squidDist: 999 } : readSensors(pred, squid, map, TILE_SIZE);
    runTick(pred, sensors, dt, t, map, TILE_SIZE, sharkRng);
    pred.animate(pred, t);
    triggerReflection(pred);
    if (invulnTimer <= 0 && checkCatch(pred, squid)) {
      const respawn = pickRespawnDen(sharkRng);
      console.log(`[GLINT] Caught by ${pred.id}! Respawning at (${respawn.wx.toFixed(1)}, ${respawn.wz.toFixed(1)})`);
      squid.group.position.set(respawn.wx, 1, respawn.wz);
      invulnTimer = 2;
      resetEnergy();
      for (const p of predators) {
        p.physical.waypoint = null;
        p.physical.lastActionType = "patrol_random";
        p.physical.timeSinceLastPursue = 999;
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
