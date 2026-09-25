// serve.ts — the viewer's own tiny static server. Knows nothing about the sim
// except where to find it (SIM_URL), which it hands to the browser.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT ?? '4201', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SIM_URL = process.env.SIM_URL ?? '';

const app = express();
app.get('/config.json', (_req, res) => res.json({ simUrl: SIM_URL }));
app.use(express.static(path.join(root, 'src', 'view', 'public')));
app.use('/dist/client', express.static(path.join(root, 'dist', 'client')));
app.listen(PORT, HOST, () => console.log(`[view] http://${HOST}:${PORT}  (sim: ${SIM_URL || 'same host, port 4200'})`));
