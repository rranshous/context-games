// ── Game ──
// Continuous demolition derby. No rounds — cars respawn on death.
// Score scales HP and speed. Background AI reflection.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { Car, checkCarCollisions, updateCollisionCooldowns, resetCollisionCooldowns } from './car.js';
import { Camera } from './camera.js';
import { CarSoma, GamePhase, LifeResult, CarColor } from './types.js';
import { getPlayerControls, clearFrame, wasPressed } from './input.js';
import {
  loadSprites, spritesLoaded, renderCar, renderRock, renderCactus,
  renderBarrel, renderSandPatch,
} from './sprites.js';
import {
  PERSONALITIES, CarPersonality, createSoma, runOnTick,
  saveSomas, loadSomas, compileOnTick,
} from './soma.js';
import { reflectOnLife } from './reflection.js';
import {
  triggerShake, updateShake, spawnDust, spawnTagSparks,
  spawnEliminationExplosion, updateParticles, renderParticles,
  addTireTrack, updateTracks, renderTracks,
} from './effects.js';

const CW = CONFIG.CANVAS.WIDTH;
const CH = CONFIG.CANVAS.HEIGHT;
const T = CONFIG.TAG;

interface AICarEntry {
  car: Car;
  personality: CarPersonality;
  soma: CarSoma;
  reflecting: boolean; // true while background reflection is in progress
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private arena!: Arena;
  private camera = new Camera();

  private player!: Car;
  private aiCars: AICarEntry[] = [];
  private allCars: Car[] = [];

  private phase: GamePhase = 'title';
  private gameTime = 0; // total elapsed play time

  // Persisted somas
  private savedSomas: Map<string, CarSoma>;

  // Persisted scores
  private savedScores: Map<string, number>;

  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = CW;
    canvas.height = CH;

    this.savedSomas = loadSomas();
    this.savedScores = this.loadScores();

    // Expose debug
    (window as unknown as Record<string, unknown>).__tagYourDead = {
      game: this,
      resetSomas: () => { localStorage.removeItem('tag-your-dead-somas'); location.reload(); },
      resetScores: () => { localStorage.removeItem('tag-your-dead-scores'); location.reload(); },
      resetAll: () => {
        localStorage.removeItem('tag-your-dead-somas');
        localStorage.removeItem('tag-your-dead-scores');
        location.reload();
      },
    };
  }

  async start(): Promise<void> {
    await loadSprites();
    this.phase = 'title';
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();
    clearFrame();

    requestAnimationFrame((t) => this.loop(t));
  }

  // ── Update ──

  private update(dt: number): void {
    switch (this.phase) {
      case 'title':
        if (wasPressed(' ') || wasPressed('Enter')) {
          this.startGame();
        }
        break;

      case 'playing':
        this.updatePlaying(dt);
        break;
    }
  }

  private updatePlaying(dt: number): void {
    this.gameTime += dt;

    // Player input (only if alive)
    if (this.player.alive) {
      const controls = getPlayerControls();
      this.player.steer(controls.steer);
      this.player.accelerate(controls.accel);
      this.player.brake(controls.brake);
    }

    // AI on_tick
    for (const ai of this.aiCars) {
      if (!ai.car.alive) continue;
      runOnTick(ai.car, ai.soma, this.gameTime, this.arena, this.allCars);
    }

    // Track who was alive before update
    const wasAlive = new Map<string, boolean>();
    for (const car of this.allCars) {
      wasAlive.set(car.id, car.alive);
    }

    // Physics update all alive cars
    for (const car of this.allCars) {
      car.update(dt, this.arena);
    }

    // Effects
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (Math.abs(car.speed) > 60) {
        spawnDust(car.x, car.y, car.angle, Math.abs(car.speed), 1);
      }
      if (Math.abs(car.speed) > 30) {
        addTireTrack(car.x, car.y, car.angle);
      }
    }

    // Car-to-car collisions
    updateCollisionCooldowns(dt);
    const collisions = checkCarCollisions(this.allCars, this.arena);
    for (const col of collisions) {
      const midX = (col.a.x + col.b.x) / 2;
      const midY = (col.a.y + col.b.y) / 2;

      if (col.tagTransfer) {
        spawnTagSparks(midX, midY);
        triggerShake(6, 0.3);
        console.log(`[TAG] tag transferred between ${col.a.id} and ${col.b.id}!`);
      } else if (col.damageToA > 5 || col.damageToB > 5) {
        spawnTagSparks(midX, midY);
        triggerShake(3, 0.15);
      }
    }

    // Check for deaths
    for (const car of this.allCars) {
      if (wasAlive.get(car.id) && !car.alive) {
        spawnEliminationExplosion(car.x, car.y);
        triggerShake(10, 0.5);
        const reason = car.hp <= 0 ? 'destroyed' : 'timed out';
        console.log(`[ELIMINATED] ${car.id} ${reason}! Score halved to ${Math.floor(car.score)}`);

        // Ensure someone is always "it"
        const alive = this.allCars.filter(c => c.alive);
        if (alive.length > 0 && !alive.some(c => c.isIt)) {
          const next = alive[Math.floor(Math.random() * alive.length)];
          next.isIt = true;
          next.itTimer = T.IT_TIMEOUT;
          console.log(`[TAG] ${next.id} is now IT!`);
        }

        // Trigger background reflection for AI cars
        const ai = this.aiCars.find(a => a.car === car);
        if (ai && !ai.reflecting) {
          this.triggerBackgroundReflection(ai, reason === 'destroyed' ? 'destroyed' : 'timeout');
        }
      }
    }

    // Respawn timers for dead cars
    for (const car of this.allCars) {
      if (!car.alive && car.respawnTimer > 0) {
        car.respawnTimer -= dt;
        if (car.respawnTimer <= 0) {
          this.respawnCar(car);
        }
      }
    }

    updateParticles(dt);
    updateTracks(dt);

    // Camera follows player (or first alive car if player dead)
    if (this.player.alive) {
      this.camera.update(this.player.x, this.player.y, this.arena.width, this.arena.height);
    } else {
      const firstAlive = this.allCars.find(c => c.alive);
      if (firstAlive) {
        this.camera.update(firstAlive.x, firstAlive.y, this.arena.width, this.arena.height);
      }
    }

    // Auto-save scores periodically (every ~5s)
    if (Math.floor(this.gameTime) % 5 === 0 && Math.floor(this.gameTime) !== Math.floor(this.gameTime - dt)) {
      this.saveScores();
      saveSomas(this.savedSomas);
    }
  }

  // ── Game Setup ──

  private startGame(): void {
    this.gameTime = 0;

    // Create arena
    this.arena = new Arena(42);

    // Spawn positions — ring around center
    const cx = this.arena.width / 2;
    const cy = this.arena.height / 2;
    const totalCars = T.CAR_COUNT + 1;
    const spawnRadius = 150;

    // Player
    this.player = new Car(
      cx + Math.cos(0) * spawnRadius,
      cy + Math.sin(0) * spawnRadius,
      'red',
      'player',
    );
    this.player.angle = Math.PI;
    this.player.score = this.savedScores.get('player') ?? 0;
    this.player.hp = this.player.maxHp;

    // AI cars
    this.aiCars = [];
    for (let i = 0; i < T.CAR_COUNT; i++) {
      const p = PERSONALITIES[i % PERSONALITIES.length];
      const spawnAngle = ((i + 1) / totalCars) * Math.PI * 2;
      const car = new Car(
        cx + Math.cos(spawnAngle) * spawnRadius,
        cy + Math.sin(spawnAngle) * spawnRadius,
        p.color,
        p.name.toLowerCase(),
      );
      car.angle = spawnAngle + Math.PI;
      car.score = this.savedScores.get(car.id) ?? 0;
      car.hp = car.maxHp;

      const soma = this.savedSomas.get(car.id) ?? createSoma(p);
      this.aiCars.push({ car, personality: p, soma, reflecting: false });
    }

    this.allCars = [this.player, ...this.aiCars.map(a => a.car)];

    // Pick random car to be "it" first
    const itIndex = Math.floor(Math.random() * this.allCars.length);
    this.allCars[itIndex].isIt = true;
    this.allCars[itIndex].itTimer = T.IT_TIMEOUT;

    resetCollisionCooldowns();
    this.camera.snap(this.player.x, this.player.y, this.arena.width, this.arena.height);
    this.phase = 'playing';
  }

  private respawnCar(car: Car): void {
    // Find a spawn point far from other alive cars
    const alive = this.allCars.filter(c => c.alive);
    const margin = CONFIG.RESPAWN.MIN_DISTANCE;
    let bestX = this.arena.width / 2;
    let bestY = this.arena.height / 2;
    let bestMinDist = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 100 + Math.random() * (this.arena.width - 200);
      const y = 100 + Math.random() * (this.arena.height - 200);

      // Check obstacle collision
      if (this.arena.checkObstacleCollision(x, y, CONFIG.VEHICLE.COLLISION_RADIUS)) continue;

      let minDist = Infinity;
      for (const other of alive) {
        const dx = other.x - x;
        const dy = other.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = x;
        bestY = y;
      }

      if (minDist >= margin) break;
    }

    car.respawn(bestX, bestY);

    // Ensure someone is always "it"
    const allAlive = this.allCars.filter(c => c.alive);
    if (allAlive.length > 0 && !allAlive.some(c => c.isIt)) {
      car.isIt = true;
      car.itTimer = T.IT_TIMEOUT;
    }

    console.log(`[RESPAWN] ${car.id} respawned at (${Math.round(bestX)}, ${Math.round(bestY)}) with ${Math.round(car.maxHp)} HP, score ${Math.floor(car.score)}`);
  }

  // ── Background Reflection ──

  private async triggerBackgroundReflection(ai: AICarEntry, deathCause: 'destroyed' | 'timeout'): Promise<void> {
    ai.reflecting = true;

    const lifeResult: LifeResult = {
      score: Math.floor(ai.car.score),
      survivedSeconds: 0, // we don't track per-life time currently
      tagsGiven: ai.car.tagsGiven,
      tagsReceived: ai.car.tagsReceived,
      damageDealt: Math.round(ai.car.damageDealt),
      damageTaken: Math.round(ai.car.damageTaken),
      kills: ai.car.kills,
      deathCause,
      rockHits: ai.car.rockHits,
      cactusHits: ai.car.cactusHits,
      barrelHits: ai.car.barrelHits,
      wallHits: ai.car.wallHits,
      carCollisions: ai.car.carCollisions,
      timeAtWall: Math.round(ai.car.timeAtWall),
      avgSpeed: ai.car.speedSamples > 0 ? Math.round(ai.car.speedAccum / ai.car.speedSamples) : 0,
    };

    try {
      const updated = await reflectOnLife(ai.personality.name, ai.soma, lifeResult);
      ai.soma = updated;
      this.savedSomas.set(ai.car.id, updated);
      saveSomas(this.savedSomas);
      console.log(`[REFLECTION] ${ai.personality.name} updated their code`);
    } catch (err) {
      console.warn(`[REFLECTION] ${ai.personality.name} failed:`, err);
    }

    ai.reflecting = false;
  }

  // ── Score Persistence ──

  private loadScores(): Map<string, number> {
    const raw = localStorage.getItem('tag-your-dead-scores');
    if (!raw) return new Map();
    try {
      const obj = JSON.parse(raw) as Record<string, number>;
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private saveScores(): void {
    const obj: Record<string, number> = {};
    for (const car of this.allCars) {
      obj[car.id] = Math.floor(car.score);
    }
    localStorage.setItem('tag-your-dead-scores', JSON.stringify(obj));
  }

  // ── Render ──

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW, CH);

    switch (this.phase) {
      case 'title':
        this.renderTitle();
        break;
      case 'playing':
        this.renderArena();
        this.renderHUD();
        break;
    }
  }

  private renderArena(): void {
    const ctx = this.ctx;
    const cam = this.camera;

    const shake = updateShake(0.016);
    ctx.save();
    ctx.translate(shake.dx, shake.dy);

    // Desert background (matches sprite sand palette)
    ctx.fillStyle = '#efb681';
    ctx.fillRect(0, 0, CW, CH);

    // Sand patches (rough terrain zones — tiled to fill radius)
    for (const sp of this.arena.sandPatches) {
      if (!cam.isVisible(sp.x, sp.y, sp.radius + 32)) continue;
      const step = 28; // tile spacing (slightly less than 32 for overlap)
      for (let ox = -sp.radius; ox <= sp.radius; ox += step) {
        for (let oy = -sp.radius; oy <= sp.radius; oy += step) {
          if (ox * ox + oy * oy > sp.radius * sp.radius) continue;
          const wx = sp.x + ox;
          const wy = sp.y + oy;
          if (!cam.isVisible(wx, wy, 16)) continue;
          const s = cam.worldToScreen(wx, wy);
          renderSandPatch(ctx, s.x, s.y);
        }
      }
    }

    // Tire tracks
    renderTracks(ctx, cam);

    // Arena border
    const tl = cam.worldToScreen(0, 0);
    const br = cam.worldToScreen(this.arena.width, this.arena.height);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 4;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // Obstacles
    for (const obs of this.arena.obstacles) {
      if (!cam.isVisible(obs.x, obs.y, obs.radius + 10)) continue;
      const s = cam.worldToScreen(obs.x, obs.y);
      if (obs.type === 'rock') renderRock(ctx, s.x, s.y, obs.radius);
      else if (obs.type === 'cactus') renderCactus(ctx, s.x, s.y);
      else if (obs.type === 'barrel') renderBarrel(ctx, s.x, s.y);
    }

    // Dead cars (dimmed, with respawn timer)
    for (const car of this.allCars) {
      if (car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      ctx.save();
      ctx.globalAlpha = 0.3;
      renderCar(ctx, s.x, s.y, car.angle, car.color, false, 0);
      ctx.restore();

      // Respawn timer
      if (car.respawnTimer > 0) {
        ctx.save();
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff8844';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        const text = car.respawnTimer.toFixed(1);
        ctx.strokeText(text, s.x, s.y - 15);
        ctx.fillText(text, s.x, s.y - 15);
        ctx.restore();
      }
    }

    // Alive cars
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      renderCar(ctx, s.x, s.y, car.angle, car.color, car.isIt, car.immuneTimer);
    }

    // Particles
    renderParticles(ctx, cam);

    // Name labels + HP bars
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 40)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      const name = car.id === 'player' ? 'YOU' :
        this.aiCars.find(a => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;

      ctx.save();

      // Name + IT label first (so HP bar draws on top, never covered)
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = car.isIt ? '#ff4444' : '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(name, s.x, s.y - 20);
      ctx.fillText(name, s.x, s.y - 20);
      if (car.isIt) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ff8888';
        ctx.strokeText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 32);
        ctx.fillText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 32);
      }

      // HP bar (drawn last so it's never covered by text)
      const barW = 24;
      const barH = 3;
      const barX = s.x - barW / 2;
      const barY = car.isIt ? s.y - 44 : s.y - 38;
      const hpFrac = car.hp / car.maxHp;
      ctx.fillStyle = '#000';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = hpFrac > 0.5 ? '#44cc44' : hpFrac > 0.25 ? '#ccaa22' : '#cc2222';
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
      ctx.restore();
    }

    ctx.restore(); // shake
  }

  private renderHUD(): void {
    const ctx = this.ctx;

    ctx.save();

    // ── Scoreboard (top-left) ──
    const sorted = [...this.allCars].sort((a, b) => b.score - a.score);
    const sbX = 10;
    const sbY = 10;
    const lineH = 18;
    const sbW = 180;
    const sbH = 14 + sorted.length * lineH + 6;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(sbX, sbY, sbW, sbH);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.strokeRect(sbX, sbY, sbW, sbH);

    // Header
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffaa22';
    ctx.fillText('SCOREBOARD', sbX + 6, sbY + 12);

    // Entries
    ctx.font = '10px monospace';
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      const name = car.id === 'player' ? 'YOU' :
        this.aiCars.find(a => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      const y = sbY + 14 + (i + 1) * lineH;

      // Highlight player
      if (car.id === 'player') {
        ctx.fillStyle = '#ff8888';
      } else if (!car.alive) {
        ctx.fillStyle = '#666';
      } else {
        ctx.fillStyle = '#ccc';
      }

      const status = car.alive ? '' : ' \u2620'; // skull when dead
      const ai = this.aiCars.find(a => a.car.id === car.id);
      const reflecting = ai?.reflecting ? ' \u2699' : ''; // gear when reflecting
      ctx.fillText(`${Math.floor(car.score).toString().padStart(4)} ${name}${status}${reflecting}`, sbX + 6, y);

      // HP bar next to score
      if (car.alive) {
        const bx = sbX + sbW - 40;
        const bw = 30;
        const bh = 4;
        const by = y - 4;
        const hpFrac = car.hp / car.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = hpFrac > 0.5 ? '#44cc44' : hpFrac > 0.25 ? '#ccaa22' : '#cc2222';
        ctx.fillRect(bx, by, bw * hpFrac, bh);
      }
    }

    // ── Player status (top-center) ──
    ctx.textAlign = 'center';
    if (this.player.isIt) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ff2222';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const itText = `YOU'RE IT! ${this.player.itTimer.toFixed(1)}s`;
      ctx.strokeText(itText, CW / 2, 30);
      ctx.fillText(itText, CW / 2, 30);
    } else if (!this.player.alive) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const text = this.player.respawnTimer > 0
        ? `RESPAWNING IN ${this.player.respawnTimer.toFixed(1)}s`
        : 'ELIMINATED — WATCHING';
      ctx.strokeText(text, CW / 2, 30);
      ctx.fillText(text, CW / 2, 30);
    }

    // Minimap
    this.renderMinimap();
    ctx.restore();
  }

  private renderMinimap(): void {
    const ctx = this.ctx;
    const mmW = 140;
    const mmH = Math.round(mmW * (this.arena.height / this.arena.width));
    const mmX = CW - mmW - 10;
    const mmY = 10;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#2a1f14';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // Obstacles
    ctx.fillStyle = '#666';
    for (const obs of this.arena.obstacles) {
      const ox = mmX + (obs.x / this.arena.width) * mmW;
      const oy = mmY + (obs.y / this.arena.height) * mmH;
      ctx.fillRect(ox - 1, oy - 1, 2, 2);
    }

    // Cars
    for (const car of this.allCars) {
      if (!car.alive) continue;
      const cx = mmX + (car.x / this.arena.width) * mmW;
      const cy = mmY + (car.y / this.arena.height) * mmH;
      ctx.fillStyle = car.isIt ? '#ff2222' :
        car.id === 'player' ? '#ff6666' : '#4488ff';
      ctx.beginPath();
      ctx.arc(cx, cy, car.id === 'player' ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderTitle(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, CW, CH);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 48px monospace';
    ctx.fillText("TAG YOU'RE DEAD", CW / 2, CH / 3);

    ctx.fillStyle = '#d4b896';
    ctx.font = '18px monospace';
    ctx.fillText('Desert Demolition Derby', CW / 2, CH / 3 + 40);

    ctx.fillStyle = '#888';
    ctx.font = '14px monospace';
    ctx.fillText('Arrow keys / WASD to drive', CW / 2, CH / 2 + 20);
    ctx.fillText('Ram cars to deal damage — being IT means 3x damage', CW / 2, CH / 2 + 45);
    ctx.fillText('Higher score = more HP and speed', CW / 2, CH / 2 + 70);
    ctx.fillText('Die? Score halved. Respawn. Keep fighting.', CW / 2, CH / 2 + 95);

    // Show saved scores if any
    if (this.savedScores.size > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('\u2500\u2500\u2500 CAREER SCORES \u2500\u2500\u2500', CW / 2, CH / 2 + 140);
      ctx.font = '12px monospace';
      let y = CH / 2 + 160;
      const entries = [...this.savedScores.entries()].sort((a, b) => b[1] - a[1]);
      for (const [id, score] of entries.slice(0, 6)) {
        const name = id === 'player' ? 'YOU' :
          PERSONALITIES.find(p => p.name.toLowerCase() === id)?.name ?? id;
        ctx.fillText(`${name}: ${score}`, CW / 2, y);
        y += 18;
      }
    }

    // Blink prompt
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('PRESS SPACE TO START', CW / 2, CH - 60);
    ctx.restore();
  }
}
