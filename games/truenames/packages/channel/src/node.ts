// The Node side of sealed channels: a server end for a `ws` connection, and long-term keys kept in a file.
import type { WebSocket } from 'ws';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { x25519 } from '@noble/curves/ed25519.js';
import { ServerEnd, b64u, unb64u, type ChannelKey } from './index.ts';

/** One sealed connection as a server sees it: objects in, objects out. */
export interface Peer {
  send(m: unknown): void;
  onMessage(h: (m: unknown) => void): void;
  onClose(h: () => void): void;
  close(): void;
}

/** Seal a server-side `ws` connection: sends the key at once; messages flow once the client has said hello. */
export function sealServerSocket(ws: WebSocket, key: ChannelKey): Peer {
  const end = new ServerEnd({ send: (d) => { if (ws.readyState === ws.OPEN) ws.send(d); }, close: (c, r) => ws.close(c, r) }, key);
  ws.on('message', (data, isBinary) => end.receive(isBinary ? new Uint8Array(data as Buffer) : String(data)));
  end.start();
  return {
    send: (m) => end.send(m),
    onMessage: (h) => { end.onMessage = h; },
    onClose: (h) => { ws.on('close', h); },
    close: () => ws.close(),
  };
}

/** A long-term key from a file (made on first use; the file holds the secret, readable by its owner only). */
export function loadKey(file: string): ChannelKey {
  if (existsSync(file)) {
    const secret = unb64u(JSON.parse(readFileSync(file, 'utf8')).secret);
    return { secret, pub: x25519.getPublicKey(secret) };
  }
  const secret = x25519.utils.randomSecretKey();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ secret: b64u(secret) }), { mode: 0o600 });
  return { secret, pub: x25519.getPublicKey(secret) };
}
