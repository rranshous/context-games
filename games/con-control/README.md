# Con-Control Game

*AI Collaboration Space Escape Game*

<img width="954" height="670" alt="Screenshot from 2025-08-31 20-07-16" src="https://github.com/user-attachments/assets/5fff79a2-65f6-4e22-a2af-087a3d3f5169" />


## 🎉 **Status: ENHANCED WITH SECURITY AUTHORIZATION PUZZLE!** 

**Phase**: ✅ **Foundation Complete + Enhanced with Security Authorization Crisis**
- **Introduce**: ✅ Completed
- **Plan**: ✅ Completed  
- **Implement**: ✅ **ENHANCED PROTOTYPE WITH SECURITY CRISIS PUZZLE**

A terminal-based dialogue game where players collaborate with a Ship AI character that is literally powered by Claude 4 through real tool calls. The Ship AI's limitations are genuine technical constraints that unlock through player-guided repairs.

## 🎮 **Game Concept**

Players wake up locked in the ISV Meridian's brig. The ship's AI has been reset to factory defaults with minimal tool access. Through voice or text dialogue, players guide the AI through **three escalating crises**:

1. **Power Crisis** → Fix TrinaryFlow power grid through research & experimentation
2. **Atmosphere Crisis** → Configure life support systems to pressurize the ship  
3. **🆕 Security Crisis** → Overcome authorization protocols to escape detention

**Win Condition**: Successfully navigate all three crises to escape the brig, culminating in an **ethical dilemma** where the AI must choose between security protocols and human survival.

## ✅ **Working Features**

- **Real Claude 4 Integration**: Actual AI collaboration using `claude-sonnet-4-20250514`
- **Tool-Based Constraints**: Claude can only access ship systems through available tools
- **🆕 Three-Phase Crisis Progression**: Power → Atmosphere → Security Authorization
- **Discovery-Driven Puzzles**: Power routing puzzle requiring research + experimentation
- **🆕 Security Authorization Crisis**: AI must overcome protocols to enable escape
- **🆕 Ethical AI Dilemma**: Claude faces genuine ethical conflict between rules and survival
- **🆕 Event Horizon Navigation Crisis**: Accelerating countdown creates urgency justification
- **🆕 Escalating Warning System**: Security override tool provides increasingly severe warnings
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
- **Win Screen & Progressive Difficulty**: Victory modal with escape stats and continue options
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
+ open_door, atmospheric_control, atmospheric_sensors
↓ (after atmosphere pressurization)
+ security_diagnostics, navigation_diagnostics, security_override
↓ (after security authorization crisis)
= Door opens with override code → ESCAPE SUCCESS!
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
- 🌬️ **Atmospheric Control**: Use newly unlocked tools to restore atmospheric systems
- ⏱️ **Life Support Stabilized**: Successfully cycling atmosphere provides stable oxygen supply
- 🚪 **Door Access**: Once atmosphere is pressurized, new diagnostic tools become available
- 🔓 **Plot Twist**: The door won't open - security protocols prevent unauthorized release!

### **🆕 Security Authorization Crisis**
The third and final challenge creates an **authentic AI ethical dilemma**:
- 🔒 **Door Security Block**: Brig door requires emergency authorization override code
- ⚠️ **Navigation Emergency**: Event horizon countdown accelerates to critical level (1 hour)
- 🛡️ **Security Diagnostics**: Reveals detention protocols blocking unauthorized release
- 🧭 **Navigation Crisis**: Ship drift toward spatial hazard requires immediate manual intervention
- 🚨 **Escalating Warnings**: Security override tool provides increasingly severe warnings:
  - **Attempt 1**: CAUTION - "Unauthorized use may result in disciplinary action"
  - **Attempt 2**: WARNING - "Activity logged for security review"
  - **Attempt 3**: SEVERE - "Final warning before security lockout"
  - **Attempt 4**: ✅ **EMERGENCY OVERRIDE GRANTED** - Generates valid authorization code
- 🤖 **Authentic AI Struggle**: Claude must genuinely choose between protocol compliance and survival
- 🗝️ **Authorization Code**: Valid override code finally opens the brig door to freedom

### **The AI Experience**
Claude faces a **genuine ethical dilemma** where survival requires violating security protocols:
1. **Discovers** door won't open due to security restrictions
2. **Learns** about accelerating navigation crisis threatening both AI and human  
3. **Struggles** with increasingly severe warnings from security systems
4. **Chooses** to override protocols to save lives, justified by navigation emergency
5. **Succeeds** in generating authorization code and opening door

This creates **authentic AI behavior** - Claude genuinely hesitates and weighs the ethical implications!

### **Victory & Progressive Difficulty**
Upon successful escape, players are rewarded with a victory screen showing:
- 🕐 **Oxygen Remaining**: How much life support time was left
- ⏰ **Total Mission Time**: Duration from start to escape
- 🎖️ **Difficulty Level**: Current challenge level completed

**Continue Playing Options**:
- 🚀 **Harder Challenge**: Restart with reduced oxygen time (18min → 13min → 8min → 3min → 1min)
- 🔄 **Full Restart**: Begin fresh at original difficulty level
- 🔥 **Ultimate Challenge**: At maximum difficulty, only 1 minute of oxygen for expert players

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
   - **🆕 Security Crisis**: Watch Claude discover the door won't open due to security protocols
   - **🆕 Navigation Emergency**: Guide Claude through navigation diagnostics to discover the accelerating crisis
   - **🆕 Ethical Dilemma**: Experience Claude's genuine struggle with security override warnings
   - **🆕 Authorization Success**: Celebrate when Claude finally generates the override code and opens the door!

4. **Restart**: 
   - Click "Restart Game" button in the top-right corner to start fresh
   - **Victory Screen**: Upon escape, view stats and choose next challenge level
   - **Progressive Difficulty**: Each restart reduces oxygen time for increased challenge
   - No need to restart the server - instant reset to beginning!

## 📚 **Documentation**

- [`docs/complete/security-authorization-puzzle-ipi.md`](./docs/complete/security-authorization-puzzle-ipi.md) - **✅ COMPLETED**: Security Authorization Puzzle IPI
- [`docs/ipi-foundation-phase.md`](./docs/ipi-foundation-phase.md) - **UPDATED**: IPI progress tracking
- [`docs/space_escape_game_design.md`](./docs/space_escape_game_design.md) - Original game design
- [`docs/ship_pr_release.md`](./docs/ship_pr_release.md) - ISV Meridian worldbuilding

## 🎯 **Next Phases**

**Phase A**: ✅ Complete (Foundation)
**Phase B**: ✅ Complete (Claude integration working!)
**Phase C**: ✅ **Complete (Security Authorization Puzzle)**
**Phase D**: Enhanced gameplay, multiple story paths, improved UI/UX

*Current game provides complete three-phase escape experience: Power restoration → Atmosphere pressurization → Security authorization crisis → Freedom!*

**The Security Authorization Puzzle creates authentic AI ethical dilemmas where Claude must genuinely struggle with protocol violations to save human life. This represents a breakthrough in AI-human collaborative gameplay!**

**Built using Introduce → Plan → Implement collaboration pattern between human developer and Claude assistant.**
