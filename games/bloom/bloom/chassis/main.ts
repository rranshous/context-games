import { pollSignals, dispatch } from './loop.js';

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000');

async function main(): Promise<void> {
  console.log('[bloom] chassis online');
  console.log(`[bloom] polling every ${POLL_INTERVAL / 1000}s`);

  const cycle = async () => {
    try {
      const signals = await pollSignals();
      for (const signal of signals) {
        await dispatch(signal);
      }
    } catch (err) {
      console.error('[bloom] cycle error:', err);
    }
  };

  // First cycle immediately
  await cycle();

  if (process.env.ONCE === '1') {
    console.log('[bloom] single cycle, exiting');
    return;
  }

  // Poll loop
  const run = async () => {
    await cycle();
    setTimeout(run, POLL_INTERVAL);
  };
  setTimeout(run, POLL_INTERVAL);
}

main();
