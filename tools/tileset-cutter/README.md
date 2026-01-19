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
