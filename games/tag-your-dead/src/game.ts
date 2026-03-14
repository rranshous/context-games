// ── Game ──
// Main game loop. Title → Countdown → Playing → Round Over → Reflecting → repeat.
// Player is one car among many. AI cars run soma on_tick each frame.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { Car } from './car.js';
import { Camera } from './camera.js';
import { CarSoma, GamePhase, RoundResult, CarColor } from './types.js';
import { getPlayerControls, clearFrame, wasPressed } from './input.js';
import {
  loadSprites, spritesLoaded, renderCar, renderRock, renderCactus,
  renderBarrel, renderSandPatch,
} from './sprites.js';
import {
  PERSONALITIES, CarPersonality, createSoma, runOnTick,
  saveSomas, loadSomas, compileOnTick,
} from './soma.js';
import { reflectOnRound, generateTrashTalk } from './reflection.js';
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
  private roundNumber = 0;
  private roundTime = 0;
  private countdownTimer = 0;
  private pauseTimer = 0;

  // Round results + trash talk
  private roundResults: { name: string; result: RoundResult }[] = [];
  private trashTalkLines: { name: string; line: string; color: CarColor }[] = [];
  private reflectionProgress = 0;
  private reflectionTotal = 0;

  // Persisted somas
  private savedSomas: Map<string, CarSoma>;

  // Overall scores across rounds
  private scores: Map<string, { wins: number; rounds: number }> = new Map();

  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = CW;
    canvas.height = CH;

    this.savedSomas = loadSomas();

    // Expose debug
    (window as unknown as Record<string, unknown>).__tagYourDead = {
      game: this,
      resetSomas: () => { localStorage.removeItem('tag-your-dead-somas'); location.reload(); },
    };
  }

  async start(): Promise<void> {
    await loadSprites();
    this.phase = 'title';
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // cap at 50ms
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
          this.startNewRound();
        }
        break;

      case 'countdown':
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
          this.phase = 'playing';
        }
        break;

      case 'playing':
        this.updatePlaying(dt);
        break;

      case 'round_over':
        this.pauseTimer -= dt;
        if (this.pauseTimer <= 0 && (wasPressed(' ') || wasPressed('Enter'))) {
          this.startReflection();
        }
        break;

      case 'reflecting':
        // Waiting for reflection to complete (async)
        break;

      case 'game_over':
        if (wasPressed(' ') || wasPressed('Enter')) {
          this.phase = 'title';
        }
        break;
    }
  }

  private updatePlaying(dt: number): void {
    this.roundTime += dt;

    // Player input
    const controls = getPlayerControls();
    this.player.steer(controls.steer);
    this.player.accelerate(controls.accel);
    this.player.brake(controls.brake);

    // AI on_tick
    for (const ai of this.aiCars) {
      if (!ai.car.alive) continue;
      runOnTick(ai.car, ai.soma, this.roundTime, this.arena, this.allCars);
    }

    // Track who was alive before update (for elimination detection)
    const wasAlive = new Map<string, boolean>();
    for (const car of this.allCars) {
      wasAlive.set(car.id, car.alive);
    }

    // Physics update all cars
    for (const car of this.allCars) {
      car.update(dt, this.arena);
    }

    // Effects
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (car.speed > 60) {
        spawnDust(car.x, car.y, car.angle, car.speed, 1);
      }
      if (car.speed > 30) {
        addTireTrack(car.x, car.y, car.angle);
      }
    }

    // Check for tag collisions
    for (const car of this.allCars) {
      if (!car.isIt || !car.alive) continue;
      for (const other of this.allCars) {
        if (car === other) continue;
        if (car.canTag(other)) {
          car.tagCar(other);
          spawnTagSparks((car.x + other.x) / 2, (car.y + other.y) / 2);
          triggerShake(6, 0.3);
          console.log(`[TAG] ${car.id} tagged ${other.id}!`);
          break;
        }
      }
    }

    // Check for eliminations (timer ran out)
    for (const car of this.allCars) {
      if (wasAlive.get(car.id) && !car.alive) {
        spawnEliminationExplosion(car.x, car.y);
        triggerShake(10, 0.5);
        console.log(`[ELIMINATED] ${car.id} timed out!`);

        // Transfer tag to a random alive car
        const alive = this.allCars.filter(c => c.alive);
        if (alive.length > 1) {
          const next = alive[Math.floor(Math.random() * alive.length)];
          next.isIt = true;
          next.itTimer = T.IT_TIMEOUT;
          console.log(`[TAG] ${next.id} is now IT!`);
        }
      }
    }

    updateParticles(dt);
    updateTracks(dt);

    // Camera follows player (or first alive car if player is dead)
    if (this.player.alive) {
      this.camera.update(this.player.x, this.player.y, this.arena.width, this.arena.height);
    } else {
      const firstAlive = this.allCars.find(c => c.alive);
      if (firstAlive) {
        this.camera.update(firstAlive.x, firstAlive.y, this.arena.width, this.arena.height);
      }
    }

    // Check round end: <= 1 car alive
    const alive = this.allCars.filter(c => c.alive);
    if (alive.length <= 1) {
      this.endRound();
    }
  }

  // ── Round Management ──

  private startNewRound(): void {
    this.roundNumber++;
    this.roundTime = 0;
    this.trashTalkLines = [];

    // Create arena (new seed each round for variety)
    this.arena = new Arena(42 + this.roundNumber);

    // Spawn positions — ring around center
    const cx = this.arena.width / 2;
    const cy = this.arena.height / 2;
    const totalCars = T.INITIAL_CAR_COUNT + 1; // +1 for player
    const spawnRadius = 150;

    // Player
    const playerAngle = 0;
    this.player = new Car(
      cx + Math.cos(playerAngle) * spawnRadius,
      cy + Math.sin(playerAngle) * spawnRadius,
      'red',
      'player',
    );
    this.player.angle = playerAngle + Math.PI; // face center

    // AI cars
    this.aiCars = [];
    for (let i = 0; i < T.INITIAL_CAR_COUNT; i++) {
      const p = PERSONALITIES[i % PERSONALITIES.length];
      const spawnAngle = ((i + 1) / totalCars) * Math.PI * 2;
      const car = new Car(
        cx + Math.cos(spawnAngle) * spawnRadius,
        cy + Math.sin(spawnAngle) * spawnRadius,
        p.color,
        p.name.toLowerCase(),
      );
      car.angle = spawnAngle + Math.PI; // face center

      // Load persisted soma or create fresh
      const soma = this.savedSomas.get(car.id) ?? createSoma(p);
      this.aiCars.push({ car, personality: p, soma });
    }

    this.allCars = [this.player, ...this.aiCars.map(a => a.car)];

    // Pick random car to be "it" first
    const itIndex = Math.floor(Math.random() * this.allCars.length);
    this.allCars[itIndex].isIt = true;
    this.allCars[itIndex].itTimer = T.IT_TIMEOUT;

    // Camera snap
    this.camera.snap(this.player.x, this.player.y, this.arena.width, this.arena.height);

    // Countdown
    this.countdownTimer = 3;
    this.phase = 'countdown';
  }

  private endRound(): void {
    this.phase = 'round_over';
    this.pauseTimer = 1.5; // brief pause before accepting input

    // Calculate placements
    // Alive car = winner, eliminated cars ranked by when they died
    const alive = this.allCars.filter(c => c.alive);
    const dead = this.allCars.filter(c => !c.alive).sort((a, b) => b.eliminatedAt - a.eliminatedAt);
    const ranked = [...alive, ...dead];

    this.roundResults = [];
    for (let i = 0; i < ranked.length; i++) {
      const car = ranked[i];
      const name = car.id === 'player' ? 'You' :
        this.aiCars.find(a => a.car.id === car.id)?.personality.name ?? car.id;

      const result: RoundResult = {
        roundNumber: this.roundNumber,
        placement: i + 1,
        totalCars: ranked.length,
        survivedSeconds: this.roundTime,
        tagsGiven: car.tagsGiven,
        tagsReceived: car.tagsReceived,
        wasEliminated: !car.alive,
      };

      this.roundResults.push({ name, result });

      // Update overall scores
      const score = this.scores.get(car.id) ?? { wins: 0, rounds: 0 };
      score.rounds++;
      if (i === 0) score.wins++;
      this.scores.set(car.id, score);
    }
  }

  private async startReflection(): Promise<void> {
    this.phase = 'reflecting';
    this.trashTalkLines = [];
    this.reflectionProgress = 0;
    this.reflectionTotal = this.aiCars.length;

    // Run all reflections in parallel
    const promises = this.aiCars.map(async (ai) => {
      const myResult = this.roundResults.find(r =>
        r.name === ai.personality.name
      )?.result;
      if (!myResult) return;

      // Reflect (sonnet)
      const updated = await reflectOnRound(ai.personality.name, ai.soma, myResult);
      ai.soma = updated;
      this.savedSomas.set(ai.car.id, updated);

      // Trash talk (haiku) — in parallel with reflection
      const talk = await generateTrashTalk(
        ai.personality.name,
        ai.soma,
        myResult,
        this.roundResults,
      );
      this.trashTalkLines.push({
        name: ai.personality.name,
        line: talk,
        color: ai.personality.color,
      });

      this.reflectionProgress++;
    });

    await Promise.all(promises);
    saveSomas(this.savedSomas);

    // Auto-advance to next round after brief display
    this.phase = 'round_over';
    this.pauseTimer = 0;
  }

  // ── Render ──

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW, CH);

    switch (this.phase) {
      case 'title':
        this.renderTitle();
        break;
      case 'countdown':
        this.renderArena();
        this.renderCountdown();
        break;
      case 'playing':
        this.renderArena();
        this.renderHUD();
        break;
      case 'round_over':
        this.renderArena();
        this.renderRoundOver();
        break;
      case 'reflecting':
        this.renderArena();
        this.renderReflecting();
        break;
      case 'game_over':
        this.renderGameOver();
        break;
    }
  }

  private renderArena(): void {
    const ctx = this.ctx;
    const cam = this.camera;

    // Apply screen shake
    const shake = updateShake(0.016);
    ctx.save();
    ctx.translate(shake.dx, shake.dy);

    // Desert background
    ctx.fillStyle = '#d4b896';
    ctx.fillRect(0, 0, CW, CH);

    // Sand patches
    for (const sp of this.arena.sandPatches) {
      if (cam.isVisible(sp.x, sp.y, 20)) {
        const s = cam.worldToScreen(sp.x, sp.y);
        renderSandPatch(ctx, s.x, s.y);
      }
    }

    // Tire tracks (below everything)
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

    // Cars (dead ones first, dimmed)
    for (const car of this.allCars) {
      if (car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      ctx.save();
      ctx.globalAlpha = 0.3;
      renderCar(ctx, s.x, s.y, car.angle, car.color, false, 0);
      ctx.restore();
    }

    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      renderCar(ctx, s.x, s.y, car.angle, car.color, car.isIt, car.immuneTimer);
    }

    // Particles on top
    renderParticles(ctx, cam);

    // Name labels
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 40)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      const name = car.id === 'player' ? 'YOU' :
        this.aiCars.find(a => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      ctx.save();
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
        ctx.strokeText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 30);
        ctx.fillText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 30);
      }
      ctx.restore();
    }

    ctx.restore(); // shake
  }

  private renderHUD(): void {
    const ctx = this.ctx;
    const alive = this.allCars.filter(c => c.alive).length;

    // Alive count
    ctx.save();
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    const text = `ALIVE: ${alive}/${this.allCars.length}  |  ROUND ${this.roundNumber}`;
    ctx.strokeText(text, 10, 24);
    ctx.fillText(text, 10, 24);

    // Player status
    if (this.player.isIt) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ff2222';
      ctx.textAlign = 'center';
      const itText = `YOU'RE IT! ${this.player.itTimer.toFixed(1)}s`;
      ctx.strokeText(itText, CW / 2, 30);
      ctx.fillText(itText, CW / 2, 30);
    } else if (!this.player.alive) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ff4444';
      ctx.textAlign = 'center';
      ctx.strokeText('ELIMINATED — WATCHING', CW / 2, 30);
      ctx.fillText('ELIMINATED — WATCHING', CW / 2, 30);
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

    // Title
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
    ctx.fillText('One car is IT — ram someone to pass the tag', CW / 2, CH / 2 + 45);
    ctx.fillText('If you\'re IT too long, you\'re OUT', CW / 2, CH / 2 + 70);
    ctx.fillText('Last car alive wins!', CW / 2, CH / 2 + 95);

    // Overall scores if any
    if (this.scores.size > 0) {
      ctx.fillStyle = '#aaa';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('─── CAREER STATS ───', CW / 2, CH / 2 + 140);
      ctx.font = '12px monospace';
      let y = CH / 2 + 160;
      const entries = [...this.scores.entries()].sort((a, b) => b[1].wins - a[1].wins);
      for (const [id, score] of entries.slice(0, 6)) {
        const name = id === 'player' ? 'YOU' :
          this.aiCars.find(a => a.car.id === id)?.personality.name ?? id;
        ctx.fillText(`${name}: ${score.wins}W / ${score.rounds}R`, CW / 2, y);
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

  private renderCountdown(): void {
    const ctx = this.ctx;
    const num = Math.ceil(this.countdownTimer);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const text = num > 0 ? String(num) : 'GO!';
    ctx.strokeText(text, CW / 2, CH / 2);
    ctx.fillText(text, CW / 2, CH / 2);
    ctx.restore();
  }

  private renderRoundOver(): void {
    const ctx = this.ctx;

    // Semi-transparent overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, CW, CH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`ROUND ${this.roundNumber} OVER`, CW / 2, 60);

    // Results
    ctx.font = '16px monospace';
    let y = 110;
    for (const { name, result } of this.roundResults) {
      const isPlayer = name === 'You';
      ctx.fillStyle = isPlayer ? '#ff8888' : '#ccc';
      const status = result.wasEliminated ? 'ELIMINATED' : 'SURVIVED';
      ctx.fillText(
        `#${result.placement} ${name} — ${status} | Tags: ${result.tagsGiven}G ${result.tagsReceived}R`,
        CW / 2, y,
      );
      y += 24;
    }

    // Trash talk
    if (this.trashTalkLines.length > 0) {
      y += 20;
      ctx.fillStyle = '#888';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('─── POST-ROUND CHATTER ───', CW / 2, y);
      y += 24;

      ctx.font = 'italic 13px monospace';
      for (const { name, line } of this.trashTalkLines) {
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${name}: "${line}"`, CW / 2, y);
        y += 20;
      }
    }

    // Prompt
    if (this.pauseTimer <= 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 400);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('PRESS SPACE — AI CARS WILL REFLECT & IMPROVE', CW / 2, CH - 40);
    }

    ctx.restore();
  }

  private renderReflecting(): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CW, CH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffaa22';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('AI CARS ARE REFLECTING...', CW / 2, CH / 2 - 30);

    ctx.fillStyle = '#888';
    ctx.font = '16px monospace';
    ctx.fillText(
      `${this.reflectionProgress}/${this.reflectionTotal} cars improving their code`,
      CW / 2, CH / 2 + 10,
    );

    // Spinner
    const dots = '.'.repeat(Math.floor(performance.now() / 300) % 4);
    ctx.fillText(dots, CW / 2, CH / 2 + 40);

    ctx.restore();
  }

  private renderGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a0f08';
    ctx.fillRect(0, 0, CW, CH);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('GAME OVER', CW / 2, CH / 3);
    ctx.restore();
  }
}
