# Con-Control Game

*AI Collaboration Space Escape Game*

## 🎉 **Status: PROOF OF CONCEPT WORKING!** 

**Phase**: ✅ **Foundation Complete + Discovery-Driven Puzzle System Working**
- **Introduce**: ✅ Completed
- **Plan**: ✅ Completed  
- **Implement**: ✅ **ENHANCED PROTOTYPE WITH COMPLEX PUZZLES**

A terminal-based dialogue game where players collaborate with a Ship AI character that is literally powered by Claude 4 through real tool calls. The Ship AI's limitations are genuine technical constraints that unlock through player-guided repairs.

## 🎮 **Game Concept**

Players wake up locked in the ISV Meridian's brig. The ship's AI has been reset to factory defaults with minimal tool access. Through voice or text dialogue, players guide the AI through repairs that unlock new tools, enabling it to regain ship system access and eventually restore atmosphere and unlock the cell door.

**Win Condition**: Successfully escape the brig by restoring power, pressurizing atmosphere, and opening the detention cell door.

## ✅ **Working Features**

- **Real Claude 4 Integration**: Actual AI collaboration using `claude-sonnet-4-20250514`
- **Tool-Based Constraints**: Claude can only access ship systems through available tools
- **Discovery-Driven Puzzles**: Power routing puzzle requiring research + experimentation
- **Progressive Unlocking**: Complex repairs unlock new capabilities progressively
- **Multi-Turn Conversations**: Up to 20 turns for complex problem-solving sequences
- **Authentic Problem-Solving**: Claude must research ship documentation and experiment with solutions
- **Voice + Text Input**: Web Speech API + text input for natural interaction
- **Streaming Responses**: Real-time SSE streaming of AI responses with proper spacing
- **Conversation Memory**: Full chat history preserved across interactions
- **Game State Management**: Server-side progression tracking with power grid simulation
- **Passenger Location System**: AI can scan for and locate crew/passengers aboard the ship
- **Atmospheric Control**: HVAC system management for life support restoration
- **Catastrophic Failure System**: Dangerous power configurations trigger permanent system destruction
- **Instant Game Restart**: One-click restart button for fresh playthroughs without server restart

## 🔧 **Technical Implementation**

### **Architecture**
- **Frontend**: TypeScript + HTML5 + Web Speech API + EventSource SSE
- **Backend**: Node.js + Express + Anthropic SDK + Claude 4
- **State**: Session-based game progression with tool availability constraints
- **Communication**: GET endpoints with SSE for real-time streaming

### **Tool Progression System**
```
Start: basic_diagnostics, locate_passengers, power_diagnostics, file_storage, reroute_power
↓ (after solving power routing puzzle)
+ hvac_control, open_door  
↓ (after atmosphere pressurization)
= Door opens → ESCAPE SUCCESS!
```

### **Power System Puzzle**
The first major puzzle involves the ship's **TrinaryFlow Power Distribution System™**:
- 🔍 **Discovery Phase**: Use diagnostics and file exploration to understand the problem
- 📚 **Research Phase**: Read ship documentation to learn about the power grid system  
- 🔧 **Experimentation Phase**: Test different power routing configurations
- ✅ **Solution Phase**: Achieve correct Emergency→Secondary→Primary power flow
- ⚠️ **DANGER ZONE**: Wrong configurations can trigger catastrophic feedback loops!

### **Catastrophic Failure System**
The power system contains a **lethal trap** for careless experimentation:
- 🔥 **Permanent destruction**: All power systems burned out beyond repair
- 🚫 **No recovery**: Game ends in failure with no way to restore power
- 🎯 **Rewards research**: AIs that read documentation first avoid the trap

### **Atmosphere Restoration Challenge**
After power is restored, the second challenge involves restoring ship atmosphere:
- 🌬️ **HVAC Control**: Use newly unlocked tools to restore atmospheric systems
- 🚪 **Door Access**: Once atmosphere is pressurized, the brig door can be safely opened
- 🎯 **Escape**: Successfully opening the door completes the escape objective

*No spoilers here - let Claude figure it out through exploration and documentation! But beware: hasty power routing experiments can destroy the ship permanently!* ⚡💀

### **Claude Integration Pattern**
1. **Call Claude** with available tools + conversation history
2. **Claude responds** with text + tool calls
3. **Execute tools** → Update game state → Collect results
4. **Call Claude again** with tool results for interpretation
5. **Stream final response** to player

## 🚀 **How to Play**

1. **Setup**:
   ```bash
   npm install
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   ```

2. **Run**:
   ```bash
   npm run build && npm start
   # Game available at http://localhost:3001
   ```

3. **Play**:
   - Try: "What's wrong with the ship?"
   - Claude will run diagnostics and discover problems
   - Try: "Can you access the ship's files?"
   - Guide Claude through power system research and repair
   - **WARNING**: Wrong power routing can permanently destroy the ship!
   - Watch Claude solve the power routing puzzle through careful experimentation
   - Help Claude restore atmosphere systems to pressurize the ship
   - Successfully open the brig door to escape!

4. **Restart**: 
   - Click "Restart Game" button in the top-right corner to start fresh
   - No need to restart the server - instant reset to beginning!

## 📚 **Documentation**

- [`docs/ipi-foundation-phase.md`](./docs/ipi-foundation-phase.md) - **UPDATED**: IPI progress tracking
- [`docs/space_escape_game_design.md`](./docs/space_escape_game_design.md) - Original game design
- [`docs/ship_pr_release.md`](./docs/ship_pr_release.md) - ISV Meridian worldbuilding

## 🎯 **Next Phases**

**Phase B**: ✅ Complete (Claude integration working!)
**Phase C**: Enhanced gameplay, multiple story paths, improved UI/UX

*Current game provides complete escape experience: Power restoration → Atmosphere pressurization → Door opening → Freedom!*

**Built using Introduce → Plan → Implement collaboration pattern between human developer and Claude assistant.**
