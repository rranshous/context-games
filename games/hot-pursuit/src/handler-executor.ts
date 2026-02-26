// ── Handler Executor ──
// Extracts signal handler code from soma, compiles it via AsyncFunction,
// executes it with the chassis API, and enforces safety constraints.

import { PoliceEntity, GameConfig } from './types';
import { TileMap } from './map';
import { Soma } from './soma';
import { ChassisAPI, SignalData, PendingAction, createChaseChassisAPI } from './chassis';

const HANDLER_TIMEOUT_MS = 50; // kill handler if it takes longer than this

interface CompiledHandler {
  actantId: string;
  fn: (type: string, data: SignalData, me: ChassisAPI) => Promise<void>;
}

// Cache compiled handlers to avoid recompiling every tick
const handlerCache = new Map<string, { code: string; handler: CompiledHandler }>();

/**
 * Compile the signal handler code from a soma into an executable function.
 * Returns null if compilation fails (invalid code).
 */
export function compileHandler(soma: Soma): CompiledHandler | null {
  // Check cache
  const cached = handlerCache.get(soma.id);
  if (cached && cached.code === soma.signalHandlers) {
    return cached.handler;
  }

  try {
    // The soma's signalHandlers contains a full function declaration.
    // We wrap it so onSignal is callable from outside.
    const wrappedCode = `
      ${soma.signalHandlers}
      return onSignal(type, data, me);
    `;

    // Use AsyncFunction to support await in handlers
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('type', 'data', 'me', wrappedCode) as
      (type: string, data: SignalData, me: ChassisAPI) => Promise<void>;

    const handler: CompiledHandler = { actantId: soma.id, fn };

    // Cache it
    handlerCache.set(soma.id, { code: soma.signalHandlers, handler });

    return handler;
  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'handler_compile_error',
      actantId: soma.id,
      error: String(err),
      code: soma.signalHandlers.slice(0, 200),
    }));
    return null;
  }
}

/**
 * Execute a signal handler with timeout protection.
 * Returns the pending actions the handler queued via me.callTool().
 */
export async function executeSignal(
  handler: CompiledHandler,
  signalType: string,
  signalData: SignalData,
  entity: PoliceEntity,
  soma: Soma,
  map: TileMap,
  config: GameConfig,
  allPolice: PoliceEntity[],
): Promise<PendingAction[]> {
  const pendingActions: PendingAction[] = [];
  const api = createChaseChassisAPI(entity, soma, map, config, allPolice, pendingActions);

  try {
    // Race the handler against a timeout
    const result = await Promise.race([
      handler.fn(signalType, signalData, api),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), HANDLER_TIMEOUT_MS)
      ),
    ]);

    if (result === 'timeout') {
      console.log(JSON.stringify({
        _hp: 'handler_timeout',
        actantId: handler.actantId,
        signal: signalType,
      }));
      return []; // drop the actions if the handler timed out
    }
  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'handler_runtime_error',
      actantId: handler.actantId,
      signal: signalType,
      error: String(err),
    }));
    return [];
  }

  return pendingActions;
}

/** Clear the handler cache (e.g., when somas are updated after reflection) */
export function clearHandlerCache(): void {
  handlerCache.clear();
}
