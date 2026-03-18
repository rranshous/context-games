/**
 * REPL — the admin's terminal interface to the habitat.
 *
 * This is the habitat actant's collaborative frame rendered as text.
 * The admin types commands, the habitat responds.
 */

import * as readline from 'node:readline';
import { StateStore } from './statestore.js';
import { Clock } from './clock.js';
import { Persistence } from './persistence.js';
import { ModuleRuntime } from '../soma/module-runtime.js';
import { HabitatSoma } from '../soma/habitat-soma.js';

interface ReplContext {
  store: StateStore;
  clock: Clock;
  persistence: Persistence;
  moduleRuntime: ModuleRuntime;
  habitatSoma: HabitatSoma;
}

export function startRepl(ctx: ReplContext): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nhabitat> ',
  });

  // Print help on start
  printHelp();
  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const [cmd, ...args] = trimmed.split(/\s+/);
    const rest = args.join(' ');

    try {
      switch (cmd) {
        case 'help':
        case '?':
          printHelp();
          break;

        case 'status':
          cmdStatus(ctx);
          break;

        case 'actants':
          cmdActants(ctx);
          break;

        case 'modules':
          cmdModules(ctx);
          break;

        case 'chat':
          if (rest) {
            cmdChatPost(ctx, rest);
          } else {
            cmdChatRead(ctx);
          }
          break;

        case 'soma':
          cmdSoma(ctx, args[0]);
          break;

        case 'store':
          cmdStore(ctx, args[0], args.slice(1));
          break;

        case 'audit':
          cmdAudit(ctx, parseInt(args[0]) || 10);
          break;

        case 'pause':
          ctx.clock.stop();
          break;

        case 'resume':
          ctx.clock.start();
          break;

        case 'step':
          if (ctx.clock.isRunning()) {
            console.log('  Pause first, then step.');
          } else {
            ctx.clock.step();
          }
          break;

        case 'speed': {
          const ms = parseInt(args[0]);
          if (isNaN(ms) || ms < 100) {
            console.log('  Usage: speed <ms>  (minimum 100)');
          } else {
            ctx.clock.setRate(ms);
          }
          break;
        }

        case 'knock-knock':
          cmdKnockKnock(ctx, args);
          break;

        default:
          console.log(`  Unknown command: ${cmd}. Type "help" for commands.`);
      }
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    // Let the main process handle shutdown
    process.emit('SIGINT' as any);
  });
}

function printHelp(): void {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║         HABITAT ADMIN CONSOLE         ║
  ╠═══════════════════════════════════════╣
  ║  status          overview             ║
  ║  actants         list actants         ║
  ║  modules         list modules         ║
  ║  soma <id>       inspect actant soma  ║
  ║  chat            read recent messages ║
  ║  chat <msg>      post as admin        ║
  ║  audit [n]       last n audit entries ║
  ║  store keys <p>  list store keys      ║
  ║  store get <k>   read a store key     ║
  ║  knock-knock     show joke state      ║
  ║  pause           stop the clock       ║
  ║  resume          start the clock      ║
  ║  step            advance one tick     ║
  ║  speed <ms>      set tick interval    ║
  ║  help            show this            ║
  ╚═══════════════════════════════════════╝`);
}

function cmdStatus(ctx: ReplContext): void {
  const { clock, moduleRuntime, habitatSoma } = ctx;
  console.log(`  Tick:     ${clock.now()}`);
  console.log(`  Clock:    ${clock.isRunning() ? 'running' : 'paused'}`);
  console.log(`  Actants:  ${habitatSoma.listActants().join(', ')}`);
  console.log(`  Modules:  ${moduleRuntime.listModules().join(', ')}`);
  console.log(`  Audit:    ${ctx.store.getAuditLength()} entries`);
}

function cmdActants(ctx: ReplContext): void {
  const ids = ctx.habitatSoma.listActants();
  for (const id of ids) {
    const identity = ctx.store.hget(`actants/${id}`, 'identity') as string;
    const memory = ctx.store.hget(`actants/${id}`, 'memory') as string;
    const activated = ctx.store.smembers(`activations:${id}`);
    console.log(`  ┌─ ${id}`);
    console.log(`  │ identity: ${truncate(identity, 60)}`);
    console.log(`  │ memory:   ${truncate(memory || '(empty)', 60)}`);
    console.log(`  │ modules:  ${activated.length ? activated.join(', ') : '(none)'}`);
    console.log(`  └─`);
  }
}

function cmdModules(ctx: ReplContext): void {
  const ids = ctx.moduleRuntime.listModules();
  for (const id of ids) {
    const methods = ctx.moduleRuntime.getMethodDescriptions(id);
    console.log(`  ┌─ ${id}`);
    if (methods) {
      for (const [name, desc] of Object.entries(methods)) {
        console.log(`  │ .${name}() — ${desc}`);
      }
    }
    console.log(`  └─`);
  }
}

function cmdChatRead(ctx: ReplContext): void {
  const result = ctx.moduleRuntime.call('chat', 'read', { count: 15 }, 'admin') as { messages?: Array<{ from: string; text: string; tick: number }> };
  const messages = result?.messages || [];
  if (messages.length === 0) {
    console.log('  (no messages)');
    return;
  }
  for (const msg of messages) {
    console.log(`  [tick ${msg.tick}] ${msg.from}: ${msg.text}`);
  }
}

function cmdChatPost(ctx: ReplContext, text: string): void {
  // Activate chat for admin if not already
  ctx.store.sadd('activations:admin', 'chat', 'admin');
  ctx.moduleRuntime.call('chat', 'post', { text, tick: ctx.clock.now() }, 'admin');
  console.log(`  posted.`);
}

function cmdSoma(ctx: ReplContext, actantId?: string): void {
  if (!actantId) {
    console.log('  Usage: soma <actant-id>');
    return;
  }
  const fields = ['identity', 'memory', 'on_tick', 'on_event'];
  for (const field of fields) {
    const value = ctx.store.hget(`actants/${actantId}`, field);
    if (value === null) continue;
    const strValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    console.log(`  ── ${field} ──`);
    // Indent multiline values
    const lines = strValue.split('\n');
    for (const line of lines) {
      console.log(`  ${line}`);
    }
  }
}

function cmdStore(ctx: ReplContext, subcmd?: string, args?: string[]): void {
  if (!subcmd) {
    console.log('  Usage: store keys <prefix>  |  store get <key>');
    return;
  }
  switch (subcmd) {
    case 'keys': {
      const pattern = (args?.[0] || '') + '*';
      const keys = ctx.store.keys(pattern);
      if (keys.length === 0) {
        console.log('  (no keys)');
      } else {
        for (const key of keys) {
          const t = ctx.store.type(key);
          console.log(`  ${t?.padEnd(7)} ${key}`);
        }
      }
      break;
    }
    case 'get': {
      const key = args?.[0];
      if (!key) {
        console.log('  Usage: store get <key>');
        return;
      }
      const t = ctx.store.type(key);
      if (!t) {
        console.log('  (key not found)');
        return;
      }
      switch (t) {
        case 'string':
          console.log(`  ${ctx.store.get(key)}`);
          break;
        case 'list': {
          const items = ctx.store.lrange(key, 0, -1);
          console.log(`  (list, ${items.length} items)`);
          for (const item of items.slice(-10)) {
            console.log(`  ${JSON.stringify(item)}`);
          }
          break;
        }
        case 'hash':
          console.log(JSON.stringify(ctx.store.hgetall(key), null, 2).split('\n').map(l => `  ${l}`).join('\n'));
          break;
        case 'set':
          console.log(`  ${ctx.store.smembers(key).join(', ')}`);
          break;
      }
      break;
    }
    default:
      console.log('  Usage: store keys <prefix>  |  store get <key>');
  }
}

function cmdAudit(ctx: ReplContext, count: number): void {
  const total = ctx.store.getAuditLength();
  const start = Math.max(0, total - count);
  const entries = ctx.store.getAudit(start, count);
  if (entries.length === 0) {
    console.log('  (no audit entries)');
    return;
  }
  for (const e of entries) {
    const argsStr = e.args ? ` ${JSON.stringify(e.args)}` : '';
    console.log(`  tick ${String(e.tick).padStart(3)} | ${e.writer.padEnd(15)} | ${e.op.padEnd(5)} ${e.key}${truncate(argsStr, 60)}`);
  }
}

function cmdKnockKnock(ctx: ReplContext, args: string[]): void {
  const result = ctx.moduleRuntime.call('knock-knock', 'scores', {}, 'admin') as { scores?: Record<string, unknown> };
  console.log('  Scores:', JSON.stringify(result?.scores || {}, null, 2).split('\n').map(l => `  ${l}`).join('\n'));

  // Show pending jokes
  const pending = ctx.moduleRuntime.call('knock-knock', 'pending', {}, 'admin') as { jokes?: Array<{ joke_id: number; poser: string; setup: string }> };
  const jokes = pending?.jokes || [];
  if (jokes.length > 0) {
    console.log('  Pending jokes:');
    for (const j of jokes) {
      console.log(`    #${j.joke_id} by ${j.poser}: ${j.setup}`);
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}
