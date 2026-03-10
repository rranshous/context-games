// ── Game: Main Orchestrator ──
// Title -> Run -> Reflection -> After-Action -> Next Run

import { DesertWorld } from './desert-world';
import { Vehicle } from './vehicle';
import { Camera } from './camera';
import { DriverSoma, Objective, RunRecording } from './types';
import { createDefaultSoma, loadSoma, saveSoma, executeTick, clearCompileCache } from './soma';
import { RunRecorder } from './run-recorder';
import { SpeechInput } from './speech';
import { reflectDriver, ReflectionResult, TurnUpdate } from './reflection';
import { renderRunMap } from './run-map-renderer';
import { CONFIG } from './config';

type GameState = 'title' | 'running' | 'reflecting' | 'after_action';

// Colors
const BG_DARK = '#1a1a2e';
const TEXT_SAND = '#c2b280';
const TEXT_DIM = '#887a5a';
const TEXT_GREEN = '#33ff33';
const TEXT_RED = '#ff4444';
const TEXT_GOLD = '#ffd700';

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

  // After-action state
  private lastRecording: RunRecording | null = null;
  private lastMapBase64: string = '';
  private lastMapImage: HTMLImageElement | null = null;
  private reflectionResult: ReflectionResult | null = null;
  private reflectionText: string = '';
  private changeSummary: string = '';

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

  private consumeSpace(): boolean {
    if (this.spaceQueued) {
      this.spaceQueued = false;
      return true;
    }
    return false;
  }

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

        // Reset controls each frame
        this.vehicle.resetControls();

        // Execute soma tick
        executeTick(
          this.soma,
          this.vehicle,
          this.world,
          this.radioTranscript,
          this.objective,
          [], // no pursuers yet
        );

        // Physics
        this.vehicle.update(dt, this.world);

        // Camera follow
        this.camera.update(this.vehicle.x, this.vehicle.y);

        // Record position (every frame, recorder thins internally)
        if (this.recorder) {
          this.recorder.recordDriverPosition(
            { x: this.vehicle.x, y: this.vehicle.y },
            this.vehicle.speed,
            this.vehicle.angle,
          );
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

      case 'running':
        // World
        this.world.render(ctx, this.camera);
        // Objective marker
        this.renderObjectiveMarker();
        // Vehicle
        this.vehicle.render(ctx, this.camera);
        // HUD
        this.renderHUD();
        break;

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

    // Create new recorder
    this.recorder = new RunRecorder();
    this.recorder.recordEvent('run_start', `Run #${this.runCount} started`, { x: this.vehicle.x, y: this.vehicle.y });

    // Clear radio
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
    this.state = 'running';

    // Clear compile cache in case soma was updated
    clearCompileCache();

    console.log(JSON.stringify({
      _wm: 'run_start',
      runCount: this.runCount,
      objective: objPos,
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

    // Add to run history
    this.soma.runHistory.push({
      runId: this.runCount,
      outcome: recording.outcome,
      durationSeconds: recording.durationSeconds,
      distanceCovered: recording.distanceCovered,
      reachedObjective: outcome === 'delivered',
    });

    // Generate run map
    if (this.objective) {
      this.lastMapBase64 = renderRunMap(recording, this.world, this.objective.position);

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
    }));

    // Start reflection (async)
    this.doReflection(recording);
  }

  private async doReflection(recording: RunRecording): Promise<void> {
    try {
      const result = await reflectDriver(
        this.soma,
        recording,
        this.lastMapBase64,
        (update: TurnUpdate) => {
          // Streaming text update
          if (update.newText) {
            this.reflectionText += update.newText;
          }
          for (const tc of update.toolCalls) {
            const status = tc.result.success ? 'OK' : `FAILED: ${tc.result.error}`;
            this.reflectionText += `\n[TOOL: ${tc.name} -> ${status}]\n`;
          }
        },
      );

      this.reflectionResult = result;
      this.changeSummary = result.changeSummary;

      // Save soma after reflection
      saveSoma(this.soma);

    } catch (err) {
      this.reflectionText += `\n[REFLECTION ERROR: ${String(err)}]\n`;
      this.changeSummary = 'Reflection failed.';
    }

    // Transition to after-action
    this.state = 'after_action';
    this.scrollY = 0;
  }

  // ── HUD Rendering (during 'running' state) ──

  private renderHUD(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Top bar: timer + run count
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

    // Speed
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.vehicle.speed)} px/s`, W - 10, 16);

    // Objective distance
    if (this.objective) {
      const dx = this.vehicle.x - this.objective.position.x;
      const dy = this.vehicle.y - this.objective.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      ctx.textAlign = 'center';
      ctx.fillStyle = dist < 200 ? TEXT_GREEN : TEXT_SAND;
      ctx.fillText(`OBJ: ${Math.round(dist)}px`, W / 2, 32 + 16);
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

    // Objective arrow when off-screen
    this.renderObjectiveArrow();
  }

  private renderObjectiveMarker(): void {
    if (!this.objective) return;
    const ctx = this.ctx;
    const screen = this.camera.worldToScreen(this.objective.position.x, this.objective.position.y);

    // Only draw if on-screen
    if (screen.x < -20 || screen.x > CONFIG.CANVAS.WIDTH + 20 ||
        screen.y < -20 || screen.y > CONFIG.CANVAS.HEIGHT + 20) return;

    // Pulsing gold diamond
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

    // Label
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

    // If objective is on-screen, no arrow needed
    const arrowMargin = 40;
    if (screen.x >= arrowMargin && screen.x <= W - arrowMargin &&
        screen.y >= arrowMargin && screen.y <= H - arrowMargin) return;

    // Clamp to screen edge
    const cx = W / 2;
    const cy = H / 2;
    const angle = Math.atan2(screen.y - cy, screen.x - cx);

    // Find edge intersection
    const edgeMargin = 30;
    let edgeX: number, edgeY: number;

    // Try horizontal edges
    const tX = Math.abs(angle) < Math.PI / 2
      ? (W - edgeMargin - cx) / Math.cos(angle)
      : (-W + edgeMargin + cx) / Math.cos(angle);
    const tY = angle > 0
      ? (H - edgeMargin - cy) / Math.sin(angle)
      : (-H + edgeMargin + cy) / Math.sin(angle);

    const t = Math.min(Math.abs(tX), Math.abs(tY));
    edgeX = cx + Math.cos(angle) * t;
    edgeY = cy + Math.sin(angle) * t;

    // Clamp to screen
    edgeX = Math.max(edgeMargin, Math.min(W - edgeMargin, edgeX));
    edgeY = Math.max(edgeMargin, Math.min(H - edgeMargin, edgeY));

    // Draw arrow
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

    // Title
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('DRIVER IS REFLECTING...', W / 2, 30);

    // Spinning indicator
    const dots = '.'.repeat(Math.floor(performance.now() / 500) % 4);
    ctx.font = '16px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText(`Reviewing the run${dots}`, W / 2, 65);

    // Streaming reasoning text
    if (this.reflectionText) {
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT_DIM;

      const lines = this.wrapText(this.reflectionText, W - 80);
      // Show last ~30 lines
      const visibleLines = lines.slice(-30);
      const startY = 100;
      for (let i = 0; i < visibleLines.length; i++) {
        // Highlight tool calls
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

    // Layout: map on left (~420px), text on right (~520px)
    const mapAreaW = 420;
    const textX = mapAreaW + 20;
    const textW = W - textX - 20;

    // Apply scroll offset for text rendering
    const scroll = this.scrollY;

    // --- Left side: Run map ---
    if (this.lastMapImage) {
      const imgW = this.lastMapImage.naturalWidth;
      const imgH = this.lastMapImage.naturalHeight;
      const fitScale = Math.min((mapAreaW - 20) / imgW, (H - 80) / imgH);
      const drawW = imgW * fitScale;
      const drawH = imgH * fitScale;
      const drawX = 10;
      const drawY = 60;

      ctx.drawImage(this.lastMapImage, drawX, drawY, drawW, drawH);

      // Border
      ctx.strokeStyle = TEXT_DIM;
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
    } else {
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText('(Map loading...)', mapAreaW / 2, H / 2);
    }

    // --- Right side: Text content ---
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
    ctx.fillText(`Run #${this.runCount}`, textX, y); y += 28;

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

    // Reflection reasoning
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('REFLECTION:', textX, y); y += 20;

    if (this.reflectionText) {
      ctx.font = '10px monospace';
      const reasoningLines = this.wrapText(this.reflectionText, textW);
      // Cap at 40 lines to keep it readable
      const displayLines = reasoningLines.slice(0, 40);
      for (const line of displayLines) {
        if (line.includes('[TOOL:')) {
          ctx.fillStyle = TEXT_GREEN;
        } else {
          ctx.fillStyle = TEXT_DIM;
        }
        ctx.fillText(line, textX, y);
        y += 13;
      }
      if (reasoningLines.length > 40) {
        ctx.fillStyle = TEXT_DIM;
        ctx.fillText(`... (${reasoningLines.length - 40} more lines)`, textX, y);
        y += 13;
      }
    }
    y += 12;

    // Change summary
    if (this.changeSummary) {
      ctx.strokeStyle = TEXT_DIM;
      ctx.beginPath();
      ctx.moveTo(textX, y);
      ctx.lineTo(textX + textW, y);
      ctx.stroke();
      y += 12;

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = TEXT_GREEN;
      ctx.fillText('WHAT CHANGED:', textX, y); y += 20;

      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_SAND;
      const summaryLines = this.wrapText(this.changeSummary, textW);
      for (const line of summaryLines) {
        ctx.fillText(line, textX, y); y += 16;
      }
      y += 12;
    }

    // Token usage
    if (this.reflectionResult?.tokenUsage) {
      ctx.font = '10px monospace';
      ctx.fillStyle = TEXT_DIM;
      const t = this.reflectionResult.tokenUsage;
      ctx.fillText(`tokens: ${t.input} in / ${t.output} out`, textX, y);
      y += 20;
    }

    // "Press space" prompt — fixed at bottom, not scrolled
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SAND;
    const pulse = Math.sin(performance.now() / 400) > 0;
    if (pulse) {
      ctx.fillText('PRESS SPACE FOR NEXT RUN', W / 2, H - 30);
    }
  }

  // ── Title Screen ──

  private renderTitle(): void {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = BG_DARK;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_SAND;
    ctx.fillText('WHEELMAN', W / 2, H / 2 - 80);

    // Subtitle
    ctx.font = '16px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText("You're the boss. Your driver is an AI.", W / 2, H / 2 - 30);

    ctx.font = '14px monospace';
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText('Watch the drone feed. Yell into the mic.', W / 2, H / 2);
    ctx.fillText('The driver listens to your radio and learns.', W / 2, H / 2 + 22);

    // Run history
    if (this.soma.runHistory.length > 0) {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_DIM;
      const last = this.soma.runHistory[this.soma.runHistory.length - 1];
      ctx.fillText(
        `Last run: ${last.outcome} (${Math.round(last.durationSeconds)}s) | Total runs: ${this.soma.runHistory.length}`,
        W / 2, H / 2 + 55,
      );
    }

    // Speech warning
    if (!this.speech.supported) {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_RED;
      ctx.fillText('WARNING: Speech recognition not supported in this browser.', W / 2, H / 2 + 85);
      ctx.fillText('Use Chrome for voice input.', W / 2, H / 2 + 102);
    } else {
      ctx.font = '12px monospace';
      ctx.fillStyle = TEXT_GREEN;
      ctx.fillText('Microphone ready.', W / 2, H / 2 + 85);
    }

    // Press space
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = TEXT_SAND;
    const pulse = Math.sin(performance.now() / 400) > 0;
    if (pulse) {
      ctx.fillText('PRESS SPACE TO START', W / 2, H / 2 + 140);
    }
  }

  // ── Utility ──

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const ctx = this.ctx;

    // Split on newlines first
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
