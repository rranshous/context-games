// Rule 3: golden vectors must pass in a browser Web Worker too.
// Serves apps/game with Vite, opens /vectors.html in headless Chromium, reads PASS/FAIL.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

export async function vectorsBrowser() {
  const root = fileURLToPath(new URL('../../game/', import.meta.url));
  const server = await createServer({ root, configFile: `${root}vite.config.ts`, server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls!.local[0]!;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${url}vectors.html`);
    await page.waitForFunction(() => document.title === 'PASS' || document.title === 'FAIL', null, { timeout: 60_000 });
    const out = (await page.textContent('#out')) ?? '';
    console.log(out);
    if (!out.startsWith('PASS')) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}
