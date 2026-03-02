// Reef renderer — takes a ReefMap and populates a Three.js scene
import * as THREE from 'three';
import { ReefMap, Tile, getTile, tileToWorld } from './map.js';

export interface ReefScene {
  swayItems: { obj: THREE.Object3D; phase: number; amplitude: number }[];
  kelpMeshes: THREE.Mesh[];
  anemones: { tendrils: THREE.Mesh[] }[];
  denLights: THREE.PointLight[];
}

// Seeded random (deterministic visuals per tile)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const coralPalette = [
  { h: 0.55, s: 0.5, l: 0.35 },
  { h: 0.85, s: 0.55, l: 0.40 },
  { h: 0.95, s: 0.55, l: 0.35 },
  { h: 0.08, s: 0.6, l: 0.40 },
  { h: 0.75, s: 0.45, l: 0.38 },
  { h: 0.12, s: 0.5, l: 0.42 },
];

export function buildReef(
  scene: THREE.Scene,
  map: ReefMap,
  tileSize: number,
  gradientMap: THREE.DataTexture
): ReefScene {
  const rand = mulberry32(777);
  const result: ReefScene = {
    swayItems: [],
    kelpMeshes: [],
    anemones: [],
    denLights: [],
  };

  function pickColor(): THREE.Color {
    const p = coralPalette[Math.floor(rand() * coralPalette.length)];
    return new THREE.Color().setHSL(p.h + (rand() - 0.5) * 0.05, p.s, p.l);
  }

  // Ocean floor
  const floorSize = Math.max(map.width, map.height) * tileSize + 20;
  const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
  const floorMat = new THREE.MeshToonMaterial({ color: 0x152a3a, gradientMap });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  // Sand patches
  for (let i = 0; i < 60; i++) {
    const r = 0.3 + rand() * 1.5;
    const geo = new THREE.CircleGeometry(r, 8);
    const mat = new THREE.MeshToonMaterial({ color: 0x253a4a, gradientMap });
    const patch = new THREE.Mesh(geo, mat);
    patch.rotation.x = -Math.PI / 2;
    const wx = (rand() - 0.5) * map.width * tileSize;
    const wz = (rand() - 0.5) * map.height * tileSize;
    patch.position.set(wx, -0.48, wz);
    scene.add(patch);
  }

  // Process each tile
  for (let tz = 0; tz < map.height; tz++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = getTile(map, tx, tz);
      const { wx, wz } = tileToWorld(tx, tz, tileSize, map.width, map.height);

      switch (tile) {
        case Tile.WALL:
          placeWallCoral(wx, wz);
          break;
        case Tile.CREVICE:
          placeCreviceDetail(wx, wz);
          break;
        case Tile.KELP:
          placeKelp(wx, wz);
          break;
        case Tile.DEN:
          placeDen(wx, wz);
          break;
        // OPEN = empty water, nothing to place
      }
    }
  }

  function placeWallCoral(x: number, z: number) {
    // Randomly pick coral type for variety
    const type = rand();
    if (type < 0.35) placeBranching(x, z);
    else if (type < 0.55) placeBrain(x, z);
    else if (type < 0.75) placeTube(x, z);
    else placeShelf(x, z);

    // Sometimes add a rock too
    if (rand() < 0.2) {
      const s = 0.2 + rand() * 0.4;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.55, 0.08, 0.15),
        gradientMap,
      });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x + (rand() - 0.5) * 0.5, -0.5 + s * 0.35, z + (rand() - 0.5) * 0.5);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }
  }

  function placeBranching(x: number, z: number) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const tipColor = baseColor.clone().offsetHSL(0.03, 0.1, 0.15);

    const trunkH = 0.8 + rand() * 1.2;
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.18, trunkH, 5);
    const trunkMat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const branchCount = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < branchCount; i++) {
      const bh = 0.4 + rand() * 0.9;
      const bGeo = new THREE.CylinderGeometry(0.03, 0.07, bh, 4);
      const bMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0.02, 0, 0.05), gradientMap });
      const branch = new THREE.Mesh(bGeo, bMat);
      const angle = (i / branchCount) * Math.PI * 2 + rand() * 0.5;
      const tilt = 0.3 + rand() * 0.5;
      branch.position.set(Math.cos(angle) * 0.12, trunkH * (0.4 + rand() * 0.4), Math.sin(angle) * 0.12);
      branch.rotation.set(Math.cos(angle) * tilt, 0, Math.sin(angle) * tilt);
      branch.castShadow = true;
      group.add(branch);

      const tipGeo = new THREE.SphereGeometry(0.04 + rand() * 0.03, 4, 3);
      const tipMat = new THREE.MeshStandardMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.5 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.copy(branch.position);
      tip.position.y += bh * 0.7;
      group.add(tip);
    }

    group.position.set(x + (rand() - 0.5) * 0.3, -0.5, z + (rand() - 0.5) * 0.3);
    scene.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.03 + rand() * 0.025 });
  }

  function placeBrain(x: number, z: number) {
    const color = pickColor();
    const s = 0.4 + rand() * 0.5;
    const geo = new THREE.IcosahedronGeometry(s, 1);
    const mat = new THREE.MeshToonMaterial({ color, gradientMap });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (rand() - 0.5) * 0.3, -0.5 + s * 0.35, z + (rand() - 0.5) * 0.3);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    mesh.scale.y = 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  function placeTube(x: number, z: number) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const tipColor = baseColor.clone().offsetHSL(0.05, 0.1, 0.2);
    const tubeCount = 3 + Math.floor(rand() * 4);

    for (let i = 0; i < tubeCount; i++) {
      const h = 0.4 + rand() * 1.2;
      const r = 0.03 + rand() * 0.03;
      const geo = new THREE.CylinderGeometry(r, r * 1.2, h, 5);
      const mat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
      const tube = new THREE.Mesh(geo, mat);
      tube.position.set((rand() - 0.5) * 0.2, h / 2, (rand() - 0.5) * 0.2);
      tube.castShadow = true;
      group.add(tube);

      const rimGeo = new THREE.TorusGeometry(r, r * 0.4, 4, 6);
      const rimMat = new THREE.MeshStandardMaterial({ color: tipColor, emissive: tipColor, emissiveIntensity: 0.6 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(tube.position.x, h, tube.position.z);
      rim.rotation.x = Math.PI / 2;
      group.add(rim);
    }

    group.position.set(x + (rand() - 0.5) * 0.3, -0.5, z + (rand() - 0.5) * 0.3);
    scene.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.025 + rand() * 0.02 });
  }

  function placeShelf(x: number, z: number) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const layers = 2 + Math.floor(rand() * 2);

    for (let i = 0; i < layers; i++) {
      const r = 0.3 + rand() * 0.4 - i * 0.05;
      const geo = new THREE.CylinderGeometry(r, r * 0.9, 0.06, 8);
      const mat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(i * 0.02, 0, i * 0.03), gradientMap });
      const disc = new THREE.Mesh(geo, mat);
      disc.position.y = 0.25 + i * 0.35;
      disc.rotation.set((rand() - 0.5) * 0.15, rand() * Math.PI, (rand() - 0.5) * 0.15);
      disc.castShadow = true;
      disc.receiveShadow = true;
      group.add(disc);
    }

    const stemGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.25 + layers * 0.35, 5);
    const stemMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0, -0.1, -0.1), gradientMap });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = (0.25 + layers * 0.35) / 2;
    group.add(stem);

    group.position.set(x + (rand() - 0.5) * 0.3, -0.5, z + (rand() - 0.5) * 0.3);
    scene.add(group);
  }

  function placeCreviceDetail(x: number, z: number) {
    // Small rocks/debris in narrow passages
    if (rand() < 0.5) {
      const s = 0.1 + rand() * 0.15;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({ color: 0x1a2a35, gradientMap });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x + (rand() - 0.5) * 0.3, -0.5 + s * 0.3, z + (rand() - 0.5) * 0.3);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      scene.add(rock);
    }
  }

  function placeKelp(x: number, z: number) {
    const count = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const h = 1.5 + rand() * 2.5;
      const geo = new THREE.ConeGeometry(0.1, h, 4);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.3 + rand() * 0.1, 0.45, 0.18),
        gradientMap,
      });
      const kelp = new THREE.Mesh(geo, mat);
      kelp.position.set(x + (rand() - 0.5) * 0.5, -0.5 + h / 2, z + (rand() - 0.5) * 0.5);
      kelp.castShadow = true;
      scene.add(kelp);
      result.kelpMeshes.push(kelp);
    }
  }

  function placeDen(x: number, z: number) {
    // Warm glowing safe zone — arched rock with interior light
    const archGeo = new THREE.TorusGeometry(0.4, 0.15, 6, 8, Math.PI);
    const archMat = new THREE.MeshToonMaterial({
      color: new THREE.Color().setHSL(0.55, 0.1, 0.2),
      gradientMap,
    });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.set(x, -0.1, z);
    arch.rotation.x = Math.PI / 2;
    arch.castShadow = true;
    scene.add(arch);

    // Warm interior glow
    const light = new THREE.PointLight(0xffaa44, 1.5, 5);
    light.position.set(x, 0.2, z);
    scene.add(light);
    result.denLights.push(light);

    // Small anemone cluster near den
    const anemGroup = new THREE.Group();
    const anemColor = new THREE.Color().setHSL(0.08, 0.6, 0.4);
    const tendrils: THREE.Mesh[] = [];
    const tendrilCount = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < tendrilCount; i++) {
      const th = 0.3 + rand() * 0.5;
      const tGeo = new THREE.CylinderGeometry(0.015, 0.03, th, 4);
      const tMat = new THREE.MeshStandardMaterial({
        color: anemColor,
        emissive: anemColor.clone().offsetHSL(0, 0.2, 0.15),
        emissiveIntensity: 0.5,
      });
      const tendril = new THREE.Mesh(tGeo, tMat);
      const angle = (i / tendrilCount) * Math.PI * 2;
      tendril.position.set(Math.cos(angle) * 0.15, th / 2, Math.sin(angle) * 0.15);
      anemGroup.add(tendril);
      tendrils.push(tendril);
    }
    anemGroup.position.set(x + 0.3, -0.5, z + 0.2);
    scene.add(anemGroup);
    result.anemones.push({ tendrils });
  }

  // Ambient bioluminescent lights scattered in open areas
  for (let i = 0; i < 10; i++) {
    const tx = Math.floor(rand() * map.width);
    const tz = Math.floor(rand() * map.height);
    if (getTile(map, tx, tz) === Tile.WALL) continue;
    const { wx, wz } = tileToWorld(tx, tz, tileSize, map.width, map.height);
    const color = new THREE.Color().setHSL(0.45 + rand() * 0.25, 0.8, 0.5);
    const light = new THREE.PointLight(color, 0.6, 8);
    light.position.set(wx, 0.5 + rand() * 2, wz);
    scene.add(light);
  }

  return result;
}
