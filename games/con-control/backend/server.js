import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize modules
import { ClaudeClient } from './claude-client.js';
import { ResponseHandler } from './response-handler.js';
import { createInitialGameState } from './game-state.js';
import { getAvailableToolDefinitions } from './tool-manager.js';
import { shipFileSystem } from './ship-data.js';
import { calculateCost, addCostToSession, resetSessionTracking } from './cost-calculator.js';

const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
const responseHandler = new ResponseHandler(claudeClient, shipFileSystem);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  
  // Log all requests, but highlight HTML page requests
  if (url === '/' || url === '/index.html') {
    console.log(`🌐 [${timestamp}] ${method} ${url} - HTML PAGE REQUEST`);
    console.log(`   📍 Client IP: ${clientIP}`);
    console.log(`   🔍 User Agent: ${userAgent}`);
    console.log(`   📄 Serving fresh page (no-cache headers set)`);
  } else {
    console.log(`📁 [${timestamp}] ${method} ${url} - Static asset`);
    console.log(`   📍 Client IP: ${clientIP}`);
  }
  
  // Set no-cache headers for HTML pages
  if (url === '/' || url === '/index.html') {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  
  next();
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Remove the custom route handlers since middleware handles logging now

// Session storage (in production, use Redis or database)
const sessions = new Map();

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
    resetSessionTracking(); // Reset session cost tracking for new sessions
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
  try {
    // Get available tools
    const availableTools = getAvailableToolDefinitions(state);
    
    // Call Claude with initial message
    const response = await claudeClient.initialCall(message, state, availableTools);
    
    // Track costs from initial call
    if (response.usage) {
      const cost = calculateCost(response.usage);
      state = addCostToSession(state, cost, true); // Mark as initial call
      
      // Send cost update event
      responseHandler.sendCostUpdate(res, state.sessionCosts);
    }
    
    // Handle the complete conversation with tool execution
    const updatedState = await responseHandler.handleConversation(response, state, res, req, message);
    
    // Update session state
    const sessionId = req.query.sessionId;
    if (sessionId) {
      sessions.set(sessionId, updatedState);
    }
    
    // Send completion signal
    res.write(`data: ${JSON.stringify({ type: 'done', gameState: updatedState })}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('❌ Error calling Claude:', error);
    res.write(`data: ${JSON.stringify({ type: 'text', content: 'Error: Unable to process request with Ship AI. Please try again.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', gameState: state })}\n\n`);
    res.end();
  }
}

// Restart endpoint to clear session state
app.post('/api/restart', (req, res) => {
  const { sessionId } = req.query;
  
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`🔄 Cleared session state for: ${sessionId}`);
    res.json({ success: true, message: 'Session cleared' });
  } else {
    console.log(`⚠️ Session not found for restart: ${sessionId}`);
    res.json({ success: true, message: 'Session not found (already cleared)' });
  }
});

// Restart with increased difficulty endpoint
app.post('/api/restart-harder', (req, res) => {
  const { sessionId } = req.query;
  
  if (sessionId && sessions.has(sessionId)) {
    const currentSession = sessions.get(sessionId);
    const currentDifficulty = currentSession?.difficulty?.level || 0;
    const newDifficulty = currentDifficulty + 1;
    
    // Preserve session costs across game restarts
    const preservedCosts = currentSession.sessionCosts;
    
    // Create new game state with preserved costs
    const newState = createInitialGameState(newDifficulty, preservedCosts);
    
    // Update the same session (don't create new session ID)
    sessions.set(sessionId, newState);
    
    console.log(`🎯 Restarted with harder difficulty: Level ${currentDifficulty} → ${newDifficulty} (${newState.difficulty.oxygenMinutes} minutes oxygen)`);
    console.log(`💰 Preserved session costs: $${preservedCosts.totalCost.toFixed(6)} (${preservedCosts.totalTokens} tokens)`);
    
    res.json({ 
      success: true, 
      message: `Restarted with harder difficulty (Level ${newDifficulty})`,
      sessionId: sessionId, // Same session ID
      difficulty: {
        level: newDifficulty,
        oxygenMinutes: newState.difficulty.oxygenMinutes
      }
    });
  } else {
    console.log(`⚠️ Session not found for harder restart: ${sessionId}`);
    
    // Create new session with difficulty level 1 if no session exists
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newState = createInitialGameState(1);
    
    sessions.set(newSessionId, newState);
    resetSessionTracking(); // Reset session cost tracking for new sessions
    
    res.json({ 
      success: true, 
      message: 'Started new harder game',
      sessionId: newSessionId,
      difficulty: {
        level: 1,
        oxygenMinutes: newState.difficulty.oxygenMinutes
      }
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Con-Control server running on http://0.0.0.0:${PORT}`);
  console.log(`🎮 Game available at http://localhost:${PORT} (local)`);
  console.log(`� Mobile access: Find your local IP and use http://[YOUR_IP]:${PORT}`);
  console.log(`�🔧 API endpoint: http://0.0.0.0:${PORT}/api/chat`);
});
