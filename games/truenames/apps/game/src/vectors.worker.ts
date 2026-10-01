// Runs the golden vectors inside a browser Web Worker (CLAUDE.md rule 3).
import vectors from '../../../packages/universe/test/vectors.json';
import { runVectors } from '../../../packages/universe/test/run-vectors.ts';
const t0 = performance.now();
const fails = runVectors(vectors);
postMessage({ fails, ms: performance.now() - t0 });
