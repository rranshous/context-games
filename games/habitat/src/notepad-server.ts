// notepad-server.ts — Named string store. No metadata, no schema, no authorship.

export class NotepadServer {
  private pads = new Map<string, string>();

  read(name: string): string | null {
    return this.pads.get(name) ?? null;
  }

  write(name: string, data: string): void {
    this.pads.set(name, data);
  }

  list(): string[] {
    return [...this.pads.keys()];
  }

  clear(name: string): void {
    this.pads.delete(name);
  }

  toJSON(): Record<string, string> {
    return Object.fromEntries(this.pads);
  }

  static fromJSON(data: Record<string, string>): NotepadServer {
    const server = new NotepadServer();
    for (const [k, v] of Object.entries(data)) {
      server.pads.set(k, v);
    }
    return server;
  }
}
