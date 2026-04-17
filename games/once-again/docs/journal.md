# Once Again: Through the Reach — Journal

## Session 1 (2026-04-16)

### What we built
- TypeScript + esbuild project at `games/once-again/`
- Text adventure engine: rooms, items, parser, renderer
- 4 rooms: Kitchen, Hallway, Living Room, Garage
- 8 items with dual descriptions (mundane + System grandiose)
- Stats system: Edge, Awareness, Resourcefulness, Flexibility, Resonance, ???
- Item-based progression — picking up items = gaining stats
- Dark themed UI with teal System accent, monospace, scanline effect
- Console logging for playthrough observation

### Design decisions
- **Item-based powers** over XP/levels — simpler engine, progression = inventory, one system to reason about
- **LitRPG system overlay on suburbia** — "The Reach" descends, gamifies your mundane world
- **Three planned play modes**: watch (actant solo), collab (human+actant), solo (human only)
- **Grow world and actant in lockstep** — each milestone adds world complexity, then actant capability to match

### Tone & voice
- **Room descriptions**: first-person familiarity. This is YOUR house. You know the coffee stains, you picked the carpet. The wrongness creeps in at the edges — shadows deeper than they should be, photos that seem to watch you.
- **System voice**: over-grandiose narrator overselling the adventure to the audience. ALL CAPS excitement, treating mundane items as legendary artifacts. The System is a hype man for your suburban apocalypse.
- **Not Zork**: distinct setting (LitRPG suburbia), distinct tone (grandiose System vs dry Zork humor), grounded in real-world physics with fantasy overlay

### Feedback from first playthrough
- "THE REACH DOES NOT EXPLAIN ITSELF" was too on the nose — replaced with more grandiose lines
- Room descriptions needed more MC familiarity — rewrote all rooms to feel like YOUR house you know intimately, with wrongness creeping in
- System voice needed to lean harder into the grandiose overselling — rewrote all item system descriptions with more ALL CAPS enthusiasm, more narrator-hyping-the-audience energy
- Overall direction is right, keep pushing both of these

### Progression plan
1. ~~Rooms, movement, look, items~~ (done)
2. Simple puzzles (locked door + key) — actant can plan ahead
3. NPCs, dialogue — actant converses
4. Combat/encounters — actant strategizes
5. Collab mode — human + actant together

### Tech
- Platform: vanilla game platform at `platforms/vanilla/`
- URL: `http://localhost:3000/dev/once-again/index.html`
- OpenRouter support added to vanilla platform this session (for future actant inference)
- Build: `cd games/once-again && npm run build`
