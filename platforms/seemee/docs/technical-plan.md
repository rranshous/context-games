# Seemee Platform - Technical Plan

## Date
September 28, 2025

## Architecture Overview

### Core Components

1. **Backend API** (TypeScript/Node.js)
   - Game management and publishing
   - AI provider integration (ollama local + Anthropic remote)
   - API key management (server-side only)
   - Game discovery endpoint

2. **Web Interface** (TypeScript)
   - Game listing/discovery page
   - Game management interface (for you)
   - Provider selection for games

3. **Game Integration**
   - Support for existing Vite-based games
   - Simple deployment mechanism
   - Static file serving

### Deployment Flow

**Developer Experience:**
1. You manage/publish games through seemee interface
2. Games get deployed and become accessible
3. Discovery page automatically updates

**User Experience:**
1. Visit seemee web interface
2. Browse available games
3. Launch games with chosen AI provider

### Hosting Strategy

- **Local Development**: localhost port
- **Production**: Published to internet (your choice of hosting)
- **Game Assets**: Served as static files from backend

### AI Provider Integration

**Backend Responsibilities:**
- Store and manage API keys securely
- Proxy AI requests from games
- Handle provider-specific authentication

**Frontend Responsibilities:**
- Allow users to choose provider per game
- Send requests to backend proxy endpoints

### Game Lifecycle (Simple)

- **Deploy**: Copy game files to seemee
- **Update**: Overwrite existing files
- **Remove**: Delete game directory
- **Version**: Keep it simple initially (no versioning)

## Technical Decisions

### Vite Integration Strategy

**Option 1: Build Output Integration**
- Games build with `vite build`
- Seemee serves the `dist/` output
- Pro: Works with existing setup
- Con: Requires build step

**Option 2: Direct Vite Dev Server Proxy**
- Seemee proxies to running Vite dev servers
- Pro: Live reload during development
- Con: More complex, requires managing multiple processes

**Recommendation**: Start with Option 1 (build output)

### Technology Stack

**Backend:**
- Node.js + TypeScript
- Express.js (simple and familiar)
- File-based storage initially
- Config files for game metadata

**Frontend:**
- TypeScript + HTML/CSS
- Minimal framework (or vanilla)
- Fetch API for backend communication

## Implementation Phases

### Phase 1: Core Backend
- [ ] Basic Express server
- [ ] Game file serving
- [ ] AI provider proxy endpoints
- [ ] Simple game registration

### Phase 2: Web Interface
- [ ] Game discovery page
- [ ] Game management interface
- [ ] Provider selection UI

### Phase 3: Integration & Polish
- [ ] Vite build integration
- [ ] Existing games migration
- [ ] Production deployment setup

## Next Steps

1. Set up basic TypeScript/Node.js project structure
2. Create simple Express server with static file serving
3. Implement AI provider proxy endpoints
4. Build minimal game discovery interface

---

*Following the Introduce, Plan, Implement pattern - ready for Implementation phase.*