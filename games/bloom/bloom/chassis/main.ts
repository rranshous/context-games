import { tick } from './loop.js';

async function main(): Promise<void> {
  console.log('[bloom] chassis online');

  try {
    await tick();
  } catch (err) {
    console.error('[bloom] tick failed:', err);
    process.exit(1);
  }

  if (process.env.ONCE === '1') {
    console.log('[bloom] single tick, exiting');
    return;
  }

  const interval = parseInt(process.env.TICK_INTERVAL || '60000');
  console.log(`[bloom] ticking every ${interval / 1000}s`);

  const run = async () => {
    try {
      await tick();
    } catch (err) {
      console.error('[bloom] tick failed:', err);
    }
    setTimeout(run, interval);
  };
  setTimeout(run, interval);
}

main();
