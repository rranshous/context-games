// ── Game: Main Orchestrator ──
// Title -> Run -> Reflection -> After-Action -> Next Run

import { DesertWorld } from './desert-world';
import { Vehicle } from './vehicle';
import { Camera } from './camera';
import { DriverSoma, Objective, RunRecording, PursuerBroadcast } from './types';
import { createDefaultSoma, loadSoma, saveSoma, executeTick, clearCompileCache } from './soma';
import { RunRecorder } from './run-recorder';
import { SpeechInput } from './speech';
import { reflectDriver, ReflectionResult, TurnUpdate } from './reflection';
import { renderRunMap } from './run-map-renderer';
import { CONFIG } from './config';
import { Pursuer, clearPursuerCompileCache } from './pursuer';
import { loadOrCreatePursuerSomas, savePursuerSomas } from './pursuer-soma';
import { reflectAllPursuers, PursuerReflectionResult, PursuerReflectionUpdate } from './pursuer-reflection';
import { PursuerSoma } from './types';
import {
  updateParticles, renderParticles, clearParticles,
  updateTireTracks, renderTireTracks, clearTireTracks,
  updateShake,
} from './effects';

type GameState = 'title' | 'running' | 'reflecting' | 'after_action';

// Colors
const BG_DARK = '#1a1a2e';
const TEXT_SAND = '#c2b280';
const TEXT_DIM = '#887a5a';
const TEXT_GREEN = '#33ff33';
const TEXT_RED = '#ff4444';
const TEXT_GOLD = '#ffd700';
const TEXT_BLUE = '#6688cc';

// Pursuer path colors (match map renderer)
const PURSUER_COLORS = ['#ff4444', '#ff8800', '#aa44ff', '#ff44aa'];

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: DesertWorld;
  private vehicle: Vehicle;
  private camera: Camera;
  private soma: DriverSoma;
  private speech: SpeechInput;
  private recorder: RunRecorder | null = null;
  private objective: Objective | null = null;
  private state: GameState = 'title';
  private runCount: number = 0;
  private runTimer: number = 0;
  private lastTime: number = 0;
  private radioTranscript: string = '';

  // Pursuers
  private pursuerSomas: PursuerSoma[] = [];
  private pursuers: Pursuer[] = [];
  private pendingBroadcasts: PursuerBroadcast[] = [];
  private currentRadio: PursuerBroadcast[] = [];
  private pursuerRadioLog: string = ''; // accumulated for reflection

  // After-action state
  private lastRecording: RunRecording | null = null;
  private lastMapBase64: string = '';
  private lastMapImage: HTMLImageElement | null = null;
  private reflectionResult: ReflectionResult | null = null;
  private reflectionText: string = '';
  private changeSummary: string = '';

  // Pursuer reflection state — runs in background during next run
  private pursuerReflectionResults: PursuerReflectionResult[] = [];
  private pursuerReflectionPhase: string = '';
  private pendingPursuerReflection: Promise<void> | null = null;

  // Input state
  private spaceQueued: boolean = false;

  // After-action scroll
  private scrollY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    // World + vehicle at center
    this.world = new DesertWorld();
    this.vehicle = new Vehicle(this.world.width / 2, this.world.height / 2);

    // Camera
    this.camera = new Camera(
      CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT,
      this.world.width, this.world.height,
    );
    this.camera.update(this.vehicle.x, this.vehicle.y);

    // Load or create soma
    const saved = loadSoma();
    this.soma = saved || createDefaultSoma();
    if (saved) {
      this.runCount = saved.runHistory.length;
    }

    // Speech input
    this.speech = new SpeechInput();

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.spaceQueued = true;
      }
      // R to reset on title screen
      if (e.code === 'KeyR' && this.state === 'title') {
        this.resetAll();
      }
    });

    // Mouse wheel for after-action scroll
    canvas.addEventListener('wheel', (e) => {
      if (this.state === 'after_action') {
        e.preventDefault();
        this.scrollY = Math.max(0, this.scrollY + e.deltaY);
      }
    }, { passive: false });
  }

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
      this.lastTime = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private resetAll(): void {
    localStorage.removeItem('wheelman-soma');
    localStorage.removeItem('wheelman-pursuers');
    this.soma = createDefaultSoma();
    this.runCount = 0;
    this.pursuerSomas = [];
    this.pursuers = [];
    console.log('[WHEELMAN] All somas reset');
  }

  private consumeSpace(): boolean {
    if (this.spaceQueued) {
      this.spaceQueued = false;
      return true;
    }
    return false;
  }

  // ── Escalation ──

  private getPursuerCount(): number {
    let count = 0;
    for (const tier of CONFIG.ESCALATION) {
      if (this.runCount >= tier.minRun) {
        count = tier.count;
      }
    }
    return count;
  }

  // ── Update Loop ──

  private update(dt: number): void {
    switch (this.state) {
      case 'title': {
        if (this.consumeSpace()) {
          this.startRun();
        }
        break;
      }

      case 'running': {
        this.runTimer += dt;

        // Swap radio buffers (double-buffered, one-tick delay)
        this.currentRadio = [...this.pendingBroadcasts];
        this.pendingBroadcasts = [];

        // Reset driver controls each frame
        this.vehicle.resetControls();

        // Build pursuer info for driver's world API
        const pursuerInfo = this.pursuers.map(p => ({
          position: { x: p.x, y: p.y },
          speed: p.speed,
          angle: p.angle,
        }));

        // Execute driver soma tick
        executeTick(
          this.soma,
          this.vehicle,
          this.world,
          this.radioTranscript,
          this.objective,
          pursuerInfo,
        );

        // Driver physics
        this.vehicle.update(dt, this.world);

        // Camera follow
        this.camera.update(this.vehicle.x, this.vehicle.y);

        // Record driver position
        if (this.recorder) {
          this.recorder.recordDriverPosition(
            { x: this.vehicle.x, y: this.vehicle.y },
            this.vehicle.speed,
            this.vehicle.angle,
          );
        }

        // Update each pursuer
        for (const pursuer of this.pursuers) {
          // Filter radio: only messages NOT from this pursuer
          const radio = this.currentRadio.filter(m => m.from !== pursuer.soma.id);

          pursuer.update(
            dt,
            { x: this.vehicle.x, y: this.vehicle.y },
            this.vehicle.speed,
            this.vehicle.angle,
            this.world,
            radio,
            this.runTimer,
          );

          // Collect outbound broadcasts
          for (const bc of pursuer.pendingBroadcasts) {
            this.pendingBroadcasts.push(bc);

            // Log for reflection
            const logLine = `[${this.runTimer.toFixed(1)}s] ${pursuer.soma.name}: ${bc.signalType}`;
            this.pursuerRadioLog += logLine + '\n';

            // Record in recorder
            if (this.recorder) {
              this.recorder.recordPursuerRadio(
                pursuer.soma.name,
                bc.signalType,
                JSON.stringify(bc.data).slice(0, 200),
              );
            }
          }

          // Record pursuer position
          if (this.recorder) {
            this.recorder.recordPursuerPosition(pursuer.soma.id, { x: pursuer.x, y: pursuer.y });
          }

          // Check: caught?
          const catchDist = pursuer.distanceToDriver(this.vehicle.x, this.vehicle.y);
          if (catchDist < CONFIG.PURSUER.CATCH_DISTANCE) {
            if (this.recorder) {
              this.recorder.recordEvent(
                'caught',
                `Caught by ${pursuer.soma.name}!`,
                { x: this.vehicle.x, y: this.vehicle.y },
              );
            }
            this.endRun('caught');
            return;
          }
        }

        // Check: reached objective?
        if (this.objective) {
          const dx = this.vehicle.x - this.objective.position.x;
          const dy = this.vehicle.y - this.objective.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONFIG.RUN.OBJECTIVE_REACH_DIST) {
            if (this.recorder) {
              this.recorder.recordEvent('objective_reached', 'Reached the objective!', { x: this.vehicle.x, y: this.vehicle.y });
            }
            this.endRun('delivered');
          }
        }

        // Check: timer expired?
        if (this.runTimer >= CONFIG.RUN.MAX_DURATION) {
          if (this.recorder) {
            this.recorder.recordEvent('timeout', 'Time ran out', { x: this.vehicle.x, y: this.vehicle.y });
          }
          this.endRun('timeout');
        }

        // Update effects
        updateParticles(dt);
        updateTireTracks(dt);

        break;
      }

      case 'reflecting': {
        // Waiting for async reflection — nothing to update
        break;
      }

      case 'after_action': {
        if (this.consumeSpace()) {
          this.startRun();
        }
        break;
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;

    switch (this.state) {
      case 'title':
        this.renderTitle();
        break;

      case 'running': {
        // Screen shake offset
        const shake = updateShake(1 / 60);

        // Apply shake to camera rendering
        ctx.save();
        ctx.translate(shake.offsetX, shake.offsetY);

        // World
        this.world.render(ctx, this.camera);
        // Tire tracks (ground level)
        renderTireTracks(ctx, this.camera);
        // Dust particles (ground level, behind/under vehicles)
        renderParticles(ctx, this.camera);
        // Objective marker
        this.renderObjectiveMarker();
        // Pursuers
        for (const pursuer of this.pursuers) {
          pursuer.render(ctx, this.camera);
        }
        // Vehicle (on top)
        this.vehicle.render(ctx, this.camera);

        ctx.restore();

        // HUD (not affected by shake)
        this.renderHUD();
        break;
      }

      case 'reflecting':
        this.renderReflecting();
        break;

      case 'after_action':
        this.renderAfterAction();
        break;
    }
  }

  private startRun(): void {
    this.runCount++;

    // Pick random objective far from vehicle
    const objPos = this.world.getObjectivePosition();
    this.objective = {
      position: objPos,
      type: 'delivery',
      label: `Drop #${this.runCount}`,
    };

    // Reset vehicle to center
    this.vehicle = new Vehicle(this.world.width / 2, this.world.height / 2);

    // Spawn pursuers based on escalation
    const pursuerCount = this.getPursuerCount();
    this.pursuerSomas = loadOrCreatePursuerSomas(pursuerCount);
    this.pursuers = [];
    for (let i = 0; i < pursuerCount; i++) {
      // Spawn pursuers spread around the map edges
      const angle = (i / pursuerCount) * Math.PI * 2 + Math.random() * 0.5;
      const spawnDist = 1500 + Math.random() * 1000;
      const sx = this.world.width / 2 + Math.cos(angle) * spawnDist;
      const sy = this.world.height / 2 + Math.sin(angle) * spawnDist;
      const clampedX = Math.max(100, Math.min(this.world.width - 100, sx));
      const clampedY = Math.max(100, Math.min(this.world.height - 100, sy));
      this.pursuers.push(new Pursuer(this.pursuerSomas[i], clampedX, clampedY, this.world));
    }

    // Clear radio state
    this.pendingBroadcasts = [];
    this.currentRadio = [];
    this.pursuerRadioLog = '';

    // Create new recorder
    this.recorder = new RunRecorder();
    this.recorder.recordEvent('run_start', `Run #${this.runCount} started`, { x: this.vehicle.x, y: this.vehicle.y });

    // Clear boss radio
    this.radioTranscript = '';
    this.soma.boss_radio = '';
    this.speech.clearTranscript();

    // Start speech listening
    this.speech.onTranscript((text: string) => {
      const timestamp = this.runTimer.toFixed(1);
      this.radioTranscript += `[${timestamp}s] Boss: ${text}\n`;
      this.soma.boss_radio = this.radioTranscript;
      if (this.recorder) {
        this.recorder.recordRadio(text);
        this.recorder.recordEvent('radio', `Boss: "${text}"`, { x: this.vehicle.x, y: this.vehicle.y });
      }
    });
    this.speech.start();

    // Reset timer and state
    this.runTimer = 0;
    this.scrollY = 0;
    this.reflectionText = '';
    this.changeSummary = '';
    this.reflectionResult = null;
    this.lastMapImage = null;
    this.pursuerReflectionResults = [];
    this.pursuerReflectionPhase = '';
    this.state = 'running';

    // Clear compile caches + effects
    clearCompileCache();
    clearPursuerCompileCache();
    clearParticles();
    clearTireTracks();

    console.log(JSON.stringify({
      _wm: 'run_start',
      runCount: this.runCount,
      objective: objPos,
      pursuerCount: pursuerCount,
      pursuerNames: this.pursuerSomas.map(s => s.name),
      vehiclePos: { x: this.vehicle.x, y: this.vehicle.y },
    }));
  }

  private endRun(outcome: RunRecording['outcome']): void {
    // Stop speech
    this.speech.stop();

    // Calculate distance to objective
    let objDist = 0;
    if (this.objective) {
      const dx = this.vehicle.x - this.objective.position.x;
      const dy = this.vehicle.y - this.objective.position.y;
      objDist = Math.sqrt(dx * dx + dy * dy);
    }

    // Finish recording
    if (!this.recorder) return;
    const recording = this.recorder.finish(outcome, objDist);
    this.lastRecording = recording;

    // Add to driver run history
    this.soma.runHistory.push({
      runId: this.runCount,
      outcome: recording.outcome,
      durationSeconds: recording.durationSeconds,
      distanceCovered: recording.distanceCovered,
      reachedObjective: outcome === 'delivered',
    });

    // Add to each pursuer's chase history
    for (const pursuer of this.pursuers) {
      const spotted = pursuer.mode === 'pursuing' || pursuer.mode === 'searching';
      pursuer.soma.chaseHistory.push({
        runId: this.runCount,
        outcome: recording.outcome,
        durationSeconds: recording.durationSeconds,
        spotted,
        captured: outcome === 'caught',
      });
    }

    // Generate composite run map with pursuer names
    if (this.objective) {
      const pursuerNames: Record<string, string> = {};
      for (const s of this.pursuerSomas) {
        pursuerNames[s.id] = s.name;
      }
      this.lastMapBase64 = renderRunMap(recording, this.world, this.objective.position, pursuerNames);

      // Preload map image for rendering
      const img = new Image();
      img.onload = () => { this.lastMapImage = img; };
      img.src = 'data:image/png;base64,' + this.lastMapBase64;
    }

    // Set state to reflecting
    this.state = 'reflecting';
    this.reflectionText = '';
    this.changeSummary = '';

    console.log(JSON.stringify({
      _wm: 'run_end',
      runCount: this.runCount,
      outcome,
      duration: recording.durationSeconds,
      distance: recording.distanceCovered,
      objectiveDistance: objDist,
      pursuers: this.pursuers.map(p => ({ name: p.soma.name, mode: p.mode })),
    }));

    // Start reflections (async — driver + pursuers in parallel)
    this.doReflection(recording);
  }

  private async doReflection(recording: RunRecording): Promise<void> {
    try {
      // Driver reflection — blocking (we want updated code before next run)
      const driverResult = await reflectDriver(
        this.soma,
        recording,
        this.lastMapBase64,
        (update: TurnUpdate) => {
          if (update.newText) {
            this.reflectionText += update.newText;
          }
          for (const tc of update.toolCalls) {
            const status = tc.result.success ? 'OK' : `FAILED: ${tc.result.error}`;
            this.reflectionText += `\n[TOOL: ${tc.name} -> ${status}]\n`;
          }
        },
      );

      this.reflectionResult = driverResult;
      this.changeSummary = driverResult.changeSummary;
      saveSoma(this.soma);

      // Pursuer reflections — fire in background, apply when done
      if (this.pursuerSomas.length > 0) {
        this.startBackgroundPursuerReflection(recording);
      }

    } catch (err) {
      this.reflectionText += `\n[REFLECTION ERROR: ${String(err)}]\n`;
      this.changeSummary = 'Reflection failed.';
    }

    // Transition to after-action — no wait for pursuers
    this.state = 'after_action';
    this.scrollY = 0;
  }

  private startBackgroundPursuerReflection(recording: RunRecording): void {
    // Capture somas for this reflection (they may get replaced if a new run starts fast)
    const somasToReflect = [...this.pursuerSomas];
    const radioLog = this.pursuerRadioLog;
    const mapBase64 = this.lastMapBase64;

    this.pursuerReflectionPhase = 'reflecting (background)';

    this.pendingPursuerReflection = reflectAllPursuers(
      somasToReflect,
      recording,
      radioLog,
      mapBase64,
      (update: PursuerReflectionUpdate) => {
        this.pursuerReflectionPhase = `${update.phase} (background)`;
        if (update.currentPursuer) {
          this.pursuerReflectionPhase += `: ${update.currentPursuer}`;
        }
        this.pursuerReflectionResults = update.results;
      },
    ).then((results) => {
      this.pursuerReflectionResults = results;
      savePursuerSomas(somasToReflect);
      clearPursuerCompileCache();
      this.pendingPursuerReflection = null;
      this.pursuerReflectionPhase = '';

      console.log(JSON.stringify({
        _wm: 'background_pursuer_reflection_complete',
        pursuers: results.map(r => r.pursuerName),
      }));
    }).catch((err) => {
      console.error('[WHEELMAN] Background pursuer reflection failed:', err);
      this.pendingPursuerReflection = null;
      this.pursuerReflectionPhase = '';
    });
  }

  // ── HUD Rendering (during 'running' state) ──

  private renderHUD(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Top bar: timer + run count + pursuer count
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, W, 32);
    ctx.font = '14px monospace';
    ctx.textBaseline = 'middle';

    // Timer
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_SAND;
    const timeLeft = Math.max(0, CONFIG.RUN.MAX_DURATION - this.runTimer);
    ctx.fillText(`TIME: ${timeLeft.toFixed(1)}s`, 10, 16);

    // Run count
    ctx.textAlign = 'center';
    ctx.fillText(`RUN #${this.runCount}`, W / 2, 16);

    // Speed + pursuer count
    ctx.textAlign = 'right';
    const pursuerText = this.pursuers.length > 0 ? ` | ${this.pursuers.length} COPS` : '';
    ctx.fillText(`${Math.round(this.vehicle.speed)} px/s${pursuerText}`, W - 10, 16);

    // Objective distance
    if (this.objective) {
      const dx = this.vehicle.x - this.objective.position.x;
      const dy = this.vehicle.y - this.objective.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      ctx.textAlign = 'center';
      ctx.fillStyle = dist < 200 ? TEXT_GREEN : TEXT_SAND;
      ctx.fillText(`OBJ: ${Math.round(dist)}px`, W / 2, 32 + 16);
    }

    // Pursuer proximity warnings
    const closePursuers = this.pursuers
      .map(p => ({ name: p.soma.name, dist: p.distanceToDriver(this.vehicle.x, this.vehicle.y), mode: p.mode }))
      .filter(p => p.dist < CONFIG.PURSUER.SPOT_RANGE * 1.5)
      .sort((a, b) => a.dist - b.dist);

    if (closePursuers.length > 0) {
      const warningY = 32 + 32;
      ctx.fillStyle = 'rgba(200, 0, 0, 0.3)';
      ctx.fillRect(0, warningY, W, 20 * closePursuers.length);
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      for (let i = 0; i < closePursuers.length; i++) {
        const p = closePursuers[i];
        ctx.fillStyle = p.mode === 'pursuing' ? TEXT_RED : TEXT_GOLD;
        const icon = p.mode === 'pursuing' ? '!!' : '?';
        ctx.fillText(`${icon} ${p.name}: ${Math.round(p.dist)}px`, 10, warningY + 10 + i * 20);
      }
    }

    // Bottom: radio transcript (last 3 lines)
    const radioLines = this.radioTranscript.trim().split('\n').filter(l => l);
    const lastLines = radioLines.slice(-3);
    if (lastLines.length > 0) {
      const boxH = 20 + lastLines.length * 16;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, H - boxH, W, boxH);

      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = TEXT_GOLD;
      for (let i = 0; i < lastLines.length; i++) {
        ctx.fillText(lastLines[i], 10, H - boxH + 6 + i * 16);
      }
    }

    // Minimap
    this.renderMinimap();

    // Background reflection indicator
    if (this.pendingPursuerReflection) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = TEXT_BLUE;
      ctx.globalAlpha = 0.6;
      ctx.fillText('cops reflecting...', W - 10, H - 8);
      ctx.globalAlpha = 1;
    }

    // Objective arrow when off-screen
    this.renderObjectiveArrow();
  }

  private renderMinimap(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Minimap dimensions — bottom-left, above radio area
    const mapW = 160;
    const mapH = mapW * (this.world.height / this.world.width); // preserve aspect ratio
    const margin = 10;
    const mapX = W - mapW - margin;
    const mapY = 40; // below top bar

    const scaleX = mapW / this.world.width;
    const scaleY = mapH / this.world.height;

    // Background
    ctx.fillStyle = 'rgba(20, 18, 14, 0.75)';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = 'rgba(194, 178, 128, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Terrain hints — oases (from world data)
    ctx.fillStyle = 'rgba(60, 100, 180, 0.3)';
    for (const oasis of this.world.oases) {
      const ox = mapX + oasis.x * scaleX;
      const oy = mapY + oasis.y * scaleY;
      const or = oasis.radius * scaleX;
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(or, 2), 0, Math.PI * 2);
      ctx.fill();
    }

    // Objective
    if (this.objective) {
      const ox = mapX + this.objective.position.x * scaleX;
      const oy = mapY + this.objective.position.y * scaleY;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = TEXT_GOLD;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }

    // Pursuers
    for (let i = 0; i < this.pursuers.length; i++) {
      const p = this.pursuers[i];
      const px = mapX + p.x * scaleX;
      const py = mapY + p.y * scaleY;
      const color = p.mode === 'pursuing' ? TEXT_RED : PURSUER_COLORS[i % PURSUER_COLORS.length];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, p.mode === 'pursuing' ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Name label (tiny)
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.soma.name, px, py - 5);
    }

    // Driver (always on top)
    const dx = mapX + this.vehicle.x * scaleX;
    const dy = mapY + this.vehicle.y * scaleY;
    ctx.fillStyle = TEXT_GREEN;
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Camera viewport rectangle (camera.x/y is top-left corner)
    const camLeft = this.camera.x;
    const camTop = this.camera.y;
    ctx.strokeStyle = 'rgba(194, 178, 128, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mapX + camLeft * scaleX,
      mapY + camTop * scaleY,
      CONFIG.CANVAS.WIDTH * scaleX,
      CONFIG.CANVAS.HEIGHT * scaleY,
    );
  }

  private renderObjectiveMarker(): void {
    if (!this.objective) return;
    const ctx = this.ctx;
    const screen = this.camera.worldToScreen(this.objective.position.x, this.objective.position.y);

    if (screen.x < -20 || screen.x > CONFIG.CANVAS.WIDTH + 20 ||
        screen.y < -20 || screen.y > CONFIG.CANVAS.HEIGHT + 20) return;

    const pulse = Math.sin(performance.now() / 300) * 3;
    const size = 10 + pulse;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = TEXT_GOLD;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_GOLD;
    ctx.fillText(this.objective.label, screen.x, screen.y - 16);
  }

  private renderObjectiveArrow(): void {
    if (!this.objective) return;
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    const screen = this.camera.worldToScreen(this.objective.position.x, this.objective.position.y);

    const arrowMargin = 40;
    if (screen.x >= arrowMargin && screen.x <= W - arrowMargin &&
        screen.y >= arrowMargin && screen.y <= H - arrowMargin) return;

    const cx = W / 2;
    const cy = H / 2;
    const angle = Math.atan2(screen.y - cy, screen.x - cx);

    const edgeMargin = 30;
    const tX = Math.abs(angle) < Math.PI / 2
      ? (W - edgeMargin - cx) / Math.cos(angle)
      : (-W + edgeMargin + cx) / Math.cos(angle);
    const tY = angle > 0
      ? (H - edgeMargin - cy) / Math.sin(angle)
      : (-H + edgeMargin + cy) / Math.sin(angle);

    const t = Math.min(Math.abs(tX), Math.abs(tY));
    let edgeX = cx + Math.cos(angle) * t;
    let edgeY = cy + Math.sin(angle) * t;

    edgeX = Math.max(edgeMargin, Math.min(W - edgeMargin, edgeX));
    edgeY = Math.max(edgeMargin, Math.min(H - edgeMargin, edgeY));

    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);

    ctx.fillStyle = TEXT_GOLD;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Reflecting Screen ──

  private renderReflecting(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = BG_DARK;
    ctx.fillRect(0, 0, W, H);

    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('REVIEWING THE RUN...', W / 2, 20);

    const dots = '.'.repeat(Math.floor(performance.now() / 500) % 4);
    ctx.font = '14px monospace';
    ctx.fillStyle = TEXT_GREEN;
    ctx.fillText(`Driver reflecting${dots}`, W / 2, 55);

    // Streaming reasoning text (driver)
    if (this.reflectionText) {
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT_DIM;

      const lines = this.wrapText(this.reflectionText, W - 80);
      const visibleLines = lines.slice(-25);
      const startY = 105;
      for (let i = 0; i < visibleLines.length; i++) {
        const line = visibleLines[i];
        if (line.includes('[TOOL:')) {
          ctx.fillStyle = TEXT_GREEN;
        } else if (line.includes('[REFLECTION ERROR')) {
          ctx.fillStyle = TEXT_RED;
        } else {
          ctx.fillStyle = TEXT_DIM;
        }
        ctx.fillText(line, 40, startY + i * 14);
      }
    }
  }

  // ── After-Action Screen ──

  private renderAfterAction(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = BG_DARK;
    ctx.fillRect(0, 0, W, H);

    const recording = this.lastRecording;
    if (!recording) return;

    const mapAreaW = 420;
    const textX = mapAreaW + 20;
    const textW = W - textX - 20;

    const scroll = this.scrollY;

    // --- Left side: Composite run map ---
    if (this.lastMapImage) {
      const imgW = this.lastMapImage.naturalWidth;
      const imgH = this.lastMapImage.naturalHeight;
      const fitScale = Math.min((mapAreaW - 20) / imgW, (H - 80) / imgH);
      const drawW = imgW * fitScale;
      const drawH = imgH * fitScale;
      const drawX = 10;
      const drawY = 60;

      ctx.drawImage(this.lastMapImage, drawX, drawY, drawW, drawH);

      ctx.strokeStyle = TEXT_DIM;
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
    } else {
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText('(Map loading...)', mapAreaW / 2, H / 2);
    }

    // --- Right side: Text content (scrollable) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX - 5, 0, textW + 25, H - 40);
    ctx.clip();

    let y = 20 - scroll;

    // Outcome banner
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const outcomeColors: Record<string, string> = {
      delivered: TEXT_GREEN,
      caught: TEXT_RED,
      crashed: TEXT_RED,
      timeout: TEXT_GOLD,
    };
    ctx.fillStyle = outcomeColors[recording.outcome] || TEXT_SAND;
    ctx.fillText(recording.outcome.toUpperCase(), textX, y);
    y += 40;

    // Stats
    ctx.font = '13px monospace';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText(`Duration: ${recording.durationSeconds.toFixed(1)}s`, textX, y); y += 18;
    ctx.fillText(`Distance: ${Math.round(recording.distanceCovered)}px`, textX, y); y += 18;
    ctx.fillText(`Objective dist: ${Math.round(recording.objectiveDistance)}px`, textX, y); y += 18;
    ctx.fillText(`Run #${this.runCount} | ${this.pursuers.length} pursuers`, textX, y); y += 28;

    // Radio transcript
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = TEXT_GOLD;
    ctx.fillText('BOSS RADIO:', textX, y); y += 20;

    ctx.font = '11px monospace';
    if (recording.radioTranscript.length === 0) {
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText('(no radio communication)', textX, y); y += 16;
    } else {
      ctx.fillStyle = TEXT_GOLD;
      for (const msg of recording.radioTranscript.slice(-8)) {
        const radioLine = `[${msg.time.toFixed(1)}s] "${msg.text}"`;
        const wrapped = this.wrapText(radioLine, textW);
        for (const line of wrapped) {
          ctx.fillText(line, textX, y); y += 14;
        }
      }
    }
    y += 12;

    // Separator
    ctx.strokeStyle = TEXT_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, y);
    ctx.lineTo(textX + textW, y);
    ctx.stroke();
    y += 12;

    // Driver reflection
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('DRIVER REFLECTION:', textX, y); y += 20;

    if (this.changeSummary) {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_GREEN;
      const summaryLines = this.wrapText(this.changeSummary, textW);
      for (const line of summaryLines) {
        ctx.fillText(line, textX, y); y += 15;
      }
      y += 8;
    } else {
      ctx.font = '11px monospace';
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText('(reflecting...)', textX, y); y += 16;
    }

    // Token usage (driver)
    if (this.reflectionResult?.tokenUsage) {
      ctx.font = '10px monospace';
      ctx.fillStyle = TEXT_DIM;
      const t = this.reflectionResult.tokenUsage;
      ctx.fillText(`driver tokens: ${t.input} in / ${t.output} out`, textX, y);
      y += 16;
    }

    // ── PURSUIT DIVISION ──
    if (this.pursuerSomas.length > 0) {
      y += 8;
      ctx.strokeStyle = TEXT_BLUE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(textX, y);
      ctx.lineTo(textX + textW, y);
      ctx.stroke();
      y += 12;

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = TEXT_BLUE;
      ctx.fillText('PURSUIT DIVISION:', textX, y); y += 22;

      if (this.pursuerReflectionResults.length === 0 && this.pendingPursuerReflection) {
        ctx.font = '11px monospace';
        ctx.fillStyle = TEXT_DIM;
        const bdots = '.'.repeat(Math.floor(performance.now() / 500) % 4);
        ctx.fillText(`Reflecting in background${bdots}`, textX, y); y += 16;
      }

      for (let pi = 0; pi < this.pursuerReflectionResults.length; pi++) {
        const pr = this.pursuerReflectionResults[pi];
        const color = PURSUER_COLORS[pi % PURSUER_COLORS.length];

        // Pursuer name header
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = color;
        ctx.fillText(`${pr.pursuerName}`, textX, y); y += 16;

        // Change summary
        if (pr.changeSummary) {
          ctx.font = '11px monospace';
          ctx.fillStyle = TEXT_SAND;
          const lines = this.wrapText(pr.changeSummary, textW - 8);
          for (const line of lines) {
            ctx.fillText(line, textX + 8, y); y += 13;
          }
        } else {
          ctx.font = '11px monospace';
          ctx.fillStyle = TEXT_DIM;
          ctx.fillText('(no changes)', textX + 8, y); y += 13;
        }

        // Debrief summary
        if (pr.debriefSummary) {
          ctx.font = '10px monospace';
          ctx.fillStyle = TEXT_DIM;
          const debriefLines = this.wrapText(`Debrief: ${pr.debriefSummary}`, textW - 8);
          for (const line of debriefLines) {
            ctx.fillText(line, textX + 8, y); y += 12;
          }
        }

        // Token usage
        if (pr.tokenUsage) {
          ctx.font = '9px monospace';
          ctx.fillStyle = TEXT_DIM;
          ctx.fillText(`tokens: ${pr.tokenUsage.input} in / ${pr.tokenUsage.output} out`, textX + 8, y);
          y += 12;
        }

        y += 8;
      }
    }

    ctx.restore(); // End clip

    // "Press space" prompt — fixed at bottom
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SAND;
    const pulse = Math.sin(performance.now() / 400) > 0;
    if (pulse) {
      ctx.fillText('PRESS SPACE FOR NEXT RUN', W / 2, H - 30);
    }

    // Scroll indicator
    ctx.font = '10px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'right';
    ctx.fillText('scroll to see more', W - 10, H - 12);
  }

  // ── Title Screen ──

  private renderTitle(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = BG_DARK;
    ctx.fillRect(0, 0, W, H);

    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('WHEELMAN', W / 2, H / 2 - 80);

    ctx.font = '16px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText("You're the boss. Your driver is an AI.", W / 2, H / 2 - 30);

    ctx.font = '14px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText('Watch the drone feed. Yell into the mic.', W / 2, H / 2);
    ctx.fillText('The driver listens to your radio and learns.', W / 2, H / 2 + 22);

    // Pursuer info
    const nextPursuerCount = this.getPursuerCount();
    if (nextPursuerCount > 0) {
      ctx.fillStyle = TEXT_RED;
      ctx.fillText(`${nextPursuerCount} cop${nextPursuerCount > 1 ? 's' : ''} on patrol. They learn too.`, W / 2, H / 2 + 48);
    }

    // Run history
    if (this.soma.runHistory.length > 0) {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_DIM;
      const last = this.soma.runHistory[this.soma.runHistory.length - 1];
      ctx.fillText(
        `Last run: ${last.outcome} (${Math.round(last.durationSeconds)}s) | Total runs: ${this.soma.runHistory.length}`,
        W / 2, H / 2 + 75,
      );
    }

    // Speech warning
    if (!this.speech.supported) {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_RED;
      ctx.fillText('WARNING: Speech recognition not supported in this browser.', W / 2, H / 2 + 105);
      ctx.fillText('Use Chrome for voice input.', W / 2, H / 2 + 122);
    } else {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_GREEN;
      ctx.fillText('Microphone ready.', W / 2, H / 2 + 105);
    }

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = TEXT_SAND;
    const pulse = Math.sin(performance.now() / 400) > 0;
    if (pulse) {
      ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 + 155);
    }

    // Reset hint
    ctx.font = '11px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText('R = reset all somas', W / 2, H / 2 + 185);
  }

  // ── Utility ──

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const ctx = this.ctx;

    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      if (!para) {
        lines.push('');
        continue;
      }

      const words = para.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    return lines;
  }
}
