import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { aiService } from './services/ai-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Parse JSON bodies for API requests
app.use(express.json({ limit: '10mb' }));

// Load magic mechanics for game context
let magicMechanics = '';
try {
  magicMechanics = readFileSync(path.join(__dirname, 'magic-mechanics.md'), 'utf8');
  console.log('📜 Magic mechanics loaded for game context');
} catch (error) {
  console.warn('⚠️ Could not load magic-mechanics.md:', error.message);
}

// In development, proxy to Vite dev server for frontend
if (isDev) {
  console.log('🔧 Development mode: proxying frontend to Vite');
  
  // Serve static assets directly
  app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
  
  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'RitSim server running (dev mode)' });
  });
  
  // AI API routes (Milestone 5)
  app.get('/api/ai/status', (req, res) => {
    const status = aiService.getStatus();
    res.json({ 
      status: 'ok',
      ai: status,
      message: status.initialized ? 'AI service ready' : 'AI service not configured'
    });
  });
  
  app.post('/api/ai/test', async (req, res) => {
    try {
      const result = await aiService.testConnection();
      res.json({
        status: 'success',
        message: 'AI connection test successful',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI connection test failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/message', async (req, res) => {
    try {
      const { message, systemPrompt } = req.body;
      
      if (!message) {
        return res.status(400).json({
          status: 'error',
          message: 'Message content is required'
        });
      }
      
      const result = await aiService.sendMessage(message, systemPrompt);
      res.json({
        status: 'success',
        message: 'AI message processed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI message failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/analyze-image', async (req, res) => {
    try {
      const { imageBase64, prompt } = req.body;
      
      if (!imageBase64) {
        return res.status(400).json({
          status: 'error',
          message: 'Image data is required'
        });
      }
      
      const result = await aiService.analyzeImage(imageBase64, prompt);
      res.json({
        status: 'success',
        message: 'AI vision analysis completed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI vision analysis failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/interpret-ritual', async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      
      if (!imageBase64) {
        return res.status(400).json({
          status: 'error',
          message: 'Image data is required'
        });
      }
      
      const result = await aiService.interpretRitual(imageBase64, magicMechanics);
      res.json({
        status: 'success',
        message: 'Ritual interpretation completed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Ritual interpretation failed',
        error: error.message
      });
    }
  });
  
  // Proxy all other requests to Vite dev server
  app.use('*', async (req, res) => {
    try {
      const response = await fetch(`http://localhost:5173${req.originalUrl}`);
      const body = await response.text();
      
      // Copy headers from Vite response
      for (const [key, value] of response.headers.entries()) {
        if (key !== 'content-encoding') {
          res.setHeader(key, value);
        }
      }
      
      res.status(response.status).send(body);
    } catch (error) {
      console.error('Proxy error:', error.message);
      res.status(503).send(`
        <h1>Development Server Not Ready</h1>
        <p>Make sure Vite is running: <code>npm run client:dev</code></p>
        <p>Or run both together: <code>npm run dev</code></p>
      `);
    }
  });
  
} else {
  // Production mode: serve static files from dist
  console.log('🚀 Production mode: serving static files');
  
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
  
  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'RitSim server running (production)' });
  });
  
  // AI API routes (Milestone 5)
  app.get('/api/ai/status', (req, res) => {
    const status = aiService.getStatus();
    res.json({ 
      status: 'ok',
      ai: status,
      message: status.initialized ? 'AI service ready' : 'AI service not configured'
    });
  });
  
  app.post('/api/ai/test', async (req, res) => {
    try {
      const result = await aiService.testConnection();
      res.json({
        status: 'success',
        message: 'AI connection test successful',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI connection test failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/message', async (req, res) => {
    try {
      const { message, systemPrompt } = req.body;
      
      if (!message) {
        return res.status(400).json({
          status: 'error',
          message: 'Message content is required'
        });
      }
      
      const result = await aiService.sendMessage(message, systemPrompt);
      res.json({
        status: 'success',
        message: 'AI message processed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI message failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/analyze-image', async (req, res) => {
    try {
      const { imageBase64, prompt } = req.body;
      
      if (!imageBase64) {
        return res.status(400).json({
          status: 'error',
          message: 'Image data is required'
        });
      }
      
      const result = await aiService.analyzeImage(imageBase64, prompt);
      res.json({
        status: 'success',
        message: 'AI vision analysis completed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'AI vision analysis failed',
        error: error.message
      });
    }
  });
  
  app.post('/api/ai/interpret-ritual', async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      
      if (!imageBase64) {
        return res.status(400).json({
          status: 'error',
          message: 'Image data is required'
        });
      }
      
      const result = await aiService.interpretRitual(imageBase64, magicMechanics);
      res.json({
        status: 'success',
        message: 'Ritual interpretation completed',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Ritual interpretation failed',
        error: error.message
      });
    }
  });
  
  // Serve the main app for all other routes (SPA support)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🕯️  RitSim server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/health`);
});
