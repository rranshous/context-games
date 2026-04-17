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
2. ~~Actant autoplay + inspector~~ (done)
3. ~~Awareness-gated puzzle + death~~ (done)
4. NPCs, dialogue — actant converses
5. Combat/encounters — actant strategizes
6. Collab mode — human + actant together

### Tech
- Platform: vanilla game platform at `platforms/vanilla/`
- URL: `http://localhost:3000/dev/once-again/index.html`
- OpenRouter support added to vanilla platform this session (for future actant inference)
- Build: `cd games/once-again && npm run build`
- Actant model: `anthropic/claude-haiku-4.5` via OpenRouter (free gemma was rate-limited)
- Tried `google/gemma-4-31b-it:free` first — 429'd upstream at Google. Switched to haiku.

---

## Session 1b (2026-04-16, continued)

### What we built
- **Actant harness** (`src/actant/actant.ts`): sends game transcript to haiku, gets a command back, feeds it in
- **Autoplay toggle + Step button**: autoplay loops every 4s, step for single turns
- **Inspector panel** (`src/actant/inspector.ts`): side panel showing per-turn prompt, model response, command executed, game output
- **Game API** (`src/engine/game-api.ts`): programmatic `sendCommand()` — same pipeline as human player, no cheating
- **Upstairs**: 4 new rooms (upstairs hallway, bedroom, bathroom, study)
- **Awareness-gated descriptions**: hallway and upstairs hall descriptions change when Awareness ≥ 3. No announcement — the room just describes more. Player/actant must notice the difference.
- **Death**: study is instadeath without the lucky rock. First-person unraveling, System's near-apology, red text, game locks.
- **Talisman**: smooth rock from childhood — found in bedroom closet. Protects against the study.
- **Survival sequence**: rock flares, darkness recoils, brush-with-death moment.
- **Mirror shard**: bathroom item, +2 Awareness (needed to reach the 3 threshold)

### First actant playthrough
Haiku explored methodically: look → take flashlight → take kitchen knife → go east → go south (living room) → take weird coin → examine tv (failed, tried twice) → take tv remote → go north → go north (garage) → take baseball bat → go south → go up (tried stairs) → inventory. Visited all 4 rooms, collected 5 items. Very reasonable behavior for a zero-shot text adventure player.

### Design decisions
- **Stairs are open** — no lock, just consequences. LitRPG doesn't gate with locks; it lets you fail.
- **Awareness threshold at 3**: flashlight (1) + TV remote (1) = only 2. Need mirror shard (+2) from bathroom upstairs. Forces exploration before you're safe.
- **Dynamic descriptions over announcements**: when Awareness hits 3, the hallway description adds a paragraph about ozone smell and prickling skin. Upstairs hall adds the feeling of something waiting behind the study door. No "AWARENESS UNLOCKED" popup.
- **The rock is personal**: childhood talisman the System can't classify. Predates the Reach.

### Voice & tone learnings
- **"THE REACH DOES NOT EXPLAIN ITSELF"** — too on the nose. Replaced with assimilation congratulations.
- **"THE REACH HAS CHOSEN THIS DWELLING AS YOUR CRUCIBLE"** — too prescriptive. Replaced with congratulating on assimilation (it's irreversible).
- **"You never questioned that"** — too flat. Replaced with the MC's naive assumption that rocks are just warm.
- **System showing vulnerability when confused by the rock** — WRONG. The narrator's whole job is overselling. When thrown for a loop, it leans in HARDER, not softer. The System should hype more frantically when uncertain, not go quiet. "OH. OH YES. NOW THIS — THIS IS SOMETHING!" beats "The Reach is, for the first time, uncertain."
- **Key rule**: the System narrator picks up the slack in uncertainty. Confusion = more hype, not less. Never show the man behind the curtain.

### What's next
- Actant needs to survive the study puzzle (currently it would die — no reasoning about awareness or talisman)
- Study room needs a post-survival description (what's actually in there?)
- The SUPER SECRET EXCITING thing that's in the study
- Growing the actant's capability alongside the world complexity
