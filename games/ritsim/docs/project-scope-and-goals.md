# RitSim: Project Scope & Goals

*Defining the boundaries and objectives for the AI-driven ritual simulator*

## 🎯 Project Goals

### Primary Goal: Prove AI-Driven Game Design Viability
Demonstrate that **AI inference can serve as the primary game logic engine** rather than just content generation. Success means the AI makes meaningful gameplay decisions that feel connected to player input while maintaining consistency.

### Secondary Goals
- **Research Framework**: Create reusable patterns for inference-driven games
- **Player Experience**: Generate genuinely surprising yet coherent ritual outcomes
- **Technical Learning**: Master AI vision integration and declarative scene rendering
- **Creative Exploration**: Push boundaries of what constitutes "game mechanics"

## 🔬 Research Questions We're Answering

1. **Where's the boundary?** How much game logic can run on inference before breaking?
2. **Consistency vs Surprise**: Can AI maintain learnable rules while staying unpredictable?
3. **Vision vs Coordinates**: Does screenshot interpretation work better than spatial encoding?
4. **Real-time Investment**: Does actual waiting time enhance digital ritual experience?
5. **Frame-Model Split**: How clean can we keep the separation between code and AI?

## 📐 Project Scope

### In Scope - Core MVP
- **Single ritual table** with free-form object placement
- **Basic object set**: 3-4 candle colors, 3-4 stone types, incense
- **Core actions**: Humming, chanting, praying, waiting in silence
- **Duration selection**: 30 seconds to 5 minutes with real waiting
- **AI vision interpretation** of arrangements via screenshot
- **Simple visual effects**: Color shifts, opacity, basic particles
- **Single successful ritual cycle** end-to-end

### In Scope - Extended Features (Post-MVP)
- **Transmutation system**: Blessed materials from successful rituals
- **Progression tracking**: Ritual history affecting outcomes
- **Enhanced effects**: Audio layers, advanced particles
- **Mobile responsive** design for touch interactions

### Explicitly Out of Scope
- **Multiple environments**: Starting with single table only
- **Multiplayer features**: Solo experience only
- **Complex 3D rendering**: Angled 2D view looking down and forward at table
- **Voice input**: Text-based action selection only
- **Monetization**: Pure research project
- **Advanced AI models**: Claude 3.5 Sonnet level sufficient
- **Real-time multiplayer**: Turn-based, single-player focus

# Technical:
- typescript
- Canvas/html5
- thin BFF to serve static files and proxy inference requests
- sonnet 3.5 for inference
- use [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#streaming-helpers) for model calls