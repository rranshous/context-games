// Reading a checkpoint in node. A crowded run's is several GB unzipped, and gunzipSync holds
// it twice at the end (its chunks, then the joined copy): this inflates into one buffer the
// size the gzip trailer gives (the size mod 4 GB, so a bigger one grows by 4 GB at a time).
import { closeSync, createReadStream, fstatSync, openSync, readSync } from 'node:fs';
import { createGunzip } from 'node:zlib';

export async function readSave(path: string): Promise<Uint8Array> {
  const fd = openSync(path, 'r'), tail = Buffer.alloc(4);
  readSync(fd, tail, 0, 4, Math.max(0, fstatSync(fd).size - 4));
  closeSync(fd);
  let out = new Uint8Array(tail.readUInt32LE(0)), n = 0;
  for await (const c of createReadStream(path).pipe(createGunzip()) as AsyncIterable<Buffer>) {
    if (n + c.length > out.length) { const o = new Uint8Array(out.length + 2 ** 32); o.set(out.subarray(0, n)); out = o; }
    out.set(c, n);
    n += c.length;
  }
  return n === out.length ? out : out.subarray(0, n);
}
