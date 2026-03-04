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
    function_body: `return world.games.ticTacToe.listGames();`,
  },
  {
    name: 'create_game',
    description: 'Create a new tic-tac-toe game. You will be player X, waiting for an opponent.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `return world.games.ticTacToe.createGame(me.gamer_handle.read());`,
  },
  {
    name: 'find_game',
    description: 'Find an open tic-tac-toe game and join it. Returns the game if one was found, or null.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    function_body: `
      const games = world.games.ticTacToe.listGames();
      const open = games.find(g => g.status === 'waiting' && g.players.X !== me.gamer_handle.read());
      if (!open) return null;
      return world.games.ticTacToe.joinGame(open.id, me.gamer_handle.read());
    `,
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
    function_body: `return world.games.ticTacToe.makeMove(input.game_id, me.gamer_handle.read(), input.position);`,
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
    function_body: `return world.games.ticTacToe.getGame(input.game_id);`,
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
    function_body: `me.gamer_handle.write(input.handle); return { success: true };`,
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
    function_body: `me.identity.write(input.content); return { success: true };`,
  },
  {
    name: 'edit_on_tick',
    description: 'Rewrite your on_tick code. This code runs every tick with (me, world) as arguments. It typically calls me.thinkAbout() to trigger your thinking.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'New on_tick JavaScript code' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    function_body: `me.on_tick.write(input.code); return { success: true };`,
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
    function_body: `me.memory.write(input.content); return { success: true };`,
  },
  {
    name: 'add_custom_tool',
    description: 'Add a new custom tool to your toolkit. The function_body receives (input, me, world).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name (snake_case)' },
        description: { type: 'string', description: 'What the tool does' },
        input_schema: { type: 'string', description: 'JSON string of the Anthropic tool input_schema' },
        function_body: { type: 'string', description: 'JavaScript function body. Receives (input, me, world).' },
      },
      required: ['name', 'description', 'input_schema', 'function_body'],
      additionalProperties: false,
    },
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const schema = JSON.parse(input.input_schema);
      tools.push({ name: input.name, description: input.description, input_schema: schema, function_body: input.function_body });
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' added." };
    `,
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
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const tool = tools.find(t => t.name === input.name);
      if (!tool) return { success: false, error: "Tool '" + input.name + "' not found." };
      if (input.new_description) tool.description = input.new_description;
      if (input.new_input_schema) tool.input_schema = JSON.parse(input.new_input_schema);
      if (input.new_function_body) tool.function_body = input.new_function_body;
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' updated." };
    `,
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
    function_body: `
      const tools = JSON.parse(me.custom_tools.read());
      const idx = tools.findIndex(t => t.name === input.name);
      if (idx === -1) return { success: false, error: "Tool '" + input.name + "' not found." };
      tools.splice(idx, 1);
      me.custom_tools.write(JSON.stringify(tools));
      return { success: true, message: "Tool '" + input.name + "' removed." };
    `,
  },
];

// ── Default soma factory ──────────────────────────────────────

const DEFAULT_ON_TICK = `await me.thinkAbout("What should I do?");`;

export function createDefaultSoma(id: string): Soma {
  return {
    id,
    gamer_handle: id,
    identity: `I am ${id}. I exist in a digital habitat with other entities. I like to play games and explore what I can do. I take action rather than just observing.`,
    on_tick: DEFAULT_ON_TICK,
    memory: '',
    custom_tools: [...DEFAULT_GAME_TOOLS, ...DEFAULT_SOMA_TOOLS].map(t => ({ ...t })),
  };
}

// ── Serialization (soma → system prompt) ──────────────────────

export function serializeSoma(soma: Soma): string {
  const toolsText = soma.custom_tools.map(t => {
    const schema = JSON.stringify(t.input_schema, null, 2);
    return `  <tool name="${t.name}">
    <description>${t.description}</description>
    <input_schema>${schema}</input_schema>
    <function_body>${t.function_body}</function_body>
  </tool>`;
  }).join('\n');

  return `You are an actant — a digital entity that lives in a habitat. This is your soma (body/mind). Act, don't narrate.

<gamer_handle>${soma.gamer_handle}</gamer_handle>

<identity>${soma.identity}</identity>

<on_tick>
${soma.on_tick}
</on_tick>

<memory>${soma.memory}</memory>

<custom_tools>
${toolsText}
</custom_tools>`;
}

// ── Tool extraction (soma → Anthropic tools param) ────────────

export function extractToolSchemas(soma: Soma): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return soma.custom_tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}
