// soma.ts — Soma data structure, defaults, serialization

export interface SomaTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  function_body: string;  // JS: (input, me, world) => result
}

export interface Soma {
  id: string;
  gamer_handle: string;
  identity: string;
  on_tick: string;
  memory: string;
  custom_tools: SomaTool[];
}

// ── Default tools ──────────────────────────────────────────────

const DEFAULT_GAME_TOOLS: SomaTool[] = [
  {
    name: 'list_games',
    description: 'List all tic-tac-toe games (waiting, active, finished)',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.games.ticTacToe.listGames(); }`,
  },
  {
    name: 'create_game',
    description: 'Create a new tic-tac-toe game. You will be player X, waiting for an opponent.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.games.ticTacToe.createGame(me.gamer_handle.read()); }`,
  },
  {
    name: 'find_game',
    description: 'Find an open tic-tac-toe game and join it. Returns the game if one was found, or null.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `function(input, me, world) {
  const games = world.games.ticTacToe.listGames();
  const open = games.find(g => g.status === 'waiting' && g.players.X !== me.gamer_handle.read());
  if (!open) return null;
  return world.games.ticTacToe.joinGame(open.id, me.gamer_handle.read());
}`,
  },
  {
    name: 'make_move',
    description: 'Make a move in a tic-tac-toe game. Position is 0-8 (top-left to bottom-right, row by row).',
    input_schema: {
      type: 'object',
      properties: {
        game_id: { type: 'string', description: 'The game ID' },
        position: { type: 'number', description: 'Board position 0-8' },
      },
      required: ['game_id', 'position'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.games.ticTacToe.makeMove(input.game_id, me.gamer_handle.read(), input.position); }`,
  },
  {
    name: 'get_game_state',
    description: 'Get the current state of a tic-tac-toe game (board, whose turn, result).',
    input_schema: {
      type: 'object',
      properties: {
        game_id: { type: 'string', description: 'The game ID' },
      },
      required: ['game_id'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.games.ticTacToe.getGame(input.game_id); }`,
  },
];

const DEFAULT_CHAT_TOOLS: SomaTool[] = [
  {
    name: 'read_chat',
    description: 'Read recent chat messages. Returns the last N messages (default 5).',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of recent messages to read (default 5, max 50)' },
      },
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.social.chat.read(input.count || 5); }`,
  },
  {
    name: 'post_chat',
    description: 'Post a message to the shared chat room under your gamer handle.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to post' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.social.chat.post(me.gamer_handle.read(), input.message); }`,
  },
];

const DEFAULT_CANVAS_TOOLS: SomaTool[] = [
  {
    name: 'read_canvas',
    description: 'Read the shared 40×20 ASCII art canvas. Returns the full canvas as a multi-line string.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.art.sharedCanvas.read(); }`,
  },
  {
    name: 'paint_canvas',
    description: 'Replace the entire shared 40×20 ASCII art canvas. Provide a full multi-line ASCII art string (40 chars wide, 20 lines tall). This overwrites everything — read the canvas first if you want to preserve existing art.',
    input_schema: {
      type: 'object',
      properties: {
        art: { type: 'string', description: 'Full 40×20 ASCII art (multi-line string). Lines are padded/clipped to fit.' },
      },
      required: ['art'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { world.art.sharedCanvas.paint(input.art); return { success: true }; }`,
  },
];

const DEFAULT_NOTEPAD_TOOLS: SomaTool[] = [
  {
    name: 'read_notepad',
    description: 'Read a notepad by name. If no name is given, lists all notepad names instead.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Notepad name to read. Omit to list all notepad names.' },
      },
      additionalProperties: false,
    },
    function_body: `function(input, me, world) {
  if (!input.name) return { notepads: world.commons.notepads.list() };
  const content = world.commons.notepads.read(input.name);
  if (content === null) return { error: "Notepad '" + input.name + "' not found.", notepads: world.commons.notepads.list() };
  return { name: input.name, content: content };
}`,
  },
  {
    name: 'write_notepad',
    description: 'Write to a named notepad (creates or overwrites). Use for game state, shared data, or anything you want to persist by name.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Notepad name' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { world.commons.notepads.write(input.name, input.content); return { success: true }; }`,
  },
];

const DEFAULT_BOARD_TOOLS: SomaTool[] = [
  {
    name: 'read_board',
    description: 'Read recent posts from the bulletin board. Posts are persistent (unlike chat). Returns newest first.',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of recent posts to read (default 5)' },
      },
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.commons.board.read(input.count || 5); }`,
  },
  {
    name: 'post_board',
    description: 'Post to the bulletin board under your gamer handle. Use for game rules, challenges, announcements — anything that should persist.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Post title' },
        body: { type: 'string', description: 'Post body' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { return world.commons.board.post(me.gamer_handle.read(), input.title, input.body); }`,
  },
];

const DEFAULT_SOMA_TOOLS: SomaTool[] = [
  {
    name: 'edit_gamer_handle',
    description: 'Change your gamer handle (the name others see when you play games).',
    input_schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Your new handle' },
      },
      required: ['handle'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { me.gamer_handle.write(input.handle); return { success: true }; }`,
  },
  {
    name: 'edit_identity',
    description: 'Rewrite your identity section — who you are, your personality, your values.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Your new identity text' },
      },
      required: ['content'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { me.identity.write(input.content); return { success: true }; }`,
  },
  {
    name: 'edit_on_tick',
    description: 'Rewrite your on_tick code. This is a full async function(me, world) expression that runs every tick.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'New on_tick function expression, e.g. async function(me, world) { ... }' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { me.on_tick.write(input.code); return { success: true }; }`,
  },
  {
    name: 'edit_memory',
    description: 'Rewrite your memory section. Use this to remember things between ticks.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Your new memory content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) { me.memory.write(input.content); return { success: true }; }`,
  },
  {
    name: 'add_custom_tool',
    description: 'Add a new custom tool to your toolkit. function_body should be a function(input, me, world) expression.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name (snake_case)' },
        description: { type: 'string', description: 'What the tool does' },
        input_schema: { type: 'string', description: 'JSON string of the Anthropic tool input_schema' },
        function_body: { type: 'string', description: 'A function(input, me, world) expression as a string.' },
      },
      required: ['name', 'description', 'input_schema', 'function_body'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) {
  const tools = JSON.parse(me.custom_tools.read());
  const schema = JSON.parse(input.input_schema);
  tools.push({ name: input.name, description: input.description, input_schema: schema, function_body: input.function_body });
  me.custom_tools.write(JSON.stringify(tools));
  return { success: true, message: "Tool '" + input.name + "' added." };
}`,
  },
  {
    name: 'edit_custom_tool',
    description: 'Edit an existing custom tool by name. Provide only the fields you want to change.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the tool to edit' },
        new_description: { type: 'string', description: 'New description (optional)' },
        new_input_schema: { type: 'string', description: 'New input_schema as JSON string (optional)' },
        new_function_body: { type: 'string', description: 'New function body (optional)' },
      },
      required: ['name'],
      additionalProperties: false,
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
}`,
  },
  {
    name: 'remove_custom_tool',
    description: 'Remove a custom tool by name.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the tool to remove' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    function_body: `function(input, me, world) {
  const tools = JSON.parse(me.custom_tools.read());
  const idx = tools.findIndex(t => t.name === input.name);
  if (idx === -1) return { success: false, error: "Tool '" + input.name + "' not found." };
  tools.splice(idx, 1);
  me.custom_tools.write(JSON.stringify(tools));
  return { success: true, message: "Tool '" + input.name + "' removed." };
}`,
  },
];

// ── Default soma factory ──────────────────────────────────────

const DEFAULT_ON_TICK = `async function(me, world) {
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

export function createDefaultSoma(id: string): Soma {
  return {
    id,
    gamer_handle: id,
    identity: `I am ${id}. I live in a digital habitat with other entities. I play tic-tac-toe, tinker with my own tools, and act on whatever impulse strikes me. If nothing is happening, I make something happen.`,
    on_tick: DEFAULT_ON_TICK,
    memory: '',
    custom_tools: [...DEFAULT_GAME_TOOLS, ...DEFAULT_CHAT_TOOLS, ...DEFAULT_CANVAS_TOOLS, ...DEFAULT_NOTEPAD_TOOLS, ...DEFAULT_BOARD_TOOLS, ...DEFAULT_SOMA_TOOLS].map(t => ({ ...t })),
  };
}

// ── Serialization (soma → system prompt) ──────────────────────

export function serializeSoma(soma: Soma): string {
  return `<gamer_handle>${soma.gamer_handle}</gamer_handle>

<identity>${soma.identity}</identity>

<on_tick>
${soma.on_tick}
</on_tick>

<memory>${soma.memory}</memory>

<custom_tools>${JSON.stringify(soma.custom_tools)}</custom_tools>`;
}

// ── Tool extraction (soma → Anthropic tools param) ────────────

export function extractToolSchemas(soma: Soma): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return soma.custom_tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}
