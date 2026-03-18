/**
 * Chat Module — rolling message room.
 *
 * Methods: post, read, history
 * Emits: message_posted
 * State: { messages: Array<{ from, text, tick }>, maxMessages: number }
 */

import { ModuleDefinition } from '../soma/module-runtime.js';

const MAX_MESSAGES = 50;

export const chatModule: ModuleDefinition = {
  id: 'chat',
  name: 'Chat',

  init: () => ({
    messages: [],
    maxMessages: MAX_MESSAGES,
  }),

  methods: {
    post: {
      description: 'Post a message to the chat room',
      handler: `
        var messages = state.messages || [];
        var maxMessages = state.maxMessages || 50;
        messages.push({ from: caller, text: input.text, tick: input.tick || 0 });
        if (messages.length > maxMessages) {
          messages = messages.slice(-maxMessages);
        }
        return {
          state: { messages: messages, maxMessages: maxMessages },
          result: { ok: true },
          emit: [{ event: 'message_posted', data: { from: caller, text: input.text } }]
        };
      `,
    },

    read: {
      description: 'Read recent messages (default last 10)',
      handler: `
        var messages = state.messages || [];
        var count = (input && input.count) || 10;
        var recent = messages.slice(-count);
        return { state: state, result: { messages: recent } };
      `,
    },

    history: {
      description: 'Get full message history',
      handler: `
        return { state: state, result: { messages: state.messages || [], total: (state.messages || []).length } };
      `,
    },
  },

  emits: ['message_posted'],
};
