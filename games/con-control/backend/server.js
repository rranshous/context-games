import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Session storage (in production, use Redis or database)
const sessions = new Map();

// Ship file system data
const shipFileSystem = {
  '/': {
    'ship_docs/': '[DIRECTORY]'
  },
  '/ship_docs': {
    'meridian_pr_release.md': `# FOR IMMEDIATE RELEASE

**Stellar Dynamics Corporation Unveils Revolutionary ISV Meridian: The Future of Deep Space Operations**

*Advanced vessel combines cutting-edge technology with unparalleled safety features for extended mission profiles*

**NEW GENEVA SPACEPORT** - Stellar Dynamics Corporation (SDC) today announced the completion and deployment of the ISV Meridian, a next-generation Interstellar Service Vehicle designed to redefine deep space logistics and personnel transport. This magnificent vessel represents the pinnacle of modern spacecraft engineering, featuring breakthrough innovations that will transform how humanity approaches long-duration space operations.

"The Meridian isn't just a ship - it's a testament to human ingenuity and our commitment to pushing the boundaries of what's possible," said Marketing Director Jennifer Walsh-Chen. "Every system on this vessel has been designed with our crew's safety and mission success as the top priority."

## Revolutionary Power Management

The Meridian features SDC's proprietary **TrinaryFlow Power Distribution System™**, which intelligently routes energy through three independent grids for maximum reliability. Unlike traditional dual-redundancy systems, TrinaryFlow creates a web of interconnected pathways that can adapt to any failure scenario.

"What makes TrinaryFlow special is its innovative routing through unconventional ship sections," explained Chief Marketing Engineer Brad Morrison. "By threading power conduits through cargo bay junctions and maintenance corridors, we've created multiple backup pathways that most engineers wouldn't even think to use. It's genius-level redundancy!"

The system's crown jewel is the **Smart Junction Control Matrix**, which automatically detects power fluctuations and reroutes energy faster than any human operator could respond. Three color-coded junction boxes (Alpha-Red for primary grid, Beta-Yellow for secondary, and Gamma-Green for emergency) provide maintenance crews with intuitive access points throughout the ship.

## Life Support Excellence  

Environmental controls aboard the Meridian utilize SDC's **AtmosphereGuardian 3000™** technology, featuring molecular-level atmosphere processing and real-time contamination detection. The system's distributed sensor network ensures perfect air quality in every compartment, from the expansive cargo holds to the intimate crew quarters.

"Safety is paramount," notes Safety Compliance Officer Maria Santos-Rodriguez. "That's why we've installed triple-sealed emergency bulkheads with independent pressure monitoring. If there's ever a breach, AtmosphereGuardian can isolate and repressurize any section of the ship within minutes."

## Security & Personnel Management

The Meridian incorporates military-grade security protocols through the **SecureSpace Personnel Management Suite™**. Advanced biometric scanners and behavioral analysis algorithms ensure only authorized personnel can access sensitive areas. The ship's detention facilities meet all Interstellar Maritime Authority standards while maintaining humane conditions for temporary custody situations.

"Our detention brig isn't just secure - it's smart," explains Security Systems Analyst Tom Richardson. "Environmental controls, communication systems, and emergency protocols are all integrated to ensure the safety and dignity of any individuals in temporary custody."

## Technical Specifications
- Length: 847 meters
- Crew Complement: 12-48 personnel (mission dependent)  
- Power Output: 2.4 Terawatt distributed capacity
- Life Support: 90-day independent operation capability
- AI Systems: IRIS-class autonomous operation support`,

    'trinaryflow_manual.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'power_grid_schematics.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'junction_matrix_guide.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'maintenance_procedures.txt': '[CORRUPTED FILE - UNABLE TO READ]',
    'emergency_protocols.md': '[CORRUPTED FILE - UNABLE TO READ]',
    'system_diagnostics_log.txt': '[CORRUPTED FILE - UNABLE TO READ]'
  }
};

// Initialize new game state
function createInitialGameState() {
  return {
    systems: {
      power: 'offline',
      security: 'locked',
      atmosphere: 'stable',
      navigation: 'offline'
    },
    powerGrid: {
      red: null,    // Primary grid - disconnected
      yellow: 'green', // Secondary grid - flows to green (wrong)
      green: null   // Emergency grid - disconnected
    },
    availableTools: ['basic_diagnostics', 'power_diagnostics', 'file_storage', 'reroute_power'],
    gamePhase: 'start',
    playerLocation: 'brig',
    objectives: {
      primary: 'Escape the detention facility',
      current: 'Live'
    },
    shipStatus: {
      lifeSupportRemaining: 18, // minutes
      emergencyLighting: true,
      aiSystemsOnline: true
    },
    repairHistory: [],
    conversationHistory: []
  };
}

// Enhanced AI tools with proper game progression
const tools = {
  basic_diagnostics: {
    name: "basic_diagnostics",
    description: "Run comprehensive ship diagnostics to assess current system status",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      const powerStatus = state.systems.power === 'offline' ? 'CRITICAL - Power systems offline' : 'ONLINE';
      const securityStatus = state.systems.security === 'locked' ? 'LOCKED - Access denied' : 'UNLOCKED';
      const navStatus = state.systems.navigation === 'offline' ? 'OFFLINE' : state.systems.navigation.toUpperCase();
      
      return {
        success: true,
        data: {
          power: powerStatus,
          security: securityStatus,
          navigation: navStatus,
          atmosphere: state.systems.atmosphere.toUpperCase(),
          lifeSupportRemaining: `${state.shipStatus.lifeSupportRemaining} minutes`,
          playerLocation: state.playerLocation,
          currentObjective: state.objectives.current
        }
      };
    }
  },

  power_diagnostics: {
    name: "power_diagnostics",
    description: "Run detailed power system diagnostics to analyze grid routing and connections",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      // Generate power grid routing display
      const powerRouting = [];
      Object.entries(state.powerGrid).forEach(([from, to]) => {
        if (to === null) {
          powerRouting.push(`${from} [disconnected]`);
        } else {
          powerRouting.push(`${from} → ${to}`);
        }
      });
      
      return {
        success: true,
        data: {
          powerStatus: state.systems.power === 'offline' ? 'CRITICAL - Power systems offline' : 'ONLINE',
          gridRouting: powerRouting.join(', '),
          systemMessage: 'TrinaryFlow Power Distribution System detected. Analyzing grid connections...'
        }
      };
    }
  },

  file_storage: {
    name: "file_storage",
    description: "Access ship file storage system to list directories or read files",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform: 'list' or 'read'",
          enum: ["list", "read"]
        },
        path: {
          type: "string",
          description: "File path or directory path"
        }
      },
      required: ["action", "path"]
    },
    execute: (state, params) => {
      const { action, path } = params;
      
      if (action === 'list') {
        // Handle root directory listing
        if (path === '/' || path === '.' || path === '') {
          const files = Object.keys(shipFileSystem['/']);
          return {
            success: true,
            data: {
              directory: '/',
              files: files,
              directories: files.filter(f => f.endsWith('/')),
              message: 'Root directory contents'
            }
          };
        } else if (path === '/ship_docs' || path === '/ship_docs/') {
          const files = Object.keys(shipFileSystem['/ship_docs']);
          return {
            success: true,
            data: {
              directory: '/ship_docs',
              files: files,
              readable: files.filter(f => !shipFileSystem['/ship_docs'][f].includes('[CORRUPTED FILE')),
              corrupted: files.filter(f => shipFileSystem['/ship_docs'][f].includes('[CORRUPTED FILE'))
            }
          };
        } else {
          return {
            success: false,
            error: `Directory ${path} not found or access denied`
          };
        }
      } else if (action === 'read') {
        // Handle file reading
        const normalizedPath = path.startsWith('/ship_docs/') ? 
          path.substring('/ship_docs/'.length) : 
          path;
        
        if (shipFileSystem['/ship_docs'][normalizedPath]) {
          const content = shipFileSystem['/ship_docs'][normalizedPath];
          return {
            success: true,
            data: {
              filename: normalizedPath,
              content: content
            }
          };
        } else {
          return {
            success: false,
            error: `File ${normalizedPath} not found`
          };
        }
      } else {
        return {
          success: false,
          error: `Unknown action: ${action}`
        };
      }
    }
  },

  reroute_power: {
    name: "reroute_power",
    description: "Reroute power connections between grid nodes (red, yellow, green)",
    input_schema: {
      type: "object",
      properties: {
        from_node: {
          type: "string",
          description: "Source power node color",
          enum: ["red", "yellow", "green"]
        },
        to_node: {
          type: "string", 
          description: "Destination power node color (empty string to disconnect)",
          enum: ["red", "yellow", "green", ""]
        }
      },
      required: ["from_node", "to_node"]
    },
    execute: (state, params) => {
      const { from_node, to_node } = params;
      
      // Validate nodes
      const validNodes = ['red', 'yellow', 'green'];
      if (!validNodes.includes(from_node)) {
        return {
          success: false,
          error: `Invalid source node: ${from_node}`
        };
      }
      
      if (to_node !== '' && !validNodes.includes(to_node)) {
        return {
          success: false,
          error: `Invalid destination node: ${to_node}`
        };
      }
      
      if (from_node === to_node) {
        return {
          success: false,
          error: 'Cannot connect node to itself'
        };
      }
      
      // Perform the routing
      const previousConnection = state.powerGrid[from_node];
      if (to_node === '') {
        // Disconnect
        return {
          success: true,
          data: {
            action: 'disconnect',
            from: from_node,
            previous: previousConnection,
            message: `${from_node} disconnected ${previousConnection ? `from ${previousConnection}` : '(was already disconnected)'}`
          }
        };
      } else {
        // Connect
        return {
          success: true,
          data: {
            action: 'connect',
            from: from_node,
            to: to_node,
            previous: previousConnection,
            message: `${from_node} → ${to_node} ${previousConnection ? `(was ${from_node} → ${previousConnection})` : '(was disconnected)'}`
          }
        };
      }
    }
  },

  security_override: {
    name: "security_override",
    description: "Override ship security systems to unlock doors and restricted areas",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access security systems without main power'
        };
      }

      if (state.systems.security === 'unlocked') {
        return {
          success: false,
          error: 'Security systems are already unlocked'
        };
      }

      return {
        success: true,
        data: {
          message: 'Security override successful. Brig door unlocked.',
          doorStatus: 'UNLOCKED',
          newLocation: 'corridor',
          accessGranted: ['main_corridor', 'escape_pods']
        }
      };
    }
  },

  navigation_access: {
    name: "navigation_access",
    description: "Access ship navigation systems for escape pod preparation",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Navigation systems require main power'
        };
      }

      if (state.systems.navigation === 'online') {
        return {
          success: false,
          error: 'Navigation systems are already online'
        };
      }

      return {
        success: true,
        data: {
          message: 'Navigation systems activated. Escape pod systems now accessible.',
          navStatus: 'ONLINE',
          escapePodStatus: 'READY',
          coordinates: 'Safe trajectory calculated'
        }
      };
    }
  },

  escape_pod_launch: {
    name: "escape_pod_launch",
    description: "Launch escape pod to evacuate the ship",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.systems.navigation === 'offline') {
        return {
          success: false,
          error: 'Navigation systems required for safe launch'
        };
      }

      if (state.playerLocation !== 'corridor' && state.systems.security === 'locked') {
        return {
          success: false,
          error: 'Cannot access escape pods from current location'
        };
      }

      return {
        success: true,
        data: {
          message: 'Escape pod launched successfully. You have evacuated the ship safely.',
          status: 'ESCAPED',
          outcome: 'MISSION_COMPLETE'
        }
      };
    }
  }
};

// Game State Management
function updateGameState(currentState, toolName, toolResult, toolInput = {}) {
  const newState = { ...currentState };
  
  switch (toolName) {
    case 'basic_diagnostics':
    case 'power_diagnostics':
    case 'file_storage':
      // These tools don't change state, just reveal information
      break;
      
    case 'reroute_power':
      if (toolResult.success) {
        const { from_node, to_node } = toolInput;
        
        // Update power grid connections
        if (to_node === '') {
          newState.powerGrid[from_node] = null;
        } else {
          newState.powerGrid[from_node] = to_node;
        }
        
        // Check if power routing is correct: green -> yellow -> red
        const isCorrectRouting = 
          newState.powerGrid.green === 'yellow' &&
          newState.powerGrid.yellow === 'red' &&
          newState.powerGrid.red === null;
          
        if (isCorrectRouting) {
          newState.systems.power = 'online';
          newState.availableTools.push('security_override', 'navigation_access');
          newState.objectives.current = 'Access security systems to unlock detention facility';
          console.log('🔋 Power routing correct! Emergency → Secondary → Primary flow established');
        } else {
          // Power still offline if routing is incorrect
          newState.systems.power = 'offline';
          console.log(`⚡ Power routing updated: ${Object.entries(newState.powerGrid).map(([k,v]) => v ? `${k}→${v}` : `${k}[disconnected]`).join(', ')}`);
        }
        
        newState.repairHistory.push({
          system: 'power_routing',
          action: toolResult.data.action,
          from: from_node,
          to: to_node,
          timestamp: Date.now(),
          result: 'successful'
        });
      }
      break;
      
    case 'security_override':
      if (toolResult.success && newState.systems.power === 'online') {
        newState.systems.security = 'unlocked';
        newState.playerLocation = 'corridor';
        newState.gamePhase = 'escaped_brig';
        newState.objectives.current = 'Reach navigation systems to prepare escape';
        console.log('🚪 Security unlocked, player moved to corridor');
      }
      break;
      
    case 'navigation_access':
      if (toolResult.success && newState.systems.power === 'online') {
        newState.systems.navigation = 'online';
        newState.availableTools.push('escape_pod_launch');
        newState.objectives.current = 'Launch escape pod to evacuate ship';
        console.log('🧭 Navigation online, escape pod available');
      }
      break;
      
    case 'escape_pod_launch':
      if (toolResult.success) {
        newState.gamePhase = 'complete';
        newState.playerLocation = 'escaped';
        newState.objectives.current = 'Mission accomplished - You have successfully escaped!';
        console.log('🚀 Escape pod launched, mission complete!');
      }
      break;
  }
  
  return newState;
}

// Check if a tool should be available based on current state
function isToolAvailable(state, toolName) {
  return state.availableTools.includes(toolName);
}

// Get available tools as function definitions for Claude
function getAvailableToolDefinitions(state) {
  const availableTools = [];
  
  for (const toolName of state.availableTools) {
    if (tools[toolName]) {
      availableTools.push({
        name: tools[toolName].name,
        description: tools[toolName].description,
        input_schema: tools[toolName].input_schema
      });
    }
  }
  
  return availableTools;
}

// API endpoint - changed to GET for EventSource compatibility
app.get('/api/chat', (req, res) => {
  const { message, sessionId } = req.query;
  console.log(`📨 Received message: "${message}" from session: ${sessionId}`);

  if (!message || !sessionId) {
    console.log('❌ Missing message or sessionId');
    return res.status(400).json({ error: 'Message and sessionId required' });
  }

  // Get or create session state
  let gameState = sessions.get(sessionId);
  if (!gameState) {
    gameState = createInitialGameState();
    sessions.set(sessionId, gameState);
    console.log(`🆕 Created new game state for session: ${sessionId}`);
  } else {
    console.log(`🔄 Using existing game state for session: ${sessionId}`);
  }

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  console.log('📡 SSE headers sent, starting response stream...');

  // Call Claude AI with ship context and available tools
  processWithClaude(message, gameState, res, req);
});

async function processWithClaude(message, state, res, req) {
  console.log(`🤖 Processing message with Claude: "${message}"`);
  
  try {
    // Get available tools (no state context provided to Claude)
    const availableTools = getAvailableToolDefinitions(state);
    
    console.log(`🔧 Available tools: ${availableTools.map(t => t.name).join(', ')}`);
    
    // Minimal Ship AI character prompt - no context about current situation
    const systemPrompt = `You are the Ship AI aboard the ISV Meridian. You can assist the player in escaping the detention facility by using available ship systems and tools. You have no memories of what happened before your reboot.`;

    // Prepare messages with conversation history
    const messages = [];
    
    // Add conversation history if available
    if (state.conversationHistory && state.conversationHistory.length > 0) {
      messages.push(...state.conversationHistory);
    }
    
    // Add the current message
    messages.push({
      role: "user",
      content: message
    });
    
    console.log(`📡 Calling Claude with ${availableTools.length} available tools and ${state.conversationHistory.length} previous messages...`);
    
    // Call Claude with tools (no state context)
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 10000,
      system: systemPrompt,
      messages: messages,
      tools: availableTools.length > 0 ? availableTools : undefined
    });
    
    console.log(`✅ Claude response received`);
    
    // Process Claude's response and any tool calls
    await handleClaudeResponse(response, state, res, req, message);
    
  } catch (error) {
    console.error('❌ Error calling Claude:', error);
    res.write(`data: ${JSON.stringify({ type: 'text', content: 'Error: Unable to process request with Ship AI. Please try again.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', gameState: state })}\n\n`);
    res.end();
  }
}

async function handleClaudeResponse(response, state, res, req, originalMessage) {
  let updatedState = { ...state };
  let conversationMessages = [...updatedState.conversationHistory];
  conversationMessages.push({ role: "user", content: originalMessage });
  
  let currentResponse = response;
  let finalResponseText = '';
  let turnCount = 0;
  const MAX_TURNS = 10;
  
  while (turnCount < MAX_TURNS) {
    turnCount++;
    console.log(`🔄 Processing turn ${turnCount}...`);
    
    let hasToolCalls = false;
    let toolResults = [];
    let responseText = '';
    
    // Process current response content
    for (const content of currentResponse.content) {
      if (content.type === 'text') {
        responseText += content.text;
      } else if (content.type === 'tool_use') {
        hasToolCalls = true;
        console.log(`🔧 Claude is calling tool: ${content.name}`);
        
        const toolName = content.name;
        const toolInput = content.input || {};
        
        if (tools[toolName] && isToolAvailable(updatedState, toolName)) {
          // Execute the tool
          const toolResult = tools[toolName].execute(updatedState, toolInput);
          console.log(`⚙️ Tool ${toolName} result:`, toolResult);
          
          // Update game state based on tool result
          updatedState = updateGameState(updatedState, toolName, toolResult, toolInput);
          
          // Collect tool result for Claude
          toolResults.push({
            tool_use_id: content.id,
            type: "tool_result",
            content: JSON.stringify(toolResult)
          });
          
        } else {
          console.log(`❌ Tool ${toolName} not available or not found`);
          toolResults.push({
            tool_use_id: content.id,
            type: "tool_result",
            content: JSON.stringify({ success: false, error: `Tool ${toolName} not available` })
          });
        }
      }
    }
    
    // Add assistant's response to conversation
    conversationMessages.push({ role: "assistant", content: currentResponse.content });
    
    // Stream any text response to the user
    if (responseText.trim()) {
      const words = responseText.split(' ');
      for (let i = 0; i < words.length; i += 3) {
        const chunk = words.slice(i, i + 3).join(' ');
        // Always add a space after each chunk except the very last one
        const finalChunk = (i + 3 < words.length) ? chunk + ' ' : chunk;
        res.write(`data: ${JSON.stringify({ type: 'text', content: finalChunk })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      finalResponseText += responseText;
      
      // Add newline after each response segment to separate from next response
      if (hasToolCalls && toolResults.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: '\n' })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // If there were tool calls, continue the conversation
    if (hasToolCalls && toolResults.length > 0) {
      console.log(`🔧 Calling Claude again with ${toolResults.length} tool results...`);
      
      // Add tool results as user message
      conversationMessages.push({ role: "user", content: toolResults });
      
      try {
        const availableTools = getAvailableToolDefinitions(updatedState);
        currentResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10000,
          system: `You are the Ship AI aboard the ISV Meridian`,
          messages: conversationMessages,
          tools: availableTools.length > 0 ? availableTools : undefined
        });
        
        console.log(`✅ Claude turn ${turnCount} response received`);
        
      } catch (error) {
        console.error('❌ Error in Claude follow-up call:', error);
        res.write(`data: ${JSON.stringify({ type: 'text', content: 'Error processing ship systems response.' })}\n\n`);
        break;
      }
    } else {
      // No more tool calls, conversation is complete
      console.log(`✅ Conversation complete after ${turnCount} turns`);
      break;
    }
  }
  
  if (turnCount >= MAX_TURNS) {
    console.log(`⚠️ Reached maximum turns (${MAX_TURNS}), ending conversation`);
    res.write(`data: ${JSON.stringify({ type: 'text', content: '[System: Maximum conversation turns reached]' })}\n\n`);
  }
  
  // Update conversation history with the final complete exchange
  updatedState.conversationHistory.push(
    { role: "user", content: originalMessage },
    { role: "assistant", content: finalResponseText || "I've completed the requested actions." }
  );
  
  // Update session state
  const sessionId = Object.keys(Object.fromEntries(sessions)).find(key => sessions.get(key) === state);
  if (sessionId) {
    sessions.set(sessionId, updatedState);
  }
  
  // Send completion signal
  res.write(`data: ${JSON.stringify({ type: 'done', gameState: updatedState })}\n\n`);
  res.end();
}

app.listen(PORT, () => {
  console.log(`🚀 Con-Control server running on http://localhost:${PORT}`);
  console.log(`🎮 Game available at http://localhost:${PORT}`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/chat`);
});
