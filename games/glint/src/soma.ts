// PredatorSoma — the predator's mind as named sections.
// The inference call IS the creature's body: every section is visible in the
// reflection prompt, and editable sections can be rewritten via scaffold tools.

export interface PredatorSoma {
  id: string;
  species: string;

  // Editable sections
  identity: string;           // who I am, hunting philosophy
  on_tick: string;             // THE code — runs every frame with (me, world)
  memory: string;              // persistent notes, spatial knowledge, AND working state
  hunt_journal: string;        // text log of hunts, written by on_tick, curated by reflection

  // Metadata
  lastReflectionTime: number;
  reflectionPending: boolean;
}

// --- Default shark on_tick ---
// Merges the old engine-level dispatchStimulus logic AND the old default instinct
// into a single function the soma owns. All frame-persistent state lives in
// me.memory — visible during reflection, truly embodied.

const DEFAULT_SHARK_ON_TICK = `
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
  const tkm = mem.match(/ticks:([\\d]+)/);
  const ticks = tkm ? +tkm[1] + 1 : 1;

  // Self-tracking: position + travel distance (rolling ~5s decay)
  const pxm = mem.match(/prevx:([-.\\d]+)/);
  const pzm = mem.match(/prevz:([-.\\d]+)/);
  const tdm = mem.match(/traveldist:([\\d.]+)/);
  const pos = me.getPosition();
  const prevX = pxm ? +pxm[1] : pos.x;
  const prevZ = pzm ? +pzm[1] : pos.z;
  const oldDist = tdm ? +tdm[1] : 0;
  const frameDist = Math.sqrt((pos.x - prevX) ** 2 + (pos.z - prevZ) ** 2);
  const decay = Math.exp(-world.dt / 5);
  const travelDist = oldDist * decay + frameDist;

  // Preserve any notes (lines not matching state keys)
  const notes = mem.replace(/^(pursuing|lost|lastknown|lastlog|prevx|prevz|traveldist|ticks):.*$/gm, '').trim();

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
    'lastlog:' + nowLastLog.toFixed(1) + '\\n' +
    'prevx:' + pos.x.toFixed(1) + '\\n' +
    'prevz:' + pos.z.toFixed(1) + '\\n' +
    'traveldist:' + travelDist.toFixed(2) + '\\n' +
    'ticks:' + ticks +
    (notes ? '\\n' + notes : ''));
}
`.trim();

export { DEFAULT_SHARK_ON_TICK };

export const DEFAULT_SHARK_IDENTITY = 'The reef shark hunts by sight and speed — a torpedo with teeth, closing distance before prey can reach cover.';
export const DEFAULT_SHARK_MEMORY = 'pursuing:no\nlost:999\nlastknown:none\nlastlog:0\nprevx:0\nprevz:0\ntraveldist:0\nticks:0\nNo hunts yet. Patrol the reef, chase what moves.';

export function createDefaultSharkSoma(id: string): PredatorSoma {
  return {
    id,
    species: 'shark',
    identity: DEFAULT_SHARK_IDENTITY,
    on_tick: DEFAULT_SHARK_ON_TICK,
    memory: DEFAULT_SHARK_MEMORY,
    hunt_journal: '',
    lastReflectionTime: 0,
    reflectionPending: false,
  };
}
