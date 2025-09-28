# Game Platform - Introduction

## Purpose

The Game Platform is a web-based hosting service for HTML5 games designed for **AI-assisted development workflows**. It assumes developers work in partnership with AI models (like GitHub Copilot) and provides APIs and tooling that enable AI assistants to publish and manage games directly from the development environment.

## Target Game: Dark Hall

Our first target game is **Dark Hall** - a horror maze game built with TypeScript and HTML5 Canvas. This choice provides a good test case because:

- ✅ TypeScript-based (matches our tech stack)
- ✅ HTML5 Canvas game (common pattern)
- ✅ Has existing build system (`build.sh`, `package.json`)
- ✅ Self-contained with clear entry point (`index.html`)
- ✅ Already published on itch.io (reference point)
- ✅ No AI inference needed (simple first case)

## Core Features (MVP)

### Game Hosting
- [ ] Serve HTML5 games with proper MIME types
- [ ] Support for game assets (images, audio, etc.)
- [ ] Proper isolation/sandboxing between games

### Game Discovery
- [ ] Simple game listing page
- [ ] Game metadata display (title, description, screenshot)
- [ ] Direct game launch (full screen or embedded)
- [ ] Basic game information

### AI-Assisted Publishing Workflow
- [ ] **MCP Tools** - Direct AI assistant integration via Model Context Protocol
- [ ] **Game publishing** - AI can upload and publish games directly
- [ ] **Metadata management** - Auto-generate descriptions from code/README
- [ ] **Asset management** - AI can organize and upload game assets
- [ ] **Game updates** - Manage versions and content updates
- [ ] **Platform management** - AI can configure and maintain the platform

## Technical Requirements

### Frontend (React + TypeScript)
- Game discovery UI
- Game launch interface
- Admin interface for publishing
- Responsive design (desktop focused initially)

### Backend (Node.js + TypeScript)
- **CRUD API** for game management operations
- **RESTful API** for web frontend and external access
- Static file serving for games
- Game metadata management
- File upload and asset management
- Simple database (JSON files or SQLite)

### VS Code Extension
- **Language Model Tools** - AI assistant integration via VS Code API
- Tools for publish_game, update_metadata, upload_assets, etc.
- User confirmation dialogs for safe operations
- Direct integration with VS Code's agent mode

### VS Code Extension Integration Points
- **Language Model Tools** - publish_game, update_metadata, upload_assets, etc.
- **File system access** - AI can read game files directly from workspace
- **Metadata extraction** - Parse README, package.json automatically
- **CRUD API calls** - Extension tools interface with backend API
- **User confirmations** - Safe operations with VS Code approval dialogs
- **Agent mode integration** - Tools available in VS Code's AI chat
- **Future: AI inference proxy integration**

## Success Criteria

### Phase 1: Single Game Hosting
- [ ] Dark Hall loads and plays correctly
- [ ] Game assets serve properly
- [ ] Basic game info displayed
- [ ] Accessible to friends via URL

### Phase 2: Multi-Game Platform
- [ ] Support multiple games
- [ ] Game discovery interface
- [ ] Publishing workflow established
- [ ] Performance acceptable for desktop hosting

## Technical Decisions

### Hosting Strategy
- Desktop-hosted backend (simple deployment)
- Static file serving with proper headers
- No CDN/complex caching initially

### Data Storage
- Start with JSON files for metadata
- Migrate to SQLite if needed
- Keep it simple and file-based

### Asset Management
- Direct file serving initially
- Future: optimization and compression
- Support common web formats (PNG, JPG, MP3, etc.)

## Implementation Plan

1. **CRUD API Backend**: Express server with game management endpoints
2. **VS Code Extension**: Language Model Tools for AI assistant integration
3. **Game Publishing Tools**: publish_game, upload_assets, update_metadata
4. **Static Serving**: Host games with proper file serving
5. **Frontend Discovery**: React UI for game browsing 
6. **AI Workflow**: Test complete publish flow with Dark Hall via VS Code

## VS Code Language Model Tools Design

```typescript
// VS Code extension tools the AI assistant can use:
tools: [
  {
    name: "publish_game",
    displayName: "Publish Game",
    description: "Publish a game to the platform",
    inputSchema: {
      gameDir: string,      // Path to game directory
      title?: string,       // Auto-extract from README if not provided
      description?: string  // Auto-extract from README if not provided
    }
  },
  {
    name: "upload_assets", 
    displayName: "Upload Assets",
    description: "Upload game assets (images, audio, etc.)",
    inputSchema: {
      gameId: string,
      assetPaths: string[]
    }
  },
  {
    name: "update_metadata",
    displayName: "Update Game Metadata", 
    description: "Update game information",
    inputSchema: {
      gameId: string,
      metadata: GameMetadata
    }
  }
]
```

---

*Sub-project: Game Platform*  
*Target Game: Dark Hall*  
*Created: September 28, 2025*