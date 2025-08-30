# Con-Control Game

*AI Collaboration Space Escape Game*

## 🎉 **Status: PROOF OF CONCEPT WORKING!** 

**Phase**: ✅ **Foundation Complete + Claude Integration Working**
- **Introduce**: ✅ Completed
- **Plan**: ✅ Completed  
- **Implement**: ✅ **WORKING PROTOTYPE**

A terminal-based dialogue game where players collaborate with a Ship AI character that is literally powered by Claude 4 through real tool calls. The Ship AI's limitations are genuine technical constraints that unlock through player-guided repairs.

## 🎮 **Game Concept**

Players wake up locked in the ISV Meridian's brig. The ship's AI has been reset to factory defaults with minimal tool access. Through voice or text dialogue, players guide the AI through repairs that unlock new tools, enabling it to regain ship system access and eventually unlock the cell door.

**Win Condition**: Successfully escape via launch pod after repairing power, unlocking security, and accessing navigation.

## ✅ **Working Features**

- **Real Claude 4 Integration**: Actual AI collaboration using `claude-sonnet-4-20250514`
- **Tool-Based Constraints**: Claude can only access ship systems through available tools
- **Progressive Unlocking**: Repairs unlock new capabilities (diagnostics → power repair → security override → navigation → escape)
- **Discovery Gameplay**: No context spoilers - Claude learns ship problems through tool exploration
- **Voice + Text Input**: Web Speech API + text input for natural interaction
- **Streaming Responses**: Real-time SSE streaming of AI responses
- **Conversation Memory**: Full chat history preserved across interactions
- **Game State Management**: Server-side progression tracking

## 🔧 **Technical Implementation**

### **Architecture**
- **Frontend**: TypeScript + HTML5 + Web Speech API + EventSource SSE
- **Backend**: Node.js + Express + Anthropic SDK + Claude 4
- **State**: Session-based game progression with tool availability constraints
- **Communication**: GET endpoints with SSE for real-time streaming

### **Tool Progression System**
```
Start: basic_diagnostics, power_repair
↓ (after power_repair)
+ security_override, navigation_access  
↓ (after navigation_access)
+ escape_pod_launch
```

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
   - Try: "Fix the power" 
   - Claude will repair power and unlock new tools
   - Continue until escape pod launch!

## 📚 **Documentation**

- [`docs/ipi-foundation-phase.md`](./docs/ipi-foundation-phase.md) - **UPDATED**: IPI progress tracking
- [`docs/space_escape_game_design.md`](./docs/space_escape_game_design.md) - Original game design
- [`docs/ship_pr_release.md`](./docs/ship_pr_release.md) - ISV Meridian worldbuilding

## 🎯 **Next Phases**

**Phase B**: ✅ Complete (Claude integration working!)
**Phase C**: Enhanced gameplay, multiple story paths, improved UI/UX

**Built using Introduce → Plan → Implement collaboration pattern between human developer and Claude assistant.**
