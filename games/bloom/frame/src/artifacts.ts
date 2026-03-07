export interface Artifact {
  id: string;
  name: string;
  content: string;
  type: string;
  handle: string;
  ts: number;
}

let counter = 0;

export class ArtifactServer {
  private artifacts: Artifact[] = [];

  deliver(handle: string, name: string, content: string, type: string = 'text/plain'): Omit<Artifact, 'content'> {
    const artifact: Artifact = {
      id: `art-${++counter}-${Date.now()}`,
      name,
      content,
      type,
      handle,
      ts: Date.now(),
    };
    this.artifacts.push(artifact);
    const { content: _, ...meta } = artifact;
    return meta;
  }

  list(): Omit<Artifact, 'content'>[] {
    return this.artifacts.map(({ content, ...rest }) => rest);
  }

  get(id: string): Artifact | null {
    const a = this.artifacts.find(x => x.id === id);
    return a ? { ...a } : null;
  }

  toJSON(): Artifact[] {
    return this.artifacts;
  }

  static fromJSON(data: Artifact[]): ArtifactServer {
    const server = new ArtifactServer();
    server.artifacts = Array.isArray(data) ? data : [];
    return server;
  }
}
