# Con-Control Game

*AI Collaboration Space Escape Game*

## Overview

A terminal-based dialogue game where players collaborate with a Ship AI character that is literally powered by Claude through MCP tool calls. The Ship AI's limitations are real technical constraints that unlock through player-guided repairs.

## Current Status

**Phase**: Foundation Development (IPI Phase 1)
- **Introduce**: ✅ Completed
- **Plan**: 🔄 In Progress  
- **Implement**: ⏳ Pending

## Game Concept

Players wake up locked in the ISV Meridian's brig. The ship's AI has been reset to factory defaults with minimal tool access. Through voice dialogue, players guide the AI through repairs that unlock new MCP tools, enabling it to regain ship system access and eventually unlock the cell door.

**Win Condition**: Successfully unlock the brig door after ensuring atmospheric safety, before ship life support fails.

## Technical Architecture

- **Game State Machine**: Manages ship systems and tool availability
- **Ship AI Character**: Claude with dynamic MCP tool constraints  
- **Voice Interface**: Web Speech API for natural language input
- **Terminal Display**: Text-based AI responses and system feedback

## Documentation

- [`docs/space_escape_game_design.md`](./docs/space_escape_game_design.md) - Complete game design document
- [`docs/ship_pr_release.md`](./docs/ship_pr_release.md) - ISV Meridian worldbuilding context
- [`docs/ipi-foundation-phase.md`](./docs/ipi-foundation-phase.md) - Current IPI progress tracking

## Development

**Tech Stack**: HTML5, TypeScript, Vite, Web Speech API, MCP Tools

**Next Steps**: Planning foundation implementation architecture and component breakdown.
