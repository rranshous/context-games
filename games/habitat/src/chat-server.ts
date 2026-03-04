// chat-server.ts — Simple rolling chat room. No AI knowledge.

export interface ChatMessage {
  handle: string;
  text: string;
  ts: number;
}

const MAX_MESSAGES = 50;

export class ChatServer {
  private messages: ChatMessage[] = [];

  post(handle: string, text: string): ChatMessage {
    const msg: ChatMessage = { handle, text, ts: Date.now() };
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_MESSAGES);
    }
    console.log(`[CHAT] ${handle}: ${text.substring(0, 100)}`);
    return msg;
  }

  read(count: number = 5): ChatMessage[] {
    return this.messages.slice(-count);
  }

  all(): ChatMessage[] {
    return [...this.messages];
  }
}
