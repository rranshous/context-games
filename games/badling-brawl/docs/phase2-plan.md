# Badling Brawl - Phase 2: Home Base & Progression

## Goal
Transform discrete waves into continuous gameplay with surges/lulls, add the Home Base safe zone with nest-based progression, enable diverse duck builds.

## Development & Testing
- **Dev URL**: `http://localhost:3000/dev/badling-brawl/index.html`
- **Use Playwright** to visually verify each milestone before committing
- **Commit after each milestone** passes verification

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
- **UI indicator** showing surge/lull status and overall progress

### Home Base (Safe Zone)
A natural area on the map bordered by trees/water:
- 2-4 entrances
- Enemies **cannot enter** (except snakes later)
- Contains the nests for progression
- Natural duck habitat feel (not built structure)

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
- Egg Bomb: Lob explosive (no egg cost - just unlocked)
- Feather Storm: Projectiles in all directions

**All attacks are auto-fire** - duck accumulates attacks over time, all operate simultaneously. Each attack has its own independent cooldown timer. Visual indicator on duck shows current powers (simple for now).

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

### 🐱 Cat (existing)
- Medium speed, chases player
- Health: 30, Damage: 10

### 🐕 Dog (new)
- Slower than cat, tankier
- Health: 50, Damage: 15
- Basic chaser, good for variety

### 🐍 Snake (future)
- Can enter the Home Base!
- Fast, low health
- Creates "nowhere is safe" tension

### 🦅 Hawk (future)
- Flies over obstacles
- Swoops down to attack
- Telegraphed attack pattern

## Implementation Milestones

### M1: Surge/Lull System ✅
- [x] Remove discrete wave transitions
- [x] Implement surge/lull spawn rhythm
- [x] Scaling difficulty over time
- [x] UI: Surge/lull indicator + progress display

### M2: Home Base - Basic 🔄 IN PROGRESS
**Simplified approach** - get basic collision working first, add entrance restrictions later

#### Done:
- [x] Create safe zone area with visual border (rocks/water from tileset)
- [x] Bridge sprites at entrance locations (visual only for now)
- [x] Debug: red dotted line showing collision boundary
- [x] Ducks cannot attack while inside home base (no camping)
- [x] Fix cat sprite rendering: use actual frame bounds from tileset-cutter
- [x] Fix cat collision: use proportional hitbox (width/height) instead of square

#### Current TODO:
- [ ] **Ducks free movement**: can cross boundary anywhere
- [ ] **Verify visually**: enemies stay outside red debug line
- [ ] **Tune border**: align visual rocks/water with collision boundary

#### Deferred (may add back later):
- Entrance-only crossing for ducks
- Enemy pathfinding around entrances

#### Notes:
- Using `tileset - grass island v2.png` for visuals
- Cat frames defined in `CAT_WALK_FRAMES` with actual bounds
- Collision uses `CAT_AVG_WIDTH`/`CAT_AVG_HEIGHT` for proportional hitbox
- See `ipi-intro.md` Session Notes for code locations and details

### M3: Dog Enemy
- [ ] New enemy type: Dog
- [ ] Slower, tankier than cat
- [ ] Mix into spawn system

### M4: Attack Nest - Quack Blast
- [ ] Nest object in Home Base
- [ ] Deposit eggs interaction
- [ ] Visual progress indicator
- [ ] Claim mechanic (first duck to interact)
- [ ] Quack Blast attack (cone, knockback, auto-fire)
- [ ] Simple visual indicator on duck for powers

### M5: Second Attack - Wing Slap
- [ ] Add Wing Slap to attack line
- [ ] Spin attack implementation (auto-fire)
- [ ] Both attacks operate simultaneously

### M6: Polish
- [ ] Balance tuning (surge timing, egg costs)
- [ ] Visual feedback for nest progress
- [ ] Power indicator refinement

## Open Questions
- [x] Attack switching: manual or automatic? → **Auto, all attacks stack**
- [x] Do eggs on ground decay? → **No decay**
- [x] Duck revival mechanic for multiplayer? → **Not yet**
- [x] Duck types with different base stats? → **Later**

## Decisions Made
- All attacks auto-fire simultaneously (duck builds up over time)
- Simple visual indicator on duck for powers
- Map stays screen-sized for now (camera/zoom later)
- Cat enemy for variety (snake/hawk deferred)
- No crowding mechanic yet - normal enemy AI
- Eggs don't decay, no revival mechanic yet

## Tech Notes
- Keep single HTML file approach
- Map is screen-sized (camera follow/zoom is future work)
- Collision system needs safe zone boundaries
- Tileset available: `assets/tileset - grass island v2.png` (192x144, multi-tile spritesheet)
- Each attack has independent cooldown timer

---

*Status: M2 In Progress*
*Current: Implementing Home Base*
