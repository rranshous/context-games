// src/shared/types.ts
var MAP_W = 30;
var MAP_H = 20;
var TICK_RATE = 20;
var TICK_DT = 1 / TICK_RATE;
var UNIT_STATS = {
  peasant: {
    type: "peasant",
    cost: 10,
    hp: 15,
    damage: 5,
    attackSpeed: 1.5,
    speed: 3,
    range: 1,
    vision: 4,
    special: "Can mine gold. Rally: nearby peasants +50% speed for 3s"
  },
  knight: {
    type: "knight",
    cost: 30,
    hp: 60,
    damage: 15,
    attackSpeed: 0.8,
    speed: 2,
    range: 1,
    vision: 5,
    special: "Armored: half damage from peasants. Shield Wall: immobile, 50% dmg reduction 5s"
  },
  archer: {
    type: "archer",
    cost: 20,
    hp: 20,
    damage: 12,
    attackSpeed: 1,
    speed: 2.5,
    range: 4,
    vision: 7,
    special: "Ranged. Volley: area attack (3 tile radius), 10s cooldown"
  },
  catapult: {
    type: "catapult",
    cost: 50,
    hp: 30,
    damage: 25,
    attackSpeed: 0.3,
    speed: 1,
    range: 6,
    vision: 4,
    special: "Siege: 1.5x castle damage. Fortify: immobile, 2x range+damage 10s"
  },
  jester: {
    type: "jester",
    cost: 15,
    hp: 25,
    damage: 3,
    attackSpeed: 1,
    speed: 4,
    range: 1,
    vision: 6,
    special: "Confuse on hit. Decoy: spawns fake unit that draws aggro 5s"
  }
};
var CASTLE_HP = 400;
var CASTLE_WIDTH = 2;
var CASTLE_RIGHT_X = MAP_W - CASTLE_WIDTH;
var SPAWN_LEFT_X = CASTLE_WIDTH + 0.5;
var SPAWN_RIGHT_X = MAP_W - CASTLE_WIDTH - 0.5;

// src/bot/bot.ts
var BASE_URL = process.env.SOD_URL ?? process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ?? "http://localhost:4000";
var HANDLE = process.env.SOD_HANDLE ?? process.argv.find((a) => a.startsWith("--handle="))?.split("=")[1] ?? "SkyNet";
var DIFFICULTY = process.env.SOD_DIFFICULTY ?? process.argv.find((a) => a.startsWith("--difficulty="))?.split("=")[1] ?? "medium";
var TICK_MS = { easy: 3e3, medium: 1500, hard: 500 };
var POLL_MS = TICK_MS[DIFFICULTY];
var token = "";
var currentGameId = null;
var mySide = "right";
async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
  if (res.status === 304) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}
async function login() {
  const result = await api("/api/auth/login", "POST", { handle: HANDLE });
  token = result.token;
  console.log(`[Bot] Logged in as "${HANDLE}" (difficulty: ${DIFFICULTY})`);
}
async function findGame() {
  const games = await api("/api/games");
  const lobby = games.find(
    (g) => g.phase === "lobby" && g.players.left?.handle !== HANDLE && g.players.right?.handle !== HANDLE
  );
  if (lobby) {
    console.log(`[Bot] Joining game ${lobby.id}...`);
    const state2 = await api(`/api/games/${lobby.id}/join`, "POST");
    currentGameId = lobby.id;
    mySide = state2.players.left?.handle === HANDLE ? "left" : "right";
    console.log(`[Bot] Joined game ${currentGameId} as ${mySide}`);
    return;
  }
  console.log(`[Bot] No games available, creating one...`);
  const state = await api("/api/games", "POST", { side: "right" });
  currentGameId = state.id;
  mySide = "right";
  console.log(`[Bot] Created game ${currentGameId}, waiting for opponent...`);
}
async function think(state) {
  if (state.phase !== "playing") return;
  const me = state.players[mySide];
  if (!me) return;
  const myUnits = state.units.filter((u) => u.owner === mySide);
  const enemyUnits = state.units.filter((u) => u.owner !== mySide && u.owner !== "neutral");
  const idlePeasants = myUnits.filter((u) => u.type === "peasant" && u.state === "idle");
  const miners = myUnits.filter((u) => u.state === "mining");
  if (idlePeasants.length > 0 && state.mines) {
    const availableMines = state.mines.filter(
      (m) => m.remaining > 0 && m.workerIds.length < 3
    );
    if (availableMines.length > 0) {
      const mine = availableMines.sort((a, b) => {
        const castleX = mySide === "left" ? CASTLE_WIDTH : MAP_W - CASTLE_WIDTH;
        const dA = Math.abs(a.x - castleX);
        const dB = Math.abs(b.x - castleX);
        return dA - dB;
      })[0];
      const toSend = idlePeasants.slice(0, 3 - mine.workerIds.length);
      if (toSend.length > 0) {
        try {
          await api(`/api/games/${currentGameId}/mine`, "POST", {
            unitIds: toSend.map((u) => u.id),
            mineId: mine.id
          });
        } catch (_) {
        }
      }
    }
  }
  await trainUnits(state, me);
  await useAbilities(state, myUnits, enemyUnits);
  await researchUpgrades(state, me, myUnits);
  await directUnits(state, myUnits, enemyUnits);
  if (DIFFICULTY !== "easy" && me.castle < CASTLE_HP * 0.55 && me.castle > CASTLE_HP * 0.5) {
    const myPower = myUnits.reduce((s, u) => s + u.hp, 0);
    const enemyPower = enemyUnits.reduce((s, u) => s + u.hp, 0);
    if (enemyPower > myPower * 3) {
      try {
        await api(`/api/games/${currentGameId}/surrender`, "POST");
        console.log(`[Bot] Surrendered \u2014 hopelessly outmatched`);
      } catch (_) {
      }
    }
  }
}
async function trainUnits(state, me) {
  const gold = me.gold;
  if (gold < 10) return;
  const batch = [];
  let budget = gold;
  const strategy = pickStrategy(state, me);
  for (const unitType of strategy) {
    const cost = UNIT_STATS[unitType].cost;
    if (budget >= cost) {
      batch.push(unitType);
      budget -= cost;
    }
  }
  if (batch.length > 0) {
    try {
      await api(`/api/games/${currentGameId}/train-batch`, "POST", { unitTypes: batch });
    } catch (_) {
    }
  }
}
function pickStrategy(state, me) {
  const elapsed = state.elapsed;
  const gold = me.gold;
  if (DIFFICULTY === "easy") {
    const types = ["peasant", "knight", "archer", "catapult", "jester"];
    const result2 = [];
    for (let i = 0; i < 5; i++) {
      result2.push(types[Math.floor(Math.random() * types.length)]);
    }
    return result2;
  }
  const enemyUnits = state.units.filter((u) => u.owner !== mySide && u.owner !== "neutral");
  const enemyKnights = enemyUnits.filter((u) => u.type === "knight").length;
  const enemyArchers = enemyUnits.filter((u) => u.type === "archer").length;
  const enemyPeasants = enemyUnits.filter((u) => u.type === "peasant").length;
  const result = [];
  if (elapsed < 30) {
    if (gold >= 10) result.push("peasant");
    if (gold >= 30) result.push("knight");
    if (gold >= 20) result.push("archer");
    return result;
  }
  if (enemyKnights > 3) {
    result.push("archer", "archer");
    if (gold >= 50) result.push("catapult");
  } else if (enemyArchers > 3) {
    result.push("knight", "peasant", "peasant", "jester");
  } else if (enemyPeasants > 5) {
    result.push("knight", "knight");
  } else {
    result.push("knight", "archer", "peasant");
    if (gold >= 80 && elapsed > 60) result.push("catapult");
    if (Math.random() < 0.3) result.push("jester");
  }
  if (DIFFICULTY === "hard" && gold > 100) {
    result.push("knight", "archer");
    if (gold > 150) result.push("catapult");
  }
  return result;
}
async function useAbilities(state, myUnits, enemyUnits) {
  if (DIFFICULTY === "easy") return;
  for (const unit of myUnits) {
    if (unit.abilityCooldown > 0) continue;
    switch (unit.type) {
      case "knight": {
        const nearbyEnemies = enemyUnits.filter(
          (e) => dist(unit.x, unit.y, e.x, e.y) < 3
        ).length;
        if (nearbyEnemies >= 2 && unit.hp < unit.maxHp * 0.7) {
          try {
            await api(`/api/games/${currentGameId}/ability`, "POST", { unitId: unit.id });
          } catch (_) {
          }
        }
        break;
      }
      case "archer": {
        const cluster = findEnemyCluster(enemyUnits);
        if (cluster && dist(unit.x, unit.y, cluster.x, cluster.y) <= 6) {
          try {
            await api(`/api/games/${currentGameId}/ability`, "POST", {
              unitId: unit.id,
              targetX: cluster.x,
              targetY: cluster.y
            });
          } catch (_) {
          }
        }
        break;
      }
      case "catapult": {
        const enemyCastleX = mySide === "left" ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;
        if (dist(unit.x, unit.y, enemyCastleX, MAP_H / 2) < 12 && unit.state !== "fortified") {
          try {
            await api(`/api/games/${currentGameId}/ability`, "POST", { unitId: unit.id });
          } catch (_) {
          }
        }
        break;
      }
      case "peasant": {
        const nearbyFriendlyPeasants = myUnits.filter(
          (u) => u.type === "peasant" && u.id !== unit.id && dist(unit.x, unit.y, u.x, u.y) < 5
        ).length;
        const nearbyEnemies = enemyUnits.filter((e) => dist(unit.x, unit.y, e.x, e.y) < 5).length;
        if (nearbyFriendlyPeasants >= 2 && nearbyEnemies >= 1) {
          try {
            await api(`/api/games/${currentGameId}/ability`, "POST", { unitId: unit.id });
          } catch (_) {
          }
        }
        break;
      }
      case "jester": {
        const nearbyEnemies = enemyUnits.filter((e) => dist(unit.x, unit.y, e.x, e.y) < 4).length;
        if (nearbyEnemies >= 2) {
          try {
            await api(`/api/games/${currentGameId}/ability`, "POST", { unitId: unit.id });
          } catch (_) {
          }
        }
        break;
      }
    }
  }
}
async function researchUpgrades(state, me, myUnits) {
  if (DIFFICULTY === "easy") return;
  if (me.researching) return;
  if (me.gold < 40) return;
  if (state.elapsed < 20) return;
  const have = new Set(me.upgrades);
  const priorities = [];
  const knightCount = myUnits.filter((u) => u.type === "knight").length;
  const archerCount = myUnits.filter((u) => u.type === "archer").length;
  const peasantCount = myUnits.filter((u) => u.type === "peasant").length;
  if (!have.has("castle_reinforce") && me.castle < CASTLE_HP * 0.8) priorities.push("castle_reinforce");
  if (!have.has("castle_arrowslits")) priorities.push("castle_arrowslits");
  if (knightCount >= 2 && !have.has("knight_heavy") && !have.has("knight_lancer")) {
    priorities.push(DIFFICULTY === "hard" ? "knight_lancer" : "knight_heavy");
  }
  if (archerCount >= 2 && !have.has("archer_longbow") && !have.has("archer_rapid")) {
    priorities.push(DIFFICULTY === "hard" ? "archer_longbow" : "archer_rapid");
  }
  if (peasantCount >= 3 && !have.has("peasant_militia") && !have.has("peasant_prospector")) {
    const hasMiningPeasants = myUnits.some((u) => u.type === "peasant" && u.state === "mining");
    priorities.push(hasMiningPeasants ? "peasant_prospector" : "peasant_militia");
  }
  for (const id of priorities) {
    if (have.has(id)) continue;
    try {
      await api(`/api/games/${currentGameId}/research`, "POST", { upgradeId: id });
      console.log(`[Bot] Researching ${id}`);
      break;
    } catch (_) {
    }
  }
}
async function directUnits(state, myUnits, enemyUnits) {
  const idleCombat = myUnits.filter(
    (u) => u.state === "idle" && u.type !== "peasant" && !u.isDecoy
  );
  if (idleCombat.length === 0) return;
  let targetX, targetY;
  if (enemyUnits.length > 0 && DIFFICULTY !== "easy") {
    const cluster = findEnemyCluster(enemyUnits);
    if (cluster) {
      targetX = cluster.x;
      targetY = cluster.y;
    } else {
      targetX = enemyUnits[0].x;
      targetY = enemyUnits[0].y;
    }
  } else {
    targetX = mySide === "left" ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;
    targetY = MAP_H / 2;
  }
  try {
    await api(`/api/games/${currentGameId}/attack-move`, "POST", {
      unitIds: idleCombat.map((u) => u.id),
      x: targetX,
      y: targetY
    });
  } catch (_) {
  }
  if (DIFFICULTY === "hard") {
    const idlePeasants = myUnits.filter(
      (u) => u.type === "peasant" && u.state === "idle" && !u.miningTargetId
    );
    if (idlePeasants.length > 2 && enemyUnits.length > 0) {
      try {
        await api(`/api/games/${currentGameId}/attack-move`, "POST", {
          unitIds: idlePeasants.map((u) => u.id),
          x: targetX,
          y: targetY
        });
      } catch (_) {
      }
    }
  }
}
function dist(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}
function findEnemyCluster(enemies) {
  if (enemies.length === 0) return null;
  let best = { x: enemies[0].x, y: enemies[0].y, count: 1 };
  for (const e of enemies) {
    const nearby = enemies.filter((o) => dist(e.x, e.y, o.x, o.y) < 4).length;
    if (nearby > best.count) {
      best = { x: e.x, y: e.y, count: nearby };
    }
  }
  return best;
}
async function main() {
  console.log(`[Bot] Surrender or Die Bot starting...`);
  console.log(`[Bot] Server: ${BASE_URL}`);
  console.log(`[Bot] Handle: ${HANDLE}`);
  console.log(`[Bot] Difficulty: ${DIFFICULTY} (poll every ${POLL_MS}ms)`);
  await login();
  while (true) {
    try {
      if (!currentGameId) {
        await findGame();
      }
      const state = await api(`/api/games/${currentGameId}/state`);
      if (!state) {
        await sleep(POLL_MS);
        continue;
      }
      if (state.phase === "lobby") {
        const games = await api("/api/games");
        const otherLobby = games.find(
          (g) => g.phase === "lobby" && g.id !== currentGameId && g.players.left?.handle !== HANDLE && g.players.right?.handle !== HANDLE
        );
        if (otherLobby) {
          console.log(`[Bot] Found another game ${otherLobby.id}, joining instead...`);
          try {
            const joined = await api(`/api/games/${otherLobby.id}/join`, "POST");
            currentGameId = otherLobby.id;
            mySide = joined.players.left?.handle === HANDLE ? "left" : "right";
            console.log(`[Bot] Joined game ${currentGameId} as ${mySide}`);
          } catch (_) {
          }
        }
        await sleep(2e3);
        continue;
      }
      if (state.phase === "finished") {
        console.log(`[Bot] Game ${currentGameId} finished \u2014 ${state.winner} wins`);
        currentGameId = null;
        await sleep(3e3);
        continue;
      }
      await think(state);
    } catch (err) {
      if (err.message?.includes("not found")) {
        currentGameId = null;
      } else {
        console.error(`[Bot] Error: ${err.message}`);
      }
    }
    await sleep(POLL_MS);
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
main().catch((err) => {
  console.error("[Bot] Fatal:", err);
  process.exit(1);
});
//# sourceMappingURL=bot.js.map
