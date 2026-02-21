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
    const brainBtn = document.createElement("button");
    brainBtn.textContent = "Brain: ON";
    brainBtn.style.cssText = btnStyle();
    let consciousnessEnabled = true;
    brainBtn.onclick = () => {
      consciousnessEnabled = !consciousnessEnabled;
      this.send({ type: "toggleConsciousness", enabled: consciousnessEnabled });
      brainBtn.textContent = consciousnessEnabled ? "Brain: ON" : "Brain: OFF";
    };
    this.container.appendChild(brainBtn);
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

// src/visualizer/history.ts
var MAX_ENTRIES_PER_CREATURE = 200;
var CreatureHistoryStore = class {
  timelines = /* @__PURE__ */ new Map();
  /** Process a sim event and append to the relevant creature timeline */
  handleEvent(event) {
    switch (event.type) {
      case "creature:spawned":
        this.append(event.creature.id, {
          type: "born",
          tick: event.tick,
          generation: event.creature.generation,
          parentId: event.creature.parentId
        });
        break;
      case "creature:ate":
        this.append(event.id, {
          type: "ate",
          tick: event.tick,
          foodValue: event.foodValue,
          x: event.x,
          y: event.y
        });
        break;
      case "creature:woke":
        this.append(event.id, {
          type: "woke",
          tick: event.tick,
          reason: event.reason,
          thoughts: event.thoughts,
          toolsUsed: event.toolsUsed
        });
        break;
      case "creature:reproduced":
        this.append(event.parentId, {
          type: "reproduced",
          tick: event.tick,
          childId: event.childId
        });
        break;
      case "creature:died":
        this.append(event.id, {
          type: "died",
          tick: event.tick,
          cause: event.cause
        });
        break;
    }
  }
  /** Get the full timeline for a creature (oldest first) */
  getTimeline(id) {
    return this.timelines.get(id) ?? [];
  }
  /** Get the most recent consciousness wake-up for a creature */
  getLastWake(id) {
    const timeline = this.timelines.get(id);
    if (!timeline) return null;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === "woke") return timeline[i];
    }
    return null;
  }
  /** Check if a creature has died */
  isDead(id) {
    const timeline = this.timelines.get(id);
    if (!timeline || timeline.length === 0) return false;
    return timeline[timeline.length - 1].type === "died";
  }
  append(creatureId, entry) {
    let timeline = this.timelines.get(creatureId);
    if (!timeline) {
      timeline = [];
      this.timelines.set(creatureId, timeline);
    }
    timeline.push(entry);
    if (timeline.length > MAX_ENTRIES_PER_CREATURE) {
      timeline.splice(0, timeline.length - MAX_ENTRIES_PER_CREATURE);
    }
  }
};

// src/visualizer/inspector.ts
var Inspector = class {
  el;
  onNavigate = null;
  visible = false;
  constructor(container) {
    this.el = container;
    this.el.innerHTML = "";
    this.hide();
  }
  /** Set callback for when user clicks a creature ID link */
  setOnNavigate(fn) {
    this.onNavigate = fn;
  }
  show() {
    this.visible = true;
    this.el.style.display = "flex";
  }
  hide() {
    this.visible = false;
    this.el.style.display = "none";
    this.el.innerHTML = "";
  }
  /** Update the panel with fresh creature state + timeline */
  update(creature, timeline, dead) {
    if (!creature && !dead) {
      this.hide();
      return;
    }
    if (!this.visible) this.show();
    if (!creature && dead) {
      this.el.innerHTML = this.renderDeadPlaceholder(timeline);
      this.bindLinks();
      return;
    }
    if (!creature) return;
    this.el.innerHTML = this.render(creature, timeline, dead);
    this.bindLinks();
  }
  render(c, timeline, dead) {
    return `
      ${this.renderHeader(c, dead)}
      ${this.renderVitals(c, dead)}
      ${this.renderGenome(c)}
      ${this.renderReflexes(c)}
      ${this.renderEmbodiment(c)}
      ${this.renderMemory(c)}
      ${this.renderTimeline(timeline)}
    `;
  }
  renderDeadPlaceholder(timeline) {
    const bornEntry = timeline.find((e) => e.type === "born");
    const diedEntry = timeline.find((e) => e.type === "died");
    return `
      <div class="insp-header">
        <span class="insp-title">Creature (dead)</span>
        <button class="insp-close" title="Close">&times;</button>
      </div>
      <div class="insp-section">
        <div class="insp-muted">This creature is no longer alive.</div>
        ${bornEntry ? `<div class="insp-muted">Lived: tick ${bornEntry.tick} - ${diedEntry ? `tick ${diedEntry.tick}` : "?"}</div>` : ""}
      </div>
      ${this.renderTimeline(timeline)}
    `;
  }
  renderHeader(c, dead) {
    const status = dead ? ' <span class="insp-dead-badge">DEAD</span>' : "";
    const parentLink = c.parentId != null ? `<a class="insp-link" data-creature-id="${c.parentId}">#${c.parentId}</a>` : "none";
    return `
      <div class="insp-header">
        <span class="insp-title">Creature #${c.id}${status}</span>
        <button class="insp-close" title="Close">&times;</button>
      </div>
      <div class="insp-subheader">
        Gen ${c.generation} &bull; Age ${c.age} &bull; Parent: ${parentLink}
      </div>
    `;
  }
  renderVitals(c, dead) {
    const pct = dead ? 0 : Math.round(c.energy / c.maxEnergy * 100);
    const barColor = pct > 30 ? "#4caf50" : pct > 10 ? "#ff9800" : "#f44336";
    return `
      <div class="insp-section">
        <div class="insp-energy-bar">
          <div class="insp-energy-fill" style="width:${pct}%;background:${barColor}"></div>
          <span class="insp-energy-text">${dead ? "Dead" : `${c.energy} / ${c.maxEnergy} (${pct}%)`}</span>
        </div>
        <div class="insp-row">Pos: (${c.x}, ${c.y}) &bull; Hungry: ${c.ticksSinceAte} ticks</div>
      </div>
    `;
  }
  renderGenome(c) {
    const g = c.genome;
    const traits = [
      { name: "speed", val: g.speed, min: 0.5, max: 2 },
      { name: "sense", val: g.senseRange, min: 2, max: 8 },
      { name: "size", val: g.size, min: 0.5, max: 2 },
      { name: "metabolism", val: g.metabolism, min: 0.5, max: 1.5 },
      { name: "diet", val: g.diet, min: 0, max: 1 },
      { name: "wakeInterval", val: g.wakeInterval, min: 30, max: 200 },
      { name: "embSize", val: g.maxEmbodimentSize, min: 500, max: 8e3 }
    ];
    const rows = traits.map((t) => {
      const pct = Math.round((t.val - t.min) / (t.max - t.min) * 100);
      return `
        <div class="insp-trait">
          <span class="insp-trait-name">${t.name}</span>
          <div class="insp-trait-bar"><div class="insp-trait-fill" style="width:${pct}%"></div></div>
          <span class="insp-trait-val">${Number.isInteger(t.val) ? t.val : t.val.toFixed(2)}</span>
        </div>`;
    }).join("");
    return `<div class="insp-section"><div class="insp-section-title">Genome</div>${rows}</div>`;
  }
  renderReflexes(c) {
    const base = c.genome.reflexWeights;
    const adj = c.reflexAdjustments;
    const reflexes = [
      { name: "foodAttraction", b: base.foodAttraction, a: adj.foodAttraction },
      { name: "dangerAvoidance", b: base.dangerAvoidance, a: adj.dangerAvoidance },
      { name: "curiosity", b: base.curiosity, a: adj.curiosity },
      { name: "restThreshold", b: base.restThreshold, a: adj.restThreshold },
      { name: "sociality", b: base.sociality, a: adj.sociality }
    ];
    const rows = reflexes.map((r) => {
      const eff = r.b + r.a;
      const pct = Math.round(Math.max(0, Math.min(1, eff / 2)) * 100);
      const adjStr = r.a !== 0 ? ` <span class="reflex-adj">${r.a >= 0 ? "+" : ""}${r.a.toFixed(2)}</span>` : "";
      return `
        <div class="insp-trait">
          <span class="insp-trait-name">${r.name}</span>
          <div class="insp-trait-bar"><div class="insp-trait-fill reflex" style="width:${pct}%"></div></div>
          <span class="insp-trait-val">${eff.toFixed(2)}${adjStr}</span>
        </div>`;
    }).join("");
    return `<div class="insp-section"><div class="insp-section-title">Reflexes (base + adj)</div>${rows}</div>`;
  }
  renderEmbodiment(c) {
    const e = c.embodiment;
    const sections = [
      { name: "identity", content: e.identity, type: "text" },
      { name: "sensors", content: e.sensors, type: "code" },
      { name: "on_tick", content: e.on_tick, type: "code" },
      { name: "tools", content: e.tools, type: "json" }
    ];
    const totalSize = e.identity.length + e.sensors.length + e.on_tick.length + e.memory.length + e.tools.length;
    const rows = sections.map((s) => {
      const preview = s.content.length > 80 ? s.content.slice(0, 80) + "..." : s.content;
      return `
        <div class="insp-emb-section">
          <span class="emb-name">${s.name}</span> <span class="emb-size">(${s.content.length})</span>
          <div class="emb-preview">${esc(preview)}</div>
        </div>`;
    }).join("");
    return `<div class="insp-section"><div class="insp-section-title">Embodiment (${totalSize} chars)</div>${rows}</div>`;
  }
  renderMemory(c) {
    let entries;
    try {
      const mem = JSON.parse(c.embodiment.memory || "{}");
      entries = Object.entries(mem);
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      return `<div class="insp-section"><div class="insp-section-title">Memory</div><div class="insp-muted">Empty</div></div>`;
    }
    const rows = entries.map(
      ([k, v]) => `<div class="insp-mem"><span class="insp-mem-key">${esc(k)}</span>: <span class="insp-mem-val">${esc(String(v))}</span></div>`
    ).join("");
    return `<div class="insp-section"><div class="insp-section-title">Memory (${entries.length})</div>${rows}</div>`;
  }
  renderTimeline(timeline) {
    if (timeline.length === 0) {
      return `<div class="insp-section insp-timeline"><div class="insp-section-title">Timeline</div><div class="insp-muted">No events yet</div></div>`;
    }
    const reversed = [...timeline].reverse();
    const rows = reversed.map((e) => this.renderTimelineEntry(e)).join("");
    return `<div class="insp-section insp-timeline"><div class="insp-section-title">Timeline (${timeline.length})</div>${rows}</div>`;
  }
  renderTimelineEntry(e) {
    switch (e.type) {
      case "born": {
        const parentLink = e.parentId != null ? `from <a class="insp-link" data-creature-id="${e.parentId}">#${e.parentId}</a>` : "spawned";
        return `<div class="tl-entry tl-born"><span class="tl-tick">t${e.tick}</span> Born (gen ${e.generation}) ${parentLink}</div>`;
      }
      case "ate":
        return `<div class="tl-entry tl-ate"><span class="tl-tick">t${e.tick}</span> Ate (${e.foodValue.toFixed(1)}) at (${e.x},${e.y})</div>`;
      case "woke": {
        const tools = e.toolsUsed.length > 0 ? e.toolsUsed.map((t) => `<div class="tl-tool">&rarr; ${esc(t)}</div>`).join("") : "";
        return `
          <div class="tl-entry tl-woke">
            <span class="tl-tick">t${e.tick}</span> <span class="tl-brain">Brain</span> (${esc(e.reason)})
            <div class="tl-thoughts">${esc(e.thoughts)}</div>
            ${tools}
          </div>`;
      }
      case "reproduced":
        return `<div class="tl-entry tl-reproduced"><span class="tl-tick">t${e.tick}</span> Reproduced &rarr; <a class="insp-link" data-creature-id="${e.childId}">#${e.childId}</a></div>`;
      case "died":
        return `<div class="tl-entry tl-died"><span class="tl-tick">t${e.tick}</span> Died (${esc(e.cause)})</div>`;
    }
  }
  bindLinks() {
    const closeBtn = this.el.querySelector(".insp-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.hide();
        this.onNavigate?.(-1);
      });
    }
    for (const link of this.el.querySelectorAll(".insp-link")) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const id = Number(link.dataset.creatureId);
        if (!isNaN(id) && id >= 0) {
          this.onNavigate?.(id);
        }
      });
    }
  }
};
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  /** Currently selected creature ID (null = none) */
  selectedCreatureId = null;
  /** Callback fired when selection changes */
  onSelectCreature = null;
  constructor(canvas2) {
    this.canvas = canvas2;
    this.ctx = canvas2.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("click", (e) => this.handleClick(e));
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
    if (c.thinking) {
      const pulsePhase = Date.now() % 1e3 / 1e3;
      const pulseAlpha = 0.3 + Math.sin(pulsePhase * Math.PI * 2) * 0.2;
      ctx.fillStyle = `rgba(100, 180, 255, ${pulseAlpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (c.id === this.selectedCreatureId) {
      const pulsePhase = Date.now() % 1500 / 1500;
      const pulseAlpha = 0.5 + Math.sin(pulsePhase * Math.PI * 2) * 0.3;
      ctx.strokeStyle = `rgba(255, 220, 80, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  handleClick(e) {
    if (!this.state) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = this.cellSize;
    const offsetX = Math.floor((rect.width - s * this.state.width) / 2);
    const offsetY = 10;
    let bestId = null;
    let bestDist = Infinity;
    for (const c of this.state.creatures) {
      const cx = offsetX + c.x * s + s / 2;
      const cy = offsetY + c.y * s + s / 2;
      const radius = Math.max(2, s * 0.35 * (0.5 + c.genome.size * 0.35));
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < radius + 6 && dist < bestDist) {
        bestDist = dist;
        bestId = c.id;
      }
    }
    if (bestId === this.selectedCreatureId) {
      bestId = null;
    }
    this.selectedCreatureId = bestId;
    this.onSelectCreature?.(bestId);
  }
  /** Programmatically select a creature (e.g. from inspector link) */
  selectCreature(id) {
    this.selectedCreatureId = id;
    this.onSelectCreature?.(id);
  }
  destroy() {
    cancelAnimationFrame(this.animFrame);
  }
};

// src/visualizer/main.ts
var canvas = document.getElementById("canvas");
var controlsEl = document.getElementById("controls");
var inspectorEl = document.getElementById("inspector");
var renderer = new Renderer(canvas);
var history = new CreatureHistoryStore();
var inspector = new Inspector(inspectorEl);
var worker = new Worker("worker.js", { type: "module" });
function send(cmd) {
  worker.postMessage(cmd);
}
var controls = new Controls(controlsEl, send);
var selectedId = null;
var lastCreatures = [];
function selectCreature(id) {
  selectedId = id;
  renderer.selectedCreatureId = id;
  updateInspector();
}
function updateInspector() {
  if (selectedId == null) {
    inspector.hide();
    triggerResize();
    return;
  }
  const creature = lastCreatures.find((c) => c.id === selectedId) ?? null;
  const timeline = history.getTimeline(selectedId);
  const dead = history.isDead(selectedId);
  if (!creature && !dead) {
    selectedId = null;
    renderer.selectedCreatureId = null;
    inspector.hide();
    triggerResize();
    return;
  }
  inspector.update(creature, timeline, dead);
  triggerResize();
}
function triggerResize() {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
}
renderer.onSelectCreature = (id) => {
  selectCreature(id);
};
inspector.setOnNavigate((id) => {
  if (id < 0) {
    selectCreature(null);
  } else {
    selectCreature(id);
    renderer.selectedCreatureId = id;
  }
});
worker.onmessage = (e) => {
  const event = e.data;
  history.handleEvent(event);
  switch (event.type) {
    case "state":
      renderer.updateState(event.state);
      lastCreatures = event.state.creatures;
      if (selectedId != null) updateInspector();
      break;
    case "stats":
      renderer.updateStats(event.stats);
      break;
    case "creature:died":
      if (event.id === selectedId) updateInspector();
      break;
    case "creature:spawned":
      break;
    case "creature:woke":
      console.log(`[CONSCIOUSNESS] Creature #${event.id} (${event.reason}): ${event.thoughts}`);
      if (event.toolsUsed.length > 0) {
        console.log(`[CONSCIOUSNESS] Tools:`, event.toolsUsed);
      }
      controls.showLog(`[BRAIN] #${event.id}: ${event.thoughts.slice(0, 60)}`);
      if (event.id === selectedId) updateInspector();
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
window.__debug = {
  get creatures() {
    return lastCreatures;
  },
  get history() {
    return history;
  },
  select: selectCreature,
  renderer,
  dumpEmbodiment(id) {
    const c = lastCreatures.find((c2) => c2.id === id);
    if (!c) {
      console.log("Creature not found");
      return;
    }
    console.log(`
=== Embodiment for Creature #${id} ===`);
    console.log(`<identity>
${c.embodiment.identity}
</identity>`);
    console.log(`<sensors>
${c.embodiment.sensors}
</sensors>`);
    console.log(`<on_tick>
${c.embodiment.on_tick}
</on_tick>`);
    console.log(`<memory>
${c.embodiment.memory}
</memory>`);
    console.log(`<tools>
${c.embodiment.tools}
</tools>`);
  }
};
send({ type: "start" });
//# sourceMappingURL=main.js.map
