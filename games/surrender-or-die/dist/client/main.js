// src/client/api.ts
var SodAPI = class {
  baseUrl;
  token = "";
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }
  setToken(token) {
    this.token = token;
  }
  authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async login(handle) {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    this.token = data.token;
    return data;
  }
  async listGames() {
    const res = await fetch(`${this.baseUrl}/api/games`);
    return res.json();
  }
  async createGame(side = "left") {
    const res = await fetch(`${this.baseUrl}/api/games`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ side })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async joinGame(gameId) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/join`, {
      method: "POST",
      headers: this.authHeaders()
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async getState(gameId, sinceTick) {
    const url = `${this.baseUrl}/api/games/${gameId}/state` + (sinceTick != null ? `?since=${sinceTick}` : "");
    const res = await fetch(url, { headers: this.authHeaders() });
    if (res.status === 304) return null;
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async train(gameId, unitType) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/train`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitType })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async trainBatch(gameId, unitTypes) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/train-batch`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitTypes })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async moveUnits(gameId, unitIds, x, y) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/move`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, x, y })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async attackMove(gameId, unitIds, x, y) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/attack-move`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, x, y })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async attackTarget(gameId, unitIds, targetId) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/attack`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, targetId })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async surrender(gameId) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/surrender`, {
      method: "POST",
      headers: this.authHeaders()
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async mineGold(gameId, unitIds, mineId) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/mine`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitIds, mineId })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async useAbility(gameId, unitId, targetX, targetY) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/ability`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ unitId, targetX, targetY })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async research(gameId, upgradeId) {
    const res = await fetch(`${this.baseUrl}/api/games/${gameId}/research`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ upgradeId })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }
  async getLeaderboard() {
    const res = await fetch(`${this.baseUrl}/api/leaderboard`);
    return res.json();
  }
};

// src/shared/types.ts
var MAP_W = 30;
var MAP_H = 20;
var TILE_SIZE = 24;
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
var UPGRADES = [
  // Peasant (pick one)
  { id: "peasant_militia", name: "Militia Training", cost: 40, researchTime: 10, exclusive: "peasant_prospector" },
  { id: "peasant_prospector", name: "Prospector Picks", cost: 40, researchTime: 10, exclusive: "peasant_militia" },
  // Knight (pick one)
  { id: "knight_heavy", name: "Heavy Armor", cost: 60, researchTime: 15, exclusive: "knight_lancer" },
  { id: "knight_lancer", name: "Lance Training", cost: 60, researchTime: 15, exclusive: "knight_heavy" },
  // Archer (pick one)
  { id: "archer_longbow", name: "Longbow", cost: 50, researchTime: 12, exclusive: "archer_rapid" },
  { id: "archer_rapid", name: "Rapid Fire", cost: 50, researchTime: 12, exclusive: "archer_longbow" },
  // Catapult (pick one)
  { id: "catapult_trebuchet", name: "Trebuchet", cost: 80, researchTime: 20, exclusive: "catapult_bombard" },
  { id: "catapult_bombard", name: "Bombard Shot", cost: 80, researchTime: 20, exclusive: "catapult_trebuchet" },
  // Jester (pick one)
  { id: "jester_trickster", name: "Master Trickster", cost: 35, researchTime: 8, exclusive: "jester_saboteur" },
  { id: "jester_saboteur", name: "Saboteur", cost: 35, researchTime: 8, exclusive: "jester_trickster" },
  // Castle (can get multiple, no exclusions)
  { id: "castle_reinforce", name: "Reinforce Walls", cost: 60, researchTime: 15 },
  { id: "castle_arrowslits", name: "Arrow Slits", cost: 75, researchTime: 20 },
  { id: "castle_warhorn", name: "War Horn", cost: 50, researchTime: 12 }
];
var CASTLE_HP = 400;
var CASTLE_WIDTH = 2;
var CASTLE_RIGHT_X = MAP_W - CASTLE_WIDTH;
var SPAWN_LEFT_X = CASTLE_WIDTH + 0.5;
var SPAWN_RIGHT_X = MAP_W - CASTLE_WIDTH - 0.5;

// src/client/renderer.ts
var CANVAS_W = MAP_W * TILE_SIZE;
var CANVAS_H = MAP_H * TILE_SIZE;
var TERRAIN_COLORS = {
  open: "#1a2a1a",
  forest: "#0d3d0d",
  hill: "#3a3a1a",
  wall: "#444444",
  water: "#1a2a4a"
};
var TERRAIN_DETAIL = {
  open: "",
  forest: "\u2663",
  hill: "\u25B2",
  wall: "\u2588",
  water: "~"
};
var UNIT_COLORS = {
  left: {
    peasant: "#6699ff",
    knight: "#3355cc",
    archer: "#55bbff",
    catapult: "#2244aa",
    jester: "#aa77ff"
  },
  right: {
    peasant: "#ff6666",
    knight: "#cc3333",
    archer: "#ff8855",
    catapult: "#aa2222",
    jester: "#ff77aa"
  },
  neutral: {
    peasant: "#cccc44",
    knight: "#cccc44",
    archer: "#cccc44",
    catapult: "#cccc44",
    jester: "#cccc44"
  }
};
var UNIT_RADIUS = {
  peasant: 4,
  knight: 7,
  archer: 5,
  catapult: 8,
  jester: 5
};
var Renderer = class {
  ctx;
  canvas;
  selectedUnitIds = /* @__PURE__ */ new Set();
  selectionBox = null;
  playerSide = "left";
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext("2d");
  }
  get width() {
    return CANVAS_W;
  }
  get height() {
    return CANVAS_H;
  }
  tileToPixel(tx, ty) {
    return [tx * TILE_SIZE, ty * TILE_SIZE];
  }
  pixelToTile(px, py) {
    return [px / TILE_SIZE, py / TILE_SIZE];
  }
  render(game) {
    const ctx = this.ctx;
    this.drawTerrain(ctx, game);
    this.drawMines(ctx, game);
    this.drawCastle(ctx, "left", game.players.left?.castle ?? CASTLE_HP, game);
    this.drawCastle(ctx, "right", game.players.right?.castle ?? CASTLE_HP, game);
    for (const unit of game.units) {
      this.drawUnit(ctx, unit, game);
    }
    if (this.selectionBox) {
      const { x1, y1, x2, y2 } = this.selectionBox;
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.setLineDash([]);
    }
    if (game.activeEvent) {
      this.drawEventBanner(ctx, game.activeEvent.name);
    }
    if (game.phase === "lobby") {
      this.drawOverlay(ctx, "Waiting for opponent...");
    } else if (game.phase === "finished") {
      const msg = game.winner === "draw" ? "DRAW!" : `${game.winner} WINS!`;
      this.drawOverlay(ctx, msg, "Press SPACE or R to return to lobby");
    }
  }
  drawTerrain(ctx, game) {
    if (!game.terrain || game.terrain.length === 0) {
      ctx.fillStyle = "#1a2a1a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const terrain = game.terrain[y]?.[x] ?? "open";
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        ctx.fillStyle = TERRAIN_COLORS[terrain];
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const detail = TERRAIN_DETAIL[terrain];
        if (detail) {
          ctx.fillStyle = terrain === "water" ? "#2a4a6a" : terrain === "forest" ? "#1a5a1a" : terrain === "hill" ? "#5a5a2a" : "#666666";
          ctx.font = `${TILE_SIZE - 6}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(detail, px + TILE_SIZE / 2, py + TILE_SIZE / 2);
        }
        ctx.strokeStyle = "#1a3a1a";
        ctx.lineWidth = 0.3;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }
  drawMines(ctx, game) {
    if (!game.mines) return;
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;
      if (mine.remaining === -1) continue;
      const [px, py] = this.tileToPixel(mine.x, mine.y);
      const r = 10;
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 215, 0, 0.15)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = mine.claimedBy === "left" ? "#4466cc" : mine.claimedBy === "right" ? "#cc4444" : "#aa8800";
      ctx.fill();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", px, py);
      ctx.fillStyle = "#fff";
      ctx.font = "7px monospace";
      ctx.fillText(`${Math.floor(mine.remaining)}`, px, py + r + 6);
      if (mine.workerIds.length > 0) {
        ctx.fillStyle = "#aaffaa";
        ctx.fillText(`\u26CF${mine.workerIds.length}`, px, py - r - 4);
      }
    }
  }
  drawCastle(ctx, side, hp, game) {
    const hpFrac = hp / CASTLE_HP;
    const x = side === "left" ? 0 : (MAP_W - CASTLE_WIDTH) * TILE_SIZE;
    const w = CASTLE_WIDTH * TILE_SIZE;
    const baseColor = side === "left" ? "#4466cc" : "#cc4444";
    const dmgColor = side === "left" ? "#223366" : "#662222";
    ctx.fillStyle = hpFrac > 0.5 ? baseColor : dmgColor;
    ctx.fillRect(x, 0, w, CANVAS_H);
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, w - 2, CANVAS_H - 2);
    const innerX = side === "left" ? x + w - TILE_SIZE / 2 : x;
    ctx.fillStyle = baseColor;
    for (let y = 0; y < MAP_H; y += 2) {
      ctx.fillRect(innerX, y * TILE_SIZE, TILE_SIZE / 2, TILE_SIZE);
    }
    const barX = x + 4;
    const barY = 4;
    const barW = w - 8;
    const barH = 8;
    ctx.fillStyle = "#000";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpFrac > 0.3 ? "#44cc44" : "#cc4444";
    ctx.fillRect(barX, barY, barW * hpFrac, barH);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = "#fff";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.ceil(hp)}`, x + w / 2, barY + barH + 12);
    const player = game.players[side];
    if (player && player.upgrades.length > 0) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "7px monospace";
      ctx.fillText(`\u2605${player.upgrades.length}`, x + w / 2, barY + barH + 22);
    }
    if (player?.researching) {
      const remaining = Math.max(0, (player.researching.completeTick - game.tick) / 20);
      ctx.fillStyle = "#ffaa00";
      ctx.font = "7px monospace";
      ctx.fillText(`\u2699${Math.ceil(remaining)}s`, x + w / 2, barY + barH + 32);
    }
  }
  drawUnit(ctx, unit, game) {
    const [px, py] = this.tileToPixel(unit.x, unit.y);
    const r = UNIT_RADIUS[unit.type] ?? 5;
    const color = UNIT_COLORS[unit.owner]?.[unit.type] ?? "#fff";
    const selected = this.selectedUnitIds.has(unit.id);
    if (unit.isDecoy) {
      ctx.globalAlpha = 0.5;
    }
    if (unit.abilityActive) {
      ctx.beginPath();
      ctx.arc(px, py, r + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 100, 0.2)";
      ctx.fill();
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (unit.state === "mining") {
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (unit.state === "fortified") {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (unit.confused) {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (unit.slowed) {
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#00aaff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#fff";
    ctx.font = `${r}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icons = {
      peasant: "P",
      knight: "K",
      archer: "A",
      catapult: "C",
      jester: "J"
    };
    ctx.fillText(icons[unit.type] ?? "?", px, py + 1);
    if (unit.hp < unit.maxHp) {
      const barW = r * 2 + 2;
      const barH = 2;
      const barX = px - barW / 2;
      const barY = py - r - 5;
      const frac = unit.hp / unit.maxHp;
      ctx.fillStyle = "#000";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = frac > 0.3 ? "#44cc44" : "#cc4444";
      ctx.fillRect(barX, barY, barW * frac, barH);
    }
    if (unit.abilityCooldown <= 0 && unit.owner === this.playerSide) {
      ctx.beginPath();
      ctx.arc(px + r + 2, py - r, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff88";
      ctx.fill();
    }
    if (selected && UNIT_STATS[unit.type].range > 1) {
      ctx.beginPath();
      ctx.arc(px, py, UNIT_STATS[unit.type].range * TILE_SIZE, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,100,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawEventBanner(ctx, name) {
    ctx.fillStyle = "rgba(255, 215, 0, 0.15)";
    ctx.fillRect(0, 0, CANVAS_W, 20);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`\u26A1 ${name} \u26A1`, CANVAS_W / 2, 10);
  }
  drawOverlay(ctx, text, subtitle) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, CANVAS_H / 2 - 40, CANVAS_W, 80);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 - 8);
    if (subtitle) {
      ctx.fillStyle = "#aaa";
      ctx.font = "12px monospace";
      ctx.fillText(subtitle, CANVAS_W / 2, CANVAS_H / 2 + 18);
    }
  }
  unitAtPixel(game, px, py) {
    for (let i = game.units.length - 1; i >= 0; i--) {
      const u = game.units[i];
      const [ux, uy] = this.tileToPixel(u.x, u.y);
      const r = (UNIT_RADIUS[u.type] ?? 5) + 2;
      if (Math.abs(px - ux) <= r && Math.abs(py - uy) <= r) return u;
    }
    return null;
  }
  mineAtPixel(game, px, py) {
    if (!game.mines) return null;
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;
      const [mx, my] = this.tileToPixel(mine.x, mine.y);
      if (Math.abs(px - mx) <= 12 && Math.abs(py - my) <= 12) return mine;
    }
    return null;
  }
  unitsInRect(game, x1, y1, x2, y2, side) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return game.units.filter((u) => {
      if (u.owner !== side) return false;
      const [px, py] = this.tileToPixel(u.x, u.y);
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    });
  }
};

// src/client/ui.ts
var UI = class {
  renderer;
  api;
  canvas;
  gameId;
  playerSide;
  // Drag selection state
  dragging = false;
  dragStartX = 0;
  dragStartY = 0;
  // Latest known game state (for hit-testing)
  latestState = null;
  constructor(renderer2, api2, canvas, gameId, playerSide2) {
    this.renderer = renderer2;
    this.api = api2;
    this.canvas = canvas;
    this.gameId = gameId;
    this.playerSide = playerSide2;
    this.setupMouseHandlers();
    this.setupKeyboardHandlers();
    this.setupTrainButtons();
    this.setupUpgradePanel();
  }
  updateGame(gameId, side) {
    this.gameId = gameId;
    this.playerSide = side;
    this.renderer.selectedUnitIds.clear();
  }
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    ];
  }
  setupMouseHandlers() {
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      const [px, py] = this.getCanvasCoords(e);
      if (e.button === 0) {
        this.dragging = true;
        this.dragStartX = px;
        this.dragStartY = py;
        this.renderer.selectionBox = { x1: px, y1: py, x2: px, y2: py };
      } else if (e.button === 2) {
        this.handleRightClick(px, py);
      }
    });
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      const [px, py] = this.getCanvasCoords(e);
      this.renderer.selectionBox = {
        x1: this.dragStartX,
        y1: this.dragStartY,
        x2: px,
        y2: py
      };
    });
    this.canvas.addEventListener("mouseup", (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      const [px, py] = this.getCanvasCoords(e);
      const game = this.latestState;
      if (!game) return;
      const dragDist = Math.abs(px - this.dragStartX) + Math.abs(py - this.dragStartY);
      if (dragDist < 5) {
        const unit = this.renderer.unitAtPixel(game, px, py);
        if (unit && unit.owner === this.playerSide) {
          if (e.shiftKey) {
            if (this.renderer.selectedUnitIds.has(unit.id)) {
              this.renderer.selectedUnitIds.delete(unit.id);
            } else {
              this.renderer.selectedUnitIds.add(unit.id);
            }
          } else {
            this.renderer.selectedUnitIds = /* @__PURE__ */ new Set([unit.id]);
          }
        } else if (!e.shiftKey) {
          this.renderer.selectedUnitIds.clear();
        }
      } else {
        const units = this.renderer.unitsInRect(
          game,
          this.dragStartX,
          this.dragStartY,
          px,
          py,
          this.playerSide
        );
        if (e.shiftKey) {
          for (const u of units) this.renderer.selectedUnitIds.add(u.id);
        } else {
          this.renderer.selectedUnitIds = new Set(units.map((u) => u.id));
        }
      }
      this.renderer.selectionBox = null;
    });
  }
  handleRightClick(px, py) {
    const selected = Array.from(this.renderer.selectedUnitIds);
    if (selected.length === 0) return;
    const game = this.latestState;
    if (!game) return;
    const target = this.renderer.unitAtPixel(game, px, py);
    if (target && target.owner !== this.playerSide) {
      this.api.attackTarget(this.gameId, selected, target.id).catch(() => {
      });
      return;
    }
    const mine = this.renderer.mineAtPixel(game, px, py);
    if (mine && mine.remaining > 0) {
      const peasantIds = selected.filter((id) => {
        const u = game.units.find((u2) => u2.id === id);
        return u && u.type === "peasant";
      });
      if (peasantIds.length > 0) {
        this.api.mineGold(this.gameId, peasantIds, mine.id).catch(() => {
        });
        return;
      }
    }
    const [tx, ty] = this.renderer.pixelToTile(px, py);
    this.api.attackMove(this.gameId, selected, tx, ty).catch(() => {
    });
  }
  setupKeyboardHandlers() {
    document.addEventListener("keydown", (e) => {
      const keyMap = {
        "1": "peasant",
        "2": "knight",
        "3": "archer",
        "4": "catapult",
        "5": "jester"
      };
      if (keyMap[e.key]) {
        this.api.train(this.gameId, keyMap[e.key]).catch(() => {
        });
        return;
      }
      if (e.key === "q" || e.key === "Q") {
        const selected = Array.from(this.renderer.selectedUnitIds);
        if (selected.length > 0) {
          this.api.useAbility(this.gameId, selected[0]).catch(() => {
          });
        }
        return;
      }
      if (e.key === "a" && e.ctrlKey) {
        e.preventDefault();
        if (!this.latestState) return;
        this.renderer.selectedUnitIds = new Set(
          this.latestState.units.filter((u) => u.owner === this.playerSide).map((u) => u.id)
        );
        return;
      }
      if (e.key === "s" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        this.api.surrender(this.gameId).catch(() => {
        });
      }
    });
  }
  setupTrainButtons() {
    document.querySelectorAll(".train-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unitType = btn.dataset.unit;
        this.api.train(this.gameId, unitType).catch(() => {
        });
      });
    });
  }
  updateGoldDisplay(game) {
    const player = game.players[this.playerSide];
    const goldEl = document.getElementById("gold-display");
    if (goldEl && player) {
      goldEl.textContent = `Gold: ${Math.floor(player.gold)}`;
    }
  }
  updateEventLog(game) {
    const logEl = document.getElementById("event-log");
    if (!logEl) return;
    const recent = game.log.slice(-8);
    logEl.innerHTML = recent.map((entry, i) => {
      const fade = i < recent.length - 4 ? " fade" : "";
      return `<div class="log-entry${fade}">${entry.message}</div>`;
    }).join("");
  }
  // --- Upgrade panel ---
  setupUpgradePanel() {
    const toggle = document.getElementById("upgrade-toggle");
    const panel = document.getElementById("upgrade-panel");
    if (toggle && panel) {
      toggle.addEventListener("click", () => {
        panel.classList.toggle("visible");
      });
    }
  }
  updateUpgradePanel(game) {
    const listEl = document.getElementById("upgrade-list");
    if (!listEl) return;
    const panel = document.getElementById("upgrade-panel");
    if (!panel?.classList.contains("visible")) return;
    const player = game.players[this.playerSide];
    if (!player) return;
    const owned = new Set(player.upgrades);
    const researching = player.researching;
    const categories = {
      "Peasant": ["peasant_militia", "peasant_prospector"],
      "Knight": ["knight_heavy", "knight_lancer"],
      "Archer": ["archer_longbow", "archer_rapid"],
      "Catapult": ["catapult_trebuchet", "catapult_bombard"],
      "Jester": ["jester_trickster", "jester_saboteur"],
      "Castle": ["castle_reinforce", "castle_arrowslits", "castle_warhorn"]
    };
    let html = "";
    for (const [cat, ids] of Object.entries(categories)) {
      html += `<div class="upgrade-category">${cat}</div>`;
      for (const id of ids) {
        const def = UPGRADES.find((u) => u.id === id);
        if (!def) continue;
        const isOwned = owned.has(id);
        const isResearching = researching?.id === id;
        const isBlocked = !isOwned && def.exclusive && owned.has(def.exclusive);
        const canAfford = player.gold >= def.cost;
        let cls = "upgrade-item";
        let status = "";
        if (isOwned) {
          cls += " owned";
          status = " \u2713";
        } else if (isResearching) {
          cls += " researching";
          const remaining = Math.max(0, Math.ceil((researching.completeTick - game.tick) / 20));
          status = ` \u2699${remaining}s`;
        } else if (isBlocked) {
          cls += " blocked";
        }
        html += `<div class="${cls}" data-upgrade="${id}">`;
        html += `<div class="upgrade-name">${def.name}${status}</div>`;
        if (!isOwned && !isResearching) {
          html += `<div class="upgrade-cost">${def.cost}g \xB7 ${def.researchTime}s${!canAfford ? " (need gold)" : ""}</div>`;
        }
        html += `</div>`;
      }
    }
    listEl.innerHTML = html;
    listEl.querySelectorAll(".upgrade-item:not(.owned):not(.blocked):not(.researching)").forEach((el) => {
      el.addEventListener("click", () => {
        const upgradeId = el.dataset.upgrade;
        if (upgradeId && !player.researching) {
          this.api.research(this.gameId, upgradeId).catch((err) => {
            console.log("[Upgrade]", err.message);
          });
        }
      });
    });
  }
};

// src/client/main.ts
var api = new SodAPI();
var renderer = null;
var ui = null;
var currentGameId = null;
var playerHandle = "";
var playerSide = "left";
var latestState = null;
var lastTick = -1;
var pollInterval = null;
var loginScreen = document.getElementById("login-screen");
var lobbyScreen = document.getElementById("lobby-screen");
var gameScreen = document.getElementById("game-screen");
function showScreen(screen) {
  loginScreen.style.display = "none";
  lobbyScreen.style.display = "none";
  gameScreen.style.display = "none";
  screen.style.display = screen === gameScreen ? "block" : "block";
}
var loginForm = document.getElementById("login-form");
var handleInput = document.getElementById("handle-input");
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = handleInput.value.trim();
  if (!handle) return;
  try {
    const result = await api.login(handle);
    playerHandle = result.handle;
    sessionStorage.setItem("sod-token", result.token);
    sessionStorage.setItem("sod-handle", result.handle);
    showLobby();
  } catch (err) {
    alert("Login failed: " + err.message);
  }
});
var gamesListEl = document.getElementById("games-list");
var createGameBtn = document.getElementById("create-game-btn");
var lobbyHandleEl = document.getElementById("lobby-handle");
var savedToken = sessionStorage.getItem("sod-token");
var savedHandle = sessionStorage.getItem("sod-handle");
if (savedToken && savedHandle) {
  api.login(savedHandle).then(() => {
    playerHandle = savedHandle;
    showLobby();
  }).catch(() => {
    sessionStorage.clear();
    showScreen(loginScreen);
  });
} else {
  showScreen(loginScreen);
}
async function showLobby() {
  showScreen(lobbyScreen);
  lobbyHandleEl.textContent = playerHandle;
  await refreshGamesList();
  startLobbyRefresh();
}
async function refreshGamesList() {
  try {
    const games = await api.listGames();
    gamesListEl.innerHTML = "";
    if (games.length === 0) {
      gamesListEl.innerHTML = '<div class="no-games">No games yet. Create one!</div>';
      return;
    }
    for (const g of games) {
      const div = document.createElement("div");
      div.className = "game-entry";
      const leftH = g.players.left?.handle ?? "???";
      const rightH = g.players.right?.handle ?? "???";
      const status = g.phase === "lobby" ? "WAITING" : g.phase === "playing" ? `PLAYING (${Math.floor(g.elapsed)}s)` : `FINISHED \u2014 ${g.winner} wins`;
      div.innerHTML = `<span class="game-id">${g.id}</span>
        <span class="game-players">${leftH} vs ${rightH}</span>
        <span class="game-status">${status}</span>`;
      if (g.phase === "lobby") {
        const isCreator = g.players.left?.handle === playerHandle || g.players.right?.handle === playerHandle;
        if (!isCreator) {
          const joinBtn = document.createElement("button");
          joinBtn.textContent = "Join";
          joinBtn.className = "join-btn";
          joinBtn.addEventListener("click", () => joinGame(g.id));
          div.appendChild(joinBtn);
        } else {
          const waitSpan = document.createElement("span");
          waitSpan.textContent = " (waiting...)";
          waitSpan.style.color = "#aaa";
          div.appendChild(waitSpan);
        }
      }
      if (g.phase === "playing") {
        const isPlayer = g.players.left?.handle === playerHandle || g.players.right?.handle === playerHandle;
        if (isPlayer) {
          const playBtn = document.createElement("button");
          playBtn.textContent = "Play";
          playBtn.className = "join-btn";
          playBtn.addEventListener("click", () => {
            const side = g.players.left?.handle === playerHandle ? "left" : "right";
            enterGame(g.id, side);
          });
          div.appendChild(playBtn);
        }
      }
      gamesListEl.appendChild(div);
    }
  } catch (err) {
    console.error("Failed to list games:", err);
  }
  try {
    const leaderboard = await api.getLeaderboard();
    const lbEl = document.getElementById("leaderboard");
    if (leaderboard.length === 0) {
      lbEl.innerHTML = '<h3>Leaderboard</h3><div class="lb-empty">No games played yet</div>';
    } else {
      let html = "<h3>Leaderboard</h3>";
      for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
        const p = leaderboard[i];
        html += `<div class="lb-entry">
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-handle">${p.handle}</span>
          <span class="lb-elo">${p.elo}</span>
          <span class="lb-record">${p.wins}W ${p.losses}L ${p.surrenders}S</span>
        </div>`;
      }
      lbEl.innerHTML = html;
    }
  } catch (err) {
    console.error("Failed to load leaderboard:", err);
  }
}
createGameBtn.addEventListener("click", async () => {
  try {
    const game = await api.createGame("left");
    await refreshGamesList();
  } catch (err) {
    alert("Failed to create game: " + err.message);
  }
});
var lobbyRefresh = null;
function startLobbyRefresh() {
  stopLobbyRefresh();
  lobbyRefresh = window.setInterval(refreshGamesList, 2e3);
}
function stopLobbyRefresh() {
  if (lobbyRefresh !== null) {
    clearInterval(lobbyRefresh);
    lobbyRefresh = null;
  }
}
async function joinGame(gameId) {
  try {
    const game = await api.joinGame(gameId);
    const side = game.players.left?.handle === playerHandle ? "left" : "right";
    enterGame(gameId, side);
  } catch (err) {
    alert("Failed to join: " + err.message);
  }
}
function enterGame(gameId, side) {
  stopLobbyRefresh();
  currentGameId = gameId;
  playerSide = side;
  lastTick = -1;
  latestState = null;
  showScreen(gameScreen);
  const canvas = document.getElementById("game-canvas");
  if (!renderer) {
    renderer = new Renderer(canvas);
    renderer.playerSide = side;
    const container = document.getElementById("game-container");
    const scale = Math.min(
      (window.innerWidth - 40) / renderer.width,
      (window.innerHeight - 140) / renderer.height
    );
    canvas.style.width = `${renderer.width * scale}px`;
    canvas.style.height = `${renderer.height * scale}px`;
    container.style.width = `${renderer.width * scale}px`;
  }
  if (!ui) {
    ui = new UI(renderer, api, canvas, gameId, side);
  } else {
    ui.updateGame(gameId, side);
  }
  startPolling();
  startRenderLoop();
}
function startPolling() {
  if (pollInterval !== null) clearInterval(pollInterval);
  pollInterval = window.setInterval(async () => {
    if (!currentGameId) return;
    try {
      const state = await api.getState(currentGameId, lastTick);
      if (state) {
        latestState = state;
        lastTick = state.tick;
        if (ui) ui.latestState = state;
      }
    } catch (err) {
    }
  }, 100);
}
var renderRunning = false;
function startRenderLoop() {
  if (renderRunning) return;
  renderRunning = true;
  function render() {
    if (latestState && renderer) {
      renderer.render(latestState);
      if (ui) {
        ui.updateGoldDisplay(latestState);
        ui.updateEventLog(latestState);
        ui.updateUpgradePanel(latestState);
      }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}
document.addEventListener("keydown", (e) => {
  if ((e.key === " " || e.key === "r") && latestState?.phase === "finished") {
    if (pollInterval !== null) clearInterval(pollInterval);
    pollInterval = null;
    currentGameId = null;
    latestState = null;
    lastTick = -1;
    showLobby();
    startLobbyRefresh();
  }
});
document.getElementById("surrender-btn")?.addEventListener("click", async () => {
  if (!currentGameId) return;
  try {
    await api.surrender(currentGameId);
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById("back-btn")?.addEventListener("click", () => {
  if (pollInterval !== null) clearInterval(pollInterval);
  pollInterval = null;
  currentGameId = null;
  latestState = null;
  lastTick = -1;
  showLobby();
  startLobbyRefresh();
});
if (lobbyScreen.style.display !== "none") {
  startLobbyRefresh();
}
//# sourceMappingURL=main.js.map
