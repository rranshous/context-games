# Theater Mechanics

## Visual Concept
We are looking at a stage from the **audience perspective** (front view). Three layers exist at different depths:

**Back → Front (Z-order):**
1. **Tiles** - Stage backdrop wall
2. **Props** - Mid-stage scenery  
3. **Puppets** - Front-stage actors

## Stage Dimensions
All measurements use **"Stage Inches"** as the base unit:
- **Stage Width**: 64 Stage Inches (left-to-right, X-axis)
- **Stage Height**: 32 Stage Inches (bottom-to-top, Y-axis)
- **Aspect Ratio**: 2:1 (width:height)
- **Depth**: Fixed layers (not positioning axis)

## Layer Details

### Layer 1: Tiled Background
- **Grid**: 64×32 discrete tiles forming the backdrop wall
- **Coordinates**: (0-63 width, 0-31 height)
- **Colors**: 10 starter color palette:
  - `'black'`, `'white'`, `'red'`, `'green'`, `'blue'`
  - `'yellow'`, `'purple'`, `'orange'`, `'brown'`, `'gray'`
- **State**: Each tile has one color from the palette
- **Control**: Direct tile setting `tile.set(x, y, color)`

### Layer 2: Props
- **Slots**: 12 fixed horizontal positions across stage width
- **Visibility**: Hidden by default, only visible when explicitly set
- **Positioning**: 
  - **X Position**: Fixed to slot positions (calculated from slot 0-11)
  - **Y Position**: 0-10 Stage Inches offset (up from stage floor)
- **Properties**: Can have rotation and tilt values
- **Control**: `prop.deploy(slot, type, y?, rotation?, tilt?)`

### Layer 3: Puppets  
- **Count**: 6 puppet characters (ids 0-5)
- **Visibility**: Hidden by default, only visible when positioned
- **Movement**: 
  - **X Position**: 0-64 Stage Inches (full stage width, left-to-right)
  - **Y Position**: Fixed baseline + adjustable offset (0-10 Stage Inches up from stage floor)
- **Properties**: Can have rotation and tilt values
- **Control**: `puppet.move(id, x, y?)`, `puppet.spin(id, rotation)`, `puppet.tilt(id, degrees)`

## Core Principles
- **No Transitions**: All state changes are immediate (A→B directly)
- **Explicit Visibility**: Elements only appear when explicitly positioned/deployed
- **Atomic Operations**: One change at a time, no batching yet
- **Strict Validation**: Bad values ignored with warnings, no errors thrown

## Coordinate Systems
- **Tiles**: Integer grid coordinates 
  - X: 0-63 Stage Inches (left-to-right)
  - Y: 0-31 Stage Inches (bottom-to-top)
- **Puppets**: Continuous positioning
  - X: 0-64 Stage Inches (left-to-right across stage width)
  - Y: Fixed baseline + 0-10 Stage Inches offset (up from stage floor)
- **Props**: Fixed to slot positions 
  - X: Fixed slot positions (12 slots evenly distributed across 64 Stage Inches width)
  - Y: 0-10 Stage Inches offset (up from stage floor)
