# Silly Theatre Assets

This directory contains all visual assets for the theater simulator.

## Directory Structure

### `/props/`
Sprite images for the 6 prop types:
- `tree.png` - Fairy tale tree with trunk and canopy
- `house.png` - Cozy cottage with roof, door, windows
- `castle.png` - Medieval castle with towers and battlements  
- `bush.png` - Garden bush/shrub with berries
- `rock.png` - Stone boulder/rock formation
- `sign.png` - Wooden signpost with blank board

### `/puppets/`
Character sprite images:
- `puppet.png` - Main character design
- `puppet-variants/` - (future) Different character types

## Image Specifications

### **Format**: PNG (with transparency support)
### **Size**: Recommended 64×64px to 128×128px 
### **Style**: Folksy hand-drawn, puppet show aesthetic
### **Background**: Transparent or easy-to-remove solid color

## Integration Notes

Images will be loaded by the renderer and drawn on the canvas at runtime. The renderer handles:
- Scaling to appropriate stage size
- Rotation and tilt transforms
- Shadow rendering (when enabled)
- Layered composition

## File Naming Convention

Use lowercase with hyphens for multi-word names:
- ✅ `tree.png`, `house.png`, `castle.png` 
- ✅ `puppet-variant-1.png` (for future variants)
- ❌ `Tree.PNG`, `house_sprite.png`
