// Starts the game (Vite), a dungeon (worlds, :5192) and an altar (a gathering place, :5193) together, with prefixed
// output. Ctrl-C stops them all.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = (n) => `${root}node_modules/.bin/${n}`;
const procs = [
  { name: 'game', color: 33, cmd: bin('vite'), args: ['apps/game'] },
  { name: 'dungeon', color: 35, cmd: bin('tsx'), args: ['watch', 'apps/dungeon/src/server.ts'] },
  { name: 'altar', color: 36, cmd: bin('tsx'), args: ['watch', 'apps/altar/src/server.ts'] },
];
const children = procs.map(({ name, color, cmd, args }) => {
  const c = spawn(cmd, args, { cwd: root, env: { ...process.env, FORCE_COLOR: '1' } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (s) => s.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  pipe(c.stdout);
  pipe(c.stderr);
  c.on('exit', (code) => { console.log(`${tag}exited (${code})`); shutdown(); });
  return c;
});
let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
