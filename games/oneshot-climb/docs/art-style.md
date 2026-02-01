# Art Style

## Reference
**Paper Pixels** by v3x3d - https://v3x3d.itch.io/paper-pixels

Key qualities:
- Tiny sprites (8x12 or smaller)
- Limited, muted color palette (soft greens, browns, pinks, cream)
- Geometric simplicity - characters and objects are just a few shapes
- Lots of negative space
- Charming minimalism - constraints create character

## Why This Style
1. **Tractable for generation** - small sprites with limited palettes are bounded problems
2. **Fast iteration** - we can create and test assets quickly
3. **Coherent failures** - a weird 8x12 blob is fine, not jarring
4. **Dogfooding** - we build assets the same way the game generates them at runtime

## Sprite Format

ASCII-style pixel arrays. Each character maps to a color in the **game's fixed palette**.

The palette is defined once by us, and given to inference as a constraint. Inference outputs sprites using only those characters - it does NOT define its own palette.

**Inference input (in prompt):**
```
Use ONLY these palette characters:
. = transparent
k = outline/dark brown
w = warm white/highlight
g = muted green
b = soft blue
r = soft red
o = orange
y = yellow
p = pink
t = teal
```

**Inference output:**
```javascript
{
  name: "Flame Boots",
  sprite: [
    "....rr....",
    "...roor...",
    "..royyro..",
    "..royyro..",
    "...roor...",
    "....rr....",
    "..kk..kk..",
    "..kk..kk..",
  ]
  // NO palette - uses game's fixed palette
}
```

### Why fixed palette
- **Visual consistency** - all generated sprites match the game's look
- **Simpler generation** - inference picks from known options
- **Easy validation** - just check all characters are valid
- **Authentic retro** - this is how old consoles worked

### Why ASCII over numeric arrays
- Easier for AI to "see" what it's drawing
- More human-readable during development
- Natural character-to-color mapping
- Simpler to validate/debug

### Sprite Sizes
- **Items/icons**: 8x8 or 10x10
- **Characters**: 8x12 to 12x16
- **Larger objects** (forge, platforms): 16x16 to 32x32

## Color Palette

TBD - will define a base palette that:
- Has ~10-16 colors
- Uses muted, paper-like tones
- Includes: transparent, outline color, 2-3 warm tones, 2-3 cool tones, neutral/brown, highlight

Example direction (from Paper Pixels feel):
```
Background:  #f5f0e1 (cream/paper)
Outline:     #5d4e37 (warm brown)
Grass:       #7d9f5a (muted green)
Sky accent:  #a8c0b0 (soft teal)
Warm 1:      #c45c4a (soft red)
Warm 2:      #e67e22 (orange)
Warm 3:      #f4d03f (yellow)
Cool 1:      #6b8fa3 (muted blue)
Highlight:   #fff8e7 (warm white)
```

## Generation Contract

**Input** (in prompt): The fixed palette with character mappings

**Output** from inference:
- `sprite` - array of strings, each string is a row using only valid palette characters

The renderer will:
1. Parse each row
2. Look up each character in the game's fixed palette
3. Draw pixels at appropriate scale (e.g., 4x or 8x for crisp pixels)

**Validation:**
- All characters in sprite must exist in palette
- All rows should be same length
- Dimensions should match expected size (e.g., 10x10 for items)

## Open Questions
- Exact palette colors (needs visual testing)
- Animation frames? Or static sprites only for now?
- Scale factor for rendering (4x? 8x?)
