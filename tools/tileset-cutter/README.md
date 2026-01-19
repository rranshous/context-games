# Tileset Cutter

A simple browser-based tool for defining sprite regions in tileset images.

## Usage

1. Open `index.html` in a browser (or via dev server)
2. Click "Load Image" to load a tileset PNG
3. Click and drag to draw bounding boxes around sprites
4. Give each region a label
5. Export as JSON or copy as JS object

## Controls

- **Click + Drag**: Draw a new region
- **Shift + Click**: Select an existing region
- **Delete key**: Remove selected region
- **Zoom +/-**: Increase/decrease zoom level (pixel grid shows at 4x+)

## Integration with Playwright

The tool exposes functions for automation:

```javascript
// Load image from URL
window.loadImageFromURL('http://localhost:3000/path/to/tileset.png');

// Get current regions
window.getRegions();

// Set regions (load saved work)
window.setRegions([{x: 0, y: 0, w: 16, h: 16, label: 'grass'}]);
```

### Playwright Setup Pattern

To load an asset image via Playwright automation, serve from the repo root to avoid CORS issues:

```bash
# From repo root (so assets and tool share same origin)
cd /path/to/repo && python3 -m http.server 8765
```

Then navigate and load:

```javascript
// Navigate to tool
await page.goto('http://localhost:8765/tools/tileset-cutter/index.html');

// Load asset image (same origin, no CORS)
await page.evaluate(() => {
  window.loadImageFromURL('http://localhost:8765/games/my-game/assets/spritesheet.png');
});
```

## Output Format

The "Copy JS Object" button generates code like:

```javascript
const TILE_DEFS = {
    grass: { x: 0, y: 0, w: 16, h: 16 },
    tree: { x: 144, y: 0, w: 32, h: 48 },
    water: { x: 0, y: 64, w: 16, h: 16 }
};
```

This can be pasted directly into game code.
