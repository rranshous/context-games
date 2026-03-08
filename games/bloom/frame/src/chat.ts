export interface ChatMessage {
  id: string;
  handle: string;
  text: string;
  ts: number;
}

let counter = 0;

export class ChatServer {
  private messages: ChatMessage[] = [];
  private maxMessages = 200;

  post(handle: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `msg-${++counter}-${Date.now()}`,
      handle,
      text,
      ts: Date.now(),
    };
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
    return { ...msg };
  }

  read(count: number = 50): ChatMessage[] {
    return this.messages.slice(-count).map(m => ({ ...m }));
  }

  readAfter(afterId: string): ChatMessage[] {
    const idx = this.messages.findIndex(m => m.id === afterId);
    if (idx === -1) return this.messages.map(m => ({ ...m }));
    return this.messages.slice(idx + 1).map(m => ({ ...m }));
  }

  toJSON(): ChatMessage[] {
    return this.messages;
  }

  static fromJSON(data: ChatMessage[]): ChatServer {
    const server = new ChatServer();
    server.messages = Array.isArray(data) ? data : [];
    return server;
  }
}
