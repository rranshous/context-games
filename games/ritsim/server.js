import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// In development, proxy to Vite dev server for frontend
if (isDev) {
  console.log('🔧 Development mode: proxying frontend to Vite');
  
  // Serve static assets directly
  app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
  
  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'RitSim server running (dev mode)' });
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
  
  // Serve the main app for all other routes (SPA support)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🕯️  RitSim server running on http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/health`);
});
