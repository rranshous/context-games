// The pictures come on plain white: lift the unit off it, so it stands on whatever it's
// shown against. Fills in from the edges through near-white, so white inside the unit
// (teeth, highlights) stays.

const cache = new Map();
const MAX = 768;

export function cutout(url) {
  if (!cache.has(url)) cache.set(url, new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';   // pictures may come from the art domain; the canvas needs to read them
    img.onload = () => {
      const k = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h), px = d.data;
      const light = (i) => Math.min(px[i], px[i + 1], px[i + 2]);
      const seen = new Uint8Array(w * h), stack = [];
      for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const p = stack.pop();
        if (seen[p] || light(p * 4) < 225) continue;
        seen[p] = 1;
        const x = p % w, y = (p - x) / w;
        if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
      }
      // Background showing through a gap (between legs, inside treads) is enclosed, so the
      // fill can't reach it: clear any pocket of near-pure white big enough to be a gap.
      const pocket = new Uint8Array(w * h), POCKET = w * h * 0.0005;
      for (let s = 0; s < w * h; s++) {
        if (seen[s] || pocket[s] || light(s * 4) < 240) continue;
        const region = [], q = [s];
        pocket[s] = 1;
        while (q.length) {
          const p = q.pop(); region.push(p);
          const x = p % w;
          for (const n of [x > 0 && p - 1, x < w - 1 && p + 1, p - w, p + w]) {
            if (n === false || n < 0 || n >= w * h || seen[n] || pocket[n] || light(n * 4) < 240) continue;
            pocket[n] = 1; q.push(n);
          }
        }
        if (region.length > POCKET) for (const p of region) seen[p] = 1;
      }
      for (let p = 0; p < w * h; p++) {
        if (seen[p]) { px[p * 4 + 3] = 0; continue; }
        // Soften the rim: a light pixel next to the cleared background fades out.
        const x = p % w;
        const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || seen[p - w] || seen[p + w];
        if (edge) px[p * 4 + 3] = Math.max(0, 255 - Math.max(0, light(p * 4) - 150) * 2.4);
      }
      g.putImageData(d, 0, 0);
      // Trim to the unit, with a little room around it.
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let p = 0; p < w * h; p++) if (px[p * 4 + 3] > 40) { const x = p % w, y = (p - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 <= x0) return resolve(c.toDataURL('image/png'));
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const t = Object.assign(document.createElement('canvas'), { width: x1 - x0 + 1, height: y1 - y0 + 1 });
      t.getContext('2d').drawImage(c, -x0, -y0);
      resolve(t.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('picture would not load'));
    img.src = url;
  }));
  return cache.get(url);
}
