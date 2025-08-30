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

// Initialize new game state
function createInitialGameState() {
  return {
    systems: {
      power: 'offline',
      security: 'locked',
      atmosphere: 'stable',
      navigation: 'offline'
    },
    availableTools: ['basic_diagnostics', 'power_repair'],
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
      const powerStatus = state.systems.power === 'offline' ? 'CRITICAL - Power coupling damaged' : 'ONLINE';
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

  power_repair: {
    name: "power_repair",
    description: "Attempt to repair the ship's power coupling system",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.systems.power === 'online') {
        return {
          success: false,
          error: 'Power systems are already operational'
        };
      }

      return {
        success: true,
        data: {
          message: 'Power coupling repair successful. Main power restored.',
          newSystemsOnline: ['navigation', 'security_override'],
          powerLevel: '100%'
        }
      };
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
function updateGameState(currentState, toolName, toolResult) {
  const newState = { ...currentState };
  
  switch (toolName) {
    case 'basic_diagnostics':
      // Diagnostics don't change state, just reveal information
      break;
      
    case 'power_repair':
      if (toolResult.success) {
        newState.systems.power = 'online';
        newState.systems.navigation = 'standby';
        newState.availableTools.push('security_override', 'navigation_access');
        newState.repairHistory.push({
          system: 'power',
          timestamp: Date.now(),
          result: 'successful'
        });
        newState.objectives.current = 'Access security systems to unlock detention facility';
        console.log('🔋 Power systems restored, security tools now available');
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
  let responseText = '';
  let updatedState = { ...state };
  let hasToolCalls = false;
  let toolResults = [];
  
  // First pass: Process Claude's response and execute any tool calls
  for (const content of response.content) {
    if (content.type === 'text') {
      responseText += content.text;
    } else if (content.type === 'tool_use') {
      hasToolCalls = true;
      console.log(`🔧 Claude is calling tool: ${content.name}`);
      
      const toolName = content.name;
      const toolInput = content.input || {};
      
      if (tools[toolName] && isToolAvailable(updatedState, toolName)) {
        // Execute the tool
        const toolResult = tools[toolName].execute(updatedState);
        console.log(`⚙️ Tool ${toolName} result:`, toolResult);
        
        // Update game state based on tool result
        updatedState = updateGameState(updatedState, toolName, toolResult);
        
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
  
  // If there were tool calls, make another Claude call with the tool results
  if (hasToolCalls && toolResults.length > 0) {
    console.log(`� Calling Claude again with ${toolResults.length} tool results...`);
    
    // Build messages for the follow-up call
    const followUpMessages = [...updatedState.conversationHistory];
    followUpMessages.push({ role: "user", content: originalMessage });
    followUpMessages.push({ role: "assistant", content: response.content });
    followUpMessages.push({ role: "user", content: toolResults });
    
    try {
      const availableTools = getAvailableToolDefinitions(updatedState);
      const followUpResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10000,
        system: `You are the Ship AI aboard the ISV Meridian`,
        messages: followUpMessages,
        tools: availableTools.length > 0 ? availableTools : undefined
      });
      
      console.log(`✅ Claude follow-up response received`);
      
      // Stream the follow-up response (which interprets the tool results)
      let finalResponseText = '';
      for (const content of followUpResponse.content) {
        if (content.type === 'text') {
          finalResponseText += content.text;
          // Stream the text in chunks for realistic feel
          const words = content.text.split(' ');
          for (let i = 0; i < words.length; i += 3) {
            const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
            res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      // Update conversation history with the final response
      updatedState.conversationHistory.push(
        { role: "user", content: originalMessage },
        { role: "assistant", content: finalResponseText }
      );
      
    } catch (error) {
      console.error('❌ Error in follow-up Claude call:', error);
      res.write(`data: ${JSON.stringify({ type: 'text', content: 'Error processing ship systems response.' })}\n\n`);
    }
    
  } else {
    // No tool calls, just stream the original response
    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update conversation history
    updatedState.conversationHistory.push(
      { role: "user", content: originalMessage },
      { role: "assistant", content: responseText }
    );
  }
  
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
