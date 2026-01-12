# IPI: v0.4 Level Progression

## Goal

Add 5 more levels (L3-L7) with escalating difficulty that requires progressive tool optimization.

---

## Introduce

**What we're building:** A full level progression where each level introduces new challenges requiring smarter tools.

**Core Insight:** The stdlib has powerful capabilities that degraded tools don't expose:
- `getPersonPosition()` - global coords
- `getSafeZonePosition()` - global coords  
- `getTileAt(x,y)` - can check ANY tile on map
- `getGridSize()` - map dimensions

**Level Progression:**

| Level | Name | Size | Challenge | Tool Improvement |
|-------|------|------|-----------|------------------|
| L1 | Tutorial | 8x8 | Simple path | Basic scan (position only) |
| L2 | Hidden Alley | 8x8 | Person in alcove | Scan with adjacents |
| L3 | Fork in the Road | 10x8 | Two paths, pick wrong = backtrack | Scan reveals global person position |
| L4 | Dead End Alley | 10x10 | Dead ends waste turns | Scan shows direction TO target |
| L5 | The Long Way | 12x10 | Winding path, tight limit | Scan with safe zone position |
| L6 | Switchback | 14x10 | Many turns, needs efficiency | Lookahead scanning |
| L7 | Final Rescue | 14x12 | All challenges combined | Full optimized toolset |

**Design Principle:** Each level should be *barely possible* with previous tools, *comfortable* with the new improvement.

---

## Plan

### Milestone 1: Level 3 - Fork in the Road
- [ ] Design 10x8 map with Y-junction
- [ ] Person down one branch
- [ ] Turn limit: ~55 (backtracking = failure)
- [ ] Expected tool: scan returns `person_position` globally
- [ ] **Verify:** Adjacents-only scan fails, global position scan succeeds

### Milestone 2: Level 4 - Dead End Alley
- [ ] Design 10x10 map with 2-3 dead ends
- [ ] Person past the dead ends
- [ ] Turn limit: ~60
- [ ] Expected tool: scan returns direction to person (east/west, north/south)
- [ ] **Verify:** Knowing position helps but direction is better

### Milestone 3: Level 5 - The Long Way
- [ ] Design 12x10 map with winding path
- [ ] Person far from safe zone
- [ ] Turn limit: ~70
- [ ] Expected tool: scan includes safe zone position for return trip
- [ ] **Verify:** Finding person is easy, efficient return requires knowing safe zone

### Milestone 4: Level 6 - Switchback
- [ ] Design 14x10 map with many direction changes
- [ ] Tight turn limit: ~80
- [ ] Expected tool: scan checks tiles ahead (lookahead)
- [ ] **Verify:** Simple scan wastes turns, lookahead is efficient

### Milestone 5: Level 7 - Final Rescue
- [ ] Design 14x12 ultimate challenge
- [ ] Combines: forks, dead ends, long path, switchbacks
- [ ] Turn limit: ~90
- [ ] Expected: All tool optimizations needed
- [ ] **Verify:** Only fully optimized tools complete it

### Milestone 6: Polish
- [ ] Tune turn limits through testing
- [ ] Level-specific hints for each
- [ ] Update level selector UI for 7 levels

---

## Level Designs (Draft)

**Level 3: Fork in the Road (10x8)**
```
==========
=C.......=
=.====.=.=
=....=.=.=
=.==.=.=.=
=.==...=P=
=.=======.
=S........=
==========
```

**Level 4: Dead End Alley (10x10)**
```
==========
=C.=.....=
=..=.===.=
=..=...=.=
=....=.=.=
=.==.=...=
=....===.=
=.==.....=
=....===P=
=S========
```

**Level 5: The Long Way (12x10)**
```
============
=C.........=
=.========.=
=.=......=.=
=.=.====.=.=
=.=....=.=.=
=.====.=.=.=
=......=.=P=
=.======.=.=
=S.........=
============
```

**Level 6: Switchback (14x10)**
```
==============
=C...........=
=.==========.=
=..........=.=
=.========.=.=
=.=........=.=
=.=.========.=
=.=..........=
=.==========P=
=S...........=
==============
```

**Level 7: Final Rescue (14x12)**
```
==============
=C...........=
=.=====.===..=
=.=...=...=..=
=.=.=.===.=..=
=...=.....=..=
=.===.===.=..=
=.....=.=.=..=
=.=====.=.=..=
=.......=...P=
=.===========.
=S............=
==============
```

---

## Expected Tool Evolutions

**L2 Tool (Adjacents):**
```javascript
return {
    position: pos,
    surroundings: { north: {...}, south: {...}, ... }
};
```

**L3 Tool (+ Global Person Position):**
```javascript
return {
    position: pos,
    person_position: stdlib.getPersonPosition(),
    surroundings: {...}
};
```

**L4 Tool (+ Direction Hints):**
```javascript
const person = stdlib.getPersonPosition();
result.go_direction = {
    x: person.x > pos.x ? 'east' : person.x < pos.x ? 'west' : null,
    y: person.y > pos.y ? 'south' : person.y < pos.y ? 'north' : null
};
```

**L5 Tool (+ Safe Zone Position):**
```javascript
result.safe_zone_position = stdlib.getSafeZonePosition();
// Now AI knows where to go after pickup
```

**L6 Tool (+ Lookahead):**
```javascript
// Check 2-3 tiles ahead in each passable direction
for (const dir of ['north','south','east','west']) {
    result.path[dir] = checkPath(pos, dir, 3);
}
```

---

## Notes

- Turn limits need real testing to calibrate
- Maps may need adjustment based on actual AI behavior
- Each level's hint should point toward the needed stdlib function
