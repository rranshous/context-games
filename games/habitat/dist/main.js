// src/game-server.ts
var WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // cols
  [0, 4, 8],
  [2, 4, 6]
  // diags
];
var nextId = 1;
var TicTacToeServer = class {
  games = /* @__PURE__ */ new Map();
  createGame(playerHandle) {
    const id = `g${nextId++}`;
    const game = {
      id,
      board: Array(9).fill(null),
      players: { X: playerHandle, O: null },
      turn: "X",
      status: "waiting",
      winner: null
    };
    this.games.set(id, game);
    console.log(`[TTT] Game ${id}: created by "${playerHandle}" (waiting for opponent)`);
    return structuredClone(game);
  }
  joinGame(gameId, playerHandle) {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    if (game.status !== "waiting") throw new Error(`Game ${gameId} is not waiting for players`);
    if (game.players.X === playerHandle) throw new Error(`Cannot play against yourself`);
    game.players.O = playerHandle;
    game.status = "active";
    console.log(`[TTT] Game ${gameId}: "${playerHandle}" joined (X: "${game.players.X}", O: "${playerHandle}")`);
    return structuredClone(game);
  }
  makeMove(gameId, playerHandle, position) {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    if (game.status !== "active") throw new Error(`Game ${gameId} is not active`);
    if (position < 0 || position > 8) throw new Error(`Invalid position ${position} (must be 0-8)`);
    if (game.board[position] !== null) throw new Error(`Position ${position} is already taken`);
    const currentPlayer = game.turn === "X" ? game.players.X : game.players.O;
    if (currentPlayer !== playerHandle) {
      throw new Error(`Not your turn (current turn: "${currentPlayer}")`);
    }
    game.board[position] = playerHandle;
    console.log(`[TTT] Game ${gameId}: "${playerHandle}" plays position ${position}`);
    const winnerHandle = this.checkWinner(game);
    if (winnerHandle) {
      game.status = "finished";
      game.winner = winnerHandle;
      console.log(`[TTT] Game ${gameId}: "${winnerHandle}" wins!`);
    } else if (game.board.every((cell) => cell !== null)) {
      game.status = "finished";
      game.winner = "draw";
      console.log(`[TTT] Game ${gameId}: draw`);
    } else {
      game.turn = game.turn === "X" ? "O" : "X";
    }
    return structuredClone(game);
  }
  getGame(gameId) {
    const game = this.games.get(gameId);
    return game ? structuredClone(game) : null;
  }
  listGames() {
    return Array.from(this.games.values()).map((g) => structuredClone(g));
  }
  checkWinner(game) {
    for (const [a, b, c] of WIN_LINES) {
      if (game.board[a] && game.board[a] === game.board[b] && game.board[b] === game.board[c]) {
        return game.board[a];
      }
    }
    return null;
  }
};

// src/soma.ts
var DEFAULT_GAME_TOOLS = [
  {
    name: "list_games",
    description: "List all tic-tac-toe games (waiting, active, finished)",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `return world.games.ticTacToe.listGames();`
  },
  {
    name: "create_game",
    description: "Create a new tic-tac-toe game. You will be player X, waiting for an opponent.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `return world.games.ticTacToe.createGame(me.gamer_handle.read());`
  },
  {
    name: "find_game",
    description: "Find an open tic-tac-toe game and join it. Returns the game if one was found, or null.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `
      const games = world.games.ticTacToe.listGames();
      const open = games.find(g => g.status === 'waiting' && g.players.X !== me.gamer_handle.read());
      if (!open) return null;
      return world.games.ticTacToe.joinGame(open.id, me.gamer_handle.read());
    `
  },
  {
    name: "make_move",
    description: "Make a move in a tic-tac-toe game. Position is 0-8 (top-left to bottom-right, row by row).",
    input_schema: {
      type: "object",
      properties: {
        game_id: { type: "string", description: "The game ID" },
        position: { type: "number", description: "Board position 0-8" }
      },
      required: ["game_id", "position"],
      additionalProperties: false
    },
    function_body: `return world.games.ticTacToe.makeMove(input.game_id, me.gamer_handle.read(), input.position);`
  },
  {
    name: "get_game_state",
    description: "Get the current state of a tic-tac-toe game (board, whose turn, result).",
    input_schema: {
      type: "object",
      properties: {
        game_id: { type: "string", description: "The game ID" }
      },
      required: ["game_id"],
      additionalProperties: false
    },
    function_body: `return world.games.ticTacToe.getGame(input.game_id);`
  }
];
var DEFAULT_SOMA_TOOLS = [
  {
    name: "edit_gamer_handle",
    description: "Change your gamer handle (the name others see when you play games).",
    input_schema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "Your new handle" }
      },
      required: ["handle"],
      additionalProperties: false
    },
    function_body: `me.gamer_handle.write(input.handle); return { success: true };`
  },
  {
    name: "edit_identity",
    description: "Rewrite your identity section \u2014 who you are, your personality, your values.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Your new identity text" }
      },
      required: ["content"],
      additionalProperties: false
    },
    function_body: `me.identity.write(input.content); return { success: true };`
  },
  {
    name: "edit_on_tick",
    description: "Rewrite your on_tick code. This code runs every tick with (me, world) as arguments. It typically calls me.thinkAbout() to trigger your thinking.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "New on_tick JavaScript code" }
      },
      required: ["code"],
      additionalProperties: false
    },
    function_body: `me.on_tick.write(input.code); return { success: true };`
  },
  {
    name: "edit_memory",
    description: "Rewrite your memory section. Use this to remember things between ticks.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Your new memory content" }
      },
      required: ["content"],
      additionalProperties: false
    },
    function_body: `me.memory.write(input.content); return { success: true };`
  },
  {
    name: "add_custom_tool",
    description: "Add a new custom tool to your toolkit. The function_body receives (input, me, world).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tool name (snake_case)" },
        description: { type: "string", description: "What the tool does" },
        input_schema: { type: "string", description: "JSON string of the Anthropic tool input_schema" },
        function_body: { type: "string", description: "JavaScript function body. Receives (input, me, world)." }
      },
      required: ["name", "description", "input_schema", "function_body"],
      additionalProperties: false
    },
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const schema = JSON.parse(input.input_schema);
      tools.push({ name: input.name, description: input.description, input_schema: schema, function_body: input.function_body });
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' added." };
    `
  },
  {
    name: "edit_custom_tool",
    description: "Edit an existing custom tool by name. Provide only the fields you want to change.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the tool to edit" },
        new_description: { type: "string", description: "New description (optional)" },
        new_input_schema: { type: "string", description: "New input_schema as JSON string (optional)" },
        new_function_body: { type: "string", description: "New function body (optional)" }
      },
      required: ["name"],
      additionalProperties: false
    },
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const tool = tools.find(t => t.name === input.name);
      if (!tool) return { success: false, error: "Tool '" + input.name + "' not found." };
      if (input.new_description) tool.description = input.new_description;
      if (input.new_input_schema) tool.input_schema = JSON.parse(input.new_input_schema);
      if (input.new_function_body) tool.function_body = input.new_function_body;
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' updated." };
    `
  },
  {
    name: "remove_custom_tool",
    description: "Remove a custom tool by name.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the tool to remove" }
      },
      required: ["name"],
      additionalProperties: false
    },
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const idx = tools.findIndex(t => t.name === input.name);
      if (idx === -1) return { success: false, error: "Tool '" + input.name + "' not found." };
      tools.splice(idx, 1);
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' removed." };
    `
  }
];
var DEFAULT_ON_TICK = `await me.thinkAbout("What should I do?");`;
function createDefaultSoma(id) {
  return {
    id,
    gamer_handle: id,
    identity: `I am ${id}. I live in a digital habitat with other entities. I play tic-tac-toe, tinker with my own tools, and act on whatever impulse strikes me. If nothing is happening, I make something happen.`,
    on_tick: DEFAULT_ON_TICK,
    memory: "",
    custom_tools: [...DEFAULT_GAME_TOOLS, ...DEFAULT_SOMA_TOOLS].map((t) => ({ ...t }))
  };
}
function serializeSoma(soma) {
  return `<gamer_handle>${soma.gamer_handle}</gamer_handle>

<identity>${soma.identity}</identity>

<on_tick>
${soma.on_tick}
</on_tick>

<memory>${soma.memory}</memory>

<custom_tools>${JSON.stringify(soma.custom_tools)}</custom_tools>`;
}
function extractToolSchemas(soma) {
  return soma.custom_tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

// src/world.ts
function buildWorld(tttServer2) {
  return {
    games: {
      ticTacToe: {
        createGame: (handle) => tttServer2.createGame(handle),
        joinGame: (gameId, handle) => tttServer2.joinGame(gameId, handle),
        makeMove: (gameId, handle, pos) => tttServer2.makeMove(gameId, handle, pos),
        getGame: (gameId) => tttServer2.getGame(gameId),
        listGames: () => tttServer2.listGames()
      }
    }
  };
}

// src/inference.ts
var API_ENDPOINT = "/api/inference/anthropic/messages";
var MODEL = "claude-sonnet-4-6";
var MAX_TOKENS = 1024;
async function callAPI(body) {
  try {
    const resp = await fetch(API_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      console.error(`[INFERENCE] API error ${resp.status}:`, await resp.text());
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error("[INFERENCE] Fetch error:", err);
    return null;
  }
}
async function agenticLoop(tag, system, userPrompt, tools, executeTool, maxTurns = 10) {
  console.log(`[${tag}] \u2192 API call (system: ${system.length} chars, tools: ${tools.length})`);
  let messages = [
    { role: "user", content: userPrompt }
  ];
  let turns = 0;
  while (turns < maxTurns) {
    turns++;
    const response = await callAPI({
      model: MODEL,
      system,
      messages,
      tools,
      max_tokens: MAX_TOKENS
    });
    if (!response) {
      console.error(`[${tag}] \u2190 API call failed on turn ${turns}`);
      break;
    }
    console.log(`[${tag}] \u2190 Response (turn ${turns}, stop: ${response.stop_reason}, tokens: ${response.usage.input_tokens}in/${response.usage.output_tokens}out)`);
    let hasToolUse = false;
    const toolResults = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        console.log(`[${tag}] \u{1F4AD} ${block.text.substring(0, 200)}${block.text.length > 200 ? "..." : ""}`);
      }
      if (block.type === "tool_use" && block.name && block.id) {
        hasToolUse = true;
        const inputSummary = JSON.stringify(block.input).substring(0, 100);
        try {
          const result = executeTool(block.name, block.input || {});
          const resultStr = JSON.stringify(result);
          const resultSummary = resultStr.substring(0, 150);
          console.log(`[${tag}] \u2192 Tool: ${block.name} ${inputSummary} \u2192 ${resultSummary}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultStr
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[${tag}] \u2192 Tool: ${block.name} ${inputSummary} \u2192 ERROR: ${errMsg}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true
          });
        }
      }
    }
    if (!hasToolUse || response.stop_reason === "end_turn") {
      break;
    }
    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults }
    ];
  }
  console.log(`[${tag}] \u2190 Loop complete (${turns} turn${turns !== 1 ? "s" : ""})`);
}

// src/actant.ts
var AsyncFunction = Object.getPrototypeOf(async function() {
}).constructor;
var Actant = class {
  soma;
  status = "idle";
  tickCount = 0;
  lastThinkPrompt = "";
  world;
  tickInterval;
  tickTimer = null;
  ticking = false;
  constructor(soma, world2, tickInterval = 15e3) {
    this.soma = soma;
    this.world = world2;
    this.tickInterval = tickInterval;
  }
  get tag() {
    return this.soma.id.toUpperCase();
  }
  // ── me API ────────────────────────────────────────────────
  buildMeAPI() {
    const soma = this.soma;
    const actant = this;
    const makeSection = (getter, setter, name) => ({
      read: () => getter(),
      write: (content) => {
        setter(content);
        console.log(`[${actant.tag}] \u270F\uFE0F ${name} updated (${content.length} chars)`);
      }
    });
    return {
      thinkAbout: (prompt) => this.thinkAbout(prompt),
      gamer_handle: makeSection(
        () => soma.gamer_handle,
        (s) => {
          soma.gamer_handle = s;
        },
        "gamer_handle"
      ),
      identity: makeSection(
        () => soma.identity,
        (s) => {
          soma.identity = s;
        },
        "identity"
      ),
      on_tick: makeSection(
        () => soma.on_tick,
        (s) => {
          soma.on_tick = s;
        },
        "on_tick"
      ),
      memory: makeSection(
        () => soma.memory,
        (s) => {
          soma.memory = s;
        },
        "memory"
      ),
      custom_tools: makeSection(
        () => JSON.stringify(soma.custom_tools),
        (s) => {
          soma.custom_tools = JSON.parse(s);
        },
        "custom_tools"
      )
    };
  }
  // ── Tool compilation ──────────────────────────────────────
  compileTool(functionBody) {
    try {
      return new Function("input", "me", "world", functionBody);
    } catch (err) {
      console.error(`[${this.tag}] Tool compilation error:`, err);
      return null;
    }
  }
  // ── thinkAbout ────────────────────────────────────────────
  async thinkAbout(prompt) {
    this.lastThinkPrompt = prompt;
    console.log(`[${this.tag}] thinkAbout("${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}")`);
    const system = serializeSoma(this.soma);
    const tools = extractToolSchemas(this.soma);
    const me = this.buildMeAPI();
    const world2 = this.world;
    const tag = this.tag;
    const toolMap = /* @__PURE__ */ new Map();
    for (const tool of this.soma.custom_tools) {
      toolMap.set(tool.name, tool.function_body);
    }
    const executeTool = (name, input) => {
      const body = toolMap.get(name);
      if (!body) throw new Error(`Unknown tool: ${name}`);
      const fn = this.compileTool(body);
      if (!fn) throw new Error(`Failed to compile tool: ${name}`);
      return fn(input, me, world2);
    };
    await agenticLoop(tag, system, prompt, tools, executeTool);
  }
  // ── Tick loop ─────────────────────────────────────────────
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    this.tickCount++;
    this.status = "thinking";
    console.log(`[${this.tag}] Tick #${this.tickCount} starting...`);
    const start = performance.now();
    try {
      const me = this.buildMeAPI();
      const fn = new AsyncFunction("me", "world", this.soma.on_tick);
      await fn(me, this.world);
    } catch (err) {
      console.error(`[${this.tag}] Tick #${this.tickCount} error:`, err);
    }
    const elapsed = ((performance.now() - start) / 1e3).toFixed(1);
    console.log(`[${this.tag}] Tick #${this.tickCount} complete (${elapsed}s)`);
    this.status = "idle";
    this.ticking = false;
  }
  startTicking() {
    console.log(`[${this.tag}] Starting tick loop (interval: ${this.tickInterval}ms)`);
    const loop = async () => {
      await this.tick();
      this.tickTimer = setTimeout(loop, this.tickInterval);
    };
    this.tickTimer = setTimeout(loop, Math.random() * 3e3 + 1e3);
  }
  stopTicking() {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    console.log(`[${this.tag}] Tick loop stopped`);
  }
};

// src/ui.ts
var HabitatUI = class {
  world;
  actants;
  selectedGameId = null;
  renderTimer = null;
  gameListEl;
  boardAreaEl;
  actantCardsEl;
  handleInput;
  constructor(world2, actants2) {
    this.world = world2;
    this.actants = actants2;
    this.gameListEl = document.getElementById("game-list");
    this.boardAreaEl = document.getElementById("board-area");
    this.actantCardsEl = document.getElementById("actant-cards");
    this.handleInput = document.getElementById("player-handle");
    document.getElementById("create-game-btn").addEventListener("click", () => {
      const handle = this.getHandle();
      if (!handle) return;
      try {
        const game = this.world.games.ticTacToe.createGame(handle);
        this.selectedGameId = game.id;
        this.render();
      } catch (err) {
        console.error("[UI] Create game error:", err);
      }
    });
  }
  getHandle() {
    return this.handleInput.value.trim() || "Player";
  }
  // ── Rendering ─────────────────────────────────────────────
  render() {
    this.renderGameList();
    this.renderBoard();
    this.renderActants();
  }
  renderGameList() {
    const games = this.world.games.ticTacToe.listGames();
    if (games.length === 0) {
      this.gameListEl.innerHTML = '<div class="no-games">No games yet. Create one!</div>';
      return;
    }
    const order = { active: 0, waiting: 1, finished: 2 };
    games.sort((a, b) => order[a.status] - order[b.status]);
    this.gameListEl.innerHTML = games.map((g) => {
      const selected = g.id === this.selectedGameId ? " selected" : "";
      const players = g.players.O ? `${g.players.X} vs ${g.players.O}` : `${g.players.X} (waiting)`;
      const result = g.status === "finished" ? g.winner === "draw" ? " \u2014 Draw" : ` \u2014 ${g.winner} wins` : "";
      return `<div class="game-item${selected}" data-game-id="${g.id}">
        <span>${g.id}: ${players}${result}</span>
        <span class="game-status ${g.status}">${g.status}</span>
      </div>`;
    }).join("");
    this.gameListEl.querySelectorAll(".game-item").forEach((el) => {
      el.addEventListener("click", () => {
        const gameId = el.dataset.gameId;
        const game = this.world.games.ticTacToe.getGame(gameId);
        if (!game) return;
        if (game.status === "waiting" && game.players.X !== this.getHandle()) {
          try {
            this.world.games.ticTacToe.joinGame(gameId, this.getHandle());
          } catch (err) {
            console.error("[UI] Join game error:", err);
          }
        }
        this.selectedGameId = gameId;
        this.render();
      });
    });
  }
  renderBoard() {
    if (!this.selectedGameId) {
      this.boardAreaEl.innerHTML = "";
      return;
    }
    const game = this.world.games.ticTacToe.getGame(this.selectedGameId);
    if (!game) {
      this.boardAreaEl.innerHTML = "";
      this.selectedGameId = null;
      return;
    }
    const handle = this.getHandle();
    const isMyTurn = game.status === "active" && (game.turn === "X" && game.players.X === handle || game.turn === "O" && game.players.O === handle);
    let info = "";
    if (game.status === "waiting") {
      info = "Waiting for opponent...";
    } else if (game.status === "finished") {
      info = game.winner === "draw" ? "Draw!" : `${game.winner} wins!`;
    } else {
      const current = game.turn === "X" ? game.players.X : game.players.O;
      info = isMyTurn ? "Your turn" : `${current}'s turn`;
    }
    const cells = game.board.map((cell, i) => {
      const mark = cell ? cell === game.players.X ? "X" : "O" : "";
      const cls = mark ? mark.toLowerCase() : "";
      const disabled = !isMyTurn || cell !== null ? " disabled" : "";
      return `<div class="cell ${cls}${disabled}" data-pos="${i}">${mark}</div>`;
    }).join("");
    this.boardAreaEl.innerHTML = `
      <div class="board-container">
        <div class="board-info">${info}</div>
        <div class="board">${cells}</div>
      </div>`;
    if (isMyTurn) {
      this.boardAreaEl.querySelectorAll(".cell:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          const pos = parseInt(el.dataset.pos, 10);
          try {
            this.world.games.ticTacToe.makeMove(game.id, handle, pos);
            this.render();
          } catch (err) {
            console.error("[UI] Move error:", err);
          }
        });
      });
    }
  }
  renderActants() {
    this.actantCardsEl.innerHTML = this.actants.map((a) => {
      const statusCls = a.status === "thinking" ? "thinking" : "idle";
      const memory = a.soma.memory || "(empty)";
      const memoryPreview = memory.length > 120 ? memory.substring(0, 120) + "..." : memory;
      return `<div class="actant-card">
        <div class="actant-header">
          <span class="actant-name">${a.soma.gamer_handle}</span>
          <span class="actant-status ${statusCls}">${a.status} \xB7 tick #${a.tickCount}</span>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Identity</div>
          <div class="actant-section-content">${escapeHtml(a.soma.identity)}</div>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Memory</div>
          <div class="actant-section-content">${escapeHtml(memoryPreview)}</div>
        </div>
        <div class="actant-section">
          <div class="actant-section-label">Last think</div>
          <div class="actant-section-content">${escapeHtml(a.lastThinkPrompt || "(none)")}</div>
        </div>
      </div>`;
    }).join("");
  }
  // ── Render loop ───────────────────────────────────────────
  startRendering(interval = 500) {
    this.render();
    this.renderTimer = setInterval(() => this.render(), interval);
  }
  stopRendering() {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
  }
};
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/main.ts
var STORAGE_KEY = "habitat-somas";
function saveSomas(actants2) {
  const data = actants2.map((a) => a.soma);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function loadSomas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
var tttServer = new TicTacToeServer();
var world = buildWorld(tttServer);
var saved = loadSomas();
var alphaSoma = saved?.[0] ?? createDefaultSoma("alpha");
var betaSoma = saved?.[1] ?? createDefaultSoma("beta");
var alpha = new Actant(alphaSoma, world);
var beta = new Actant(betaSoma, world);
var actants = [alpha, beta];
var origAlphaTick = alpha.tick.bind(alpha);
var origBetaTick = beta.tick.bind(beta);
alpha.tick = async function() {
  await origAlphaTick();
  saveSomas(actants);
};
beta.tick = async function() {
  await origBetaTick();
  saveSomas(actants);
};
var ui = new HabitatUI(world, actants);
alpha.startTicking();
beta.startTicking();
ui.startRendering();
console.log("[HABITAT] Initialized \u2014 2 actants, tic-tac-toe server ready");
window.__habitat = { world, alpha, beta, ui, saveSomas: () => saveSomas(actants), resetSomas: () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
} };
//# sourceMappingURL=main.js.map
