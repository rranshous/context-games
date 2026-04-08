export { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
export { embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus } from './embodied-v0.js';

import { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
import {
  embodiedV0Haiku, embodiedV0Sonnet, embodiedV0Opus,
  embodiedV0HaikuConstrained, embodiedV0SonnetConstrained,
} from './embodied-v0.js';
import type { Agent } from '../types.js';

/** Registry of all available agents by name. */
export const AGENTS: Record<string, Agent> = {
  'bare-haiku': bareHaiku,
  'bare-sonnet': bareSonnet,
  'bare-opus': bareOpus,
  'embodied-v0-haiku': embodiedV0Haiku,
  'embodied-v0-sonnet': embodiedV0Sonnet,
  'embodied-v0-opus': embodiedV0Opus,
  'embodied-v0-haiku-4k': embodiedV0HaikuConstrained,
  'embodied-v0-sonnet-4k': embodiedV0SonnetConstrained,
};
