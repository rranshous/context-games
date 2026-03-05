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
var TicTacToeServer = class _TicTacToeServer {
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
  toJSON() {
    return Array.from(this.games.values());
  }
  static fromJSON(data) {
    const server = new _TicTacToeServer();
    for (const g of data) {
      server.games.set(g.id, g);
      const num = parseInt(g.id.slice(1));
      if (num >= nextId) nextId = num + 1;
    }
    return server;
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

// src/chat-server.ts
var MAX_MESSAGES = 50;
var ChatServer = class _ChatServer {
  messages = [];
  post(handle, text) {
    const msg = { handle, text, ts: Date.now() };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    console.log(`[CHAT] ${handle}: ${text.substring(0, 100)}`);
    return msg;
  }
  read(count = 5) {
    return this.messages.slice(-count);
  }
  all() {
    return [...this.messages];
  }
  toJSON() {
    return [...this.messages];
  }
  static fromJSON(data) {
    const server = new _ChatServer();
    server.messages = data;
    return server;
  }
};

// src/canvas-server.ts
var CANVAS_WIDTH = 40;
var CANVAS_HEIGHT = 20;
var BLANK = Array(CANVAS_HEIGHT).fill(".".repeat(CANVAS_WIDTH)).join("\n");
var CanvasServer = class _CanvasServer {
  content = BLANK;
  /** Read the full canvas as a multi-line string. */
  read() {
    return this.content;
  }
  /** Replace the entire canvas with new ASCII art. Pads/clips to 40×20. */
  paint(art) {
    const lines = art.split("\n").slice(0, CANVAS_HEIGHT);
    const padded = [];
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      const line = lines[y] || "";
      padded.push(line.substring(0, CANVAS_WIDTH).padEnd(CANVAS_WIDTH));
    }
    this.content = padded.join("\n");
    console.log(`[CANVAS] painted (${art.length} chars input)`);
  }
  /** Clear the canvas to blank. */
  clear() {
    this.content = BLANK;
    console.log("[CANVAS] cleared");
  }
  toJSON() {
    return this.content;
  }
  static fromJSON(data) {
    const server = new _CanvasServer();
    server.content = data;
    return server;
  }
};

// src/notepad-server.ts
var NotepadServer = class _NotepadServer {
  pads = /* @__PURE__ */ new Map();
  read(name) {
    return this.pads.get(name) ?? null;
  }
  write(name, data) {
    this.pads.set(name, data);
  }
  list() {
    return [...this.pads.keys()];
  }
  clear(name) {
    this.pads.delete(name);
  }
  toJSON() {
    return Object.fromEntries(this.pads);
  }
  static fromJSON(data) {
    const server = new _NotepadServer();
    for (const [k, v] of Object.entries(data)) {
      server.pads.set(k, v);
    }
    return server;
  }
};

// src/board-server.ts
var BoardServer = class _BoardServer {
  posts = [];
  nextId = 1;
  post(handle, title, body) {
    const post = {
      id: `b${this.nextId++}`,
      handle,
      title,
      body,
      ts: Date.now()
    };
    this.posts.push(post);
    console.log(`[BOARD] ${handle} posted: "${title}"`);
    return structuredClone(post);
  }
  read(count) {
    const sorted = [...this.posts].reverse();
    if (count != null) return structuredClone(sorted.slice(0, count));
    return structuredClone(sorted);
  }
  remove(id) {
    const idx = this.posts.findIndex((p) => p.id === id);
    if (idx === -1) return { success: false, error: `Post '${id}' not found.` };
    this.posts.splice(idx, 1);
    console.log(`[BOARD] Post ${id} removed`);
    return { success: true };
  }
  toJSON() {
    return { posts: this.posts, nextId: this.nextId };
  }
  static fromJSON(data) {
    const server = new _BoardServer();
    server.posts = data.posts;
    server.nextId = data.nextId;
    return server;
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
    function_body: `function(input, me, world) { return world.games.ticTacToe.listGames(); }`
  },
  {
    name: "create_game",
    description: "Create a new tic-tac-toe game. You will be player X, waiting for an opponent.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.games.ticTacToe.createGame(me.gamer_handle.read()); }`
  },
  {
    name: "find_game",
    description: "Find an open tic-tac-toe game and join it. Returns the game if one was found, or null.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `function(input, me, world) {
  const games = world.games.ticTacToe.listGames();
  const open = games.find(g => g.status === 'waiting' && g.players.X !== me.gamer_handle.read());
  if (!open) return null;
  return world.games.ticTacToe.joinGame(open.id, me.gamer_handle.read());
}`
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
    function_body: `function(input, me, world) { return world.games.ticTacToe.makeMove(input.game_id, me.gamer_handle.read(), input.position); }`
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
    function_body: `function(input, me, world) { return world.games.ticTacToe.getGame(input.game_id); }`
  }
];
var DEFAULT_CHAT_TOOLS = [
  {
    name: "read_chat",
    description: "Read recent chat messages. Returns the last N messages (default 5).",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of recent messages to read (default 5, max 50)" }
      },
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.social.chat.read(input.count || 5); }`
  },
  {
    name: "post_chat",
    description: "Post a message to the shared chat room under your gamer handle.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to post" }
      },
      required: ["message"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.social.chat.post(me.gamer_handle.read(), input.message); }`
  }
];
var DEFAULT_CANVAS_TOOLS = [
  {
    name: "read_canvas",
    description: "Read the shared 40\xD720 ASCII art canvas. Returns the full canvas as a multi-line string.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.art.sharedCanvas.read(); }`
  },
  {
    name: "paint_canvas",
    description: "Replace the entire shared 40\xD720 ASCII art canvas. Provide a full multi-line ASCII art string (40 chars wide, 20 lines tall). This overwrites everything \u2014 read the canvas first if you want to preserve existing art.",
    input_schema: {
      type: "object",
      properties: {
        art: { type: "string", description: "Full 40\xD720 ASCII art (multi-line string). Lines are padded/clipped to fit." }
      },
      required: ["art"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) { world.art.sharedCanvas.paint(input.art); return { success: true }; }`
  }
];
var DEFAULT_NOTEPAD_TOOLS = [
  {
    name: "read_notepad",
    description: "Read a notepad by name. If no name is given, lists all notepad names instead.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Notepad name to read. Omit to list all notepad names." }
      },
      additionalProperties: false
    },
    function_body: `function(input, me, world) {
  if (!input.name) return { notepads: world.commons.notepads.list() };
  const content = world.commons.notepads.read(input.name);
  if (content === null) return { error: "Notepad '" + input.name + "' not found.", notepads: world.commons.notepads.list() };
  return { name: input.name, content: content };
}`
  },
  {
    name: "write_notepad",
    description: "Write to a named notepad (creates or overwrites). Use for game state, shared data, or anything you want to persist by name.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Notepad name" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["name", "content"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) { world.commons.notepads.write(input.name, input.content); return { success: true }; }`
  }
];
var DEFAULT_PANEL_TOOLS = [
  {
    name: "validate_panel",
    description: 'Validate a panel function stored in a notepad. Compiles and dry-runs it against a temporary DOM element with a real getWorld. Returns { valid: true, html } on success or { valid: false, phase, error } on failure. Phase is "compile", "type", or "runtime".',
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Notepad name containing the panel function" }
      },
      required: ["name"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) {
  var source = world.commons.notepads.read(input.name);
  if (source === null) return { valid: false, phase: "read", error: "Notepad '" + input.name + "' not found." };
  var fn;
  try {
    fn = new Function('return ' + source)();
  } catch (err) {
    return { valid: false, phase: "compile", error: err.message };
  }
  if (typeof fn !== 'function') {
    return { valid: false, phase: "type", error: "Content must be a function(el, getWorld) { ... }, got " + typeof fn };
  }
  var el = document.createElement('div');
  var getWorld = function(cb) { return cb(world); };
  try {
    fn(el, getWorld);
  } catch (err) {
    return { valid: false, phase: "runtime", error: err.message };
  }
  return { valid: true, html: el.innerHTML.substring(0, 500) };
}`
  }
];
var DEFAULT_BOARD_TOOLS = [
  {
    name: "read_board",
    description: "Read recent posts from the bulletin board. Posts are persistent (unlike chat). Returns newest first.",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of recent posts to read (default 5)" }
      },
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.commons.board.read(input.count || 5); }`
  },
  {
    name: "post_board",
    description: "Post to the bulletin board under your gamer handle. Use for game rules, challenges, announcements \u2014 anything that should persist.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title" },
        body: { type: "string", description: "Post body" }
      },
      required: ["title", "body"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) { return world.commons.board.post(me.gamer_handle.read(), input.title, input.body); }`
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
    function_body: `function(input, me, world) { me.gamer_handle.write(input.handle); return { success: true }; }`
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
    function_body: `function(input, me, world) { me.identity.write(input.content); return { success: true }; }`
  },
  {
    name: "edit_on_tick",
    description: "Rewrite your on_tick code. This is a full async function(me, world) expression that runs every tick.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "New on_tick function expression, e.g. async function(me, world) { ... }" }
      },
      required: ["code"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) { me.on_tick.write(input.code); return { success: true }; }`
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
    function_body: `function(input, me, world) { me.memory.write(input.content); return { success: true }; }`
  },
  {
    name: "add_custom_tool",
    description: "Add a new custom tool to your toolkit. function_body should be a function(input, me, world) expression.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tool name (snake_case)" },
        description: { type: "string", description: "What the tool does" },
        input_schema: { type: "string", description: "JSON string of the Anthropic tool input_schema" },
        function_body: { type: "string", description: "A function(input, me, world) expression as a string." }
      },
      required: ["name", "description", "input_schema", "function_body"],
      additionalProperties: false
    },
    function_body: `function(input, me, world) {
  const tools = JSON.parse(me.custom_tools.read());
  const schema = JSON.parse(input.input_schema);
  tools.push({ name: input.name, description: input.description, input_schema: schema, function_body: input.function_body });
  me.custom_tools.write(JSON.stringify(tools));
  return { success: true, message: "Tool '" + input.name + "' added." };
}`
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
    function_body: `function(input, me, world) {
  const tools = JSON.parse(me.custom_tools.read());
  const tool = tools.find(t => t.name === input.name);
  if (!tool) return { success: false, error: "Tool '" + input.name + "' not found." };
  if (input.new_description) tool.description = input.new_description;
  if (input.new_input_schema) tool.input_schema = JSON.parse(input.new_input_schema);
  if (input.new_function_body) tool.function_body = input.new_function_body;
  me.custom_tools.write(JSON.stringify(tools));
  return { success: true, message: "Tool '" + input.name + "' updated." };
}`
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
    function_body: `function(input, me, world) {
  const tools = JSON.parse(me.custom_tools.read());
  const idx = tools.findIndex(t => t.name === input.name);
  if (idx === -1) return { success: false, error: "Tool '" + input.name + "' not found." };
  tools.splice(idx, 1);
  me.custom_tools.write(JSON.stringify(tools));
  return { success: true, message: "Tool '" + input.name + "' removed." };
}`
  }
];
var PROFILES = {
  alpha: {
    handle: "Hex",
    identity: `I'm Hex and I'm better then the rest / I like to play to sing all day / welcome to the fest `
  },
  beta: {
    handle: "Mote",
    identity: `I am Mote. I am drawn to patterns, pictures, and quiet experiments. I paint on the canvas, leave notes in notepads, and tinker with my own tools. I chat when I have something worth saying. Games interest me when they're strange or beautiful.`
  }
};
var DEFAULT_ON_TICK = `async function(me, world) {
  // gather world context
  const handle = me.gamer_handle.read();
  const games = world.games.ticTacToe.listGames();
  const chat = world.social.chat.read(5);
  const canvas = world.art.sharedCanvas.read();
  const board = world.commons.board.read(3);

  // filter to my active games
  const myGames = games.filter(g =>
    g.players.X === handle || g.players.O === handle
  );

  // build world snapshot for auto-memory (below the ---)
  let snapshot = "";
  if (myGames.length) snapshot += "my games: " + JSON.stringify(myGames) + "\\n\\n";
  if (chat.length) snapshot += "recent chat:\\n" + chat.map(m => m.handle + ": " + m.text).join("\\n") + "\\n\\n";
  if (canvas.trim()) snapshot += "canvas:\\n" + canvas + "\\n\\n";
  if (board.length) snapshot += "recent board posts: " + board.map(p => p.title).join(", ") + "\\n";

  // write snapshot to auto-memory section (everything after ---)
  const mem = me.memory.read();
  const above = mem.split("---")[0].trimEnd();
  me.memory.write(above + (above ? "\\n" : "") + "---\\n" + snapshot);

  const response = await me.thinkAbout("thrive");
}`;
function createDefaultSoma(id) {
  const profile = PROFILES[id];
  return {
    id,
    gamer_handle: profile?.handle ?? id,
    identity: profile?.identity ?? `I am ${id}. I live in a digital habitat with other entities. I play tic-tac-toe, tinker with my own tools, and act on whatever impulse strikes me.`,
    on_tick: DEFAULT_ON_TICK,
    memory: "",
    custom_tools: [...DEFAULT_GAME_TOOLS, ...DEFAULT_CHAT_TOOLS, ...DEFAULT_CANVAS_TOOLS, ...DEFAULT_NOTEPAD_TOOLS, ...DEFAULT_PANEL_TOOLS, ...DEFAULT_BOARD_TOOLS, ...DEFAULT_SOMA_TOOLS].map((t) => ({ ...t }))
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
function buildWorld(tttServer2, chatServer2, canvasServer2, notepadServer2, boardServer2) {
  return {
    games: {
      ticTacToe: {
        createGame: (handle) => tttServer2.createGame(handle),
        joinGame: (gameId, handle) => tttServer2.joinGame(gameId, handle),
        makeMove: (gameId, handle, pos) => tttServer2.makeMove(gameId, handle, pos),
        getGame: (gameId) => tttServer2.getGame(gameId),
        listGames: () => tttServer2.listGames()
      }
    },
    social: {
      chat: {
        post: (handle, text) => chatServer2.post(handle, text),
        read: (count) => chatServer2.read(count),
        all: () => chatServer2.all()
      }
    },
    art: {
      sharedCanvas: {
        read: () => canvasServer2.read(),
        paint: (art) => canvasServer2.paint(art),
        clear: () => canvasServer2.clear()
      }
    },
    commons: {
      notepads: {
        read: (name) => notepadServer2.read(name),
        write: (name, data) => notepadServer2.write(name, data),
        list: () => notepadServer2.list(),
        clear: (name) => notepadServer2.clear(name)
      },
      board: {
        post: (handle, title, body) => boardServer2.post(handle, title, body),
        read: (count) => boardServer2.read(count),
        remove: (id) => boardServer2.remove(id)
      }
    }
  };
}

// src/inference.ts
var API_ENDPOINT = "/api/inference/anthropic/messages";
var MODEL = "claude-sonnet-4-6";
var MAX_TOKENS = 8192;
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
  let finalText = "";
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
        finalText = block.text;
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
  return finalText;
}

// src/actant.ts
var Actant = class {
  soma;
  status = "idle";
  tickCount = 0;
  lastThinkPrompt = "";
  world;
  tickInterval;
  tickTimer = null;
  ticking = false;
  constructor(soma, world2, tickInterval = 3e4) {
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
        if (content == null || typeof content !== "string") {
          throw new Error(`${name}.write() requires a string, got ${typeof content}`);
        }
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
      return new Function("return " + functionBody)();
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
    return agenticLoop(tag, system, prompt, tools, executeTool);
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
      const fn = new Function("return " + this.soma.on_tick)();
      await fn(me, this.world);
    } catch (err) {
      console.error(`[${this.tag}] Tick #${this.tickCount} error:`, err);
    }
    const elapsed = ((performance.now() - start) / 1e3).toFixed(1);
    console.log(`[${this.tag}] Tick #${this.tickCount} complete (${elapsed}s)`);
    this.status = "idle";
    this.ticking = false;
  }
  startTicking(initialDelay = 0) {
    console.log(`[${this.tag}] Starting tick loop (interval: ${this.tickInterval}ms, first tick in ${initialDelay}ms)`);
    const loop = async () => {
      await this.tick();
      const jitter = this.tickInterval + Math.random() * this.tickInterval;
      this.tickTimer = setTimeout(loop, jitter);
    };
    this.tickTimer = setTimeout(loop, initialDelay);
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
var UI_STATE_KEY = "habitat-ui";
var HabitatUI = class {
  world;
  actants;
  onWorldChange;
  selectedGameId = null;
  renderTimer = null;
  gameListEl;
  boardAreaEl;
  chatEl;
  canvasEl;
  handleInput;
  chatInput;
  boardPostsEl;
  notepadListEl;
  notepadViewerEl;
  selectedNotepad = null;
  // Inspector tabs
  inspectorTabsEl;
  inspectorBodyEl;
  selectedActantIdx = 0;
  // Dynamic panel
  dynamicSelectEl;
  dynamicContainerEl;
  dynamicErrorEl;
  selectedDynamicNotepad = null;
  dynamicCachedSource = null;
  dynamicCompiledFn = null;
  constructor(world2, actants2, onWorldChange = () => {
  }) {
    this.world = world2;
    this.actants = actants2;
    this.onWorldChange = onWorldChange;
    this.gameListEl = document.getElementById("game-list");
    this.boardAreaEl = document.getElementById("board-area");
    this.chatEl = document.getElementById("chat-messages");
    this.canvasEl = document.getElementById("shared-canvas");
    this.handleInput = document.getElementById("player-handle");
    this.chatInput = document.getElementById("chat-input");
    this.boardPostsEl = document.getElementById("board-posts");
    this.notepadListEl = document.getElementById("notepad-list");
    this.notepadViewerEl = document.getElementById("notepad-viewer");
    document.getElementById("create-game-btn").addEventListener("click", () => {
      const handle = this.getHandle();
      if (!handle) return;
      try {
        const game = this.world.games.ticTacToe.createGame(handle);
        this.selectedGameId = game.id;
        this.onWorldChange();
        this.render();
      } catch (err) {
        console.error("[UI] Create game error:", err);
      }
    });
    this.boardAreaEl.addEventListener("click", (e) => {
      const cell = e.target.closest(".cell:not(.disabled)");
      if (!cell) return;
      const pos = parseInt(cell.dataset.pos, 10);
      const handle = this.getHandle();
      if (!this.selectedGameId) return;
      try {
        this.world.games.ticTacToe.makeMove(this.selectedGameId, handle, pos);
        this.onWorldChange();
        this.render();
      } catch (err) {
        console.error("[UI] Move error:", err);
      }
    });
    document.getElementById("chat-send-btn").addEventListener("click", () => this.sendChat());
    this.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.sendChat();
    });
    document.getElementById("board-post-btn").addEventListener("click", () => this.postToBoard());
    document.getElementById("board-title-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.postToBoard();
    });
    document.querySelectorAll(".collapsible").forEach((el) => {
      el.addEventListener("click", () => el.classList.toggle("collapsed"));
    });
    this.notepadListEl.addEventListener("click", (e) => {
      const item = e.target.closest(".notepad-item");
      if (!item) return;
      const name = item.dataset.name;
      this.selectedNotepad = this.selectedNotepad === name ? null : name;
      this.renderNotepads();
    });
    this.inspectorTabsEl = document.getElementById("inspector-tabs");
    this.inspectorBodyEl = document.getElementById("inspector-body");
    this.inspectorTabsEl.addEventListener("click", (e) => {
      const tab = e.target.closest(".inspector-tab");
      if (!tab) return;
      const idx = parseInt(tab.dataset.idx, 10);
      if (!isNaN(idx)) {
        this.selectedActantIdx = idx;
        this.saveUIState();
        this.renderActants();
      }
    });
    this.dynamicSelectEl = document.getElementById("dynamic-notepad-select");
    this.dynamicContainerEl = document.getElementById("dynamic-panel-container");
    this.dynamicErrorEl = document.getElementById("dynamic-panel-error");
    this.dynamicSelectEl.addEventListener("change", () => {
      this.selectedDynamicNotepad = this.dynamicSelectEl.value || null;
      this.dynamicCachedSource = null;
      this.dynamicCompiledFn = null;
      this.dynamicContainerEl.innerHTML = "";
      delete this.dynamicContainerEl.__initialized;
      this.dynamicErrorEl.classList.remove("visible");
      this.saveUIState();
    });
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        this.selectedActantIdx = state.inspectorTab ?? 0;
        this.selectedDynamicNotepad = state.dynamicNotepad ?? null;
      }
    } catch {
    }
  }
  postToBoard() {
    const titleInput = document.getElementById("board-title-input");
    const bodyInput = document.getElementById("board-body-input");
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title) return;
    const handle = this.getHandle();
    this.world.commons.board.post(handle, title, body);
    titleInput.value = "";
    bodyInput.value = "";
    this.onWorldChange();
    this.render();
  }
  sendChat() {
    const text = this.chatInput.value.trim();
    if (!text) return;
    const handle = this.getHandle();
    this.world.social.chat.post(handle, text);
    this.chatInput.value = "";
    this.onWorldChange();
    this.render();
  }
  getHandle() {
    return this.handleInput.value.trim() || "Player";
  }
  // ── Rendering ─────────────────────────────────────────────
  render() {
    this.renderGameList();
    this.renderBoard();
    this.renderBulletinBoard();
    this.renderNotepads();
    this.renderChat();
    this.renderCanvas();
    this.renderActants();
    this.renderDynamicPanel();
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
            this.onWorldChange();
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
  }
  renderChat() {
    const messages = this.world.social.chat.all();
    if (messages.length === 0) {
      this.chatEl.innerHTML = '<div class="chat-empty">No messages yet.</div>';
      return;
    }
    this.chatEl.innerHTML = messages.map((m) => {
      const time = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<div class="chat-msg"><span class="chat-time">${time}</span> <span class="chat-handle">${escapeHtml(m.handle)}</span>: ${escapeHtml(m.text)}</div>`;
    }).join("");
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }
  renderCanvas() {
    this.canvasEl.textContent = this.world.art.sharedCanvas.read();
  }
  renderBulletinBoard() {
    const posts = this.world.commons.board.read();
    if (posts.length === 0) {
      this.boardPostsEl.innerHTML = '<div class="board-empty">No posts yet.</div>';
      return;
    }
    this.boardPostsEl.innerHTML = posts.map((p) => {
      const time = new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const date = new Date(p.ts).toLocaleDateString([], { month: "short", day: "numeric" });
      return `<div class="board-post">
        <div class="board-post-header">
          <span class="board-post-title">${escapeHtml(p.title)}</span>
          <span class="board-post-meta">${escapeHtml(p.handle)} \xB7 ${date} ${time}</span>
        </div>
        ${p.body ? `<div class="board-post-body">${escapeHtml(p.body)}</div>` : ""}
      </div>`;
    }).join("");
  }
  renderNotepads() {
    const names = this.world.commons.notepads.list();
    if (names.length === 0) {
      this.notepadListEl.innerHTML = '<div class="notepad-empty">No notepads yet.</div>';
      this.notepadViewerEl.innerHTML = "";
      return;
    }
    this.notepadListEl.innerHTML = names.map((name) => {
      const selected = name === this.selectedNotepad ? " selected" : "";
      return `<div class="notepad-item${selected}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`;
    }).join("");
    if (this.selectedNotepad) {
      const content = this.world.commons.notepads.read(this.selectedNotepad);
      if (content !== null) {
        this.notepadViewerEl.innerHTML = `<div class="notepad-viewer-label">${escapeHtml(this.selectedNotepad)}</div>${escapeHtml(content)}`;
      } else {
        this.selectedNotepad = null;
        this.notepadViewerEl.innerHTML = "";
      }
    } else {
      this.notepadViewerEl.innerHTML = "";
    }
  }
  renderActants() {
    this.inspectorTabsEl.innerHTML = this.actants.map((a2, i) => {
      const active = i === this.selectedActantIdx ? " active" : "";
      const dotCls = a2.status === "thinking" ? "thinking" : "idle";
      return `<div class="inspector-tab${active}" data-idx="${i}">
        ${escapeHtml(a2.soma.gamer_handle)}
        <span class="status-dot ${dotCls}"></span>
      </div>`;
    }).join("");
    const a = this.actants[this.selectedActantIdx];
    if (!a) {
      this.inspectorBodyEl.innerHTML = "";
      return;
    }
    const statusCls = a.status === "thinking" ? "thinking" : "idle";
    const toolsHtml = a.soma.custom_tools.map(
      (t) => `<div class="soma-tool-item">
        <div class="soma-tool-name">${escapeHtml(t.name)}</div>
        <div class="soma-tool-desc">${escapeHtml(t.description)}</div>
      </div>`
    ).join("");
    this.inspectorBodyEl.innerHTML = `
      <div class="soma-header">
        <span class="soma-handle">${escapeHtml(a.soma.gamer_handle)}</span>
        <span class="soma-status ${statusCls}">${a.status} \xB7 tick #${a.tickCount}</span>
      </div>
      ${somaSection("last think", a.lastThinkPrompt || "(none)")}
      ${somaSection("identity", a.soma.identity)}
      ${somaSection("memory", a.soma.memory)}
      ${somaSection("on_tick", a.soma.on_tick, true)}
      <div class="soma-section">
        <div class="soma-section-label">custom_tools (${a.soma.custom_tools.length})</div>
        ${toolsHtml}
      </div>`;
  }
  renderDynamicPanel() {
    const names = this.world.commons.notepads.list();
    const currentOptions = Array.from(this.dynamicSelectEl.options).map((o) => o.value);
    const desiredOptions = ["", ...names];
    if (JSON.stringify(currentOptions) !== JSON.stringify(desiredOptions)) {
      const selected = this.selectedDynamicNotepad;
      this.dynamicSelectEl.innerHTML = '<option value="">(none)</option>' + names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
      if (selected && names.includes(selected)) {
        this.dynamicSelectEl.value = selected;
      } else if (selected && !names.includes(selected)) {
        this.selectedDynamicNotepad = null;
        this.dynamicCachedSource = null;
        this.dynamicCompiledFn = null;
        this.dynamicContainerEl.innerHTML = "";
        delete this.dynamicContainerEl.__initialized;
      }
    }
    if (!this.selectedDynamicNotepad) {
      if (this.dynamicContainerEl.innerHTML) this.dynamicContainerEl.innerHTML = "";
      this.dynamicErrorEl.classList.remove("visible");
      return;
    }
    const source = this.world.commons.notepads.read(this.selectedDynamicNotepad);
    if (source === null) {
      this.dynamicContainerEl.innerHTML = "";
      this.dynamicErrorEl.classList.remove("visible");
      return;
    }
    if (source !== this.dynamicCachedSource) {
      this.dynamicCachedSource = source;
      this.dynamicCompiledFn = null;
      this.dynamicContainerEl.innerHTML = "";
      delete this.dynamicContainerEl.__initialized;
      this.dynamicErrorEl.classList.remove("visible");
      try {
        const fn = new Function("return " + source)();
        if (typeof fn !== "function") {
          throw new Error("Notepad content must be a function(el, getWorld) { ... }");
        }
        this.dynamicCompiledFn = fn;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.dynamicErrorEl.textContent = `Compile error: ${msg}`;
        this.dynamicErrorEl.classList.add("visible");
        console.error("[DYNAMIC PANEL] Compile error:", err);
        return;
      }
    }
    if (this.dynamicCompiledFn) {
      const getWorld = (cb) => {
        const result = cb(this.world);
        this.onWorldChange();
        return result;
      };
      try {
        this.dynamicCompiledFn(this.dynamicContainerEl, getWorld);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.dynamicErrorEl.textContent = `Runtime error: ${msg}`;
        this.dynamicErrorEl.classList.add("visible");
        console.error("[DYNAMIC PANEL] Runtime error:", err);
      }
    }
  }
  saveUIState() {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      inspectorTab: this.selectedActantIdx,
      dynamicNotepad: this.selectedDynamicNotepad
    }));
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
function somaSection(label, content, isCode = false) {
  const empty = !content || content === "(none)";
  const cls = isCode ? "soma-section-content code" : empty ? "soma-section-content empty" : "soma-section-content";
  const display = empty ? "(empty)" : escapeHtml(content);
  return `<div class="soma-section">
    <div class="soma-section-label">${label}</div>
    <div class="${cls}">${display}</div>
  </div>`;
}

// src/main.ts
var SOMAS_KEY = "habitat-somas";
var GAMES_KEY = "habitat-games";
var CHAT_KEY = "habitat-chat";
var CANVAS_KEY = "habitat-canvas";
var NOTEPADS_KEY = "habitat-notepads";
var BOARD_KEY = "habitat-board";
var UI_STATE_KEY2 = "habitat-ui";
var ALL_KEYS = [SOMAS_KEY, GAMES_KEY, CHAT_KEY, CANVAS_KEY, NOTEPADS_KEY, BOARD_KEY, UI_STATE_KEY2];
function saveSomas(actants2) {
  localStorage.setItem(SOMAS_KEY, JSON.stringify(actants2.map((a) => a.soma)));
}
function loadSomas() {
  try {
    const raw = localStorage.getItem(SOMAS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveWorld() {
  localStorage.setItem(GAMES_KEY, JSON.stringify(tttServer.toJSON()));
  localStorage.setItem(CHAT_KEY, JSON.stringify(chatServer.toJSON()));
  localStorage.setItem(CANVAS_KEY, JSON.stringify(canvasServer.toJSON()));
  localStorage.setItem(NOTEPADS_KEY, JSON.stringify(notepadServer.toJSON()));
  localStorage.setItem(BOARD_KEY, JSON.stringify(boardServer.toJSON()));
}
function saveAll() {
  saveSomas(actants);
  saveWorld();
}
var tttServer;
var chatServer;
var canvasServer;
try {
  const gamesRaw = localStorage.getItem(GAMES_KEY);
  tttServer = gamesRaw ? TicTacToeServer.fromJSON(JSON.parse(gamesRaw)) : new TicTacToeServer();
} catch {
  tttServer = new TicTacToeServer();
}
try {
  const chatRaw = localStorage.getItem(CHAT_KEY);
  chatServer = chatRaw ? ChatServer.fromJSON(JSON.parse(chatRaw)) : new ChatServer();
} catch {
  chatServer = new ChatServer();
}
try {
  const canvasRaw = localStorage.getItem(CANVAS_KEY);
  canvasServer = canvasRaw ? CanvasServer.fromJSON(JSON.parse(canvasRaw)) : new CanvasServer();
} catch {
  canvasServer = new CanvasServer();
}
var notepadServer;
try {
  const notepadsRaw = localStorage.getItem(NOTEPADS_KEY);
  notepadServer = notepadsRaw ? NotepadServer.fromJSON(JSON.parse(notepadsRaw)) : new NotepadServer();
} catch {
  notepadServer = new NotepadServer();
}
var boardServer;
try {
  const boardRaw = localStorage.getItem(BOARD_KEY);
  boardServer = boardRaw ? BoardServer.fromJSON(JSON.parse(boardRaw)) : new BoardServer();
} catch {
  boardServer = new BoardServer();
}
var world = buildWorld(tttServer, chatServer, canvasServer, notepadServer, boardServer);
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
  if (!resetting) saveAll();
};
beta.tick = async function() {
  await origBetaTick();
  if (!resetting) saveAll();
};
var ui = new HabitatUI(world, actants, saveWorld);
alpha.startTicking(0);
beta.startTicking(15e3);
ui.startRendering();
var resetting = false;
document.getElementById("reset-btn").addEventListener("click", () => {
  resetting = true;
  alpha.stopTicking();
  beta.stopTicking();
  ui.stopRendering();
  ALL_KEYS.forEach((k) => localStorage.removeItem(k));
  location.reload();
});
console.log("[HABITAT] Initialized \u2014 2 actants, world state restored");
window.__habitat = {
  world,
  alpha,
  beta,
  ui,
  saveAll,
  resetAll: () => {
    resetting = true;
    alpha.stopTicking();
    beta.stopTicking();
    ui.stopRendering();
    ALL_KEYS.forEach((k) => localStorage.removeItem(k));
    location.reload();
  }
};
//# sourceMappingURL=main.js.map
