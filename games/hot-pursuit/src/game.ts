// ── Game State Manager: Chase Lifecycle ──

import {
  GameConfig, DEFAULT_CONFIG, GamePhase, ChaseOutcome,
  ChaseReplay, PoliceEntity, TileType,
} from './types';
import { TileMap } from './map';
import { Player, InputHandler } from './player';
import { createPolice, updatePolice, distanceToPlayer } from './police';
import { ReplayRecorder } from './replay';
import { Renderer } from './renderer';

const CAPTURE_DISTANCE = 18; // pixels — close enough to catch

export class Game {
  private config: GameConfig;
  private map: TileMap;
  private player: Player;
  private police: PoliceEntity[] = [];
  private input: InputHandler;
  private renderer: Renderer;
  private recorder: ReplayRecorder;
  private phase: GamePhase = 'pregame';
  private runNumber: number = 1;
  private chaseStartTime: number = 0;
  private elapsedTime: number = 0;
  private replays: ChaseReplay[] = [];

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

    // Initialize player at spawn
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player = new Player(spawnWorld, this.config);

    console.log(JSON.stringify({
      _hp: 'init',
      mapSize: { cols: this.map.cols, rows: this.map.rows },
      tileSize: this.config.tileSize,
      extractionPoints: this.map.extractionPoints,
      playerSpawn: this.map.playerSpawn,
      policeSpawns: this.map.policeSpawns,
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

    // Reset player to spawn
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player.pos = { ...spawnWorld };
    this.player.facing = { x: 0, y: -1 };

    // Create police
    this.police = this.map.policeSpawns.map((spawn, i) =>
      createPolice(i, spawn, this.map, this.config)
    );

    // New recorder
    this.recorder = new ReplayRecorder(this.runNumber);
    this.recorder.start();

    this.renderer.hideGameOver();

    console.log(JSON.stringify({
      _hp: 'chase_start',
      run: this.runNumber,
      policeCount: this.police.length,
      police: this.police.map(p => ({ id: p.id, name: p.name, pos: p.pos })),
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
    this.tickCount++;
    this.elapsedTime = (performance.now() - this.chaseStartTime) / 1000;

    // Update player
    const action = this.player.update(dt, this.input.state, this.map);

    // Update police
    for (const p of this.police) {
      updatePolice(p, this.player.pos, this.map, this.config, dt);
    }

    // Record tick
    this.recorder.recordTick(this.player.pos, action, this.police);

    // Check win/lose conditions
    const outcome = this.checkOutcome();
    if (outcome) {
      this.endChase(outcome);
    }
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

    const escaped = outcome === 'escaped' || outcome === 'timeout';
    this.renderer.showGameOver(outcome, escaped);

    console.log(JSON.stringify({
      _hp: 'chase_end',
      run: this.runNumber,
      outcome,
      durationSeconds: Math.round(this.elapsedTime * 10) / 10,
      stats: replay.stats,
    }));

    // Log full replay for analysis
    console.log(JSON.stringify({
      _hp: 'full_replay',
      replay,
    }));
  }

  private updatePostgame(): void {
    if (this.input.state.space) {
      // Start next chase
      this.runNumber++;
      this.input.state.space = false; // consume the input
      this.startChase();
    }
  }
}
