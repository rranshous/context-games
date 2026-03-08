import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function ensureBrowser(): Promise<Page> {
  if (page && !page.isClosed()) return page;
  if (browser) {
    try { await browser.close(); } catch {}
  }
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
    context = null;
    page = null;
  }
}

export interface BrowserResult {
  text: string;
  screenshot?: string; // base64 png
  consoleMessages?: string[];
}

/**
 * Execute a Playwright script. The function receives `page` (Playwright Page)
 * and should return a string or void. A screenshot is taken after execution.
 *
 * Example code:
 *   await page.goto('http://localhost:4444/hosted/games/qacky/index.html');
 *   await page.click('button:text("Play")');
 *   return await page.title();
 */
export async function runBrowser(code: string): Promise<BrowserResult> {
  const p = await ensureBrowser();

  // Collect console messages during execution
  const consoleMessages: string[] = [];
  const consoleHandler = (msg: { type: () => string; text: () => string }) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  };
  p.on('console', consoleHandler);

  let text = '';
  try {
    // Compile and run the code as an async function with `page` in scope
    const fn = new Function('page', `return (async () => { ${code} })()`) as (page: Page) => Promise<unknown>;
    const result = await Promise.race([
      fn(p),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Browser script timed out after 30s')), 30_000)),
    ]);
    text = result !== undefined && result !== null ? String(result) : 'Script completed.';
  } catch (err: unknown) {
    text = `Error: ${(err as Error).message}`;
  }

  // Take screenshot after execution
  let screenshot: string | undefined;
  try {
    if (!p.isClosed()) {
      const buf = await p.screenshot({ type: 'png' });
      screenshot = buf.toString('base64');
    }
  } catch {
    // Page may have navigated away or closed
  }

  p.removeListener('console', consoleHandler);

  return { text, screenshot, consoleMessages };
}
