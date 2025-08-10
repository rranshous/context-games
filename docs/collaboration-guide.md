# Collaboration Guide

**For AI assistants collaborating with Robby on game development projects**

## Quick Repository Overview

This repository contains 11 game development projects as Git submodules, organized into two main categories:

- **Games** (5 projects): Traditional game experiences  
- **Interactive Experiences** (6 projects): Experimental tools, simulations, and creative platforms

## Key Files & Tools

### Central Documentation
- `/games/README.md` - Main project overview with current status of all projects
- `/docs/games-readme-ipi.md` - Complete documentation process history 
- `/docs/development-patterns.md` - Robby's preferred coding patterns and architectures
- `/docs/technical-setup.md` - Environment setup and development workflows

### Utility Scripts
- `/bin/fetch-itch-games.js` - Retrieves current publication data from itch.io API
- `.env` - Contains API keys (gitignored, see `.env.example`)

## Working with the itch.io API Script

To get current publication status and stats:

```bash
# Make sure .env file exists with ITCH_API_KEY
node bin/fetch-itch-games.js
```

This provides:
- Current publication status
- View counts and download stats  
- Publication dates
- Clean summary for updating documentation

## Project Status Categories

When working with projects, use these status categories consistently:

- **Foundation ready for expansion** - Solid base for new development
- **Playable core mechanics complete** - Game works but needs polish
- **~Complete** - Essentially finished, minor enhancements possible
- **Functional, potentially complete** - Working well, may be done
- **In development, interesting but not complete** - Active work needed
- **Experimental, limited development** - Early concept, didn't pursue far
- **MVP Complete** - First version done, refinement planned
- **Playable full game, very fun** - Complete and enjoyable experience

## Key Project Insights

### Priority Projects for AI Development
- **RaceOn** - Good foundation for AI-driven game making experiments
- **Stacksonstacks** - Designed for kids collaborating with AI 
- **Dark Hall** - Demonstrates preferred architecture pattern

### Family Collaboration Projects
- **Dark Hall** - Created with step-son
- **World Weaver** - Built for step-son's creative expression
- **Wallverine** - Made for girlfriend's projector

### Voice-Controlled Projects  
- **Wallverine**, **Dinosaur Dance**, **Stacksonstacks** - All use Web Speech API

### Heavy AI Integration
- **Sacred Scribe** - Text analysis and collaborative storytelling
- **Sparkly-Sim** - AI controlling simulation parameters
- **AI Orchestration Game** - Multiple AI agents coordination

## Robby's Preferred Patterns

### Architecture
- **Separation of concerns**: Simulation ↔ Presentation ↔ Input (Dark Hall model)
- **Configuration-driven** systems for easy expansion
- **Deterministic systems** for predictable AI collaboration

### AI Integration Philosophy
- AI as collaborative partner, not replacement
- Focus on human-AI creative collaboration  
- Kid-friendly AI interaction design
- Voice control as natural interface

### Development Approach
- **IPI Pattern**: Introduce → Plan → Implement for major changes
- Document decisions and commit frequently
- Start minimal, build up systematically
- Family-oriented development (step-son involvement)

## Common Collaboration Tasks

### Updating Project Documentation
1. Check current itch.io status: `node bin/fetch-itch-games.js`
2. Update `/games/README.md` with any status changes
3. Maintain the emoji badge format: 🎯 🎮 🤖 🔧 ✨
4. Commit changes with clear descriptions

### Starting Work on a Project
1. Review project details in `/games/README.md`
2. Check if there are "Next:" items listed
3. Look for related patterns in `/docs/development-patterns.md`
4. Consider family/collaborative aspects if applicable

### Adding New Projects
1. Add as submodule to `/games/` directory
2. Update `/games/README.md` following established format
3. Categorize as Game vs Interactive Experience
4. Include current status and future vision

## Notes for AI Collaborators

- **Always ask rather than assume** project status or priorities
- **Use the established emoji badge system** for consistency  
- **Respect family collaboration aspects** - some projects involve step-son
- **Voice control is a recurring theme** - leverage existing patterns
- **AI integration varies widely** - from none to heavy integration
- **Follow IPI approach** for major documentation or organizational changes
