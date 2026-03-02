// Food morsels — glowing orbs the squid must collect to maintain energy
import * as THREE from 'three';
import { ReefMap, Tile, getTile, tileToWorld } from './map.js';
import type { Squid } from './squid.js';

export interface Morsel {
  group: THREE.Group;
  light: THREE.PointLight;
  tileX: number;
  tileZ: number;
  alive: boolean;
  respawnTimer: number;
  phase: number; // animation offset
}

const COLLECT_RADIUS = 1.0;
const RESPAWN_TIME = 10;
const MORSEL_Y = 0.15;
const BOB_AMP = 0.08;
const BOB_FREQ = 2;

function pickValidTile(map: ReefMap, rng: () => number): { tx: number; tz: number } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const tx = Math.floor(rng() * map.width);
    const tz = Math.floor(rng() * map.height);
    const tile = getTile(map, tx, tz);
    if (tile === Tile.OPEN || tile === Tile.KELP) return { tx, tz };
  }
  // fallback — center-ish
  return { tx: Math.floor(map.width / 2), tz: Math.floor(map.height / 2) };
}

function createMorselMesh(): { group: THREE.Group; light: THREE.PointLight } {
  const group = new THREE.Group();

  // Core orb
  const geo = new THREE.SphereGeometry(0.12, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcc44,
    emissive: 0xaaff44,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.9,
  });
  const orb = new THREE.Mesh(geo, mat);
  group.add(orb);

  // Outer glow halo
  const haloGeo = new THREE.SphereGeometry(0.2, 6, 4);
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: 0xffcc44,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.25,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  group.add(halo);

  // Point light
  const light = new THREE.PointLight(0xffcc44, 1.0, 5);
  group.add(light);

  return { group, light };
}

export function spawnMorsels(
  scene: THREE.Scene,
  map: ReefMap,
  tileSize: number,
  count: number,
  rng: () => number,
): Morsel[] {
  const morsels: Morsel[] = [];
  for (let i = 0; i < count; i++) {
    const { tx, tz } = pickValidTile(map, rng);
    const { wx, wz } = tileToWorld(tx, tz, tileSize, map.width, map.height);
    const { group, light } = createMorselMesh();
    group.position.set(wx, MORSEL_Y, wz);
    scene.add(group);
    morsels.push({
      group,
      light,
      tileX: tx,
      tileZ: tz,
      alive: true,
      respawnTimer: 0,
      phase: rng() * Math.PI * 2,
    });
  }
  return morsels;
}

export function updateMorsels(
  morsels: Morsel[],
  squid: Squid,
  dt: number,
  t: number,
  scene: THREE.Scene,
  map: ReefMap,
  tileSize: number,
  rng: () => number,
): number {
  let energyGained = 0;
  const sx = squid.group.position.x;
  const sz = squid.group.position.z;

  for (const m of morsels) {
    if (m.alive) {
      // Bob animation
      m.group.position.y = MORSEL_Y + Math.sin(t * BOB_FREQ + m.phase) * BOB_AMP;
      // Light pulse
      m.light.intensity = 0.8 + Math.sin(t * 3 + m.phase) * 0.4;

      // Collection check
      const dx = sx - m.group.position.x;
      const dz = sz - m.group.position.z;
      if (dx * dx + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        m.alive = false;
        m.group.visible = false;
        m.respawnTimer = RESPAWN_TIME;
        energyGained += 20;
      }
    } else {
      // Respawn countdown
      m.respawnTimer -= dt;
      if (m.respawnTimer <= 0) {
        const { tx, tz } = pickValidTile(map, rng);
        const { wx, wz } = tileToWorld(tx, tz, tileSize, map.width, map.height);
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
