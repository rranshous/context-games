# Fairy Funtime — Journal

## Session 1 — v1 skeleton (2026-04-06)

### What we built

Teaching sandbox for the actant pattern, wrapped in fairy whimsy.
Single-file HTML on the vanilla platform. RP all the way down — every
API name, soma section, and tool uses fairy-world language.

**Architecture:**
- Hardened shell (background, fairy sprite, spell dock, status bar)
  that can't be broken by the actant
- Spell system (modules): each spell has state, render function, and
  handle function — all stored as compilable strings the fairy can
  rewrite
- Fairy soma: name, heart (identity), instincts (on_tick), memories,
  satchel (mounted code), cantrips (custom tools)
- Signal-driven tick: player clicks → signal queue → debounce (2s) →
  fairy tick → inference → cantrip calls
- Mounting pattern: peek_into_satchel pulls a spell's code into the
  soma so the fairy can see and reweave it

**Starter spells:** tic-tac-toe, blackboard, painting (16x12 pixel canvas)

**Built-in cantrips:** fairy_say, scribble, peek_into_satchel,
put_away, reweave_spell, conjure_spell, edit_heart, edit_memories

**First test results:**
- Shell renders cleanly — gradient glade background, glowing fairy
  sprite with CSS wings, spell card dock at bottom
- Tic-tac-toe fully playable (gold stars vs purple diamonds)
- Signal→tick→inference loop works end to end on haiku
- Fairy's first reaction: peeked at tic-tac-toe spell code, then
  said "Oh, the center square! Clever!"
- Blackboard renders welcome message in green chalk style
- Painting renders with clickable pixel grid and color palette

### Design decisions

**Why fairy world?** Explored many metaphors (under the porch, tide
pools, puddles, terrariums) before landing on fairy glade. Fairy
magic maps perfectly: humans can't do magic (can't touch things
directly), fairy enchants surfaces to make them solid (interactive),
magic is fiddly (things break, that's charming), the guide has
friends (other actants). RP all the way down was a firm requirement.

**Why single-file?** Keeps everything visible, no build step, opens
in browser. The constraint keeps it honest for a teaching sandbox.

**Why reactive-only tick?** No autonomous timer yet. Fairy only
wakes up when the player does something. Simpler, cheaper. Timer
can be added later for the fairy to have a life between clicks.

**Why haiku?** Cheap for reactive responses. May need sonnet for
spell creation/reweaving based on prior learning (Glint session 12:
haiku bad at self-modification, sonnet with minimal prompting >> haiku
with heavy scaffolding).

**Spell types as structural concept:** conjure_spell requires the
fairy to pick a type (board-game, fairy-board, shared-painting, toy).
Each type has a default template. This gives the model a starting
point rather than blank canvas.

### Prior art consulted

- `games/habitat/` — actant soma pattern, thinkAbout, tool
  compilation, tick loop, persistence. Borrowed the core pattern.
- `habitats/` — collaborative frame concept, human-access-through-
  actant design, module system, surface construction. Borrowed
  ideas but built fresh and simpler.
- Bloom's mount pattern — satchel (peek/put_away) is the fairy
  version of mount/unmount.

### What's next

- Background image (user has one ready)
- Test conjure_spell — can the fairy build a new game from scratch?
- Consider sonnet for spell creation if haiku struggles
- Autonomous timer tick for fairy to have a life between clicks
- More starter spell types?
- Chat module (fairy builds it as a spell?)
