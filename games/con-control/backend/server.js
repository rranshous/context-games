import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      security: 'locked'
    },
    availableTools: ['basic_diagnostics'],
    gamePhase: 'start'
  };
}

// Mock AI tools (we'll replace with actual Claude integration)
const tools = {
  basic_diagnostics: (state) => {
    const powerStatus = state.systems.power === 'offline' ? 'CRITICAL - Power coupling damaged' : 'ONLINE';
    const securityStatus = state.systems.security === 'locked' ? 'LOCKED - Access denied' : 'UNLOCKED';
    
    return {
      success: true,
      data: {
        power: powerStatus,
        security: securityStatus,
        lifeSupportRemaining: '18 minutes'
      }
    };
  },

  security_override: (state) => {
    if (state.systems.power === 'offline') {
      return {
        success: false,
        error: 'Cannot access security systems without power'
      };
    }

    // Update state - unlock security
    state.systems.security = 'unlocked';
    state.gamePhase = 'complete';
    
    return {
      success: true,
      data: {
        message: 'Security override successful. Brig door unlocked.',
        doorStatus: 'UNLOCKED'
      }
    };
  }
};

// API endpoint
app.post('/api/chat', (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: 'Message and sessionId required' });
  }

  // Get or create session state
  let gameState = sessions.get(sessionId);
  if (!gameState) {
    gameState = createInitialGameState();
    sessions.set(sessionId, gameState);
  }

  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Mock Ship AI response based on input and available tools
  simulateShipAIResponse(message, gameState, res);
});

function simulateShipAIResponse(message, state, res) {
  const lowerMessage = message.toLowerCase();

  // Ship AI character responses
  let responses = [];

  if (lowerMessage.includes('diagnostic') || lowerMessage.includes('status') || lowerMessage.includes('check')) {
    responses = [
      "Accessing ship diagnostic systems...",
      " running comprehensive scan...",
      " analyzing power distribution networks...",
      ""
    ];

    // Execute diagnostics tool
    const result = tools.basic_diagnostics(state);
    if (result.success) {
      responses.push(`Diagnostics complete. Power status: ${result.data.power}. Security: ${result.data.security}. Life support remaining: ${result.data.lifeSupportRemaining}.`);
      
      // Check if power repair completed (simple trigger)
      if (lowerMessage.includes('repair') && state.systems.power === 'offline') {
        responses.push(" Detecting power coupling repair attempt...");
        responses.push(" Power systems coming online!");
        state.systems.power = 'online';
        state.availableTools.push('security_override');
        responses.push(" I now have access to security override protocols!");
      }
    }
  } else if (lowerMessage.includes('door') || lowerMessage.includes('unlock') || lowerMessage.includes('override')) {
    if (!state.availableTools.includes('security_override')) {
      responses = [
        "I cannot access security override systems.",
        " My security tools are currently unavailable.",
        " Please ensure power systems are operational first."
      ];
    } else {
      responses = [
        "Attempting security override...",
        " accessing authorization protocols...",
        " bypassing security locks...",
        ""
      ];

      const result = tools.security_override(state);
      if (result.success) {
        responses.push(`${result.data.message} You are now free to leave the detention facility.`);
        responses.push(" Mission accomplished. Welcome back to full ship access.");
      } else {
        responses.push(`Security override failed: ${result.error}`);
      }
    }
  } else if (lowerMessage.includes('help') || lowerMessage.includes('what')) {
    responses = [
      "I am the ISV Meridian Ship AI, currently operating with limited functionality.",
      " Available commands: run diagnostics, check systems, repair power coupling, unlock door.",
      " My current tool access: " + state.availableTools.join(', ') + ".",
      " How may I assist you in resolving the current situation?"
    ];
  } else {
    responses = [
      "I acknowledge your input.",
      " Please specify what action you would like me to take.",
      " I can run diagnostics, attempt repairs, or override security systems if available.",
      " What are your instructions?"
    ];
  }

  // Stream responses with realistic delays
  let index = 0;
  const streamInterval = setInterval(() => {
    if (index < responses.length) {
      const content = responses[index];
      res.write(`data: ${JSON.stringify({ type: 'text', content })}\n\n`);
      index++;
    } else {
      res.write(`data: ${JSON.stringify({ type: 'done', gameState: state })}\n\n`);
      res.end();
      clearInterval(streamInterval);
    }
  }, 800); // 800ms delay between response chunks for realistic feel

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(streamInterval);
    res.end();
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Con-Control server running on http://localhost:${PORT}`);
  console.log(`🎮 Game available at http://localhost:${PORT}`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/chat`);
});
