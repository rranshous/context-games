// src/visualizer/controls.ts
var Controls = class {
  container;
  send;
  paused = false;
  speed = 10;
  constructor(container, send2) {
    this.container = container;
    this.send = send2;
    this.build();
  }
  build() {
    this.container.innerHTML = "";
    this.container.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #1a1a2e; color: #ddd;
      font-family: monospace; font-size: 13px;
      border-bottom: 1px solid #333;
    `;
    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "\u23F8 Pause";
    pauseBtn.style.cssText = btnStyle();
    pauseBtn.onclick = () => {
      this.paused = !this.paused;
      this.send({ type: this.paused ? "pause" : "resume" });
      pauseBtn.textContent = this.paused ? "\u25B6 Resume" : "\u23F8 Pause";
    };
    this.container.appendChild(pauseBtn);
    const speedLabel = document.createElement("span");
    speedLabel.textContent = `Speed: ${this.speed} t/s`;
    this.container.appendChild(speedLabel);
    const speedSlider = document.createElement("input");
    speedSlider.type = "range";
    speedSlider.min = "1";
    speedSlider.max = "60";
    speedSlider.value = String(this.speed);
    speedSlider.style.cssText = "width: 120px; cursor: pointer;";
    speedSlider.oninput = () => {
      this.speed = parseInt(speedSlider.value);
      speedLabel.textContent = `Speed: ${this.speed} t/s`;
      this.send({ type: "setSpeed", ticksPerSecond: this.speed });
    };
    this.container.appendChild(speedSlider);
    const logEl = document.createElement("span");
    logEl.id = "sim-log";
    logEl.style.cssText = "margin-left: auto; color: #888; font-size: 11px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
    this.container.appendChild(logEl);
  }
  showLog(message) {
    const el = document.getElementById("sim-log");
    if (el) el.textContent = message;
  }
};
function btnStyle() {
  return `
    padding: 4px 12px; cursor: pointer;
    background: #2a2a4e; color: #ddd; border: 1px solid #444;
    border-radius: 4px; font-family: monospace; font-size: 13px;
  `;
}

// src/visualizer/renderer.ts
var TERRAIN_COLORS = {
  grass: "#4a7c3f",
  forest: "#2d5a27",
  water: "#2a5c8f",
  rock: "#6b6b6b",
  sand: "#c4a954"
};
var FOOD_COLOR = "#e8d44d";
var Renderer = class {
  canvas;
  ctx;
  state = null;
  stats = null;
  cellSize = 10;
  animFrame = 0;
  constructor(canvas2) {
    this.canvas = canvas2;
    this.ctx = canvas2.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.startRenderLoop();
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    if (this.state) {
      const maxW = rect.width / this.state.width;
      const maxH = (rect.height - 70) / this.state.height;
      this.cellSize = Math.max(2, Math.floor(Math.min(maxW, maxH)));
    }
  }
  updateState(state) {
    this.state = state;
    this.stats = state.stats;
    const rect = this.canvas.getBoundingClientRect();
    const maxW = rect.width / state.width;
    const maxH = (rect.height - 70) / state.height;
    this.cellSize = Math.max(2, Math.floor(Math.min(maxW, maxH)));
  }
  updateStats(stats) {
    this.stats = stats;
  }
  startRenderLoop() {
    const render = () => {
      this.draw();
      this.animFrame = requestAnimationFrame(render);
    };
    this.animFrame = requestAnimationFrame(render);
  }
  draw() {
    const { ctx } = this;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!this.state) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#aaa";
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Starting simulation...", rect.width / 2, rect.height / 2);
      return;
    }
    const s = this.cellSize;
    const offsetX = Math.floor((rect.width - s * this.state.width) / 2);
    const offsetY = 10;
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const cell = this.state.cells[y * this.state.width + x];
        ctx.fillStyle = TERRAIN_COLORS[cell.terrain];
        ctx.fillRect(offsetX + x * s, offsetY + y * s, s, s);
        if (cell.danger > 0) {
          const alpha = Math.min(0.5, cell.danger * 0.12);
          ctx.fillStyle = `rgba(200, 30, 30, ${alpha})`;
          ctx.fillRect(offsetX + x * s, offsetY + y * s, s, s);
        }
        if (cell.food > 0) {
          ctx.fillStyle = FOOD_COLOR;
          const foodSize = Math.min(s * 0.6, 2 + cell.food);
          const pad = (s - foodSize) / 2;
          ctx.fillRect(
            offsetX + x * s + pad,
            offsetY + y * s + pad,
            foodSize,
            foodSize
          );
        }
      }
    }
    if (s >= 6) {
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= this.state.width; x++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + x * s, offsetY);
        ctx.lineTo(offsetX + x * s, offsetY + this.state.height * s);
        ctx.stroke();
      }
      for (let y = 0; y <= this.state.height; y++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY + y * s);
        ctx.lineTo(offsetX + this.state.width * s, offsetY + y * s);
        ctx.stroke();
      }
    }
    for (const creature of this.state.creatures) {
      this.drawCreature(ctx, creature, offsetX, offsetY, s);
    }
    this.drawStats(ctx, rect.width, offsetY + this.state.height * s + 10);
  }
  drawCreature(ctx, c, ox, oy, s) {
    const cx = ox + c.x * s + s / 2;
    const cy = oy + c.y * s + s / 2;
    const radius = Math.max(2, s * 0.35 * (0.5 + c.genome.size * 0.35));
    const r = Math.floor(c.genome.diet * 220 + 30);
    const g = Math.floor((1 - c.genome.diet) * 180 + 40);
    const b = 60;
    const brightness = 0.3 + c.energy / c.maxEnergy * 0.7;
    ctx.fillStyle = `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.energy / c.maxEnergy > 0.3 ? "rgba(255,255,255,0.4)" : "rgba(255,60,60,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2 * (c.energy / c.maxEnergy));
    ctx.stroke();
  }
  drawStats(ctx, width, y) {
    if (!this.stats) return;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, y - 5, width, 60);
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    const s = this.stats;
    ctx.fillStyle = "#ddd";
    const deaths = s.deathsByStarvation !== void 0 ? `Died: ${s.totalDeaths} (${s.deathsByStarvation}\u2620 ${s.deathsByHazard}\u26A1)` : `Died: ${s.totalDeaths}`;
    ctx.fillText(`Tick: ${s.tick}  |  Alive: ${s.creatureCount}  |  Born: ${s.totalBirths}  |  ${deaths}  |  Energy: ${s.avgEnergy}  |  Gen: ${s.maxGeneration}`, 10, y + 12);
    if (s.avgTraits) {
      const t = s.avgTraits;
      ctx.fillStyle = "#999";
      ctx.fillText(`Traits \u2014 spd: ${t.speed}  sns: ${t.senseRange}  sz: ${t.size}  met: ${t.metabolism}  diet: ${t.diet}`, 10, y + 28);
    }
  }
  destroy() {
    cancelAnimationFrame(this.animFrame);
  }
};

// src/visualizer/main.ts
var canvas = document.getElementById("canvas");
var controlsEl = document.getElementById("controls");
var renderer = new Renderer(canvas);
var worker = new Worker("worker.js", { type: "module" });
function send(cmd) {
  worker.postMessage(cmd);
}
var controls = new Controls(controlsEl, send);
worker.onmessage = (e) => {
  const event = e.data;
  switch (event.type) {
    case "state":
      renderer.updateState(event.state);
      break;
    case "stats":
      renderer.updateStats(event.stats);
      break;
    case "creature:died":
      break;
    case "creature:spawned":
      break;
    case "log":
      controls.showLog(event.message);
      console.log(`[SIM] ${event.message}`);
      break;
  }
};
worker.onerror = (e) => {
  console.error("Worker error:", e);
  controls.showLog(`Error: ${e.message}`);
};
send({ type: "start" });
//# sourceMappingURL=main.js.map
