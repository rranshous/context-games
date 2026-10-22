// OpenRouter sends the person back here with a code. Trade it for a key, keep the key,
// and close (the page that opened this hears about it). Opened without a popup, go home.
import { finishConnect } from './openrouter.js';
const msg = document.getElementById('msg');
const code = new URLSearchParams(location.search).get('code');
try {
  if (!code) throw new Error('OpenRouter didn\'t send a code back (was it cancelled?)');
  await finishConnect(code);
  msg.textContent = 'Connected. Your ludants think on your OpenRouter account now. You can close this window.';
  if (opener) setTimeout(() => close(), 600); else setTimeout(() => location.replace('/'), 1200);
} catch (err) {
  msg.textContent = `Couldn't connect: ${err.message}`;
}
