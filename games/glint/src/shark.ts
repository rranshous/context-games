// Shark — first predator type
// Model + chassis + animate. Behavior comes from instinct code in PredatorSoma.
import * as THREE from 'three';
import { Predator, Chassis, PhysicalState } from './predator.js';
import { PredatorSoma, createDefaultSharkSoma } from './soma.js';

// --- Chassis config ---

function sharkChassis(): Chassis {
  return {
    speed: 3.5,
    chaseSpeed: 5.5,
    turnSpeed: 2.0,
    collisionRadius: 0.5,
    sensorRange: 16,
    isSmall: false,
  };
}

// --- Model ---

export function createShark(
  id: string,
  spawnX: number, spawnZ: number,
  gradientMap: THREE.DataTexture,
  existingSoma?: PredatorSoma,
): Predator {
  const group = new THREE.Group();

  // Torpedo body
  const bodyGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const bodyMat = new THREE.MeshToonMaterial({ color: 0x2a3a4a, gradientMap });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.6, 0.5, 1.4);
  body.castShadow = true;
  group.add(body);

  // Snout
  const snoutGeo = new THREE.ConeGeometry(0.22, 0.5, 6);
  const snoutMat = new THREE.MeshToonMaterial({ color: 0x334455, gradientMap });
  const snout = new THREE.Mesh(snoutGeo, snoutMat);
  snout.rotation.x = -Math.PI / 2;
  snout.position.z = 0.8;
  group.add(snout);

  // Dorsal fin
  const dorsalGeo = new THREE.ConeGeometry(0.1, 0.45, 4);
  const dorsalMat = new THREE.MeshToonMaterial({ color: 0x1a2a35, gradientMap });
  const dorsal = new THREE.Mesh(dorsalGeo, dorsalMat);
  dorsal.position.set(0, 0.35, -0.1);
  group.add(dorsal);

  // Tail fin
  const tailGeo = new THREE.ConeGeometry(0.18, 0.4, 4);
  const tailMat = new THREE.MeshToonMaterial({ color: 0x253545, gradientMap });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.1, -0.9);
  tail.rotation.x = Math.PI / 6;
  group.add(tail);

  // Pectoral fins
  for (let side = -1; side <= 1; side += 2) {
    const finGeo = new THREE.ConeGeometry(0.08, 0.25, 3);
    const finMat = new THREE.MeshToonMaterial({ color: 0x253545, gradientMap });
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(side * 0.28, -0.12, 0.2);
    fin.rotation.z = side * 1.2;
    fin.rotation.x = -0.3;
    group.add(fin);
  }

  // Eyes — red-orange threat glow
  for (let side = -1; side <= 1; side += 2) {
    const eyeGeo = new THREE.SphereGeometry(0.055, 5, 4);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5,
    });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.18, 0.08, 0.55);
    group.add(eye);
  }

  // Threat glow — pulses with state
  const threatLight = new THREE.PointLight(0xff4400, 0.5, 10);
  threatLight.position.set(0, 0, 0.3);
  group.add(threatLight);

  group.position.set(spawnX, 1, spawnZ);
  group.rotation.y = Math.random() * Math.PI * 2;

  const physical: PhysicalState = {
    waypoint: null,
    lastSeenPos: null,
    lostTime: 0,
    stuckTimer: 0,
    wasPursuing: false,
  };

  const predatorSoma = existingSoma ?? createDefaultSharkSoma(id);

  // Animation uses closures over mesh refs (no fragile child indexing)
  // Visual state derived from physical signals, not string labels.
  function animate(pred: Predator, t: number) {
    const pursuing = pred.physical.wasPursuing;
    const searching = !pursuing && pred.physical.lastSeenPos !== null && pred.physical.lostTime < 8;

    // Body sway
    body.rotation.y = Math.sin(t * 3 + pred.group.position.x) * 0.08;

    // Tail wag — faster when pursuing
    const tailSpeed = pursuing ? 8 : 2.5;
    tail.rotation.y = Math.sin(t * tailSpeed) * 0.3;

    // Threat light — driven by action, not labels
    if (pursuing) {
      pred.threatLight.intensity = 1.5 + Math.sin(t * 4) * 0.5;
      pred.threatLight.color.setHex(0xff2200);
    } else if (searching) {
      pred.threatLight.intensity = 0.8 + Math.sin(t * 2) * 0.3;
      pred.threatLight.color.setHex(0xff4400);
    } else {
      pred.threatLight.intensity = 0.3 + Math.sin(t) * 0.15;
      pred.threatLight.color.setHex(0xff6600);
    }

    // Gentle bob
    pred.group.position.y = 1 + Math.sin(t * 0.8 + pred.group.position.x * 0.5) * 0.1;
  }

  return {
    id, type: 'shark', group, chassis: sharkChassis(),
    physical, predatorSoma, threatLight, animate,
  };
}
