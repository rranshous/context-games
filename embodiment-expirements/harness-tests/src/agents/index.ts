export { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
export { embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus } from './embodied-v0.js';
export { embodiedV1Sonnet, embodiedV1Opus } from './embodied-v1.js';
export { navigatorSonnet, navigatorOpus } from './embodied-v2.js';

import { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
import { embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus } from './embodied-v0.js';
import { embodiedV1Sonnet, embodiedV1Opus } from './embodied-v1.js';
import { navigatorSonnet, navigatorOpus } from './embodied-v2.js';
import type { Agent } from '../types.js';

/** Registry of all available agents by name. */
export const AGENTS: Record<string, Agent> = {
  'bare-haiku': bareHaiku,
  'bare-sonnet': bareSonnet,
  'bare-opus': bareOpus,
  'embodied-v0-haiku': embodiedV0Haiku,
  'embodied-v0-sonnet': embodiedV0Sonnet,
  'embodied-v0-opus': embodiedV0Opus,
  'embodied-v1-sonnet': embodiedV1Sonnet,
  'embodied-v1-opus': embodiedV1Opus,
  'navigator-sonnet': navigatorSonnet,
  'navigator-opus': navigatorOpus,
};
