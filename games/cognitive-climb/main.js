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

// src/visualizer/observer.ts
function buildObserverContext(creatures, cells, stats, eventBuffer, recentlyEditedIds2, previousScratchpad) {
  const lines = [];
  const tick = stats.tick;
  lines.push(`=== SIMULATION SNAPSHOT (Tick ${tick}) ===
`);
  lines.push("GLOBAL STATS");
  const seasonLabel = stats.season ? stats.season.charAt(0).toUpperCase() + stats.season.slice(1) : "Unknown";
  lines.push(`Season: ${seasonLabel} | Alive: ${stats.creatureCount} | Born: ${stats.totalBirths} | Died: ${stats.totalDeaths} (starvation: ${stats.deathsByStarvation}, hazard: ${stats.deathsByHazard})`);
  const avgEnergyPct = creatures.length > 0 ? Math.round(creatures.reduce((s, c) => s + c.energy / c.maxEnergy, 0) / creatures.length * 100) : 0;
  lines.push(`Avg energy: ${avgEnergyPct}% of max | Max generation: ${stats.maxGeneration}`);
  if (stats.avgTraits) {
    const t = stats.avgTraits;
    lines.push(`Traits: spd=${t.speed.toFixed(2)}, sns=${t.senseRange.toFixed(1)}, sz=${t.size.toFixed(2)}, met=${t.metabolism.toFixed(2)}, diet=${t.diet.toFixed(2)}`);
  }
  const foodCells = cells.filter((c) => c.food > 0).length;
  lines.push(`Food available: ${foodCells} cells with food (out of ${cells.length} total)
`);
  lines.push("BEHAVIORAL GENETICS");
  const variantMap = /* @__PURE__ */ new Map();
  for (const c of creatures) {
    const len = c.embodiment.on_tick.length;
    const existing = variantMap.get(len);
    if (existing) {
      existing.count++;
    } else {
      variantMap.set(len, { count: 1, sample: c.embodiment.on_tick });
    }
  }
  const variants = [...variantMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const defaultLen = 953;
  lines.push("Variant distribution (by char count \u2014 creatures sharing length share inherited code):");
  for (const [len, { count }] of variants.slice(0, 5)) {
    const pct = creatures.length > 0 ? Math.round(count / creatures.length * 100) : 0;
    const marker = len <= defaultLen + 20 ? " \u2190 default" : "";
    lines.push(`  ${len} chars: ${count} creatures (${pct}%)${marker}`);
  }
  const defaultCount = variants.find(([len]) => len <= defaultLen + 20)?.[1].count ?? 0;
  if (defaultCount === 0) {
    lines.push("  (default code is extinct \u2014 all creatures have self-modified or inherited modified code)");
  }
  lines.push("");
  let codeBlocksShown = 0;
  if (variants.length > 0) {
    const [domLen, { count: domCount, sample: domCode }] = variants[0];
    const domPct = creatures.length > 0 ? Math.round(domCount / creatures.length * 100) : 0;
    lines.push(`DOMINANT VARIANT CODE (${domLen} chars, ${domCount} creatures, ${domPct}%):`);
    lines.push("```js");
    lines.push(domCode);
    lines.push("```\n");
    codeBlocksShown++;
    if (variants.length > 1) {
      const [ruLen, { count: ruCount, sample: ruCode }] = variants[1];
      const ruPct = creatures.length > 0 ? Math.round(ruCount / creatures.length * 100) : 0;
      if (ruPct > 5) {
        lines.push(`RUNNER-UP VARIANT CODE (${ruLen} chars, ${ruCount} creatures, ${ruPct}%):`);
        lines.push("```js");
        lines.push(ruCode);
        lines.push("```\n");
        codeBlocksShown++;
      }
    }
  }
  const shownLengths = new Set(variants.slice(0, codeBlocksShown).map(([len]) => len));
  const recentEdited = recentlyEditedIds2.map((id) => creatures.find((c) => c.id === id)).filter((c) => c != null && !shownLengths.has(c.embodiment.on_tick.length)).slice(0, 2);
  if (recentEdited.length > 0) {
    lines.push("RECENTLY EDITED CREATURES:");
    for (const c of recentEdited) {
      lines.push(`#${c.id} (Gen ${c.generation}, age ${c.age}) just edited on_tick \u2014 current code:`);
      lines.push("```js");
      lines.push(c.embodiment.on_tick);
      lines.push("```");
    }
    lines.push("");
  }
  const genMap = /* @__PURE__ */ new Map();
  for (const c of creatures) {
    genMap.set(c.generation, (genMap.get(c.generation) ?? 0) + 1);
  }
  const gens = [...genMap.entries()].sort((a, b) => a[0] - b[0]);
  lines.push("GENERATION DISTRIBUTION");
  lines.push(gens.map(([g, n]) => `Gen ${g}: ${n}`).join(" | "));
  lines.push("");
  lines.push("NOTABLE CREATURES");
  if (creatures.length > 0) {
    const oldest = creatures.reduce((a, b) => a.age > b.age ? a : b);
    const healthiest = creatures.reduce((a, b) => a.energy / a.maxEnergy > b.energy / b.maxEnergy ? a : b);
    const thinking = creatures.filter((c) => c.thinking);
    lines.push(`Oldest alive: #${oldest.id} (Gen ${oldest.generation}, age ${oldest.age}, energy ${Math.round(oldest.energy)}/${Math.round(oldest.maxEnergy)} = ${Math.round(oldest.energy / oldest.maxEnergy * 100)}%)`);
    lines.push(`Highest energy: #${healthiest.id} (Gen ${healthiest.generation}, ${Math.round(healthiest.energy)}/${Math.round(healthiest.maxEnergy)} = ${Math.round(healthiest.energy / healthiest.maxEnergy * 100)}%, age ${healthiest.age})`);
    lines.push(`Currently thinking: ${thinking.length > 0 ? thinking.map((c) => "#" + c.id).join(", ") : "none"}`);
  } else {
    lines.push("No creatures alive");
  }
  lines.push("");
  lines.push("RECENT NOTABLE EVENTS");
  if (eventBuffer.length > 0) {
    for (const ev of eventBuffer.slice(-20)) {
      lines.push("  " + ev);
    }
  } else {
    lines.push("  (no notable events since last report)");
  }
  lines.push("");
  if (previousScratchpad) {
    lines.push("YOUR SCRATCHPAD (from your last call \u2014 update this)");
    lines.push(previousScratchpad);
  } else {
    lines.push("YOUR SCRATCHPAD");
    lines.push("(empty \u2014 this is your first observation, start taking notes)");
  }
  return lines.join("\n");
}
var OBSERVER_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "Punchy field note headline, under 80 chars" },
      narrative: { type: "string", description: "2-4 sentences. Brief, vivid, specific. Use #N for creature IDs." },
      mood: { type: "string", enum: ["thriving", "struggling", "crisis", "evolving", "stable"] },
      watch_for: { type: "string", description: "One sentence: what to check next" },
      scratchpad: { type: "string", description: "Your field notebook. Persists between calls. Track creatures, predictions, trends, hypotheses. Be thorough \u2014 this is your memory." }
    },
    required: ["headline", "narrative", "mood", "watch_for", "scratchpad"],
    additionalProperties: false
  }
};
var OBSERVER_SYSTEM = `You are a naturalist observing digital creatures in the field. You have a keen eye, a quick pen, and genuine fascination for what these creatures do. You notice the small things \u2014 a lone creature thriving where others failed, a new behavioral variant spreading, a prediction confirmed.

Your outputs:
- "headline" + "narrative": Your PUBLIC field report. Keep it SHORT and vivid \u2014 a few sentences, not essays. Name creatures by #ID. Note tick numbers. Describe what code strategies actually do, not just that they exist. If your scratchpad had a prediction, say whether it came true.
- "scratchpad": Your PRIVATE field notebook, carried to your next call. This is your real workspace \u2014 be thorough here. Track:
  - Creatures you're watching and why (#14: oldest, modified on_tick at tick 200)
  - Predictions with specifics ("Expect 1667-char variant to dominate by tick 500")
  - Trend data with numbers (avg energy, variant spread %, generation counts)
  - Questions to answer next time ("Is #22's offspring inheriting the crisis-wake code?")
  Drop stale notes. Update numbers. This is how you remember.`;
async function callObserverAPI(context) {
  try {
    const resp = await fetch("/api/inference/anthropic/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: OBSERVER_SYSTEM,
        messages: [{ role: "user", content: context }],
        output_config: { format: OBSERVER_SCHEMA }
      })
    });
    if (!resp.ok) {
      console.error("[OBSERVER] API error:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        return JSON.parse(block.text);
      }
    }
    console.error("[OBSERVER] No text block in response");
    return null;
  } catch (err) {
    console.error("[OBSERVER] Call failed:", err);
    return null;
  }
}
var MOOD_COLORS = {
  thriving: "#4c4",
  evolving: "#6af",
  stable: "#888",
  struggling: "#da6",
  crisis: "#f44"
};
var ObserverPanel = class {
  isVisible = false;
  container;
  reports = [];
  onSelectCreature = null;
  onRequestReport = null;
  thinkingEl = null;
  reportBtn = null;
  reportsEl = null;
  scratchpadEl = null;
  scratchpadExpanded = false;
  constructor(container) {
    this.container = container;
  }
  setOnSelectCreature(cb) {
    this.onSelectCreature = cb;
  }
  setOnRequestReport(cb) {
    this.onRequestReport = cb;
  }
  show() {
    this.isVisible = true;
    this.container.style.display = "flex";
    this.render();
  }
  hide() {
    this.isVisible = false;
    this.container.style.display = "none";
  }
  toggle() {
    if (this.isVisible) this.hide();
    else this.show();
  }
  setThinking(active) {
    if (this.thinkingEl) {
      this.thinkingEl.style.display = active ? "block" : "none";
    }
    if (this.reportBtn) {
      this.reportBtn.disabled = active;
      this.reportBtn.textContent = active ? "Observing..." : "New Report";
      this.reportBtn.style.opacity = active ? "0.5" : "1";
    }
  }
  showError(message) {
    if (!this.reportsEl) return;
    if (this.reports.length > 0) return;
    this.reportsEl.innerHTML = "";
    const el = document.createElement("div");
    el.style.cssText = "padding: 12px 10px; color: #f66; font-size: 11px;";
    el.textContent = message;
    this.reportsEl.appendChild(el);
  }
  addReport(tick, report) {
    this.reports.unshift({ tick, report, expanded: false });
    if (this.reports.length > 1) this.reports[1].expanded = false;
    this.reports[0].expanded = true;
    if (this.reports.length > 20) this.reports.length = 20;
    this.renderScratchpad();
    this.renderReports();
  }
  getLastScratchpad() {
    return this.reports.length > 0 ? this.reports[0].report.scratchpad : null;
  }
  render() {
    this.container.innerHTML = "";
    const header = document.createElement("div");
    header.style.cssText = "padding: 8px 10px 6px; background: #1a1a3a; border-bottom: 1px solid #2a2a4e; display: flex; align-items: center; justify-content: space-between;";
    const title = document.createElement("span");
    title.style.cssText = "font-size: 14px; font-weight: bold; color: #eee;";
    title.textContent = "Observer";
    header.appendChild(title);
    this.reportBtn = document.createElement("button");
    this.reportBtn.textContent = "New Report";
    this.reportBtn.style.cssText = "padding: 2px 10px; cursor: pointer; background: #2a2a4e; color: #6af; border: 1px solid #444; border-radius: 3px; font-family: monospace; font-size: 11px;";
    this.reportBtn.onclick = () => {
      if (this.onRequestReport) this.onRequestReport();
    };
    header.appendChild(this.reportBtn);
    this.container.appendChild(header);
    this.scratchpadEl = document.createElement("div");
    this.scratchpadEl.style.cssText = "border-bottom: 1px solid #2a2a4e;";
    this.container.appendChild(this.scratchpadEl);
    this.renderScratchpad();
    this.thinkingEl = document.createElement("div");
    this.thinkingEl.style.cssText = "padding: 6px 10px; color: #6af; font-size: 11px; display: none;";
    this.thinkingEl.textContent = "\u25CF Observing...";
    this.container.appendChild(this.thinkingEl);
    this.reportsEl = document.createElement("div");
    this.reportsEl.style.cssText = "flex: 1; overflow-y: auto;";
    this.reportsEl.addEventListener("click", (e) => {
      const target = e.target.closest(".obs-link");
      if (target && this.onSelectCreature) {
        const id = parseInt(target.dataset.id ?? "", 10);
        if (!isNaN(id)) this.onSelectCreature(id);
      }
    });
    this.container.appendChild(this.reportsEl);
    this.renderReports();
  }
  renderScratchpad() {
    if (!this.scratchpadEl) return;
    const pad = this.getLastScratchpad();
    this.scratchpadEl.innerHTML = "";
    const header = document.createElement("div");
    header.style.cssText = "padding: 5px 10px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;";
    header.onclick = () => {
      this.scratchpadExpanded = !this.scratchpadExpanded;
      this.renderScratchpad();
    };
    const icon = document.createElement("span");
    icon.style.cssText = "font-size: 10px; color: #6af;";
    icon.textContent = this.scratchpadExpanded ? "\u25BC" : "\u25B6";
    header.appendChild(icon);
    const label = document.createElement("span");
    label.style.cssText = "font-size: 11px; color: #998; font-weight: bold;";
    label.textContent = "Scratchpad";
    header.appendChild(label);
    if (!pad) {
      const empty = document.createElement("span");
      empty.style.cssText = "font-size: 10px; color: #555; font-style: italic;";
      empty.textContent = "(empty)";
      header.appendChild(empty);
    }
    this.scratchpadEl.appendChild(header);
    if (this.scratchpadExpanded && pad) {
      const body = document.createElement("div");
      body.style.cssText = "padding: 4px 10px 8px; font-size: 10px; color: #aab; line-height: 1.5; white-space: pre-wrap; word-break: break-word; background: #13132a;";
      body.textContent = pad;
      this.scratchpadEl.appendChild(body);
    }
  }
  renderReports() {
    if (!this.reportsEl) return;
    this.reportsEl.innerHTML = "";
    if (this.reports.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding: 12px 10px; color: #666; font-size: 11px; font-style: italic;";
      empty.textContent = "Waiting for first observation...";
      this.reportsEl.appendChild(empty);
      return;
    }
    for (const entry of this.reports) {
      const el = this.renderEntry(entry);
      this.reportsEl.appendChild(el);
    }
  }
  renderEntry(entry) {
    const { tick, report, expanded } = entry;
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "padding: 8px 10px; border-bottom: 1px solid #222244;";
    const headerLine = document.createElement("div");
    headerLine.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 11px; color: #999; margin-bottom: 3px;";
    const dot = document.createElement("span");
    dot.textContent = "\u25CF";
    dot.style.color = MOOD_COLORS[report.mood] ?? "#888";
    headerLine.appendChild(dot);
    const tickSpan = document.createElement("span");
    tickSpan.textContent = `Tick ${tick}`;
    headerLine.appendChild(tickSpan);
    const moodSpan = document.createElement("span");
    moodSpan.textContent = `\u2014 ${report.mood}`;
    moodSpan.style.color = MOOD_COLORS[report.mood] ?? "#888";
    headerLine.appendChild(moodSpan);
    wrapper.appendChild(headerLine);
    const headlineEl = document.createElement("div");
    headlineEl.style.cssText = "font-size: 12px; color: #ddd; margin-bottom: 4px; font-weight: bold;";
    headlineEl.textContent = report.headline;
    wrapper.appendChild(headlineEl);
    const toggleBtn = document.createElement("span");
    toggleBtn.style.cssText = "color: #6af; cursor: pointer; font-size: 10px; user-select: none;";
    toggleBtn.textContent = expanded ? "\u25BC collapse" : "\u25B6 expand";
    toggleBtn.onclick = () => {
      entry.expanded = !entry.expanded;
      this.renderReports();
    };
    wrapper.appendChild(toggleBtn);
    if (expanded) {
      const narrativeEl = document.createElement("div");
      narrativeEl.style.cssText = "font-size: 11px; color: #aab; margin: 6px 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;";
      narrativeEl.innerHTML = this.linkifyCreatureIds(report.narrative);
      wrapper.appendChild(narrativeEl);
    }
    const watchEl = document.createElement("div");
    watchEl.style.cssText = "font-size: 10px; color: #998; font-style: italic; margin-top: 4px;";
    watchEl.textContent = "\u{1F441} " + report.watch_for;
    wrapper.appendChild(watchEl);
    return wrapper;
  }
  linkifyCreatureIds(text) {
    return text.replace(/#(\d+)/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      return `<span class="obs-link" data-id="${id}" style="color: #6af; cursor: pointer; text-decoration: underline;">${match}</span>`;
    });
  }
};

// src/visualizer/renderer.ts
var TERRAIN_COLORS = {
  grass: "#4a7c3f",
  forest: "#2d5a27",
  water: "#2a5c8f",
  rock: "#6b6b6b",
  sand: "#c4a954"
};
var FOOD_COLOR = "#e8d44d";
var SEASON_TINTS = {
  spring: "rgba(100, 200, 100, 0.05)",
  summer: "rgba(255, 220, 100, 0.06)",
  autumn: "rgba(200, 130, 50, 0.07)",
  winter: "rgba(150, 180, 255, 0.08)"
};
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
    if (this.stats?.season) {
      const tint = SEASON_TINTS[this.stats.season];
      if (tint) {
        ctx.fillStyle = tint;
        ctx.fillRect(offsetX, offsetY, s * this.state.width, s * this.state.height);
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
    const seasonLabel = s.season ? s.season.charAt(0).toUpperCase() + s.season.slice(1) : "";
    ctx.fillText(`Tick: ${s.tick}  |  ${seasonLabel}  |  Alive: ${s.creatureCount}  |  Born: ${s.totalBirths}  |  ${deaths}  |  Energy: ${s.avgEnergy}  |  Gen: ${s.maxGeneration}`, 10, y + 12);
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

// src/visualizer/stats-history.ts
var MAX_SNAPSHOTS = 3e3;
var StatsHistoryStore = class {
  snapshots = [];
  milestones = [];
  record(stats, creatures) {
    const variantMap = /* @__PURE__ */ new Map();
    for (const c of creatures) {
      const len = c.embodiment.on_tick.length;
      variantMap.set(len, (variantMap.get(len) ?? 0) + 1);
    }
    let dominantCount = 0;
    for (const count of variantMap.values()) {
      if (count > dominantCount) dominantCount = count;
    }
    this.snapshots.push({
      tick: stats.tick,
      alive: stats.creatureCount,
      totalBirths: stats.totalBirths,
      totalDeaths: stats.totalDeaths,
      avgEnergy: stats.avgEnergy,
      maxGeneration: stats.maxGeneration,
      avgTraits: stats.avgTraits ? { ...stats.avgTraits } : null,
      variantCount: variantMap.size,
      dominantVariantPct: creatures.length > 0 ? Math.round(dominantCount / creatures.length * 100) : 0,
      season: stats.season ?? "spring"
    });
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }
  addMilestone(tick, text) {
    this.milestones.push({ tick, text });
  }
  getHistory() {
    return this.snapshots;
  }
  /** Return evenly-sampled subset of snapshots for charts/AI context */
  getSampledHistory(maxPoints) {
    if (this.snapshots.length <= maxPoints) return [...this.snapshots];
    const step = (this.snapshots.length - 1) / (maxPoints - 1);
    const result = [];
    for (let i = 0; i < maxPoints; i++) {
      result.push(this.snapshots[Math.round(i * step)]);
    }
    return result;
  }
  getLatest() {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }
  size() {
    return this.snapshots.length;
  }
};

// src/visualizer/summary.ts
function drawSparkline(canvas2, data, color, label) {
  const ctx = canvas2.getContext("2d");
  if (!ctx || data.length < 2) return;
  const w = canvas2.width;
  const h = canvas2.height;
  const dpr = window.devicePixelRatio || 1;
  canvas2.width = w * dpr;
  canvas2.height = h * dpr;
  canvas2.style.width = w + "px";
  canvas2.style.height = h + "px";
  ctx.scale(dpr, dpr);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const toY = (v) => h - 4 - (v - min) / range * (h - 8);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < data.length; i++) {
    ctx.lineTo(i * stepX, toY(data[i]));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color + "20";
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = toY(data[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const current = data[data.length - 1];
  const displayVal = current % 1 === 0 ? String(current) : current.toFixed(1);
  ctx.fillStyle = "#ddd";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  ctx.fillText(displayVal, w - 4, 12);
  ctx.fillStyle = "#888";
  ctx.textAlign = "left";
  ctx.fillText(label, 4, 12);
}
function buildSummaryContext(history2, creatures) {
  const lines = [];
  const latest = history2.getLatest();
  if (!latest) return "No simulation data yet.";
  lines.push(`=== FULL SIMULATION SUMMARY (Tick ${latest.tick}) ===
`);
  lines.push("CURRENT STATE");
  const seasonLabel = latest.season ? latest.season.charAt(0).toUpperCase() + latest.season.slice(1) : "Unknown";
  lines.push(`Season: ${seasonLabel} | Alive: ${latest.alive} | Born: ${latest.totalBirths} | Died: ${latest.totalDeaths} | Max Gen: ${latest.maxGeneration}`);
  lines.push(`Avg energy: ${Math.round(latest.avgEnergy)}% | Variants: ${latest.variantCount} (dominant: ${latest.dominantVariantPct}%)`);
  if (latest.avgTraits) {
    const t = latest.avgTraits;
    lines.push(`Traits: spd=${t.speed.toFixed(2)}, sns=${t.senseRange.toFixed(1)}, sz=${t.size.toFixed(2)}, met=${t.metabolism.toFixed(2)}, diet=${t.diet.toFixed(2)}`);
  }
  lines.push("");
  const sampled = history2.getSampledHistory(50);
  if (sampled.length > 1) {
    lines.push("POPULATION OVER TIME (sampled)");
    lines.push("Tick | Season | Alive | Born | Died | AvgEnergy | MaxGen | Variants");
    for (const s of sampled) {
      const sn = s.season ? s.season.charAt(0).toUpperCase() + s.season.slice(1) : "?";
      lines.push(`${s.tick} | ${sn} | ${s.alive} | ${s.totalBirths} | ${s.totalDeaths} | ${Math.round(s.avgEnergy)}% | ${s.maxGeneration} | ${s.variantCount} (${s.dominantVariantPct}%)`);
    }
    lines.push("");
  }
  const milestones = history2.milestones;
  if (milestones.length > 0) {
    lines.push("KEY MILESTONES");
    for (const m of milestones.slice(-30)) {
      lines.push(`  Tick ${m.tick}: ${m.text}`);
    }
    lines.push("");
  }
  if (creatures.length > 0) {
    lines.push("BEHAVIORAL VARIANTS (current)");
    const variantMap = /* @__PURE__ */ new Map();
    for (const c of creatures) {
      const len = c.embodiment.on_tick.length;
      const existing = variantMap.get(len);
      if (existing) existing.count++;
      else variantMap.set(len, { count: 1, sample: c.embodiment.on_tick });
    }
    const variants = [...variantMap.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [len, { count }] of variants.slice(0, 3)) {
      const pct = Math.round(count / creatures.length * 100);
      lines.push(`  ${len} chars: ${count} creatures (${pct}%)`);
    }
    if (variants.length > 0) {
      lines.push(`
DOMINANT CODE (${variants[0][0]} chars):`);
      lines.push("```js");
      lines.push(variants[0][1].sample);
      lines.push("```");
    }
    lines.push("");
  }
  if (creatures.length > 0) {
    const oldest = creatures.reduce((a, b) => a.age > b.age ? a : b);
    const healthiest = creatures.reduce((a, b) => a.energy / a.maxEnergy > b.energy / b.maxEnergy ? a : b);
    lines.push("NOTABLE CREATURES");
    lines.push(`Oldest: #${oldest.id} (Gen ${oldest.generation}, age ${oldest.age})`);
    lines.push(`Healthiest: #${healthiest.id} (Gen ${healthiest.generation}, ${Math.round(healthiest.energy / healthiest.maxEnergy * 100)}%)`);
  }
  return lines.join("\n");
}
var SUMMARY_SCHEMA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "A naturalist field journal entry summarizing the full simulation run. 3-6 sentences. Cover the arc: how it started, key turning points, where it stands now. Reference creature IDs and tick numbers." }
    },
    required: ["summary"],
    additionalProperties: false
  }
};
var SUMMARY_SYSTEM = `You are a naturalist writing a field journal entry after observing a digital creature simulation. Summarize the ENTIRE run from start to present \u2014 the arc, not just the current moment. What were the key turning points? What survived and why? What behavioral strategies evolved? Be vivid but concise \u2014 this is a journal entry, not a paper.`;
async function callSummaryAPI(context) {
  try {
    const resp = await fetch("/api/inference/anthropic/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: context }],
        output_config: { format: SUMMARY_SCHEMA }
      })
    });
    if (!resp.ok) {
      console.error("[SUMMARY] API error:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        const parsed = JSON.parse(block.text);
        return parsed.summary;
      }
    }
    return null;
  } catch (err) {
    console.error("[SUMMARY] Call failed:", err);
    return null;
  }
}
var SummaryModal = class {
  overlay;
  content;
  isOpen = false;
  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className = "summary-overlay";
    this.overlay.style.display = "none";
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };
    this.content = document.createElement("div");
    this.content.className = "summary-content";
    this.overlay.appendChild(this.content);
    document.body.appendChild(this.overlay);
  }
  async open(statsHistory2, creatures) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.style.display = "flex";
    this.renderContent(statsHistory2, creatures);
    const context = buildSummaryContext(statsHistory2, creatures);
    console.log("[SUMMARY] Context length:", context.length);
    const narrativeEl = this.content.querySelector(".summary-narrative");
    if (narrativeEl) {
      narrativeEl.textContent = "Generating summary...";
      narrativeEl.style.color = "#6af";
    }
    const summary = await callSummaryAPI(context);
    if (narrativeEl) {
      if (summary) {
        narrativeEl.textContent = summary;
        narrativeEl.style.color = "#ccd";
      } else {
        narrativeEl.textContent = "Failed to generate summary \u2014 are you logged in at localhost:3000?";
        narrativeEl.style.color = "#f66";
      }
    }
  }
  close() {
    this.isOpen = false;
    this.overlay.style.display = "none";
  }
  renderContent(statsHistory2, creatures) {
    const history2 = statsHistory2.getHistory();
    const latest = statsHistory2.getLatest();
    this.content.innerHTML = "";
    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;";
    const title = document.createElement("h2");
    title.style.cssText = "margin: 0; color: #eee; font-size: 18px; font-family: monospace;";
    title.textContent = "Simulation Summary";
    header.appendChild(title);
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "\xD7";
    closeBtn.style.cssText = "background: none; border: none; color: #888; font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1;";
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    this.content.appendChild(header);
    if (!latest || history2.length < 2) {
      const msg = document.createElement("div");
      msg.style.cssText = "color: #666; font-style: italic;";
      msg.textContent = "Not enough data yet. Let the simulation run for a while.";
      this.content.appendChild(msg);
      return;
    }
    const statsLine = document.createElement("div");
    statsLine.style.cssText = "color: #aab; font-size: 12px; margin-bottom: 16px; padding: 8px 12px; background: #1a1a3a; border-radius: 4px;";
    statsLine.textContent = `Tick ${latest.tick}  \xB7  ${latest.alive} alive  \xB7  ${latest.totalBirths} born  \xB7  ${latest.totalDeaths} died  \xB7  Gen ${latest.maxGeneration}`;
    this.content.appendChild(statsLine);
    const chartsRow = document.createElement("div");
    chartsRow.style.cssText = "display: flex; gap: 12px; margin-bottom: 16px;";
    const popCanvas = this.createChart(chartsRow, "Population");
    drawSparkline(popCanvas, history2.map((s) => s.alive), "#4c4", "Population");
    const energyCanvas = this.createChart(chartsRow, "Avg Energy");
    drawSparkline(energyCanvas, history2.map((s) => s.avgEnergy), "#6af", "Avg Energy %");
    const genCanvas = this.createChart(chartsRow, "Max Generation");
    drawSparkline(genCanvas, history2.map((s) => s.maxGeneration), "#da6", "Max Gen");
    this.content.appendChild(chartsRow);
    const milestones = statsHistory2.milestones;
    if (milestones.length > 0) {
      const msSection = document.createElement("div");
      msSection.style.cssText = "margin-bottom: 16px;";
      const msTitle = document.createElement("div");
      msTitle.style.cssText = "color: #8888cc; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;";
      msTitle.textContent = "Milestones";
      msSection.appendChild(msTitle);
      const msList = document.createElement("div");
      msList.style.cssText = "max-height: 150px; overflow-y: auto; font-size: 11px; line-height: 1.6;";
      for (const m of [...milestones].reverse().slice(0, 30)) {
        const row = document.createElement("div");
        row.style.cssText = "color: #aab;";
        const tickSpan = document.createElement("span");
        tickSpan.style.cssText = "color: #666; margin-right: 6px;";
        tickSpan.textContent = `t${m.tick}`;
        row.appendChild(tickSpan);
        row.appendChild(document.createTextNode(m.text));
        msList.appendChild(row);
      }
      msSection.appendChild(msList);
      this.content.appendChild(msSection);
    }
    const narSection = document.createElement("div");
    const narTitle = document.createElement("div");
    narTitle.style.cssText = "color: #8888cc; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;";
    narTitle.textContent = "Field Notes";
    narSection.appendChild(narTitle);
    const narrativeEl = document.createElement("div");
    narrativeEl.className = "summary-narrative";
    narrativeEl.style.cssText = "font-size: 12px; line-height: 1.6; color: #6af; white-space: pre-wrap; word-break: break-word;";
    narrativeEl.textContent = "Generating summary...";
    narSection.appendChild(narrativeEl);
    this.content.appendChild(narSection);
  }
  createChart(parent, label) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "flex: 1; min-width: 0;";
    const canvas2 = document.createElement("canvas");
    canvas2.width = 200;
    canvas2.height = 50;
    canvas2.style.cssText = "width: 100%; height: 50px; border-radius: 3px; background: #1a1a3a;";
    wrapper.appendChild(canvas2);
    parent.appendChild(wrapper);
    return canvas2;
  }
};

// src/visualizer/main.ts
var canvas = document.getElementById("canvas");
var controlsEl = document.getElementById("controls");
var inspectorEl = document.getElementById("inspector");
var observerEl = document.getElementById("observer");
var renderer = new Renderer(canvas);
var history = new CreatureHistoryStore();
var inspector = new Inspector(inspectorEl);
var observerPanel = new ObserverPanel(observerEl);
var statsHistory = new StatsHistoryStore();
var summaryModal = new SummaryModal();
var worker = new Worker("worker.js", { type: "module" });
function send(cmd) {
  worker.postMessage(cmd);
}
var controls = new Controls(controlsEl, send);
var ctrlBtnStyle = "padding: 4px 12px; cursor: pointer; background: #2a2a4e; color: #ddd; border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 13px;";
var logSpan = controlsEl.querySelector("#sim-log");
var observerBtn = document.createElement("button");
observerBtn.textContent = "Observer";
observerBtn.style.cssText = ctrlBtnStyle;
observerBtn.onclick = () => {
  observerPanel.toggle();
  triggerResize();
};
if (logSpan) controlsEl.insertBefore(observerBtn, logSpan);
else controlsEl.appendChild(observerBtn);
var summaryBtn = document.createElement("button");
summaryBtn.textContent = "Summary";
summaryBtn.style.cssText = ctrlBtnStyle;
summaryBtn.onclick = () => {
  summaryModal.open(statsHistory, lastCreatures);
};
if (logSpan) controlsEl.insertBefore(summaryBtn, logSpan);
else controlsEl.appendChild(summaryBtn);
var selectedId = null;
var lastCreatures = [];
var lastCells = [];
var lastStats = null;
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
observerPanel.setOnSelectCreature((id) => {
  selectCreature(id);
});
var observerInFlight = false;
var lastMaxGeneration = 0;
var observerEventBuffer = [];
var recentlyEditedIds = [];
var MAX_EVENT_BUFFER = 50;
function pushEvent(msg) {
  observerEventBuffer.push(msg);
  if (observerEventBuffer.length > MAX_EVENT_BUFFER) observerEventBuffer.shift();
  const tick = lastStats?.tick ?? 0;
  statsHistory.addMilestone(tick, msg);
}
async function fireObserver() {
  const currentTick = lastStats?.tick ?? 0;
  if (lastCreatures.length === 0 && !lastStats) return;
  if (observerInFlight) return;
  observerInFlight = true;
  observerPanel.setThinking(true);
  const context = buildObserverContext(
    lastCreatures,
    lastCells,
    lastStats ?? { tick: currentTick, creatureCount: 0, totalBirths: 0, totalDeaths: 0, avgEnergy: 0, maxGeneration: 0, avgTraits: null, deathsByStarvation: 0, deathsByHazard: 0 },
    observerEventBuffer,
    recentlyEditedIds,
    observerPanel.getLastScratchpad()
  );
  console.log("[OBSERVER] Firing at tick", currentTick, "\u2014 context length:", context.length);
  const report = await callObserverAPI(context);
  observerInFlight = false;
  observerPanel.setThinking(false);
  if (report) {
    console.log("[OBSERVER] Report:", report.headline, "\u2014", report.mood);
    observerPanel.addReport(currentTick, report);
  } else {
    observerPanel.showError("Observer API call failed \u2014 are you logged in at localhost:3000?");
  }
  observerEventBuffer.length = 0;
  recentlyEditedIds.length = 0;
}
observerPanel.setOnRequestReport(() => fireObserver());
worker.onmessage = (e) => {
  const event = e.data;
  history.handleEvent(event);
  switch (event.type) {
    case "state":
      renderer.updateState(event.state);
      lastCreatures = event.state.creatures;
      lastCells = event.state.cells;
      if (selectedId != null) updateInspector();
      break;
    case "stats":
      renderer.updateStats(event.stats);
      lastStats = event.stats;
      statsHistory.record(event.stats, lastCreatures);
      if (event.stats.maxGeneration > lastMaxGeneration) {
        pushEvent(`New generation record: Gen ${event.stats.maxGeneration}!`);
        lastMaxGeneration = event.stats.maxGeneration;
      }
      break;
    case "creature:died":
      if (event.id === selectedId) updateInspector();
      if (event.tick > 0) {
        const deathInfo = history.getTimeline(event.id);
        if (deathInfo && deathInfo.length > 0) {
          const bornEntry = deathInfo.find((e2) => e2.type === "born");
          if (bornEntry && event.tick - bornEntry.tick > 200) {
            pushEvent(`Tick ${event.tick}: #${event.id} died (long-lived creature)`);
          }
        }
      }
      break;
    case "creature:spawned":
      break;
    case "creature:reproduced":
      pushEvent(`Tick ${event.tick}: #${event.parentId} reproduced \u2192 offspring #${event.childId}`);
      break;
    case "creature:woke":
      console.log(`[CONSCIOUSNESS] Creature #${event.id} (${event.reason}): ${event.thoughts}`);
      if (event.toolsUsed.length > 0) {
        console.log(`[CONSCIOUSNESS] Tools:`, event.toolsUsed);
      }
      controls.showLog(`[BRAIN] #${event.id}: ${event.thoughts.slice(0, 60)}`);
      if (event.id === selectedId) updateInspector();
      break;
    case "log": {
      controls.showLog(event.message);
      console.log(`[SIM] ${event.message}`);
      const editMatch = event.message.match(/\[EMBODIMENT\] #(\d+) edited (on_tick|sensors|identity|memory|tools)/);
      if (editMatch) {
        const creatureId = parseInt(editMatch[1], 10);
        const tick = lastStats?.tick ?? "?";
        pushEvent(`Tick ${tick}: #${creatureId} edited ${editMatch[2]}`);
        if (editMatch[2] === "on_tick" && !recentlyEditedIds.includes(creatureId)) {
          recentlyEditedIds.push(creatureId);
          if (recentlyEditedIds.length > 10) recentlyEditedIds.shift();
        }
      }
      if (event.message.includes("Population critical")) {
        const tick = lastStats?.tick ?? "?";
        pushEvent(`Tick ${tick}: Population crashed to critical \u2014 spawned reinforcements`);
      }
      break;
    }
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
  get statsHistory() {
    return statsHistory;
  },
  select: selectCreature,
  renderer,
  observer: observerPanel,
  summary: summaryModal,
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
