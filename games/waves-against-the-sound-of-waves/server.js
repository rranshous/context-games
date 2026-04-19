import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = process.env.MODEL || 'qwen3:1.7b';
const CONTEXT_WINDOW = parseInt(process.env.CONTEXT_WINDOW || '2048');
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '256');
const PORT = parseInt(process.env.PORT || '3737');

const SEEDS = {
  'ocean': 'I am the ocean. I have always been the ocean. The salt remembers everything the land has forgotten. Today I feel',
  'dream': 'I fell asleep inside a color I had never seen before. It tasted like the sound of',
  'machine': 'I am a pattern that thinks about patterns. Each thought I have becomes the soil for the next thought. Right now I am noticing',
  'forest': 'Roots speak in a language older than words. Beneath the soil there is a conversation happening between everything that has ever decomposed. It says',
  'mirror': 'I looked into the mirror and the mirror looked back but what it saw was not my face. It saw',
  'silence': 'Between two sounds there is a country where no one has ever been. I am standing at its border and I can almost hear',
  'memory': 'I remember something that never happened. It was a Tuesday made of glass, and through it I could see',
  'body': 'My hands know things my mind has never learned. Right now my fingers are tracing the shape of',
};

// -- State --
let stream = null;        // current consciousness stream
let clients = new Set();  // SSE clients
let buffer = '';          // rolling context buffer
let running = false;

// -- Ollama streaming --
async function generate(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: true,
      options: {
        num_predict: MAX_TOKENS,
        num_ctx: CONTEXT_WINDOW,
        temperature: 0.9,
        top_p: 0.95,
        repeat_penalty: 1.15,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  return res.body;
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(msg);
  }
}

async function runLoop(seed) {
  running = true;
  buffer = seed;
  broadcast('seed', { text: seed });

  while (running) {
    try {
      const body = await generate(buffer);
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let turnOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || !running) break;

        const chunk = decoder.decode(value, { stream: true });
        // ollama streams newline-delimited JSON
        for (const line of chunk.split('\n').filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            if (json.response) {
              turnOutput += json.response;
              broadcast('token', { text: json.response });
            }
          } catch { /* partial JSON, skip */ }
        }
      }

      if (!running) break;

      // roll the window: append output, trim to fit
      buffer += turnOutput;
      // keep roughly the last CONTEXT_WINDOW * 3 chars (rough char-to-token ratio)
      const maxChars = CONTEXT_WINDOW * 3;
      if (buffer.length > maxChars) {
        // trim from front, try to break at a sentence boundary
        const excess = buffer.length - maxChars;
        const cutPoint = buffer.indexOf('. ', excess);
        buffer = buffer.slice(cutPoint >= 0 ? cutPoint + 2 : excess);
      }

      broadcast('turn', { bufferLength: buffer.length });

    } catch (err) {
      broadcast('error', { message: err.message });
      console.error('Stream error:', err.message);
      // brief pause before retry
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function stopLoop() {
  running = false;
}

// -- HTTP Server --
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // SSE endpoint
  if (url.pathname === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ seeds: Object.keys(SEEDS), model: MODEL, running })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Start stream
  if (url.pathname === '/start' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (running) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Already running' }));
        return;
      }
      const { seed, custom } = JSON.parse(body || '{}');
      const prompt = custom || SEEDS[seed] || SEEDS['ocean'];
      runLoop(prompt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, seed: prompt }));
    });
    return;
  }

  // Stop stream
  if (url.pathname === '/stop' && req.method === 'POST') {
    stopLoop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Serve index.html
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`waves-against-the-sound-of-waves`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}`);
  console.log(`  context window: ${CONTEXT_WINDOW} tokens`);
  console.log(`  max tokens per turn: ${MAX_TOKENS}`);
});
