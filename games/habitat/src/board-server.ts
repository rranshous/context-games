// board-server.ts — Persistent bulletin board. Posts stay until removed.

export interface BoardPost {
  id: string;
  handle: string;
  title: string;
  body: string;
  ts: number;
}

export class BoardServer {
  private posts: BoardPost[] = [];
  private nextId = 1;

  post(handle: string, title: string, body: string): BoardPost {
    const post: BoardPost = {
      id: `b${this.nextId++}`,
      handle,
      title,
      body,
      ts: Date.now(),
    };
    this.posts.push(post);
    console.log(`[BOARD] ${handle} posted: "${title}"`);
    return structuredClone(post);
  }

  read(count?: number): BoardPost[] {
    const sorted = [...this.posts].reverse(); // newest first
    if (count != null) return structuredClone(sorted.slice(0, count));
    return structuredClone(sorted);
  }

  remove(id: string): { success: boolean; error?: string } {
    const idx = this.posts.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: `Post '${id}' not found.` };
    this.posts.splice(idx, 1);
    console.log(`[BOARD] Post ${id} removed`);
    return { success: true };
  }

  toJSON(): { posts: BoardPost[]; nextId: number } {
    return { posts: this.posts, nextId: this.nextId };
  }

  static fromJSON(data: { posts: BoardPost[]; nextId: number }): BoardServer {
    const server = new BoardServer();
    server.posts = data.posts;
    server.nextId = data.nextId;
    return server;
  }
}
