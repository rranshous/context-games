# RitSim: Implementation Plan

*Incremental milestone-driven development for the AI-driven ritual simulator*

## 🏗️ Development Philosophy

**Incremental Complexity**: Each milestone builds on the previous, allowing us to validate assumptions and pivot quickly if needed.

**Backend-First Integration**: Single server handles both static file serving and AI proxy to keep deployment simple.

**Visual-First Development**: Get rendering working before AI integration to enable rapid iteration.

## 🎯 Milestone Breakdown

### ✅ Milestone 1: Backend Foundation & Static Serving (COMPLETED)
**Goal**: Basic server infrastructure serving static files

**Deliverables**:
- ✅ Node.js/Express server setup
- ✅ Static file serving for HTML/CSS/JS
- ✅ Basic project structure (frontend + backend)
- ✅ Development workflow (build, serve, reload)

**Technical Decisions**:
- Express.js for simplicity
- Standard frontend build (likely Vite for TypeScript/modern JS)
- Single server process for both concerns

**Note**: Robby will handle starting the background server

**Success**: ✅ Can serve a basic HTML page with JavaScript loading

---

### ✅ Milestone 2: Canvas Rendering & Asset Loading (COMPLETED)
**Goal**: Visual foundation with background and object assets

**Deliverables**:
- ✅ Canvas setup with proper sizing/scaling
- ✅ Background table image loaded and rendered
- ✅ Object assets (candles, stones, incense) loaded
- ✅ Basic 2D rendering pipeline working

**Technical Decisions**:
- HTML5 Canvas API (or lightweight wrapper)
- Asset management system
- Coordinate system for angled table view

**Success**: ✅ Table background visible with object sprites loaded

---

### ✅ Milestone 3: Object Placement & Interaction (COMPLETED)
**Goal**: User can arrange objects on the table

**Deliverables**:
- ✅ All starter objects initially placed on table
- ✅ Click/drag interaction system
- ✅ Object positioning within table bounds
- ✅ Visual feedback for interactions

**Technical Decisions**:
- Mouse/touch event handling
- Collision detection for table boundaries
- Object state management

**Success**: ✅ User can drag objects around the table naturally

---

### ✅ Milestone 4: Canvas Screenshot Capture (COMPLETED)
**Goal**: Capture table state as image for AI processing

**Deliverables**:
- ✅ Canvas-to-image conversion function
- ✅ Screenshot triggered by user action
- ✅ Image format optimization for AI vision
- ✅ Debug display of captured image

**Technical Decisions**:
- Canvas.toDataURL() vs toBlob()
- Image format (PNG vs JPEG) and quality
- Resolution considerations for AI processing

**Success**: ✅ Can capture and display screenshot of current table state

---

### ✅ Milestone 5: AI Proxy Infrastructure (COMPLETED)
**Goal**: Backend can communicate with Claude API

**Deliverables**:
- ✅ Claude API integration in backend
- ✅ Environment variable configuration for API keys
- ✅ Basic "hello world" test endpoint
- ✅ Error handling for API failures

**Technical Decisions**:
- Use Anthropic SDK (per project requirements) - https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#streaming-helpers
- Request/response structure design
- Rate limiting considerations

**Success**: ✅ Frontend can trigger backend to make successful Claude API call

---

### ✅ Milestone 6: Vision Processing & Debug Display (COMPLETED)
**Goal**: Send table image to AI and display interpretation

**Deliverables**:
- ✅ Image upload from frontend to backend
- ✅ Image sent to Claude 3.5 Sonnet vision model
- ✅ AI description returned to frontend
- ✅ Debug panel showing AI's interpretation

**Technical Decisions**:
- Image encoding for API transmission
- Basic prompt structure for vision model
- Frontend debug UI design

**Success**: ✅ AI can see table image and describe what objects it observes

---

### 🎯 Milestone 7: Game Context & Ritual Interpretation (IN PROGRESS)
**Goal**: AI understands the ritual game context

**Deliverables**:
- Game definition document/prompt
- Ritual logic and magical rules
- Enhanced prompt including game context
- AI generates prose ritual outcomes

**Technical Decisions**:
- Prompt engineering for consistent magical logic
- Context management (how much to send each time)
- Balance between rules and creative freedom

**Success**: AI generates meaningful ritual outcome descriptions

---

### Milestone 8: Structured AI Response Format
**Goal**: AI returns scene updates in parseable XML-like format

**Deliverables**:
- Custom RitSim markup specification
- AI trained to use structured response format
- Backend parsing and validation of responses
- Error handling for malformed responses

**Technical Decisions**:
- XML-like syntax design for scene descriptions
- Required vs optional elements in responses
- Fallback strategies for parsing failures

**Success**: AI consistently returns well-formed RitSim markup

---

### Milestone 9: Scene Rendering from AI Description
**Goal**: Frontend interprets AI markup and updates visual scene

**Deliverables**:
- RitSim markup parser
- Scene state update system
- Visual effects rendering (color, opacity, particles)
- Complete ritual cycle (arrangement → AI → visual update)

**Technical Decisions**:
- State management for scene updates
- Animation/transition system
- Effect rendering implementation

**Success**: Complete ritual cycle works end-to-end with visual feedback

## 🔧 Technical Stack

### Frontend
- **Build Tool**: Vite (TypeScript support, fast dev server)
- **Rendering**: HTML5 Canvas API
- **Language**: TypeScript
- **Styling**: CSS (minimal, focused on canvas)

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js (thin BFF architecture)
- **AI Integration**: Anthropic SDK for Claude 3.5 Sonnet
- **Language**: TypeScript/JavaScript

### Development
- **Package Manager**: npm
- **Development**: Hot reload, source maps
- **Deployment**: Single server process

##  Getting Started

Each milestone will be developed in sequence, with full completion before moving to the next. This allows for:

- **Early validation** of technical approaches
- **Rapid iteration** on core mechanics
- **Clear progress tracking** 
- **Easy debugging** when issues arise

Ready to begin with **Milestone 1: Backend Foundation & Static Serving**?

---

*Prepared to manifest through methodical iteration.*
