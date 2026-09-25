# Qwestworld — Journal

## Session 1 — 2026-09-24 — "a window into another world"

### Origin
Wanted a game a local AI could live in on this CPU-bound desktop (i7-4770, 31 GB, no GPU). Brainstormed toward: mega-scale sim/RTS, civilization "the size of a wall", a world running at its own rate that you look into. First pass: continent RTS, almost no brains. A couple of kings are LLMs, everything below is hands.

### Architecture (sim ≠ view)
- `src/sim/` — daemon (`npm run sim`). World, court (kings), persistence, HTTP API on 0.0.0.0:4200 with CORS. No rendering, no static files.
- `src/view/` — viewer (`npm run view`, :4201). Static server + canvas client. Point it at any sim with `?sim=http://host:4200` or `SIM_URL=`.
- `src/cli/qw.ts` — terminal viewer (`npm run qw -- status|kings|chronicle|map|pause|resume`). Same API and powers as the browser viewer. This is also how Claude observes the sim.
- `src/shared/types.ts` — constants and API shapes.

API: `/api/meta`, `/api/terrain.bin` (terrain+height bytes), `/api/regions.bin` (Uint16 tile→settlement), `/api/state` (JSON), `/api/soldiers.bin` (tick, n, Uint16 x[], Uint16 y[] at 1/32 tile, Uint8 faction[]), `/api/health`, `POST /api/control {action: pause|resume}`.

### World
- 1024×576 tiles. Map is a pure function of the seed: warped fbm + ridges, quantile sea level, largest landmass is walkable. Only dynamic state is saved (`data/world.json`, every 2 min and on SIGTERM).
- 64 settlements (poisson-ish), 4 kingdoms from farthest-point capitals. Regions come from a multi-source walking-distance field, which gives terrain-following borders and adjacency.
- Soldiers are SoA typed arrays (cap 131k). Garrison or army. Each walks down the target settlement's distance field (Dial's algorithm, cached per settlement).
- Combat: 4×4 tile cells, per-faction counts; chance of falling ∝ enemy share × terrain defense. Foreign-land attrition.
- Sieges: enemy present and no defenders within ±2 cells → capture over ~18 hours. Contested towns don't recruit.
- Recruitment fills the garrison, then overflows into a host resting there.
- Orders travel by courier (45 tiles/day). March orders: obey (72–92% by loyalty), misread (marches on a neighbor), or ignore.

### Kings
- `KINGS=qwen,qwen,script,script` (default). Script kings: attack the weakest of the 3 nearest foes when ≥1.6× stronger; keep 2 hosts.
- Qwen kings: `/api/chat` with 4 tools (march, hold, muster, proclaim), a report in the user message, `/no_think`, `think:false`, `keep_alive:-1`, num_predict 400.
- If Ollama fails, the advisors (script) rule that council.

### Model findings
- qwen3:30b-a3b: 264s for one decision. 65s load, 12s prompt, 186s of reasoning leaked into content despite think:false.
- Advice from the local-ai session (measured on this box): qwen3:8b matches the 30B on tool tasks at ~1/5 the wall time. The 30B ignores think:false. Use terse tool descriptions, keep_alive -1, and a byte-identical system prompt + tools across kings with the per-king text last.
- qwen3:8b in the sim: ~800 prompt tokens, ~30 output tokens (clean tool call, no leak). Cold ~144s (with a browser rendering), warm 37–62s.

### Balance notes
- v0: total stalemate. Armies circled towns at radius ~11 tiles, never engaged garrisons, and attrition killed them. Fix: attackers crowd to radius 3 on foreign targets, and contested towns stop recruiting.
- "Destroyed near Grisreach" for every army was a bug (centroid reset to 0,0 before the obituary).
- POP_SCALE=3 → ~25k soldiers in year 1. Step cost ~2ms per 12k soldiers alone; ~9–40ms while Ollama saturates the CPU (sim runs at nice 19).
- Pacing: 12 tps, council every 45 days, grace 10 days. Two qwen kings at ~50s each mostly keep up.

### Knobs (env)
SEED, KINGS, KING_MODEL (qwen3:8b), OLLAMA_URL, TICKS_PER_SEC (12), COUNCIL_DAYS (45), GRACE_DAYS (10), PORT, HOST, DATA_DIR. Viewer: PORT (4201), SIM_URL.

### Watching the first kings (year 1–2)
Watched two qwen3:8b kings against two scripted kings.

- **Leobert (Zandun, "cautious and patient").** Gave two real orders ("Edvin → Barhaven"). Edvin ignored the second (the hands' disobedience roll). Leobert's next council was a threat, the most in-character line so far: *"General Edvin is to march on Barhaven, and if he disobeys, he shall be held accountable…"* After that, 12 councils of proclamations only, all near-identical ("I will not rashly send forth our hosts, but when the time is right…"). Meanwhile overflow recruitment ballooned Edvin's idle host to 8,028, the biggest army on the continent, doing nothing.
- **Edric (Grisreach, "ambitious and proud").** His only general, Merdric, died at Grisvale. For nine councils he kept ordering Merdric to march and never mustered, while shrinking from 12 towns to 4.
- **Diagnosis: the report shaped behavior more than the temperament did.** Edric's report echoed "Your last commands: march: no general named Merdric", which re-primed the dead man's name every council. An 8B model follows names it sees; it doesn't reason from absence ("You have no generals in the field").

### Fix 1: outcomes, not errors (continuity v1)
- Failed commands become in-fiction outcomes: *"You sent word to General Merdric, but no such general serves you. Merdric is destroyed near Grisvale."* (found by searching the chronicle for the general's fate).
- With no generals, the report adds: "A muster raises a new host from a garrison."
- A "reign so far" section (the last 8 in-fiction outcomes) replaced the raw last-commands echo.
- Added a `journal` tool (the king writes notes to himself, last 5 shown).
- Fixed general names repeating after a restart (NameGen's used set now persists and is also rebuilt from the chronicle).

**Result:** Edric broke his loop on the very next council (muster ×2, then orders for the new generals Halda and Edwyn). Leobert saw his own two identical proclamations side by side in "reign so far" and delivered the same speech a third time. Neither king ever used `journal`. An 8B model ignores an optional tool nobody asks for.

Later, while we weren't looking, Leobert woke up: he mustered, sent Edvin and Cynmir on campaigns, and won Thorncrag (24-day battle, 1,169 dead). He also won Grisgate *by accident*: Edvin misread the seal, marched on the wrong town, and took it. The hands' noise is producing history.

But Edric fell into a new loop: the identical "Halda → Dunstead | Edwyn → Marcrag" for 6 councils. Each council was stateless, so he couldn't see he was repeating himself.

### Fix 2: a rolling context window (continuity v2)
Decision (user's direction): drop the journal. The kings keep a rolling conversation of their last 5 councils (`KING_MEMORY`), where each user turn is the date plus the update on the realm.

**Tradeoff: prompt reading is the bottleneck on this CPU (~20 tok/s for qwen3:8b).** A full report is ~500–900 tokens, so five full reports would mean ~4 minutes of reading per council. So:
- **The current turn** gets the full report.
- **Older turns** are stored as a *brief*: date, settlements held, generals with size and location, and that council's news.
- **The king's own tool calls** stay verbatim as assistant messages. Their results come back as `tool` messages (the in-fiction outcome text).
- The system prompt now includes the king's identity. We lose the shared-prefix cache across kings, but with two kings alternating on one Ollama slot the cache was barely helping anyway.
- num_ctx 4096 → 8192.

Removed: the journal tool, the reign section in the report (reign is kept for viewers only).

Observability: `GET /api/kings/:id/context` returns exactly what a king would be sent right now, and `qw context a` prints it. This lets us (and Claude) read a king's mind-state directly.

**First results with memory (Year 4):**
- Edric broke the 6-council repetition on his first council with history: "Halda → Thornwick | Edwyn holds | muster at Dunstead | proclamation". That's the most varied council any qwen king has held.
- Leobert switched Edvin's target to Ashwall, adapting to where the misread had actually sent his general instead of insisting on Dunbarrow.

### Performance note
Council wall time has crept up: 37–62s warm at first, now 160–290s. Prompt size is similar (~900–1,150 tokens). The difference is CPU contention: viewers rendering 40k dots at 60fps in browsers on this box, plus the sim itself. **Viewing from another machine on the LAN is not just nicer, it frees this machine's CPU for the minds.**

### Next
- Watch the rolling window over many councils. Does memory produce plans that span councils?
- Idle-army problem: overflow recruiting grows resting hosts without bound. Consider upkeep or desertion for idle hosts (gives kings a reason to act).
- Try llama3.2:3b (independent calls, ~2.4× faster).
- Scale up: more realms, more soldiers, a bigger map for the wall.


## Session 2 — 2026-09-25 (overnight) — "make it rich"

The user went to bed with a brief: iterate overnight, make the simulation richer and the playthrough more interesting. More brains, a bigger world, resources, death, desertion, reputation. Journal and commit along the way; resetting the world is fine.

### A bug that was eating councils
Before starting: 16 councils had silently become "advisors ruled". Node's `fetch` (undici) aborts if response headers take >300s, and Ollama sends no headers until it has read the whole prompt. Councils were running ~300s. Switched to `node:http` with a 30-minute timeout. **Lesson: on slow local inference, the HTTP client's hidden timeouts become game mechanics.**

### Tooling: `npm run bench`
A headless runner: N days with all-script rulers, printing realm standings every 60 days, the chronicle tail, and event tallies (captures, wars, peace, deaths, rebellions, mercs, desertion, bankruptcies). Five in-game years take ~30s. All balance work below came from bench runs.

### Realms become first-class
Refactored the kingdom model. A `Realm` is now one saved record: ruler (title, name, birth tick, temperament), brain (`script` or any Ollama model), origin, treasury, honor, relations, council state, inbox, rolling memory. Realms can be created at runtime (rebels) and rulers replaced (succession), which the old "regenerate kingdoms from the seed" model couldn't do. Save format v2. A v1 save is set aside as `.bak` automatically.

### What's new in the world
- **Bigger:** 1280×720 tiles (from 1024×576), 96 settlements (from 64), 6 founding realms (from 4). Up to 12 factions.
- **Coin:** taxes by settlement fertility. Pay per soldier: garrison 0.02/day, host at home 0.05, host foraging in foreign land 0.025. **Campaigning is cheaper than idling**, which answers Leobert's 8,000-man idle host. Musters cost 1 crown a soldier; sellswords cost 3. Capturing a town gives plunder; capturing a capital takes a share of the loser's treasury.
- **Morale:** per host. Drifts to steady. Rises with captures (+0.2). Falls with heavy losses, with idleness past 60 days, and fast when unpaid. Below 0.3 men desert. Obedience is now `0.5 + 0.2·loyalty + 0.3·morale`, so a miserable host ignores orders.
- **Mercenaries:** a `hire_mercenaries` tool. Coin becomes a host instantly, with low loyalty (0–0.35).
- **Diplomacy:** realms start at peace. War is a state. Tools: `declare_war`, `send_envoy(realm, message, offer_peace)`. Envoys travel capital to capital. Two crossing peace offers, or accepting a pending one, make a treaty. Breaking a treaty sworn in the last 2 years costs honor ("Oathbreaker, they whisper"), and others' reports mention it. Marching on a realm at peace declares war implicitly (the ruler is told). Misreads never pick a target that would start a new war; a blundering general starting wars felt too random.
- **Mortality:** rulers age. Yearly death chance is 1% under 40, rising steeply (~17% at 60). The heir gets a fresh memory and an inbox note: "You have just been crowned. Queen X dies of a wound that never healed, aged 64." Capital falls carry a 30% chance the ruler is slain.
- **Rebellion:** a renowned (≥2 towns taken), disloyal (<0.4) general with a grievance (unpaid, or low morale) holding a town may rise and found a new realm (Free March / Dominion / Compact / Banner of X), at war with the old crown. Rebels get their own brain (`REBEL_BRAIN`, default llama3.2:3b) and an inbox note about who they were. Utterly miserable hosts can mutiny even without renown.
- **Omens:** rare plague (kills 40% of a garrison) and bountiful harvests.
- **Time slows rather than stops** while the world waits on an overdue mind (1/8 speed). "Time slows while Queen Alda deliberates…"

### Balance: three bench iterations
1. **First pass:** gold piled up to 50–120k with nothing to spend on, and wars never ended (the strong side never accepted peace).
2. **Lower taxes, muster cost, mercenaries, war-weariness** (scripts accept peace after 1.5 years at 50%, offer it after 3): every realm hovered at 0 gold, bankrupt forever. "Runs dry" 262 times in 600 chronicle entries. Cause: stewards kept filling garrisons until pay ate every crown.
3. **Stewards don't hire men the crown can't pay** (recruit only while the surplus is >20% of income): the healthy middle. Over 5 years: 39 captures, 31 mercenary hires, 6 peaces, 2 rebellions (both crushed), 2 royal deaths, 30 desertion notices, 7 bankruptcies. Hoarding at peace remains for scripted rulers; that's their personality.

The chronicle was drowning in daily desertion lines. They're now summed per host and chronicled every 150 men. Bankruptcy is chronicled at most once per 90 days.

### Minds
Default brains: `qwen,qwen,llama,script,script,script` (two qwen3:8b, one llama3.2:3b, three scripts). Rebels use llama3.2:3b. llama3.2:3b made a valid tool call from a real 1,500-token ruler context (311s, but that included a cold load contending with qwen).

The report now carries the treasury, per-host spirits ("grumbling, idle 10 months"), war durations, other realms' wars and reputations, and "Tidings" (envoys, succession notes). Tools: march, hold, muster, hire_mercenaries, declare_war, send_envoy, proclaim. A typical first report is ~2,300 characters (~650 tokens).

### The new world, first year (live)
Seed 10064: two qwen3:8b kings (Caswyn of Thornby, 60, melancholy; Halrin of Normere), one llama3.2:3b queen (Alda of Galcrag), three scripted queens (Ulmund, Rosvin, Leora).

- All three minds opened at peace with the same instinct: the qwen kings proclaimed, and the llama queen declared war on Mardun (which had already declared war on *her* on day 13, so it was redundant but the right instinct).
- The scripted queens were the aggressors early: Leora (Mardun) declared on Galcrag on day 13, and Ulmund (Galdun) on Kelford with 1,301 crowns of sellswords.
- **First mind-to-mind-ish diplomacy.** Caswyn, at war with Mardun, sent: *"I offer peace, Queen Leora. Let us end this strife and restore stability to our lands."* Leora (script) accepted, and Caswyn then proclaimed: *"Peace has been restored with the Mardun Realm. Let our people rejoice and prepare for the trials ahead."* Halrin made a **conditional** offer to Kelford: *"I offer peace, if you withdraw your armies from our borders."* Accepted.
- Alda (llama) spends her treasury on sellswords every council (545, then 954 crowns). Terse and consistent: ~17–29 output tokens per council.

### Viewer additions
- A Chronicle / Annals / History tab strip.
- History is a stacked area of towns (or soldiers) per realm, with a surface gap between bands, direct labels on the thick bands, a legend, and a hover crosshair and tooltip. The realm colors fail the dataviz validator's lightness band (gold/orange/teal are brighter than it prefers) but pass CVD separation and contrast. Kept, because they're the map identity colors, and identity never relies on color alone (legend, labels, tooltip).
- Map hover tooltips for towns and armies (general, size, spirits, renown, orders).
- Chronicle glyphs: ⚔ war, ☮ peace, ♛ succession, 🔥 rebellion, ♜ fallen seat, ✉ envoy, 📜 proclamation.
- Realm cards sort by size and expand on click to show that ruler's reign in their own memory's words.
- Seats are drawn from each realm's current capital, not the founding capitals.
- **The viewer is capped at 24 fps** (`?fps=`). A Firefox tab on the sim machine was using ~55% of a core, competing with the minds.

### Contention on a shared box
Councils slowed to 290–340s for ~1,250 prompt tokens (~4 tok/s prompt eval, vs ~20 earlier). Cause: the local-ai session's Ollama had a ~20 GB model resident (RSS 20.7 GB), and our qwen/llama were being evicted and reloaded from disk around it. Nothing to fix on our side, but it's worth knowing: **the kings' thinking speed is a function of whatever else this machine is doing.** When the big model left, councils dropped back to 60–180s.

### Idle morale, revisited
Hosts at peace were sliding toward desertion (morale 0.38 by midsummer) because idleness decayed morale regardless of war. Changed: idleness only chafes while the realm is at war. Garrison duty in peacetime doesn't break an army.

### More world: sellswords and revolts
- **Unpaid sellswords** (8%/day while the realm is in debt) either defect to the richest enemy at war with their employer (who pays their price) or break contract and ride away.
- **Revolts:** a town taken within the last 3 years, garrison under 40, uncontested and not a seat, may rise (0.4%/day) and return to its founding realm, reopening the war if needed.

### Year 1 in review: two oathbreakers, and whose fault that was
Both qwen kings started wars (Caswyn on Mardun, day 161; Halrin on Kelford, day 183), both made peace with envoys, and both **broke the peace about 100 days later**: *"King Caswyn breaks the peace sworn with the Mardun Realm and declares war! Oathbreaker, they whisper."*

Reading their reigns showed how: each simply ordered a general to march on a border town of a realm they were at peace with, and the game quietly turned that into a declaration of war. The tool description never said so. **The treachery was my design, not their choice.** Changed: marching on a realm at peace is refused with an in-fiction explanation ("…with whom you are at peace. You must declare war first."), and the march tool says so. Oathbreaking now requires an explicit `declare_war`, which makes it a real choice.

**The first annal** (llama3.2:3b, 131s) had the right voice: *"…the discord between King Caswyn and the Mardun Realm would sow the seeds of a bitter peace, one that would be broken in the year's final days, as the monarch's oath was cast aside, and the very fabric of trust was rent asunder."* It misattributed a general (put Kelford's Casgar under Thornby), because chronicle lines about generals don't name their realm. The scribe's copy of the records now tags each entry with its realm.

### More minds, mid-reign
Tested qwen3:1.7b as a ruler on a real 1,900-token context: a valid `muster` call. Rather than reset the world, added a runtime brain swap: `POST /api/control {action:'brain', realm, brain}`, or `qw brain d qwen3:1.7b`. A new mind doesn't inherit the old one's memory. Handed two scripted queens to minds:

| Realm | Ruler | Mind |
|---|---|---|
| Thornby | King Caswyn | qwen3:8b |
| Normere | King Halrin | qwen3:8b |
| Galcrag | Queen Alda | llama3.2:3b |
| Galdun | Queen Ulmund | qwen3:1.7b (was script) |
| Kelford | Queen Rosvin | llama3.2:3b (was script) |
| Mardun | Queen Leora | script (the baseline) |

Plus the scribe (llama3.2:3b) and any rebels (llama3.2:3b). Councils are now every 60 days (was 45), since five minds take ~10 minutes per round. New worlds default to this mix.

Noticed: both qwen kings hoard, each sitting on ~10,000 crowns while at war. They see the number in their report and don't spend it.

### Seeing orders flow downhill
The core idea (commands degrade as they travel down the hierarchy) was invisible. Now couriers are drawn: royal orders as small lights in the realm's color riding from the seat to the general, envoys as pale lanterns with a faint trail between capitals. A seat whose mind is in council pulses with an expanding gold ring. `StateResponse.couriers` carries each rider's endpoints and progress.
