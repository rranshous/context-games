# Explororama — Journal

A tiny framework for ASCII point-and-click adventures. Each scene is a chunk of ASCII art; clickable hotspots are characters in the art that link to other scenes.

## The conversation that led here

Late-night chat about small games. Started reminiscing about an old Pink Panther web game built on HTML image maps — click the phone on the desk, jump to a picture of who's calling. Felt the appeal was the simplicity: no engine, no logic, just images + hotspot regions + scene transitions.

Then bitsy came up. Tiny pixel rooms, custom text format, "small tool, big feeling" energy. A bitsy game built around a museum where you walked through exhibits as narrative was particularly inspiring — the structure does the storytelling for free.

The leap: what if bitsy were *first-person*? Not top-down avatar walking through rooms, but standing inside, looking at a wall, clicking what you see to look at the next view. ASCII renders for each "wall." 8-bit Myst.

The format proposal: hotspots are *characters* in the ASCII art. Click a `D` (door) anywhere in the scene → it links to the next scene. Bitsy-philosophy: constraints drive style. Pick characters, hover lights up the whole shape, click to travel.

## Session 1 — first build

**Stack**: plain HTML + JS, no build step, single dev server (vanilla platform).

**Files**:
- `framework.js` — engine. Parses `.expr` files, renders scenes, handles hotspot clicks, history stack for back-navigation.
- `the-cottage.expr` — 5-scene demo
- `index.html` — bootstraps, fetches `the-cottage.expr`, mounts the engine
- `docs/journal.md` — this file

**Demo: The Cottage** — a tiny atmospheric loop. Five scenes:
- `cottage_outside` — establishing shot. Cottage at dusk between trees, stars overhead.
- `cottage_inside` — main room. Window blob, desk, door back outside.
- `window_view` — looking out the window from inside. Trees + stars + path.
- `desk_closeup` — zoomed-in desk with a letter on it.
- `letter` — read the letter. ("Dear traveler, the cottage trusts you. — M")

Navigation graph:
```
outside ←→ inside ←→ window_view
              ↕
           desk ←→ letter
```

**The .expr format** (flat ASCII):

```
@palette
D = #c89060
W = #6aa0d4

@start cottage_outside

@scene cottage_outside
@title  Outside the Cottage
@art
   ╔══════════════╗
   ║    DDDD      ║
   ╚══════════════╝
@hotspots
D -> cottage_inside
```

Directives: `@palette`, `@start`, `@scene`, `@title`, `@art`, `@hotspots`. Each is line-prefixed. Multi-line sections (art, hotspots, palette) collect until the next directive. Hotspot meaning is *per-scene* — `D` can be "door inward" in one scene and "door outward" in another.

**UX details that shipped**:
- Hover over any hotspot character → all instances of that character in the scene light up (text-shadow glow). Reveals the *shape* of the clickable region.
- Esc / Backspace → pop history, go back. Lets the player explore freely without dead-ending.
- Per-character palette colors. Hotspots inherit their palette color so they feel object-like, not generic.

**Reaction**: "yes! awesome demo!"

## Design philosophy notes

- **Bitsy-style constraint**: one character = one meaning per scene. If you want two doors with different destinations in the same scene, use two different characters (`D` and `d`, or `D` and `▦`). The constraint forces visual differentiation.
- **No game logic in v1**: no inventory, no flags, no conditional unlocks. Pure scene graph. State-gated transitions (need-the-key, etc.) are a future direction but the demo deliberately doesn't have them — the core loop should feel complete without them.
- **The .expr file is the game**: should be readable, editable, and shareable as a single text file. Authoring a new game = writing one file. No tooling, no editor, no build.

## Ideas for later (not yet built)

- **Animated characters** — flickering torches, rain falling, water shimmering. Frame-cycle a character's color or substitute char.
- **Inline state** — `@flag has_key`, `@scene locked_door` with conditional hotspots based on flags.
- **Sound** — ambient audio per scene. Each scene declares an audio track that loops and crossfades.
- **Multi-region hotspots** — for finer disambiguation: `D@5,12,20,18 -> hallway` (rect coords) when char-only isn't expressive enough.
- **Bracketed inline hotspots** — alternative to char-based for cases where `[door->hallway]` reads better.
- **Scene transitions** — fade, ASCII wipe, character-by-character reveal.
- **More demos** — the museum (callback to the inspiration), a tower descent, a cave.

## Running it

```
cd platforms/vanilla && npm run dev
# http://localhost:3000/dev/explororama/index.html
```

Or any static server pointed at `games/explororama/`.
