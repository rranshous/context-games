# Badling Brawl - Phase 2: Duck Run & Progression

## Goal
Transform discrete waves into continuous gameplay with surges/lulls, add the Duck Run safe zone with nest-based progression, enable diverse duck builds.

## Design Principles
- **Continuous action** - no menus, no pause screens between waves
- **Shared world, individual builds** - ducks contribute to nests but claim rewards individually
- **Risk/reward** - safe zone exists but can become a trap
- **Build diversity** - different ducks can specialize differently

## Core Systems

### Surge/Lull Spawning
Replace discrete waves with continuous enemy flow:
- **Surge**: Heavy spawning for ~45 seconds
- **Lull**: Light/no spawning for ~15 seconds
- Difficulty scales over time (surge intensity increases)
- No "wave complete" screen - just natural rhythm

### Duck Run (Safe Zone)
A walled-off area on the map:
- 2-4 entrances
- Enemies **cannot enter** (except snakes later)
- Enemies **crowd around exits** if ducks stay inside
- Contains the nests for progression
- Natural "we gotta fight out" pressure

### Nest System
Each nest is a skill line. Ducks deposit eggs to fund progress, then claim rewards individually.

**Deposit vs Claim separation:**
- Any duck can deposit eggs into any nest
- Deposits push the nest toward next unlock
- When threshold reached, ONE duck can claim the reward
- Creates cooperation + competition

**Nest Types (implement one at a time):**

#### ⚔️ Attack Nest
```
[Quack Blast] → [Wing Slap] → [Egg Bomb] → [Feather Storm]
   10 eggs        25 eggs       45 eggs        70 eggs
```
- Quack Blast: Medium range cone, knockback
- Wing Slap: Spin attack, hits all around
- Egg Bomb: Lob explosive (costs 1 egg to use?)
- Feather Storm: Projectiles in all directions

#### 🩹 Healing Nest (later)
```
[Regen I] → [Regen II] → [Lifesteal] → [Second Wind]
  5 eggs     15 eggs       30 eggs        50 eggs
```

#### 🛡️ Armor Nest (later)
```
[Tough I] → [Tough II] → [Thorns] → [Fortress]
  5 eggs     15 eggs      30 eggs     50 eggs
```

### Eggs (Per-Duck)
- Each duck carries their own eggs
- Future: egg weight could slow ducks down
- Future: duck types with carry bonuses/penalties

## New Enemies

### 🦊 Fox (existing)
- Medium speed, chases player
- Health: 30, Damage: 10

### 🐍 Snake (new)
- Can enter the Duck Run!
- Fast, low health
- Creates "nowhere is safe" tension

### 🦅 Hawk (new)
- Flies over obstacles
- Swoops down to attack
- Telegraphed attack pattern

## Implementation Milestones

### M1: Surge/Lull System
- [ ] Remove discrete wave transitions
- [ ] Implement surge/lull spawn rhythm
- [ ] Scaling difficulty over time
- [ ] UI: Show surge/lull indicator (optional)

### M2: Duck Run - Basic
- [ ] Create walled safe zone area
- [ ] Enemies pathfind around walls
- [ ] Entrances that block enemies
- [ ] Duck can enter/exit freely

### M3: Attack Nest - Quack Blast
- [ ] Nest object in Duck Run
- [ ] Deposit eggs interaction
- [ ] Visual progress indicator
- [ ] Claim mechanic (first duck to interact)
- [ ] Quack Blast attack (cone, knockback)

### M4: Enemy Crowding
- [ ] Enemies accumulate near Duck Run exits
- [ ] Visual tension (see them waiting)
- [ ] Balanced spawn positioning

### M5: Second Attack - Wing Slap
- [ ] Add Wing Slap to attack line
- [ ] Spin attack implementation
- [ ] Attack switching (or auto-use based on situation?)

### M6: Snake Enemy
- [ ] Snake can enter Duck Run
- [ ] Fast movement, low health
- [ ] Spawn during surges only (rare)

### M7: Polish
- [ ] Balance tuning (surge timing, egg costs)
- [ ] Visual feedback for nest progress
- [ ] Audio cues for surge/lull transitions

## Open Questions
- [ ] Attack switching: manual or automatic?
- [ ] Do eggs on ground decay? Adds pressure to collect
- [ ] Duck revival mechanic for multiplayer?
- [ ] Duck types with different base stats?

## Tech Notes
- Keep single HTML file approach
- Map is now larger than screen? Or fixed arena with Duck Run in corner?
- Collision system needs walls

---

*Status: Introduction Complete*
*Next: Review with Robby, then Plan phase*
