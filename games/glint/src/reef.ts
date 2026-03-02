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
  const floorSize = Math.max(map.width, map.height) * tileSize;
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
        case Tile.OPEN:
          if (rand() < 0.12) placeOpenDecor(wx, wz);
          break;
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
    if (rand() < 0.25) {
      const s = 0.4 + rand() * 0.5;
      const geo = new THREE.DodecahedronGeometry(s);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.55, 0.08, 0.15),
        gradientMap,
      });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(x + (rand() - 0.5) * 0.6, -0.5 + s * 0.35, z + (rand() - 0.5) * 0.6);
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

    const trunkH = 1.4 + rand() * 1.6;
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.3, trunkH, 5);
    const trunkMat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    const branchCount = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < branchCount; i++) {
      const bh = 0.6 + rand() * 1.0;
      const bGeo = new THREE.CylinderGeometry(0.05, 0.12, bh, 4);
      const bMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0.02, 0, 0.05), gradientMap });
      const branch = new THREE.Mesh(bGeo, bMat);
      const angle = (i / branchCount) * Math.PI * 2 + rand() * 0.5;
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
    scene.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.03 + rand() * 0.025 });
  }

  function placeBrain(x: number, z: number) {
    const color = pickColor();
    const s = 0.7 + rand() * 0.6;
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
      const h = 0.8 + rand() * 1.8;
      const r = 0.06 + rand() * 0.06;
      const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 5);
      const mat = new THREE.MeshToonMaterial({ color: baseColor, gradientMap });
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
    scene.add(group);
    result.swayItems.push({ obj: group, phase: rand() * Math.PI * 2, amplitude: 0.025 + rand() * 0.02 });
  }

  function placeShelf(x: number, z: number) {
    const group = new THREE.Group();
    const baseColor = pickColor();
    const layers = 2 + Math.floor(rand() * 2);

    for (let i = 0; i < layers; i++) {
      const r = 0.5 + rand() * 0.5 - i * 0.05;
      const geo = new THREE.CylinderGeometry(r, r * 0.9, 0.08, 8);
      const mat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(i * 0.02, 0, i * 0.03), gradientMap });
      const disc = new THREE.Mesh(geo, mat);
      disc.position.y = 0.35 + i * 0.45;
      disc.rotation.set((rand() - 0.5) * 0.15, rand() * Math.PI, (rand() - 0.5) * 0.15);
      disc.castShadow = true;
      disc.receiveShadow = true;
      group.add(disc);
    }

    const stemGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.35 + layers * 0.45, 5);
    const stemMat = new THREE.MeshToonMaterial({ color: baseColor.clone().offsetHSL(0, -0.1, -0.1), gradientMap });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = (0.35 + layers * 0.45) / 2;
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
    const count = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const totalH = 1.5 + rand() * 2.5;
      const segments = 5 + Math.floor(rand() * 3);
      const segH = totalH / segments;
      const baseR = 0.1 + rand() * 0.06;
      const color = new THREE.Color().setHSL(0.3 + rand() * 0.1, 0.45, 0.15 + rand() * 0.08);
      const waveMag = 0.08 + rand() * 0.06;
      const waveFreq = 1.5 + rand() * 1.0;
      const wavePhase = rand() * Math.PI * 2;

      const group = new THREE.Group();
      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const r = baseR * (1 - t * 0.6); // taper toward tip
        const geo = new THREE.CylinderGeometry(r * 0.7, r, segH, 4);
        const mat = new THREE.MeshToonMaterial({
          color: color.clone().offsetHSL(0, 0, t * 0.06),
          gradientMap,
        });
        const seg = new THREE.Mesh(geo, mat);
        // S-curve offset via sine wave
        const ox = Math.sin(t * Math.PI * waveFreq + wavePhase) * waveMag;
        const oz = Math.cos(t * Math.PI * waveFreq * 0.7 + wavePhase) * waveMag * 0.5;
        seg.position.set(ox, segH * s + segH / 2, oz);
        seg.castShadow = true;
        group.add(seg);
      }

      group.position.set(x + (rand() - 0.5) * 1.4, -0.5, z + (rand() - 0.5) * 1.4);
      scene.add(group);
      result.kelpMeshes.push(group as any);
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

  function placeOpenDecor(x: number, z: number) {
    const type = rand();
    if (type < 0.35) {
      // Sea star — flat 5-pointed shape from thin cylinders
      const group = new THREE.Group();
      const starColor = new THREE.Color().setHSL(0.05 + rand() * 0.1, 0.6, 0.45);
      for (let i = 0; i < 5; i++) {
        const armLen = 0.3 + rand() * 0.15;
        const geo = new THREE.CylinderGeometry(0.04, 0.08, armLen, 3);
        const mat = new THREE.MeshToonMaterial({ color: starColor, gradientMap });
        const arm = new THREE.Mesh(geo, mat);
        const angle = (i / 5) * Math.PI * 2;
        arm.position.set(Math.cos(angle) * armLen * 0.4, 0, Math.sin(angle) * armLen * 0.4);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = angle;
        group.add(arm);
      }
      group.position.set(x + (rand() - 0.5) * 1.2, -0.46, z + (rand() - 0.5) * 1.2);
      scene.add(group);
    } else if (type < 0.6) {
      // Shell — small hemisphere
      const s = 0.15 + rand() * 0.1;
      const geo = new THREE.SphereGeometry(s, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color().setHSL(0.1 + rand() * 0.05, 0.35, 0.5),
        gradientMap,
      });
      const shell = new THREE.Mesh(geo, mat);
      shell.position.set(x + (rand() - 0.5) * 1.2, -0.47, z + (rand() - 0.5) * 1.2);
      shell.rotation.y = rand() * Math.PI * 2;
      scene.add(shell);
    } else if (type < 0.8) {
      // Sand ripples — a few stretched torus arcs
      for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
        const r = 0.5 + rand() * 0.4;
        const geo = new THREE.TorusGeometry(r, 0.04, 3, 8, Math.PI * (0.5 + rand() * 0.5));
        const mat = new THREE.MeshToonMaterial({ color: 0x253a4a, gradientMap });
        const ripple = new THREE.Mesh(geo, mat);
        ripple.position.set(
          x + (rand() - 0.5) * 1.0,
          -0.47,
          z + (rand() - 0.5) * 1.0 + i * 0.35,
        );
        ripple.rotation.x = -Math.PI / 2;
        ripple.rotation.z = rand() * 0.3;
        scene.add(ripple);
      }
    } else {
      // Coral nub — small branch poking from floor
      const h = 0.3 + rand() * 0.4;
      const geo = new THREE.CylinderGeometry(0.04, 0.1, h, 4);
      const color = pickColor();
      const mat = new THREE.MeshToonMaterial({ color, gradientMap });
      const nub = new THREE.Mesh(geo, mat);
      nub.position.set(x + (rand() - 0.5) * 1.2, -0.5 + h / 2, z + (rand() - 0.5) * 1.2);
      nub.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      scene.add(nub);
    }
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
