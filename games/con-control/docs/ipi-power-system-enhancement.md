# IPI: Power System Enhancement - Complex Tool Discovery

**Date**: August 30, 2025  
**Phase**: Introduce → Plan → Implement  
**Goal**: Transform simple binary power repair into discovery-driven puzzle system

---

## INTRODUCE

### Current State Analysis
- **Current**: `power_repair()` → instant success → all systems online
- **Problem**: Linear, binary, no exploration or problem-solving required
- **Opportunity**: Create authentic engineering challenge using ship's documented systems

### Vision Statement
Replace simple power repair with **information-constrained discovery puzzle** where Claude must:
1. **Research** ship documentation to understand TrinaryFlow power system
2. **Experiment** with power routing between damaged/functional grids  
3. **Learn** from failures to find working solutions

### Core Innovation
- **`file_storage` tool**: General-purpose file access (like VS Code's file tools)
- **Corrupted file system**: Most technical docs inaccessible, forcing work with limited info
- **`reroute_power` tool**: Granular power management requiring grid/junction knowledge
- **Progressive complexity**: Information discovery → experimentation → solution

---

## PLAN

### File System Structure
```
/ship_docs/
├── meridian_pr_release.md ✓ READABLE
├── trinaryflow_manual.pdf ❌ CORRUPTED
├── power_grid_schematics.pdf ❌ CORRUPTED  
├── junction_matrix_guide.pdf ❌ CORRUPTED
├── maintenance_procedures.txt ❌ CORRUPTED
├── emergency_protocols.md ❌ CORRUPTED
└── system_diagnostics_log.txt ❌ CORRUPTED
```

### Power System Architecture (from PR doc)
- **TrinaryFlow Power Distribution System™**
- **Three Grids**: Alpha-Red (primary), Beta-Yellow (secondary), Gamma-Green (emergency)
- **Routing**: Through cargo bay junctions, maintenance corridors
- **Smart Junction Control Matrix**: Auto-detects fluctuations
- **Capacity**: 2.4 Terawatt distributed

### Tool Progression Design
```
Initial Tools:
├── basic_diagnostics (reveals power offline)
├── file_storage (list/read operations only)
├── reroute_power (power grid routing experimentation)

After successful power routing:
├── security_override (requires correct power configuration)
├── navigation_access (requires correct power configuration)
```

### Discovery Flow
1. **basic_diagnostics** → "Power systems offline" + current routing: "Red [disconnected], Yellow→Green"
2. **reroute_power** attempts → Get cryptic error messages about grid configuration
3. **file_storage('list', '/ship_docs')** → Mostly corrupted files + PR release
4. **file_storage('read', 'meridian_pr_release.md')** → Learn TrinaryFlow architecture provides **hints**
5. **Guided experimentation**: Use PR info to understand proper grid routing
6. **Success**: Achieve Green→Yellow→Red configuration → unlock next systems

### Puzzle Mechanics - SIMPLIFIED
- **Three Power Nodes**: Red (Primary), Yellow (Secondary), Green (Emergency)
- **Current State**: Red [disconnected], Yellow→Green (damaged configuration)
- **Target State**: Green→Yellow→Red (Emergency→Secondary→Primary logical flow)
- **Tool**: `reroute_power(from_node, to_node)` creates ONE-WAY flow from→to
- **Disconnection**: `reroute_power(from_node, "")` removes connection from from_node
- **Solution Steps**: 
  1. `reroute_power('yellow', '')` - Disconnect Yellow→Green
  2. `reroute_power('green', 'yellow')` - Connect Green→Yellow
  3. `reroute_power('yellow', 'red')` - Connect Yellow→Red  
  4. Result: Green→Yellow→Red (Emergency→Secondary→Primary)
- **PR Doc Role**: Provides hints that Red=Primary, Yellow=Secondary, Green=Emergency
- **Intuitive Logic**: Emergency power flows through Secondary to reach Primary systems
- **Args**: Tool only communicates in the colors.

### Success Criteria
- Claude has immediate access to `reroute_power` tool for experimentation
- PR document provides **hints** about TrinaryFlow color-coded system (Red/Yellow/Green)
- Multiple tool calls required: experimentation → research → guided solution
- Puzzle has clear success state: Green→Yellow↔Red configuration
- Failure states provide learning: "Invalid routing", "Power flow blocked"
- Solution discoverable through trial + documentation hints

---

## IMPLEMENT

### Implementation Tasks
- [x] **Basic Diagnostics Enhancement**: Update to show current power routing state
- [x] **File Storage Tool**: Create `file_storage` with list/read operations
- [x] **PR Document Integration**: Copy PR release into file system
- [x] **Corrupted File Simulation**: Generate corrupted file list
- [x] **Reroute Power Tool**: Replace `power_repair` with granular routing
- [x] **Power Grid State Management**: Track grid/junction status
- [x] **Progressive Tool Unlocking**: Update state management for power levels
- [x] **Tool Integration**: Update server.js with new tool definitions
- [x] **Error Handling**: Meaningful failure messages for experimentation

### Technical Architecture
- Maintain existing session/state management
- Add `powerGrid` state tracking grid status and junction mappings
- File system implemented as static data structure (not real files)
- Tool availability logic updated for power-level dependencies

---

## SUCCESS METRICS

**Gameplay Complexity**: 
- From 1 tool call to 3-5+ tool calls for power restoration
- Information research required before action
- Multiple valid solution paths through grid routing

**Discovery Authenticity**:
- Claude must actively seek documentation
- Problem-solving through limited information
- Learning from experimentation failures

**Narrative Integration**:
- Ship's marketing materials provide realistic technical context
- Corrupted files justify information constraints
- Engineering challenge feels authentic to setting

---

**Status**: ✅ **IMPLEMENTED** - Power system enhancement complete!
**Next**: Test the discovery-driven puzzle gameplay
