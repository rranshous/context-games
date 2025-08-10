# Technical Setup Guide

**Environment setup and development workflows for the games repository**

## Repository Structure

```
/
├── games/                    # Git submodules for each project
│   ├── raceon/
│   ├── darkhall/
│   ├── stacksonstacks/
│   └── ... (11 total projects)
├── docs/                     # Documentation
│   ├── collaboration-guide.md
│   ├── development-patterns.md
│   └── games-readme-ipi.md   # Documentation process history
├── bin/                      # Utility scripts
│   └── fetch-itch-games.js   # itch.io API integration
├── .env                      # API keys (gitignored)
├── .env.example              # Template for environment setup
└── .gitignore                # Includes .env and common patterns
```

## Initial Setup

### 1. Clone Repository with Submodules

```bash
# Clone main repository
git clone https://github.com/rranshous/context-games.git
cd context-games

# Initialize and update all submodules
git submodule init
git submodule update --recursive
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env file and add your API keys
# ITCH_API_KEY=your_actual_api_key_here
```

**Getting API Keys:**
- **itch.io API Key:** Get from https://itch.io/api-keys

### 3. Node.js Setup (for utility scripts)

```bash
# Install Node.js (16+ recommended)
# No package.json in root - utility scripts use only built-in modules

# Test itch.io API script
node bin/fetch-itch-games.js
```

## Working with Submodules

### Understanding the Structure
Each game project is a separate Git repository included as a submodule. This allows:
- Independent development of each project
- Centralized organization and documentation
- Easy collaboration across projects

### Common Submodule Commands

```bash
# Update all submodules to latest commits
git submodule update --remote

# Update specific submodule
git submodule update --remote games/raceon

# Work on a specific project
cd games/raceon
# Make changes, commit as normal
git add .
git commit -m "Update raceon features"
git push

# Update main repository to reference new commit
cd ../..
git add games/raceon
git commit -m "Update raceon submodule reference"
```

### Adding New Project Submodules

```bash
# Add new project as submodule
git submodule add https://github.com/username/new-game-repo.git games/new-game

# Update documentation
# Edit games/README.md to include new project

# Commit submodule addition
git add .
git commit -m "Add new-game project as submodule"
```

## Development Workflows

### Individual Project Development

1. **Navigate to project:**
   ```bash
   cd games/project-name
   ```

2. **Follow project-specific setup:**
   - Most projects use TypeScript + Vite
   - Check project's README.md for specific instructions

3. **Common project setup pattern:**
   ```bash
   npm install
   npm run dev    # Start development server
   npm run build  # Build for production
   ```

### Documentation Updates

1. **Update project status:**
   ```bash
   # Get current itch.io data
   node bin/fetch-itch-games.js
   
   # Update games/README.md with any status changes
   # Follow emoji badge format: 🎯 🎮 🤖 🔧 ✨
   ```

2. **Document major changes:**
   - Use IPI (Introduce → Plan → Implement) approach
   - Create docs in `/docs/` for significant processes
   - Update collaboration guides as patterns evolve

### Publishing Workflow

1. **Build project for production:**
   ```bash
   cd games/project-name
   npm run build
   ```

2. **Deploy to itch.io:**
   - Upload build files to itch.io
   - Configure for browser-based play
   - Update project as published

3. **Update documentation:**
   ```bash
   # Refresh publication data
   node bin/fetch-itch-games.js
   
   # Update games/README.md with new publication status
   # Commit changes
   ```

## API Integration

### itch.io API Script Usage

```bash
# Basic usage (uses .env file)
node bin/fetch-itch-games.js

# With direct API key
node bin/fetch-itch-games.js YOUR_API_KEY

# Output includes:
# - Publication status and dates
# - Download/view counts  
# - Clean summary for documentation updates
```

### Script Capabilities
- Fetches all published games for authenticated user
- Provides publication dates and statistics
- Outputs clean summary for documentation updates
- Handles API errors gracefully

## Development Environment Recommendations

### Required Tools
- **Node.js 16+** for utility scripts
- **Git** with submodule support
- **Code editor** with TypeScript support (VS Code recommended)

### Project-Specific Tools
- **Most projects:** TypeScript, Vite, HTML5 Canvas
- **AI projects:** API access (Anthropic, OpenAI, etc.)
- **Voice projects:** Modern browser with Web Speech API support

### Testing Environment
- **Local development:** Most projects run on localhost
- **Mobile testing:** Many projects work on mobile browsers
- **Projector testing:** Some projects designed for wall projection

## Common Issues & Solutions

### Submodule Issues

**Problem:** Submodule shows as modified but no changes made
```bash
# Reset submodule to tracked commit
git submodule update --init
```

**Problem:** Submodule stuck on old commit
```bash
# Update to latest remote commit
git submodule update --remote games/project-name
```

### API Script Issues

**Problem:** "No API key provided" error
```bash
# Check .env file exists and has ITCH_API_KEY
cat .env
```

**Problem:** API request fails
```bash
# Verify API key is valid at https://itch.io/api-keys
# Check internet connection
```

### Documentation Sync Issues

**Problem:** Project status doesn't match actual state
```bash
# Refresh itch.io data
node bin/fetch-itch-games.js

# Manually verify project status
# Update games/README.md accordingly
```

## Collaboration Best Practices

### For AI Assistants
- Always check current project status before making assumptions
- Use established emoji badge format in documentation
- Run itch.io script to verify publication status
- Follow IPI pattern for major changes

### For Human Collaborators
- Keep .env file secure and gitignored
- Test voice control features in supported browsers
- Consider family-friendly aspects of project development
- Document architectural decisions for future reference

### Version Control
- Commit documentation updates separately from code changes
- Use clear commit messages describing what was updated
- Tag significant milestones for easy reference
