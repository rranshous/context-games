import { defineConfig, Plugin } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Vite plugin: Anthropic API proxy for dev mode.
 * Reads ANTHROPIC_API_KEY from platforms/.env and forwards
 * POST /api/inference/anthropic/messages → Anthropic API.
 * In production, the vanilla platform handles this route.
 */
function anthropicProxy(): Plugin {
  let apiKey: string | undefined;

  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      // Load API key lazily from platforms/.env
      if (!apiKey) {
        try {
          const envPath = resolve(__dirname, '../../platforms/.env');
          const envContent = readFileSync(envPath, 'utf-8');
          const match = envContent.match(/ANTHROPIC_API_KEY=(.+)/);
          if (match) apiKey = match[1].trim();
        } catch {
          console.warn('[anthropic-proxy] Could not read platforms/.env');
        }
      }

      server.middlewares.use('/api/inference/anthropic/messages', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }));
          return;
        }

        // Read request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks).toString('utf-8');

        try {
          const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body,
          });

          const responseText = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(responseText);
        } catch (err) {
          console.error('[anthropic-proxy] Error:', err);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    host: true,
  },
  plugins: [anthropicProxy()],
});
