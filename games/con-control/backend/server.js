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

const claudeClient = new ClaudeClient(process.env.ANTHROPIC_API_KEY);
const responseHandler = new ResponseHandler(claudeClient, shipFileSystem);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, '../dist')));

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

app.listen(PORT, () => {
  console.log(`🚀 Con-Control server running on http://localhost:${PORT}`);
  console.log(`🎮 Game available at http://localhost:${PORT}`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/chat`);
});
