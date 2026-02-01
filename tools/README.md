# Tools

Interactive browser-based tools for game development workflows. These tools are designed to work with **Playwright automation** - Claude (or other AI assistants) can launch them, you interact visually, and structured results are read back programmatically.

## The Playwright-Interactive Tool Pattern

```
┌─────────────────────────────────────────────────────────────┐
│  1. Claude builds/launches HTML tool via Playwright         │
│  2. Claude loads assets via window.loadXXX() functions      │
│  3. You interact visually (draw, select, arrange, label)    │
│  4. Claude reads results via window.getXXX() functions      │
│  5. Claude uses structured data directly in game code       │
└─────────────────────────────────────────────────────────────┘
```

This pattern is powerful for tasks that are:
- **Hard to describe** but easy to point at
- **Visual/spatial** in nature
- **Tedious to specify** coordinates, colors, timings manually

## Available Tools

| Tool | Purpose | Status |
|------|---------|--------|
| [tileset-cutter](tileset-cutter/) | Define sprite regions in tileset images | ✅ Ready |

## Building a New Tool

### Required: Window API Functions

Every tool must expose global functions for Playwright to call:

```javascript
// SETUP: Load assets or initialize state
window.loadImageFromURL = function(url) {
  // Load and display the asset
  img.src = url;
};

// READ: Get the user's work as structured data
window.getRegions = function() {
  return regions;  // Array of objects, JSON-serializable
};

// RESTORE: Load previous state (for continuing work)
window.setRegions = function(data) {
  regions = data;
  render();
};
```

### Naming Convention

- `loadXXX(url)` - Load an asset (image, audio, data file)
- `getXXX()` - Return structured results
- `setXXX(data)` - Restore previous state

### Output Format Guidelines

Return data that can be directly used in game code:

```javascript
// Good: Direct coordinates
{ grass: { x: 0, y: 0, w: 16, h: 16 } }

// Good: Array of labeled items
[{ label: 'walk_1', x: 0, y: 0, w: 32, h: 32, duration: 100 }]

// Good: Polygon vertices
{ hitbox: [[0, 0], [16, 0], [16, 16], [8, 20], [0, 16]] }
```

### CORS Handling

Serve assets from the same origin as the tool to avoid CORS issues:

```bash
# From repo root
python3 -m http.server 8765
```

Then load assets with full URLs:
```javascript
window.loadImageFromURL('http://localhost:8765/games/my-game/assets/sprite.png');
```

## Playwright Usage Example

```javascript
// 1. Navigate to tool
await page.goto('http://localhost:8765/tools/tileset-cutter/index.html');

// 2. Load asset
await page.evaluate(() => {
  window.loadImageFromURL('http://localhost:8765/games/my-game/tileset.png');
});

// 3. Wait for user interaction...
// (User draws regions, labels them, etc.)

// 4. Read results
const regions = await page.evaluate(() => window.getRegions());

// 5. Use in code generation
const code = `const SPRITES = ${JSON.stringify(regions, null, 2)};`;
```

## Tool Ideas

Tools that would benefit from this pattern:

| Tool | You Do | Claude Gets |
|------|--------|-------------|
| **Level Editor** | Place tiles/objects on grid | JSON map data |
| **Hitbox Editor** | Draw collision polygons | Vertex arrays |
| **Animation Timeline** | Arrange frames, set timing | Frame sequence + durations |
| **Color Palette Picker** | Click colors in image | Hex codes array |
| **Sprite Arranger** | Position sprites in scene | Layout coordinates |
| **Sound Cue Marker** | Mark timestamps in audio waveform | Cue points array |
| **Parallax Layer Setup** | Arrange background layers | Layer depths + speeds |
| **Dialog Tree Builder** | Connect conversation nodes | Dialog graph JSON |

## Template

Minimal starting point for a new tool:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Tool Name</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    #canvas { border: 1px solid #ccc; }
  </style>
</head>
<body>
  <canvas id="canvas" width="800" height="600"></canvas>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let data = [];  // User's work stored here
    let img = null;

    // === PLAYWRIGHT API ===

    window.loadImageFromURL = function(url) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = render;
      img.src = url;
    };

    window.getData = function() {
      return data;
    };

    window.setData = function(newData) {
      data = newData;
      render();
    };

    // === RENDERING ===

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img) ctx.drawImage(img, 0, 0);
      // Draw user's work...
    }

    // === INTERACTION ===

    canvas.addEventListener('mousedown', (e) => {
      // Handle clicks...
    });

    render();
  </script>
</body>
</html>
```
