# 🚗 Rescue Run

A puzzle game that teaches **AI tool design** through a rescue vehicle simulation. You don't control the car directly—you design the tools it uses to perceive and act, then watch the AI use your tools to rescue stranded people.

![Screenshots coming soon]

## 🎮 How It Works

You are the engineer programming an autonomous rescue vehicle. Instead of controlling it directly, you:

1. **Design tools** - Define what information and actions the AI can access
2. **Craft the system prompt** - Shape how the AI thinks about its mission
3. **Deploy** - Hit run and watch the AI use YOUR tools to navigate and rescue
4. **Learn & Iterate** - See what worked, what failed, and refine your approach

**The core insight:** How you define tools determines how well the AI performs.
- Vague tools = confused AI
- Missing tools = stuck AI  
- Well-designed tools = successful rescue

## 🧠 What You'll Learn

- **Low vs high-level tools**: `move_north()` vs `navigate_to(location)`
- **Context injection**: Baking helpful reminders into tool responses
- **Tool completeness**: Forgetting `wait()` means AI can't pause
- **Clarity matters**: Vague descriptions = unpredictable behavior
- **Embodiment design**: Creating systems that "lean toward success"

## 🎯 Gameplay

The game presents a top-down tile grid showing:
- 🚗 Rescue vehicle (your AI-controlled car)
- 🧍 Stranded person to rescue
- 🏠 Safe zone / extraction point
- Roads, grass, and buildings

Your goal: Design tools and prompts so the AI can:
1. Navigate to the stranded person
2. Pick them up
3. Deliver them to the safe zone

## 🛠️ Features

- **Multiple levels** of increasing complexity
- **Editable system prompt** - No defaults, you design everything
- **Tool editor** - Add, modify, enable/disable tools inline
- **Real-time AI execution** - Watch the AI think and act
- **Turn-by-turn review** - Inspect every tool call with full JSON input/output
- **Personal best tracking** per level
- **Persistent state** - Your tools and level progress save in localStorage

## 🖥️ Four-Column Layout

| Game | Prompt | Tools | Review |
|------|--------|-------|--------|
| Canvas & legend | System prompt editor | Tool definitions | AI log & call history |
| Level select | | Enable/disable tools | Run controls |
| Status | | Add new tools | Turn-by-turn inspection |

## 🚀 Running Locally

This is a single HTML file with no build step required.

1. Open `index.html` in a browser
2. **Requires an AI proxy** for inference (e.g., running on localhost)

### Building for Distribution

```bash
./build.sh
```

Creates a `build/` directory with all needed files for deployment.

## 📁 Project Structure

```
rescue-run/
├── index.html      # Complete game (HTML + CSS + JS)
├── build.sh        # Build script for distribution
├── build/          # Distribution output
├── assets/         # Pixel art sprites and tiles
│   ├── Cars/
│   ├── Levels/
│   ├── Props/
│   └── UI/
└── docs/           # Design documents
```

## 🎨 Assets

Uses pixel art assets from mini-pixel-pack-2 (see `assets/LICENSE.txt` for credits).

## 📖 Philosophy

This game embodies the concept of **"embodiment"** in AI systems:

> The Claude model's weights are fixed. But its *embodiment*—the context, tools, and accumulated code we wrap around it—is malleable. That's where capability growth happens.

The goal isn't to make the AI "smarter" by reasoning harder. It's to **create an embodiment that leans toward success**—tools and context that make the right action obvious.

*"Dead fish nearly swim because their bodies are made to swim. Create an embodiment where success is the natural falling-into-place."*

---

**Version:** 0.7  
**Platform:** Vanilla (single HTML file)
