// ── Game ──
// Continuous demolition derby. No rounds — cars respawn on death.
// Score scales HP and speed. Background AI reflection.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { Car, checkCarCollisions, updateCollisionCooldowns, resetCollisionCooldowns } from './car.js';
import { Camera } from './camera.js';
import { CarSoma, GamePhase, LifeResult, CarColor, ScoreSnapshot, GameEvent } from './types.js';
import { getPlayerControls, clearFrame, wasPressed, pollGamepad, gamepadWasPressed } from './input.js';
import {
  loadSprites, spritesLoaded, renderCar, renderRock, renderCactus,
  renderBarrel, renderSandPatch,
} from './sprites.js';
import {
  PERSONALITIES, CarPersonality, createSoma,
  saveSomas, loadSomas, compileOnTick,
  buildMeAPI, buildWorldAPI,
} from './soma.js';
import { reflectOnLife, ReflectionResult } from './reflection.js';
import { ReflexLayer } from './reflex/reflex-layer.js';
import { OnnxReservoirBridge } from './reflex/onnx-bridge.js';
import { TendencyAccumulator } from './reflex/tendency-system.js';
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

  // Score history for pause screen graph
  private scoreHistory: ScoreSnapshot[] = [];
  private gameEvents: GameEvent[] = [];
  private lastSnapshotTime = 0;

  // Pause screen AI summaries
  private tacticsSummaries: Record<string, string> | null = null;
  private tacticsFetching = false;

  // Mouse tracking for pause screen tooltips
  private mouseX = 0;
  private mouseY = 0;
  private eventMarkers: { x: number; y: number; label: string; color: string }[] = [];

  // Ticker banner for driver brags
  private tickerMessages: { name: string; color: string; text: string; x: number }[] = [];
  private tickerSpeed = 60; // pixels per second

  private lastTime = 0;

  // ── Reflex Layer ──
  // Off by default to keep the game playable at full speed.
  // Enable via URL param: ?reflex=on
  private reflexEnabled = new URLSearchParams(window.location.search).get('reflex') === 'on';
  private reflexLayer: ReflexLayer | null = null;
  private reflexLoading = false;
  private reflexSaveTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = CW;
    canvas.height = CH;

    // Track mouse position (scaled to canvas coords)
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) * (CW / rect.width);
      this.mouseY = (e.clientY - rect.top) * (CH / rect.height);
    });

    this.savedSomas = loadSomas();
    this.savedScores = this.loadScores();

    // Expose debug
    (window as unknown as Record<string, unknown>).__tagYourDead = {
      game: this,
      getReflex: () => this.reflexLayer,
      reflexSummary: () => this.reflexLayer?.summary(),
      resetSomas: () => { localStorage.removeItem('tag-your-dead-somas'); location.reload(); },
      resetScores: () => { localStorage.removeItem('tag-your-dead-scores'); location.reload(); },
      resetReflexes: () => { localStorage.removeItem('tag-your-dead-reflexes'); location.reload(); },
      resetAll: () => {
        localStorage.removeItem('tag-your-dead-somas');
        localStorage.removeItem('tag-your-dead-scores');
        localStorage.removeItem('tag-your-dead-reflexes');
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

    pollGamepad();
    this.update(dt);
    this.render();
    clearFrame();

    requestAnimationFrame((t) => this.loop(t));
  }

  // ── Update ──

  private update(dt: number): void {
    switch (this.phase) {
      case 'title':
        if (wasPressed(' ') || wasPressed('Enter') || gamepadWasPressed()) {
          this.startGame();
        }
        break;

      case 'playing':
        if (wasPressed('Escape') || wasPressed('p') || wasPressed('P') || gamepadWasPressed()) {
          this.phase = 'paused';
          this.tacticsSummaries = null;
          this.fetchTacticsSummaries();
          break;
        }
        this.updatePlaying(dt);
        break;

      case 'paused':
        if (wasPressed('Escape') || wasPressed('p') || wasPressed('P')
            || wasPressed(' ') || wasPressed('Enter') || gamepadWasPressed()) {
          this.phase = 'playing';
        }
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
      if (controls.boost) this.player.boost();
    }

    // ── Tendency composition: both layers contribute to the same pool ──
    //
    // 1. Create accumulator, set probe magnitudes (learned tendencies)
    // 2. Build me API with accumulator so on_tick vocabulary calls register
    // 3. Run on_tick (authored tendencies register via me.ram_nearest(0.8) etc.)
    // 4. Softmax-compose all tendencies → net steer/accel → apply to car
    //
    // Both layers speak the same vocabulary. The car's movement is the
    // ordinal-weighted composition of all active tendencies from both sources.
    for (const ai of this.aiCars) {
      if (!ai.car.alive) continue;

      const accum = new TendencyAccumulator();

      // Tendency probes: set learned magnitudes (if reflex layer is loaded)
      if (this.reflexLayer) {
        const cr = this.reflexLayer.getReflex(ai.car.id);
        if (cr.cachedPriorities) {
          accum.setProbes(cr.cachedPriorities);
        }
        // Fire-and-forget reservoir update on cadence
        const meForText = buildMeAPI(ai.car, ai.soma, this.arena);
        const worldForText = buildWorldAPI(this.gameTime, this.arena, this.allCars, ai.car.id);
        this.reflexLayer.updateReservoir(ai.car, meForText, worldForText);
      }

      // on_tick: soma's authored code registers tendencies via vocabulary
      const world = buildWorldAPI(this.gameTime, this.arena, this.allCars, ai.car.id);
      const me = buildMeAPI(ai.car, ai.soma, this.arena, accum);
      try {
        const fn = compileOnTick(ai.soma.on_tick.content);
        fn(me, world);
      } catch (err) {
        console.warn(`[SOMA] on_tick error for ${ai.car.id}:`, err);
      }

      // Compose: softmax all tendencies → net controls → apply
      const net = accum.compose(me, world);
      ai.car.steer(net.steer);
      if (net.accel >= 0) {
        ai.car.accelerate(net.accel);
      } else {
        ai.car.brake(-net.accel);
      }
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

    // Reflex post-tick: compute reward + TD update for each AI car
    if (this.reflexLayer) {
      for (const ai of this.aiCars) {
        this.reflexLayer.postTick(ai.car);
      }
    }

    // Sample position trails for reflection maps
    for (const car of this.allCars) {
      car.sampleTrail(this.gameTime, dt);
    }

    // Effects
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (Math.abs(car.speed) > 60) {
        const dustCount = car.isBoosting ? 4 : 1;
        spawnDust(car.x, car.y, car.angle, Math.abs(car.speed), dustCount);
      }
      if (Math.abs(car.speed) > 30) {
        addTireTrack(car.x, car.y, car.angle);
      }
    }

    // Car-to-car collisions
    updateCollisionCooldowns(dt);
    const collisions = checkCarCollisions(this.allCars, this.arena);
    for (const col of collisions) {
      // Wrap-aware midpoint for effects
      const midX = col.a.x + this.arena.wrapDx(col.b.x - col.a.x) / 2;
      const midY = col.a.y + this.arena.wrapDy(col.b.y - col.a.y) / 2;

      if (col.tagTransfer) {
        spawnTagSparks(midX, midY);
        triggerShake(6, 0.3);
        console.log(`[TAG] tag transferred between ${col.a.id} and ${col.b.id}!`);
        // Record who became IT
        const newIt = col.a.isIt ? col.a : col.b;
        const gaveIt = col.a.isIt ? col.b : col.a;
        this.gameEvents.push({
          time: this.gameTime,
          carId: newIt.id,
          type: 'tagged_it',
          detail: `Tagged IT`,
        });
        // Life events for both cars involved
        newIt.addLifeEvent(this.gameTime, `Tagged ${this.carDisplayName(gaveIt.id)} — became IT`);
        gaveIt.addLifeEvent(this.gameTime, `Got tagged by ${this.carDisplayName(newIt.id)} — now IT`);
      } else if (col.damageToA > 5 || col.damageToB > 5) {
        spawnTagSparks(midX, midY);
        triggerShake(3, 0.15);
      }

      // Big hit events (damage > 25 — notable collisions only)
      if (col.damageToB > 25) {
        this.gameEvents.push({
          time: this.gameTime,
          carId: col.a.id,
          type: 'big_hit',
          detail: `Hit ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToB)} dmg`,
        });
        col.a.addLifeEvent(this.gameTime, `Rammed ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToB)} dmg`);
        col.b.addLifeEvent(this.gameTime, `Got rammed by ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToB)} dmg`);
      }
      if (col.damageToA > 25) {
        this.gameEvents.push({
          time: this.gameTime,
          carId: col.b.id,
          type: 'big_hit',
          detail: `Hit ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToA)} dmg`,
        });
        col.b.addLifeEvent(this.gameTime, `Rammed ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToA)} dmg`);
        col.a.addLifeEvent(this.gameTime, `Got rammed by ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToA)} dmg`);
      }
    }

    // Check for deaths
    for (const car of this.allCars) {
      if (wasAlive.get(car.id) && !car.alive) {
        spawnEliminationExplosion(car.x, car.y);
        triggerShake(10, 0.5);
        const reason = car.hp <= 0 ? 'destroyed' : 'timed out';
        console.log(`[ELIMINATED] ${car.id} ${reason}! Score halved to ${Math.floor(car.score)}`);

        const killerId = car.lastAttackerId;
        const killerName = killerId ? this.carDisplayName(killerId) : null;

        this.gameEvents.push({
          time: this.gameTime,
          carId: car.id,
          type: 'death',
          detail: reason === 'destroyed'
            ? (killerName ? `Killed by ${killerName}` : 'Destroyed')
            : 'IT timeout',
          relatedCarId: killerId ?? undefined,
        });

        // Life event on the dying car
        car.addLifeEvent(this.gameTime, reason === 'destroyed'
          ? (killerName ? `Destroyed by ${killerName}` : 'Destroyed (HP=0)')
          : 'Died — IT timer ran out');

        // Kill event on the killer's line
        if (reason === 'destroyed' && killerId) {
          this.gameEvents.push({
            time: this.gameTime,
            carId: killerId,
            type: 'kill',
            detail: `Destroyed ${this.carDisplayName(car.id)}`,
          });
        }

        // Ensure someone is always "it"
        const alive = this.allCars.filter(c => c.alive);
        if (alive.length > 0 && !alive.some(c => c.isIt)) {
          const next = alive[Math.floor(Math.random() * alive.length)];
          next.isIt = true;
          next.itTimer = T.IT_TIMEOUT;
          console.log(`[TAG] ${next.id} is now IT!`);
        }

        // Notify reflex layer of death (reset TD per-life state)
        if (this.reflexLayer) {
          this.reflexLayer.onCarDeath(car.id);
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
    this.updateTicker(dt);

    // Periodically save reflex probe weights (every 30 seconds)
    if (this.reflexLayer) {
      this.reflexSaveTimer += dt;
      if (this.reflexSaveTimer > 30) {
        this.reflexSaveTimer = 0;
        this.reflexLayer.save();
      }
    }

    // Camera follows player (or first alive car if player dead)
    if (this.player.alive) {
      this.camera.update(this.player.x, this.player.y, this.arena.width, this.arena.height);
    } else {
      const firstAlive = this.allCars.find(c => c.alive);
      if (firstAlive) {
        this.camera.update(firstAlive.x, firstAlive.y, this.arena.width, this.arena.height);
      }
    }

    // Score snapshots for pause screen graph (~1s intervals)
    if (this.gameTime - this.lastSnapshotTime >= 1) {
      this.lastSnapshotTime = this.gameTime;
      const scores: Record<string, number> = {};
      for (const car of this.allCars) {
        scores[car.id] = Math.floor(car.score);
      }
      this.scoreHistory.push({ time: this.gameTime, scores });
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
    this.scoreHistory = [];
    this.gameEvents = [];
    this.lastSnapshotTime = 0;
    this.tacticsSummaries = null;

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

    // Initialize reflex layer (async — loads reservoir model in background)
    // Only when ?reflex=on — off by default for playable speed.
    if (this.reflexEnabled && !this.reflexLayer && !this.reflexLoading) {
      this.reflexLoading = true;
      const bridge = new OnnxReservoirBridge('Xenova/distilgpt2');
      const layer = new ReflexLayer(bridge);
      layer.load().then(() => {
        layer.loadSaved();
        this.reflexLayer = layer;
        this.reflexLoading = false;
        console.log('[GAME] reflex layer ready');
      }).catch(err => {
        console.warn('[GAME] reflex layer failed to load:', err);
        this.reflexLoading = false;
      });
    }
  }

  private respawnCar(car: Car): void {
    // Find a spawn point far from other alive cars
    const alive = this.allCars.filter(c => c.alive);
    const margin = CONFIG.RESPAWN.MIN_DISTANCE;
    let bestX = this.arena.width / 2;
    let bestY = this.arena.height / 2;
    let bestMinDist = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Math.random() * this.arena.width;
      const y = Math.random() * this.arena.height;

      // Check obstacle collision
      if (this.arena.checkObstacleCollision(x, y, CONFIG.VEHICLE.COLLISION_RADIUS)) continue;

      let minDist = Infinity;
      for (const other of alive) {
        const d = this.arena.wrapDistance(x, y, other.x, other.y);
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
      trail: ai.car.trail,
      lifeEvents: ai.car.lifeEvents,
    };

    try {
      const result = await reflectOnLife(ai.personality.name, ai.soma, lifeResult, {
        arenaWidth: this.arena.width,
        arenaHeight: this.arena.height,
        obstacles: this.arena.obstacles,
        sandPatches: this.arena.sandPatches,
        carColor: this.CAR_COLORS[ai.car.id] ?? '#888',
      });
      ai.soma = result.soma;
      this.savedSomas.set(ai.car.id, result.soma);
      saveSomas(this.savedSomas);
      console.log(`[REFLECTION] ${ai.personality.name} updated their code`);

      if (result.brag) {
        console.log(`[TICKER] ${ai.personality.name}: ${result.brag}`);
        this.pushTickerMessage(ai.personality.name, ai.car.id, result.brag);
      } else {
        console.log(`[TICKER] ${ai.personality.name}: no brag returned`);
      }
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
        this.renderTicker();
        break;
      case 'paused':
        this.renderPauseScreen();
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
        ctx.font = 'bold 12px "tEggst", monospace';
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
      ctx.font = 'bold 10px "tEggst", monospace';
      ctx.textAlign = 'center';
      const nameColor = car.isIt ? '#ff4444' : (this.CAR_COLORS[car.id] ?? '#ffffff');
      ctx.fillStyle = nameColor;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText(name, s.x, s.y - 20);
      ctx.fillText(name, s.x, s.y - 20);
      if (car.isIt) {
        ctx.font = 'bold 9px "tEggst", monospace';
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
    ctx.font = 'bold 10px "tEggst", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffaa22';
    ctx.fillText('SCOREBOARD', sbX + 6, sbY + 12);

    // Entries
    ctx.font = '10px "tEggst", monospace';
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      const name = car.id === 'player' ? 'YOU' :
        this.aiCars.find(a => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      const y = sbY + 14 + (i + 1) * lineH;

      // Color per driver (dimmed when dead)
      const baseColor = this.CAR_COLORS[car.id] ?? '#ccc';
      ctx.fillStyle = car.alive ? baseColor : '#555';

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
      ctx.font = 'bold 20px "tEggst", monospace';
      ctx.fillStyle = '#ff2222';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const itText = `YOU'RE IT! ${this.player.itTimer.toFixed(1)}s`;
      ctx.strokeText(itText, CW / 2, 30);
      ctx.fillText(itText, CW / 2, 30);
    } else if (!this.player.alive) {
      ctx.font = 'bold 20px "tEggst", monospace';
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const text = this.player.respawnTimer > 0
        ? `RESPAWNING IN ${this.player.respawnTimer.toFixed(1)}s`
        : 'ELIMINATED — WATCHING';
      ctx.strokeText(text, CW / 2, 30);
      ctx.fillText(text, CW / 2, 30);
    }

    // Boost indicator (bottom-center)
    if (this.player.alive) {
      const bw = 80;
      const bh = 8;
      const bx = CW / 2 - bw / 2;
      const by = CH - 50;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);

      if (this.player.isBoosting) {
        // Active boost — bright bar draining
        const frac = this.player.boostTimer / CONFIG.BOOST.DURATION;
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(bx, by, bw * frac, bh);
      } else if (this.player.boostCooldownFrac > 0) {
        // Recharging
        const frac = 1 - this.player.boostCooldownFrac;
        ctx.fillStyle = '#555';
        ctx.fillRect(bx, by, bw * frac, bh);
      } else {
        // Ready
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = '300 9px "tEggst", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.player.boostCooldownFrac > 0 && !this.player.isBoosting ? '#666' : '#fff';
      ctx.fillText('BOOST [SPACE]', CW / 2, by - 4);
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
      ctx.fillStyle = car.isIt ? '#ff2222' : (this.CAR_COLORS[car.id] ?? '#4488ff');
      ctx.beginPath();
      ctx.arc(cx, cy, car.id === 'player' ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Pause Screen ──

  private readonly CAR_COLORS: Record<string, string> = {
    player: '#ff4444',
    viper: '#4488ff',
    bruiser: '#44cc44',
    ghost: '#cccc44',
    rattler: '#8888ff',
    'dust devil': '#999999',
  };

  private carDisplayName(id: string): string {
    if (id === 'player') return 'YOU';
    return this.aiCars.find(a => a.car.id === id)?.personality.name.toUpperCase() ?? id.toUpperCase();
  }

  private renderPauseScreen(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, CW, CH);

    ctx.save();

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffaa22';
    ctx.font = 'bold 24px "tEggst", monospace';
    ctx.fillText('PAUSED', CW / 2, 30);

    ctx.fillStyle = '#888';
    ctx.font = '10px "tEggst", monospace';
    ctx.fillText('Press ESC / P / SPACE to resume', CW / 2, 48);

    // Score graph
    this.renderScoreGraph(ctx, 20, 60, CW - 40, 260);

    // Driver tactics
    this.renderTactics(ctx, 20, 340, CW - 40, CH - 360);

    ctx.restore();
  }

  private renderScoreGraph(ctx: CanvasRenderingContext2D, gx: number, gy: number, gw: number, gh: number): void {
    const history = this.scoreHistory;
    if (history.length < 2) {
      ctx.fillStyle = '#666';
      ctx.font = '12px "tEggst", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data yet — play for a few seconds', gx + gw / 2, gy + gh / 2);
      return;
    }

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);

    const pad = { left: 45, right: 15, top: 20, bottom: 25 };
    const plotX = gx + pad.left;
    const plotY = gy + pad.top;
    const plotW = gw - pad.left - pad.right;
    const plotH = gh - pad.top - pad.bottom;

    // Determine ranges
    const minTime = history[0].time;
    const maxTime = history[history.length - 1].time;
    const timeRange = maxTime - minTime || 1;

    let maxScore = 0;
    for (const snap of history) {
      for (const s of Object.values(snap.scores)) {
        if (s > maxScore) maxScore = s;
      }
    }
    maxScore = Math.max(maxScore, 10); // minimum scale

    const toX = (t: number) => plotX + ((t - minTime) / timeRange) * plotW;
    const toY = (s: number) => plotY + plotH - (s / maxScore) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = plotY + (i / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();

      // Y-axis labels
      const val = Math.round(maxScore * (1 - i / gridLines));
      ctx.fillStyle = '#666';
      ctx.font = '9px "tEggst", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), plotX - 5, y + 3);
    }

    // X-axis time labels
    ctx.textAlign = 'center';
    const timeSteps = Math.min(6, Math.floor(timeRange / 10));
    for (let i = 0; i <= timeSteps; i++) {
      const t = minTime + (i / Math.max(timeSteps, 1)) * timeRange;
      const x = toX(t);
      ctx.fillStyle = '#666';
      ctx.font = '9px "tEggst", monospace';
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, x, plotY + plotH + 14);
    }

    // Draw lines for each car
    const carIds = Object.keys(history[0].scores);
    for (const carId of carIds) {
      const color = this.CAR_COLORS[carId] ?? '#888';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const snap of history) {
        const x = toX(snap.time);
        const y = toY(snap.scores[carId] ?? 0);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw event markers on each car's line
    this.eventMarkers = [];
    for (const ev of this.gameEvents) {
      if (ev.time < minTime || ev.time > maxTime) continue;
      const color = this.CAR_COLORS[ev.carId] ?? '#888';
      const name = this.carDisplayName(ev.carId);

      // Find score at event time from snapshots
      let evScore = 0;
      for (let i = 0; i < history.length; i++) {
        if (history[i].time >= ev.time) {
          evScore = history[i].scores[ev.carId] ?? 0;
          break;
        }
      }

      const ex = toX(ev.time);
      const ey = toY(evScore);
      const mins = Math.floor(ev.time / 60);
      const secs = Math.floor(ev.time % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

      if (ev.type === 'death') {
        // Skull in killer's color (or own color if no killer)
        const killerColor = ev.relatedCarId ? (this.CAR_COLORS[ev.relatedCarId] ?? color) : color;
        ctx.font = 'bold 22px "tEggst", monospace';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText('\u2620', ex, ey - 2);
        ctx.fillStyle = killerColor;
        ctx.fillText('\u2620', ex, ey - 2);
        this.eventMarkers.push({ x: ex, y: ey - 8, label: `${name} — ${ev.detail} [${timeStr}]`, color: killerColor });
      } else if (ev.type === 'kill') {
        // Kill marker — crosshair/target circle on the killer's line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, 8, 0, Math.PI * 2);
        ctx.stroke();
        // Cross inside
        ctx.beginPath();
        ctx.moveTo(ex - 5, ey); ctx.lineTo(ex + 5, ey);
        ctx.moveTo(ex, ey - 5); ctx.lineTo(ex, ey + 5);
        ctx.stroke();
        this.eventMarkers.push({ x: ex, y: ey, label: `${name} — ${ev.detail} [${timeStr}]`, color });
      } else if (ev.type === 'big_hit') {
        // Small burst/star for big hits
        ctx.fillStyle = color;
        ctx.font = 'bold 14px "tEggst", monospace';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText('\u2737', ex, ey + 1); // six-pointed star
        ctx.fillText('\u2737', ex, ey + 1);
        this.eventMarkers.push({ x: ex, y: ey, label: `${name} — ${ev.detail} [${timeStr}]`, color });
      } else if (ev.type === 'tagged_it') {
        // Red pulsing circle (like IT glow ring)
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // Inner dot
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
        this.eventMarkers.push({ x: ex, y: ey, label: `${name} — ${ev.detail} [${timeStr}]`, color });
      }
    }

    // Hover tooltip
    const hitRadius = 14;
    for (const marker of this.eventMarkers) {
      const dx = this.mouseX - marker.x;
      const dy = this.mouseY - marker.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        // Tooltip background
        ctx.font = '10px "tEggst", monospace';
        const tw = ctx.measureText(marker.label).width + 12;
        const tooltipX = Math.min(marker.x + 10, plotX + plotW - tw);
        const tooltipY = Math.max(marker.y - 24, plotY);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(tooltipX, tooltipY, tw, 18);
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(tooltipX, tooltipY, tw, 18);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(marker.label, tooltipX + 6, tooltipY + 13);
        break; // only show one tooltip
      }
    }

    // Legend (horizontal, above graph area)
    ctx.textAlign = 'left';
    ctx.font = '9px "tEggst", monospace';
    let legendX = plotX;
    for (const carId of carIds) {
      const color = this.CAR_COLORS[carId] ?? '#888';
      ctx.fillStyle = color;
      ctx.fillRect(legendX, plotY - 12, 8, 3);
      const name = this.carDisplayName(carId);
      ctx.fillText(name, legendX + 11, plotY - 8);
      legendX += ctx.measureText(name).width + 22;
    }
    // Marker legend
    ctx.fillStyle = '#888';
    ctx.fillText('\u2620=death', legendX + 4, plotY - 8);
    legendX += 55;
    ctx.fillText('\u2295=kill', legendX + 4, plotY - 8);
    legendX += 45;
    ctx.fillText('\u2737=hit', legendX + 4, plotY - 8);
    legendX += 40;
    // Red circle legend marker
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(legendX + 4, plotY - 10, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff4444';
    ctx.fillText('=IT', legendX + 11, plotY - 8);
  }

  private renderTactics(ctx: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);

    ctx.fillStyle = '#ffaa22';
    ctx.font = 'bold 12px "tEggst", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DRIVER INTEL', tx + 10, ty + 18);

    if (this.tacticsFetching) {
      ctx.fillStyle = '#888';
      ctx.font = '11px "tEggst", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Analyzing driver tactics...', tx + tw / 2, ty + th / 2);
      return;
    }

    if (!this.tacticsSummaries) {
      ctx.fillStyle = '#666';
      ctx.font = '11px "tEggst", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No intel available', tx + tw / 2, ty + th / 2);
      return;
    }

    // Render each AI driver's tactics summary in columns
    const colCount = this.aiCars.length;
    const colW = Math.floor((tw - 20) / colCount);
    const startX = tx + 10;
    const startY = ty + 32;

    for (let i = 0; i < this.aiCars.length; i++) {
      const ai = this.aiCars[i];
      const cx = startX + i * colW;
      const summary = this.tacticsSummaries[ai.car.id] ?? 'Unknown';
      const color = this.CAR_COLORS[ai.car.id] ?? '#888';

      // Driver name
      ctx.fillStyle = color;
      ctx.font = 'bold 11px "tEggst", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(ai.personality.name.toUpperCase(), cx + 4, startY);

      // Score
      ctx.fillStyle = '#aaa';
      ctx.font = '9px "tEggst", monospace';
      ctx.fillText(`Score: ${Math.floor(ai.car.score)}`, cx + 4, startY + 13);

      // Tactics text (word-wrapped)
      ctx.fillStyle = '#ccc';
      ctx.font = '9px "tEggst", monospace';
      const maxLineW = colW - 12;
      const lines = this.wrapText(ctx, summary, maxLineW);
      let ly = startY + 28;
      for (const line of lines.slice(0, 12)) { // cap lines
        ctx.fillText(line, cx + 4, ly);
        ly += 11;
      }
    }
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private async fetchTacticsSummaries(): Promise<void> {
    if (this.tacticsFetching) return;
    this.tacticsFetching = true;

    // Build a single prompt with all AI somas
    const drivers = this.aiCars.map(ai => ({
      id: ai.car.id,
      name: ai.personality.name,
      score: Math.floor(ai.car.score),
      identity: ai.soma.identity.content,
      on_tick: ai.soma.on_tick.content,
      memory: ai.soma.memory.content,
    }));

    const prompt = drivers.map(d =>
      `<driver id="${d.id}" name="${d.name}" score="${d.score}">\n<identity>${d.identity}</identity>\n<on_tick>${d.on_tick}</on_tick>\n<memory>${d.memory}</memory>\n</driver>`
    ).join('\n\n');

    const schema = {
      type: 'object' as const,
      properties: Object.fromEntries(drivers.map(d => [
        d.id,
        { type: 'string' as const, description: `2-3 sentence tactics summary for ${d.name}` },
      ])),
      required: drivers.map(d => d.id),
      additionalProperties: false,
    };

    try {
      const resp = await fetch(CONFIG.API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `You are analyzing AI drivers in a top-down demolition derby game. Each driver has on_tick code that runs every frame controlling their car via me.steer()/accelerate()/brake()/boost().

GAME CONTEXT: Toroidal desert arena (no walls, edges wrap). Cars ram each other for damage (speed × 0.15). Being "it" = 3x damage output but +35% damage taken. Front-bumper hits (nose-first) = only 10% self-damage. All cars have full visibility of all other cars via world.otherCars (no blind spots, no hidden information). boost() gives 1.8x speed burst on 3s cooldown.

For each driver, write a 1-2 sentence summary of what their code ACTUALLY DOES. Only describe behavior visible in the code — do not invent tactics or concepts not present. Max 30 words each.\n\n${prompt}`,
            },
          ],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object',
                properties: schema.properties,
                required: schema.required,
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const text = data.content?.[0]?.text;
      if (text) {
        this.tacticsSummaries = JSON.parse(text);
      }
    } catch (err) {
      console.warn('[TACTICS] Failed to fetch summaries:', err);
      // Fallback: just show identities
      this.tacticsSummaries = {};
      for (const ai of this.aiCars) {
        this.tacticsSummaries[ai.car.id] = ai.soma.identity.content;
      }
    }

    this.tacticsFetching = false;
  }

  private pushTickerMessage(name: string, carId: string, text: string): void {
    const color = this.CAR_COLORS[carId] ?? '#888';
    const label = name.toUpperCase();
    // Estimate pixel width of the full message (~7px per char)
    const GAP = 40; // px gap between messages
    const charW = 7;

    // Start after the last queued message clears, or off-screen right
    let startX = CW + 10;
    if (this.tickerMessages.length > 0) {
      const last = this.tickerMessages[this.tickerMessages.length - 1];
      const lastWidth = (last.name.length + last.text.length + 2) * charW;
      const lastEnd = last.x + lastWidth + GAP;
      if (lastEnd > startX) startX = lastEnd;
    }
    this.tickerMessages.push({ name: label, color, text, x: startX });
  }

  private updateTicker(dt: number): void {
    for (const msg of this.tickerMessages) {
      msg.x -= this.tickerSpeed * dt;
    }
    // Remove messages that have scrolled fully off-screen left
    // Estimate width: name + text at ~7px per char
    this.tickerMessages = this.tickerMessages.filter(
      msg => msg.x > -(msg.name.length + msg.text.length + 10) * 7
    );
  }

  private renderTicker(): void {
    if (this.tickerMessages.length === 0) return;
    const ctx = this.ctx;
    const y = CH - 12;

    // Banner background
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, y - 11, CW, 18);

    ctx.font = '300 10px "tEggst", monospace';
    for (const msg of this.tickerMessages) {
      // Driver name in their color
      ctx.fillStyle = msg.color;
      ctx.textAlign = 'left';
      ctx.fillText(`${msg.name}:`, msg.x, y);
      // Brag text in white
      const nameW = ctx.measureText(`${msg.name}: `).width;
      ctx.fillStyle = '#ccc';
      ctx.fillText(msg.text, msg.x + nameW, y);
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
    ctx.font = 'bold 48px "tEggst", monospace';
    ctx.fillText("TAG YOU'RE DEAD", CW / 2, CH / 3);

    ctx.fillStyle = '#d4b896';
    ctx.font = '18px "tEggst", monospace';
    ctx.fillText('Desert Demolition Derby', CW / 2, CH / 3 + 40);

    ctx.fillStyle = '#888';
    ctx.font = '14px "tEggst", monospace';
    ctx.fillText('Arrow keys / WASD / Gamepad to drive — SPACE to boost', CW / 2, CH / 2 + 20);
    ctx.fillText('Being IT: 3x damage output but take 35% more damage', CW / 2, CH / 2 + 45);
    ctx.fillText('Higher score = more HP and speed', CW / 2, CH / 2 + 70);
    ctx.fillText('No walls — edges wrap around. Die? Score halved. Keep fighting.', CW / 2, CH / 2 + 95);

    // Show saved scores if any
    if (this.savedScores.size > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = 'bold 14px "tEggst", monospace';
      ctx.fillText('\u2500\u2500\u2500 CAREER SCORES \u2500\u2500\u2500', CW / 2, CH / 2 + 140);
      ctx.font = '12px "tEggst", monospace';
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
    ctx.font = 'bold 16px "tEggst", monospace';
    ctx.fillText('PRESS SPACE / A TO START', CW / 2, CH - 60);
    ctx.restore();
  }
}
