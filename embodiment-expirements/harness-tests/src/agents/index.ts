export { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';

import { bareHaiku, bareSonnet, bareOpus } from './bare-model.js';
import type { Agent } from '../types.js';

/** Registry of all available agents by name. */
export const AGENTS: Record<string, Agent> = {
  'bare-haiku': bareHaiku,
  'bare-sonnet': bareSonnet,
  'bare-opus': bareOpus,
};
