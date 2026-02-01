# Oneshot Climb Tools

## Sprite Editor

A browser-based pixel art editor for Paper Pixels style sprites.

### Manual Usage

1. Open `sprite-editor.html` in a browser
2. Use the palette to select colors (keyboard: 1-0 for quick select)
3. Draw on the grid (left click draw, right click erase)
4. Copy the generated code with "Copy to Clipboard"

### Controls

- **Left click**: Draw with selected color
- **Right click**: Erase (set to transparent)
- **1-0 keys**: Quick palette select
- **D/E/F/P**: Switch tools (Draw/Erase/Fill/Pick)

### Integration with Playwright MCP

The tool exposes global functions for Claude to automate sprite editing workflows.

#### Setup

Serve from repo root to avoid CORS issues:

```bash
# From games repo root
python3 -m http.server 8765
```

#### Playwright API

```javascript
// Navigate to the tool
await page.goto('http://localhost:8765/games/oneshot-climb/tools/sprite-editor.html');

// Load an existing sprite for editing
await page.evaluate(() => {
    window.setSprite([
        '...ww...',
        '..kwwk..',
        '..kwwk..',
        '.kkbbkk.',
    ]);
});

// User edits the sprite in the browser...

// Get the edited sprite back
const sprite = await page.evaluate(() => window.getSprite());
// Returns: ['...ww...', '..kwwk..', ...]

// Get as copy-paste ready code
const code = await page.evaluate(() => window.getSpriteCode());
// Returns: "const SPRITE = [\n    '...ww...',\n    ..."

// Other helpers
await page.evaluate(() => window.clearSprite());
await page.evaluate(() => window.resizeSprite(10, 14));
const dims = await page.evaluate(() => window.getSpriteDimensions());
```

#### Workflow Pattern

1. Claude loads the current sprite into the editor
2. Claude takes a screenshot so user can see current state
3. User edits in browser
4. User tells Claude they're done
5. Claude reads the result and updates game code

### Palette Reference

| Key | Color | Hex |
|-----|-------|-----|
| `.` | Transparent | - |
| `k` | Outline/Dark Brown | #5d4e37 |
| `w` | White/Highlight | #fff8e7 |
| `g` | Green | #7d9f5a |
| `b` | Blue | #6b8fa3 |
| `r` | Red | #c45c4a |
| `o` | Orange | #e67e22 |
| `y` | Yellow | #f4d03f |
| `p` | Pink | #d4a5a5 |
| `t` | Teal | #a8c0b0 |
| `n` | Brown | #8b7355 |
| `d` | Dark Brown | #4a3728 |
