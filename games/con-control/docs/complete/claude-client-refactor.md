# Aggressive Model Logic Refactor

## Overview
Aggressively extracted all model-related logic from `server.js` into dedicated modules for clean separation of concerns.

## New Modules Created

### `claude-client.js` (90 lines)
- **`ClaudeClient`** class that wraps all Anthropic API interactions
- **`initialCall()`** method for the first message in a conversation
- **`followUpCall()`** method for subsequent calls with tool results
- Maintains all existing logging and error handling

### `tool-manager.js` (410 lines)
- **`tools`** object containing all tool definitions and execute functions
- **`executeTool()`** function for safe tool execution with error handling
- **`isToolAvailable()`** function for checking tool availability
- **`getAvailableToolDefinitions()`** function for generating Claude tool schemas

### `response-handler.js` (160 lines)
- **`ResponseHandler`** class that manages complete conversation flows
- **`handleConversation()`** method for processing Claude responses and tool execution
- **`streamText()`** method for streaming responses to the client
- Handles the entire conversation loop with tool calls and follow-ups

### `game-state.js` (116 lines)
- **`createInitialGameState()`** function for initializing new game sessions
- **`updateGameState()`** function for processing tool execution results
- Pure game logic separated from server concerns

### `ship-data.js` (54 lines)
- **`shipFileSystem`** data structure with all ship file content
- Clean separation of game data from logic

## Refactored: `server.js` (102 lines, down from 756 lines!)

### What Remains in Server
- Express setup and middleware
- Session management
- HTTP endpoint handling
- Module coordination

### What Was Removed
- ❌ All tool definitions (410 lines → tool-manager.js)
- ❌ Game state management functions (116 lines → game-state.js)
- ❌ Ship file system data (54 lines → ship-data.js)
- ❌ Response handling logic (160 lines → response-handler.js)
- ❌ Direct Claude API calls (90 lines → claude-client.js)
- ❌ Tool execution logic (now in tool-manager.js)
- ❌ Conversation flow management (now in response-handler.js)

## Benefits
1. **Massive Simplification**: Server.js reduced by 85% (654 lines removed)
2. **True Separation of Concerns**: Each module has a single responsibility
3. **Easier Testing**: Each module can be tested independently
4. **Better Maintainability**: Changes to game logic don't affect server logic
5. **Cleaner Dependencies**: Clear boundaries between API, game, and server concerns
6. **Future Streaming**: Foundation ready for streaming implementation within modules

## Module Dependencies
```
server.js
├── claude-client.js (Anthropic API)
├── response-handler.js (conversation flow)
│   ├── tool-manager.js (tool execution)
│   ├── game-state.js (state updates)
│   └── ship-data.js (game data)
└── game-state.js (initial state)
```

## API Compatibility
- ✅ All existing functionality preserved
- ✅ No changes to HTTP endpoints or client interface
- ✅ Same error handling and logging behavior
- ✅ Same game mechanics and progression

## Next Steps
- Ready for streaming refactor within the `ClaudeClient` and `ResponseHandler` classes
- Consider adding configuration management module
- Add comprehensive unit tests for each module
- Consider implementing caching layers for tool results
