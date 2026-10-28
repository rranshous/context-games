# Cut the interface's drawings (tools/frames-raw/, from frames.mjs) into the pieces the
# pages use (public/img/ui/<aid>/): the white around each piece made clear, trimmed to the
# piece, and scaled to what a screen needs. The backdrops just shrink.
#
#   python3 tools/frames.py

from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent.parent
RAW, OUT = HERE / 'tools/frames-raw', HERE / 'public/img/ui'
WIDTH = {'panel': 360, 'button': 560, 'main': 560, 'knob': 128}


def clear_white(im):
    """Clear the white that touches the edge (not white inside the piece), softening the rim."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    white = lambda p: p[0] > 228 and p[1] > 228 and p[2] > 228
    seen = bytearray(w * h)
    todo = deque((x, y) for x in range(w) for y in (0, h - 1)) + deque((x, y) for y in range(h) for x in (0, w - 1))
    while todo:
        x, y = todo.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y * w + x] or not white(px[x, y]):
            continue
        seen[y * w + x] = 1
        todo.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    mask = Image.frombytes('L', (w, h), bytes(0 if s else 255 for s in seen))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(mask)
    return im.crop(mask.point(lambda a: 255 if a > 40 else 0).getbbox())


for raw in sorted(RAW.glob('*.png')):
    aid, kind = raw.stem.split('-')
    (OUT / aid).mkdir(parents=True, exist_ok=True)
    im = Image.open(raw)
    if kind == 'room':
        im.convert('RGB').save(OUT / aid / 'room.jpg', quality=78)
    else:
        im = clear_white(im)
        im = im.resize((WIDTH[kind], round(WIDTH[kind] * im.height / im.width)), Image.LANCZOS)
        im.save(OUT / aid / f'{kind}.png', optimize=True)
    print(aid, kind, im.size)
