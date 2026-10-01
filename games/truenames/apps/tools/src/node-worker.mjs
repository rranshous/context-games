// worker_threads bootstrap: register tsx, then load the TypeScript worker (execArgv --import isn't honored for workers).
import { register } from 'tsx/esm/api';
register();
await import('./node-worker.ts');
