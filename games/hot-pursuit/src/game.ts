// ── Game State Manager: Chase Lifecycle ──
// Phase 3: Police reflect via Claude API after each chase, updating their somas.

import {
  GameConfig, DEFAULT_CONFIG, GamePhase, ChaseOutcome,
  ChaseReplay, PoliceEntity, TileType, RadioMessage,
} from './types';
import { TileMap } from './map';
import { Player, InputHandler } from './player';
import { Soma } from './soma';
import { createPoliceFromSoma, updateSomaPolice, distanceToPlayer } from './soma-police';
import { loadSomas, saveSomas, recordChaseInSoma, resetSomas } from './persistence';
import { clearHandlerCache } from './handler-executor';
import { ReplayRecorder } from './replay';
import { Renderer } from './renderer';
import { reflectAllActants } from './reflection';

// API endpoint for reflection inference (vanilla platform proxy)
const API_ENDPOINT = '/api/inference/anthropic/messages';

const CAPTURE_DISTANCE = 18; // pixels — close enough to catch

export class Game {
  private config: GameConfig;
  private map: TileMap;
  private player: Player;
  private police: PoliceEntity[] = [];
  private somas: Soma[] = [];
  private input: InputHandler;
  private renderer: Renderer;
  private recorder: ReplayRecorder;
  private phase: GamePhase = 'pregame';
  private runNumber: number = 1;
  private chaseStartTime: number = 0;
  private elapsedTime: number = 0;
  private replays: ChaseReplay[] = [];
  private updateInProgress: boolean = false;
  private lastReplay: ChaseReplay | null = null;
  private reflectionInProgress: boolean = false;

  // Live radio — broadcasts queued during tick N, dispatched on tick N+1
  private pendingBroadcasts: RadioMessage[] = [];
  private currentRadio: RadioMessage[] = [];

  // Fixed timestep
  private readonly TICK_RATE = 60;
  private readonly TICK_DT = 1 / 60;
  private accumulator: number = 0;
  private lastFrameTime: number = 0;
  private tickCount: number = 0;
  private running: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.config = { ...DEFAULT_CONFIG };
    this.map = new TileMap(this.config);
    this.input = new InputHandler();
    this.renderer = new Renderer(canvas, this.config);
    this.recorder = new ReplayRecorder(this.runNumber);

    // Load somas from localStorage (or create defaults)
    const policeCount = this.map.policeSpawns.length;
    this.somas = loadSomas(policeCount);

    // Initialize player at spawn
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player = new Player(spawnWorld, this.config);

    // Wire up reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all officers to defaults? This clears all learned behavior.')) {
          resetSomas();
          location.reload();
        }
      });
    }

    console.log(JSON.stringify({
      _hp: 'init',
      phase: 2,
      somasDriven: true,
      mapSize: { cols: this.map.cols, rows: this.map.rows },
      tileSize: this.config.tileSize,
      extractionPoints: this.map.extractionPoints,
      playerSpawn: this.map.playerSpawn,
      policeSpawns: this.map.policeSpawns,
      somas: this.somas.map(s => ({
        id: s.id,
        name: s.name,
        nature: s.nature.slice(0, 80) + '...',
        tools: s.tools.map(t => t.name),
        chaseCount: s.chaseHistory.length,
      })),
      config: {
        playerSpeed: this.config.playerSpeed,
        policeSpeed: this.config.policeBaseSpeed,
        losRange: this.config.losRange,
        losAngle: this.config.losAngle,
        survivalTime: this.config.survivalTime,
      },
    }));
  }

  start(): void {
    this.startChase();
    this.running = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private startChase(): void {
    this.phase = 'chase';
    this.chaseStartTime = performance.now();
    this.elapsedTime = 0;
    this.tickCount = 0;

    // Clear radio buffers
    this.pendingBroadcasts = [];
    this.currentRadio = [];

    // Randomize positions each chase
    this.map.randomizeExtractionPoints();
    this.map.randomizePoliceSpawns();

    // Reset player to spawn
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player.pos = { ...spawnWorld };
    this.player.facing = { x: 0, y: -1 };

    // Create police entities from somas
    this.police = this.somas.map((soma, i) =>
      createPoliceFromSoma(soma, this.map.policeSpawns[i], this.map, this.config)
    );

    // New recorder
    this.recorder = new ReplayRecorder(this.runNumber);
    this.recorder.start();

    this.renderer.hideGameOver();

    console.log(JSON.stringify({
      _hp: 'chase_start',
      run: this.runNumber,
      policeCount: this.police.length,
      police: this.police.map((p, i) => ({
        id: p.id,
        name: p.name,
        pos: p.pos,
        handlerSize: this.somas[i].signalHandlers.length,
        tools: this.somas[i].tools.map(t => t.name),
      })),
    }));
  }

  private loop(now: number): void {
    if (!this.running) return;

    const frameDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // Cap to prevent spiral of death
    this.accumulator += Math.min(frameDt, 0.1);

    // Fixed timestep updates
    while (this.accumulator >= this.TICK_DT) {
      this.accumulator -= this.TICK_DT;

      if (this.phase === 'chase') {
        this.updateChase(this.TICK_DT);
      } else if (this.phase === 'postgame') {
        this.updatePostgame();
      }
    }

    // Render (every frame, not tied to tick rate)
    if (this.phase === 'chase' || this.phase === 'postgame') {
      this.renderer.render(
        this.map,
        this.player.pos,
        this.police,
        this.elapsedTime,
        this.runNumber,
      );
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  private updateChase(dt: number): void {
    // Guard against re-entrant updates (handlers are async)
    if (this.updateInProgress) return;
    this.updateInProgress = true;

    this.tickCount++;
    this.elapsedTime = (performance.now() - this.chaseStartTime) / 1000;

    // Swap radio buffers — broadcasts from previous tick become current
    this.currentRadio = this.pendingBroadcasts;
    this.pendingBroadcasts = [];

    // Broadcast callback — officers push messages here during handler execution
    const onBroadcast = (msg: RadioMessage) => {
      msg.tick = this.tickCount;
      this.pendingBroadcasts.push(msg);
    };

    // Update player
    const action = this.player.update(dt, this.input.state, this.map);

    // Update police via soma signal handlers (fire and forget — handlers are fast)
    for (let i = 0; i < this.police.length; i++) {
      // Filter radio: only messages NOT from this officer
      const radio = this.currentRadio.filter(m => m.from !== this.police[i].id);

      updateSomaPolice(
        this.police[i],
        this.somas[i],
        this.player.pos,
        this.map,
        this.config,
        this.police,
        dt,
        this.tickCount,
        radio.length > 0 ? radio : undefined,
        onBroadcast,
      );
    }

    // Record tick
    this.recorder.recordTick(this.player.pos, action, this.police);

    // Check win/lose conditions
    const outcome = this.checkOutcome();
    if (outcome) {
      this.endChase(outcome);
    }

    this.updateInProgress = false;
  }

  private checkOutcome(): ChaseOutcome | null {
    // Check extraction — player standing on extraction tile
    const playerTile = this.map.worldToTile(this.player.pos);
    if (this.map.getTile(playerTile.col, playerTile.row) === TileType.EXTRACTION) {
      return 'escaped';
    }

    // Check capture — any police close enough
    for (const p of this.police) {
      if (distanceToPlayer(p, this.player.pos) < CAPTURE_DISTANCE) {
        return 'captured';
      }
    }

    // Check timer
    if (this.elapsedTime >= this.config.survivalTime) {
      return 'timeout';
    }

    return null;
  }

  private endChase(outcome: ChaseOutcome): void {
    this.phase = 'postgame';

    const replay = this.recorder.finish(outcome, 'city-grid-v1');
    this.replays.push(replay);
    this.lastReplay = replay;

    // Record chase in each soma's history
    for (let i = 0; i < this.somas.length; i++) {
      const p = this.police[i];
      recordChaseInSoma(this.somas[i], {
        runId: this.runNumber,
        outcome,
        durationSeconds: this.elapsedTime,
        spotted: p.canSeePlayer || (p.lastKnownPlayerPos !== null),
        captured: outcome === 'captured' && distanceToPlayer(p, this.player.pos) < CAPTURE_DISTANCE,
      });
    }

    // Persist somas after each chase
    saveSomas(this.somas);

    const escaped = outcome === 'escaped' || outcome === 'timeout';
    this.renderer.showGameOver(outcome, escaped);

    console.log(JSON.stringify({
      _hp: 'chase_end',
      run: this.runNumber,
      outcome,
      durationSeconds: Math.round(this.elapsedTime * 10) / 10,
      stats: replay.stats,
      somaState: this.somas.map(s => ({
        id: s.id,
        chaseCount: s.chaseHistory.length,
        memory: s.memory.slice(0, 100),
      })),
    }));

    // Log full replay for analysis
    console.log(JSON.stringify({
      _hp: 'full_replay',
      replay,
    }));
  }

  private updatePostgame(): void {
    if (this.input.state.space) {
      this.input.state.space = false; // consume the input
      // Start reflection phase
      this.startReflection();
    }
  }

  private async startReflection(): Promise<void> {
    if (this.reflectionInProgress || !this.lastReplay) {
      // Skip reflection if no replay or already reflecting — go straight to next chase
      this.runNumber++;
      this.startChase();
      return;
    }

    this.phase = 'reflecting';
    this.reflectionInProgress = true;
    this.renderer.hideGameOver();
    this.renderer.showReflection('starting', this.somas);

    console.log(JSON.stringify({
      _hp: 'reflection_phase_start',
      run: this.runNumber,
      somaCount: this.somas.length,
    }));

    try {
      const results = await reflectAllActants(
        this.somas,
        this.lastReplay,
        API_ENDPOINT,
        {
          tiles: this.map.tiles,
          cols: this.map.cols,
          rows: this.map.rows,
          tileSize: this.map.tileSize,
        },
        undefined, // use default model
        (actantId, status, chaseMapBase64) => {
          this.renderer.updateReflectionProgress(actantId, status, this.somas, chaseMapBase64);
        },
        (update) => {
          this.renderer.appendTurnContent(update);
        },
        (actantId, summary, fullReasoning) => {
          this.renderer.setReflectionSummary(actantId, summary, fullReasoning);
        },
      );

      // Persist updated somas
      saveSomas(this.somas);
      clearHandlerCache();

      console.log(JSON.stringify({
        _hp: 'reflection_phase_complete',
        run: this.runNumber,
        results: results.map(r => ({
          actantId: r.actantId,
          success: r.success,
          handlersUpdated: r.handlersUpdated,
          memoryUpdated: r.memoryUpdated,
          toolsAdopted: r.toolsAdopted,
          tokens: r.tokenUsage,
        })),
      }));

      // Show "press space" prompt — the cards already have all the content
      this.renderer.showReflectionComplete();

      // Wait for player to press space to continue
      await this.waitForSpace();

    } catch (err) {
      console.log(JSON.stringify({
        _hp: 'reflection_phase_error',
        run: this.runNumber,
        error: String(err),
      }));
      // Show error but let the player continue
      this.renderer.showReflectionError(String(err));
      await this.waitForSpace();
    }

    this.reflectionInProgress = false;
    this.renderer.hideReflection();
    this.runNumber++;
    this.startChase();
  }

  private waitForSpace(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.input.state.space) {
          this.input.state.space = false;
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      // Small delay so we don't immediately consume a held space key
      setTimeout(check, 300);
    });
  }
}
