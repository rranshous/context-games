# Stitch look.mjs frames into an animated GIF: python3 safari/gif.py <dir> <out.gif> [ms per frame] [scale]
import sys, glob
from PIL import Image
files = sorted(glob.glob(f'{sys.argv[1]}/frame-*.png'))
ms = int(sys.argv[3]) if len(sys.argv) > 3 else 120
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 1
frames = [Image.open(f).convert('RGB') for f in files]
if scale != 1: frames = [f.resize((int(f.width * scale), int(f.height * scale)), Image.NEAREST) for f in frames]
frames = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT) for f in frames]
frames[0].save(sys.argv[2], save_all=True, append_images=frames[1:], duration=ms, loop=0, optimize=True)
print(sys.argv[2], len(frames), 'frames')
