export { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
export { embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus } from './embodied-v0.js';
export { embodiedV1Sonnet, embodiedV1Opus } from './embodied-v1.js';
export { navigatorSonnet, navigatorOpus } from './embodied-v2.js';
export { v3Sonnet, v3Opus } from './embodied-v3.js';
export { v4Sonnet, v4Opus } from './embodied-v4.js';
export { v5Sonnet, v5Opus } from './embodied-v5.js';
export { v6Sonnet, v6Opus } from './embodied-v6.js';
export { v7Sonnet, v7Opus } from './embodied-v7.js';

import { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
import { embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus } from './embodied-v0.js';
import { embodiedV1Sonnet, embodiedV1Opus } from './embodied-v1.js';
import { navigatorSonnet, navigatorOpus } from './embodied-v2.js';
import { v3Sonnet, v3Opus } from './embodied-v3.js';
import { v4Sonnet, v4Opus } from './embodied-v4.js';
import { v5Sonnet, v5Opus } from './embodied-v5.js';
import { v6Sonnet, v6Opus } from './embodied-v6.js';
import { v7Sonnet, v7Opus } from './embodied-v7.js';
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
  'v3-sonnet': v3Sonnet,
  'v3-opus': v3Opus,
  'v4-sonnet': v4Sonnet,
  'v4-opus': v4Opus,
  'v5-sonnet': v5Sonnet,
  'v5-opus': v5Opus,
  'v6-sonnet': v6Sonnet,
  'v6-opus': v6Opus,
  'v7-sonnet': v7Sonnet,
  'v7-opus': v7Opus,
};
