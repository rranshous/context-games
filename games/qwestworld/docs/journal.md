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

### Alliances
Envoys can carry `offer_alliance`. Crossing or answered offers seal a pact ("…swear alliance"). If anyone declares war on your ally, you're **called to arms** ("The X honors its alliance with Y and takes up arms against Z"). Declaring war on your own ally is a **betrayal** (honor -0.35, "betrays the alliance… Oathbreaker, they whisper"). Reports show "your ALLY" and each realm's own alliances. Scripts accept alliances from realms that share an enemy and seek them against shared foes. The bench now tallies alliances, calls to arms, betrayals, revolts and turncoats. First 4-year bench: 25 captures, 3 alliances, 6 revolts, 3 turncoat companies.

### Catching up: "While you were away"
A window into a world that keeps living needs a way to catch up. The viewer remembers (localStorage, per browser, safe to lose) the last tick it saw. On opening, it fetches `/api/chronicle?since=` and shows the major events since then, newest first: captures of seats, wars, peace, alliances, betrayals, successions, rebellions, revolts, turncoats. A first-time viewer (or one from before this feature) gets **"The Story So Far"** for the whole age. The chronicle now keeps 3,000 entries (was 600) so an overnight run doesn't forget its early chapters.

First live turncoats: *"Unpaid, the Free Band turn their coats: 51 sellswords under General Osrin go over from the Kelford Realm to the Principality of Normere."* (Kelford is llama-ruled Rosvin, who hires sellswords every council and went into debt.)

qwen3:1.7b as Queen Ulmund: fast (30–42s per council), accepted peace sensibly, then proclaimed a confabulated news bulletin: *"…The Principality of Thornby has ceased its war with the Mardun Realm…"* (it hadn't). Small models narrate the world they imagine.

### Memory as a template: the 153-crown loop
Queen Rosvin (llama3.2:3b) hired sellswords for exactly 153 crowns at three councils in a row (51 men each time). Her memory showed each hire succeeding, and the previous `hire_mercenaries(Kelford, 153)` call sat verbatim in her context. **For a 3B model, the rolling memory becomes a template to copy.** The same mechanism that broke qwen3:8b Edric out of his dead-general loop (seeing his own repetition) pulls llama3.2:3b *into* one. Queen Alda (also llama) hires every council too, with varying sums. Minimum sellsword contract raised to 100 men (300 crowns) so small-model habits don't flood the map with tiny companies.

### Year 2: a death, and armies crumbling to dust
- **Queen Ulmund of Galdun died.** Queen Falbert, 17, took the throne on the same qwen3:1.7b mind, with fresh memory and the news of her predecessor's death in her inbox.
- **Fragmentation.** The minds' hosts withered into scraps (1, 5, 6, 13, 19 men): mustered, then idle at war, then desertion. The scraps kept occupying the six host slots, so no new musters were possible. Queen Alda had six "hosts" holding the same town, five of them under 70 men. Fix: hosts under 25 men fold into the nearest friendly garrison (or scatter in enemy land), and hosts camped at the same friendly town merge under the stronger general. Alda's six became one host of 647.
- **The qwen kings hoard:** Caswyn 17k, Halrin 13k crowns, while their hosts melt from idleness. They never spend on sellswords at scale, and rarely march.

### Instrumentation and speed
- **Per-mind statistics:** councils, average seconds, tokens in/out, silent councils, misfires (commands naming no such general/place/realm), tool histogram. `qw minds` prints them. They reset when a realm changes minds.
- **Chunked memory window:** the window grows to KING_MEMORY+3 councils, then trims back to KING_MEMORY. Between trims, the older councils are an unchanged prefix, so Ollama can skip re-reading them. It only helps when a model isn't serving two rulers alternately on one slot (as qwen3:8b and llama3.2:3b each are now); OLLAMA_NUM_PARALLEL=2 on the server might let each ruler keep a slot.

### Counsel: making pressure salient without giving orders
Baseline (2 councils each, before counsel):

| Mind | Realm | avg s | in/out tokens | Tools used |
|---|---|---|---|---|
| qwen3:8b | Thornby (Caswyn) | 163 | 2315/27 | march 2 (1 misfire: a general whose host had merged away) |
| qwen3:8b | Normere (Halrin) | 154 | 2322/24 | march 1, declare_war 1 (redundant: already at war) |
| llama3.2:3b | Galcrag (Alda) | 76 | 2489/30 | hire_mercenaries 2 |
| qwen3:1.7b | Galdun (Falbert, 17) | 31 | 1739/42 | declare_war 1, send_envoy 1 |
| llama3.2:3b | Kelford (Rosvin) | 73 | 2381/30 | hire_mercenaries 2 |

Every mind uses **one tool per council**. The qwen kings hoard 13–17k crowns while their hosts melt. The llama queens do nothing but hire.

Added an "Your advisors speak:" section, in-fiction and conditional: the treasurer (idle coin at war; debt), the marshal (hosts idle for months while the war goes on; no host in the field), scouts (poorly defended enemy border towns), the castellan (towns under siege), the chancellor (low honor). Nothing tells the ruler what to do; it names what a long report buries. We'll see whether tool use widens.

Also: annals get a longer output budget and end on the last full sentence (Year 2's stopped mid-sentence), and death notices use the ruler's pronoun ("dies in her sleep").

Young Queen Falbert (qwen3:1.7b), crowned at 17, **broke her predecessor's peace with Kelford within three months**, a deliberate `declare_war` that earned the oathbreaker label.

**Counsel works.** In the first round with advisors, all three qwen minds mustered new hosts (Caswyn at Thornby after "21,446 crowns lie idle… we are at war and have no host in the field"; Halrin at Marhold; Falbert at Fenwick). None had mustered in the baseline councils. The llama queens kept hiring. Still exactly one command per council for every mind, so the system prompt now adds "You may give several commands at once." (It ended with "Speak little.", which may read as "do little".)

**Several commands? No.** After adding "You may give several commands at once": still exactly one command per council from every mind, qwen3:8b included. That's how these models use tools with thinking off. Accepted.

**Crowns are abstract; men are not.** King Caswyn, sitting on 21,000 crowns, offered 200 crowns for sellswords, and Falbert offered 13. The tool asked how many crowns to spend, and small models pick small numbers. Changed `hire_mercenaries(settlement, crowns)` to `hire_mercenaries(settlement, men)` at 3 crowns a man, with "100 to 3000" in the schema. Old memories that say `crowns` still work.

Mind stats after 4 councils each: qwen3:8b ~146–169s, llama3.2:3b ~75–83s, qwen3:1.7b ~35s. The llama queens have used exactly one tool (hire_mercenaries) in every council. qwen3:1.7b has the widest repertoire (war, envoy, muster, hire).

### Trade: a reason to keep the peace
Coin only came from taxes, so peace had no price. Now neighbors at peace trade: each side earns 12% of the poorer neighbor's taxes per day (1.5× between allies), and war cuts it off. Caravans (small laden carts) roll between the seats of trading realms on the map. The treasury line reads "Taxes and trade bring N a day (M of it from trade with K neighbors at peace)", and the merchants speak up when a war has "closed the border roads to trade."

### The council chamber
Expanded realm cards link to "open the council chamber": a modal showing exactly what that mind is given right now (from `/api/kings/:id/context`). Who they are; each remembered council (the brief, what they commanded as tool calls, and what came of it); and today's full report with the advisors' counsel. In the inspector spirit of Glint and Habitat: you can read a mind's whole world.

### The end of an age, tested
The age-transition path (one crown left → a new continent 12 days later) had never run. Tested on a throwaway sim (port 4300, two scripted realms, 24 settlements, 1000 tps), with a new control to force it: `qw new-age` / `{action:'new-age'}` ("The gods tire of this age…", then a new continent 3 days later). Found and fixed one bug on the way: the scribe remembered the last year it had written across ages, so a new age's first annals would have been skipped. Transition works: "A new age dawns: Age 2, seed 100". Viewers reload on the seed change.

### Wander mode, for the wall
Press W (or open with `?wander`) and the camera drifts on its own every 16 seconds. It picks by weight among the live sights: the biggest battles, towns under siege, seats whose ruler is in council, great hosts on the march, envoys on the road. It eases in and captions each ("The Battle of Holmouth: … 12 days, 540 fallen."), and pulls back to the whole continent every fifth stop. Dragging the map takes the reins back. With H hiding the panel, this is the projector mode.

Also: rulers now see a hint of each general's heart ("Devoted to you." / "Ambitious, and loves you little."), and a spymaster warns when a proud, disloyal general's men are discontent ("There is talk of rebellion."). A general whose host merged away or dissolved is explained when a ruler orders them.

### Names run out
Queen Leora of Mardun died, and her heir was crowned **"King Halis 49"**. Years of musters, sellsword companies and heirs had exhausted the 560-name person pool, and the fallback appended a number. The pool is now ~54 × 38 names, with an optional middle syllable (~20k+ shapes; 0 collisions in 2,000 draws). Heirs sometimes take the dynasty's name ("King Caswyn II"), and a true collision gets a regnal numeral. The live world's Halis lost his 49 on load.

### Whispers: touching the world without playing it
A viewer (or `qw whisper a <text>`) can put words into a ruler's next council: "A stranger at court whispers to you: “…”", in their Tidings. The chronicle only notes "A cloaked stranger is seen at the court of King X." This is the lightest intervention from the first brainstorm (watch plus occasional whispers). **Test (by Claude, deliberately vague):** to King Halrin, "The stars favor bold rulers this year." His next council sent General Garwald on from newly taken Yrmere to Osmouth. That's bold, though not provably because of the whisper.

### The scribe needs curation, not everything
The Year 3 annal was a roll call of merges ("General Sigda and General Neya joined General Yswen's host…"), because host consolidation now chronicles itself and llama3.2:3b copied whatever it was handed. The scribe now reads only what history remembers (captures, fallen seats, wars, peace, alliances, betrayals, successions, rebellions, revolts, turncoats, proclamations, destroyed hosts) plus the five bloodiest battles, with housekeeping (merges, remnants, musters) excluded. Year 3 was rewritten (by dropping it from the save so the scribe queued it again). Much better, though "The host is no more" had slipped past the filter via the realm-fall pattern; now excluded explicitly.

### Year 4 snapshot
- **Queen Falbert** (qwen3:1.7b, crowned at 17, "vengeful and quick to anger") sent the Mardun Realm, with which she was *at peace*: *"I am not a peacekeeper. I am a warrior. You are at war with me, and I will not stop until you kneel to me."* The small model imagined the war it was threatening. Mardun's scripted ruler ignored it.
- **Mind-to-mind diplomacy has gone quiet** since day 489. With advisors now naming idle coin and idle hosts, councils turned to musters, hires and marches. No alliances between minds yet.
- **Hoards persist:** Caswyn ~31k crowns, Falbert ~23k, even with the treasurer's warning. They muster (garrison-limited) but rarely buy sellswords at scale.
- **Mind stats after ~7 councils each:** qwen3:8b ~142–176s per council, 2.5k tokens in, ~25 out, using march/muster/hire/declare. llama3.2:3b ~66–83s, almost only `hire_mercenaries`. qwen3:1.7b ~34s, the widest repertoire (muster, war, envoy, hire, hold). Zero silent councils from any mind; Caswyn has 2 misfires (generals whose hosts had merged).

### Seasons
The year now has a rhythm. **Winter** (Frostmonth–Longnight): hosts march at 60% and foreign-land attrition doubles. **Harvest** (Harvest, Leaffall): taxes ×1.5. Reports open with the season ("It is Frostmonth 3, Year 4, winter. Winter: hosts march slowly, and those in foreign land freeze and starve."), and in Mistmonth the marshal warns that winter is coming if hosts are on campaign. The viewer washes the map by season (frost-blue in winter, faintly golden in autumn, faintly green in spring) and shows it beside the date. Bench over 2 years: 27 captures, 4 alliances, 2 rebellions, 5 revolts.

### A frozen map, and sieges by starvation
Captures per year in the live world: 3, 1, 0, 1. Battles kept happening (5–8 a year), but borders barely moved in four years. Two causes:
1. **Garrisons rival hosts** (median garrison 383, up to 1,077; hosts 160–1,000), and a town fell only when *every* defender was dead. Symmetric combat meant an attacker who merely outnumbered a town bled out against it, with foreign-land attrition and winter on top.
2. **The hands' noise:** Mardun sent host after host at Pellmouth (**garrison: 1**), and its generals misread the seal three times and marched elsewhere.

Fix: **surrender.** If besiegers outnumber the defenders 3:1 (and are at least 20), the town is starved out over ~20 days even with defenders inside ("Starved and outnumbered, X yields to the Y."). Storming an empty town still takes under a day. Bench (seed 777, 3 years): 35 captures, 21 of them surrenders (vs 20–25 captures before), 3 rebellions, 8 peaces.

**Year 4 annal**, with the curated record: *"…the Broken Company, erstwhile loyal to the Crown of Galcrag, defected to the realm's banner, surrendering a thousand valiant men to the will of King Halis…"* Events, not housekeeping. Still longer than the eight sentences asked for; llama3.2:3b doesn't count.

### The first war between minds
Early in Year 5, King Caswyn of Thornby (qwen3:8b, "melancholy", 64) declared war on young Queen Falbert's Galdun (qwen3:1.7b, "vengeful and quick to anger", now 20). At her next council Falbert issued her own (redundant) declaration back. It's the first war where both sides are minds. Falbert also sent King Halis of Mardun *word for word* the envoy she'd sent his dead predecessor ("I am not a peacekeeper. I am a warrior…"). The copy-your-own-memory habit isn't only llama's. Caswyn has ~37k crowns hoarded, Falbert ~30k. The two richest treasuries on the continent are now pointed at each other. New README screenshot.

### Year 5 so far
- Sieges by starvation are breaking the stalemate: *"Starved and outnumbered, Pellmouth yields to the Mardun Realm."* Morstead followed. (Pellmouth had held with one defender for a year while Mardun's generals misread their orders.)
- **Queen Alda of Galcrag (llama) died in her sleep at 66.** Queen Daggard, 18, took the throne on the same mind.
- The Broken Band (1,321 sellswords) turned their coats from debt-ridden Kelford to Galdun.
- King Halis (script) proposed an alliance to Queen Falbert against their shared enemy, Thornby.

### Experiment: narrative memory for small models
Baseline, chat memory (past councils as real turns with their own tool calls): the two llama3.2:3b queens chose `hire_mercenaries` in **18 of 23 councils** (Galcrag 10/12, Kelford 8/11). The hypothesis: for a 3B model, a prior tool call in context is a template to copy. New `NARRATIVE_MEMORY` (a regex over model names, default `llama`): those minds get their history as prose inside today's report ("Your recent decisions and what came of them: …"), with no past tool-call turns. qwen keeps chat memory. Compare tool variety after a few rounds.

**Year 5 annal** (the best yet, from the curated record): *"…the Crown of Galcrag, now ruled by the youthful Queen Daggard, who had ascended to the throne following the passing of her predecessor, Queen Alda, took Norvale from the Mardun Realm, only to see it reclaimed by the same realm in the following days… As the year drew to a close, the Principality of Thornby and the Mardun Realm laid down their arms, swearing a fragile peace, but the memories of the battles and the fallen would linger on."*

The first llama council under narrative memory: Queen Rosvin **declared war on Galdun**, the realm her unpaid Broken Band had defected to. A different tool from her habitual hire, and a grudge that makes sense.

**Narrative memory, result (6 llama councils vs 23 before):**

| | chat memory (before) | narrative memory (after) |
|---|---|---|
| hire_mercenaries | 18 / 23 (78%) | 3 / 6 (50%) |
| other tools | muster 4, war 1 | war 2, **march 1**, (hire 3) |
| seconds per council | 70–83 | 41–52 |
| prompt tokens | ~2,500–2,700 | ~1,450–1,750 |

Rosvin's `Cynana → Galreach` is the **first march any llama ruler has ever ordered**. A small sample, but in the predicted direction: without their own past tool calls in the context to copy, the 3B minds choose more varied actions, and they're faster. qwen3:8b keeps chat memory: seeing its own calls is what broke Edric's dead-general loop. **The right memory format depends on model size.**

### Councils with several steps
Every mind issued exactly one command per council, while the scripted ruler commands every idle host at once, plus hires and diplomacy. That's an asymmetry that probably explains a lot of Mardun's growth. Now a council is a loop (`COUNCIL_STEPS`, default 3): the mind acts, commands take effect immediately, the in-fiction results come back as tool messages, and it may act again. Identical repeat commands within one council are skipped (arguments normalized). Later steps are cheap because the prefix is unchanged: qwen3:8b councils went from ~150s to ~170–230s for three steps.

The first multi-step council was the best reasoning yet. **King Caswyn** proposed an alliance to Galdun, was told *"you are at war with them. Make peace first,"* then, in the same council, proclaimed and **offered Galdun peace**. He adapted to feedback within one council. Halrin marched, hired, then repeated the march (argument order differed, so it slipped past the duplicate check; fixed). qwen3:1.7b and llama3.2:3b mostly still stop after one step.

### Year 6: two rebellions, and a rebellion that ate itself
- **The Thornwall Compact.** General Maldric, a *sellsword captain* in Thornby's pay, rose at Thornwall "for the men are sick of waiting." Three weeks later his new realm couldn't pay him: *"Unpaid, the Crow Band turn their coats: 326 sellswords under General Maldric's Guard go over from the Thornwall Compact to the Principality of Thornby."* His army went back to the king he had just rebelled against, leaving him a town and its garrison.
- **The Free March of Ashmoor.** General Oshild rose against Queen Falbert "for the crown has not paid them in months." Falbert (qwen3:1.7b) went from ~30,000 crowns to −1,320 in about a year, hiring sellswords and feeding a two-front war.
- Both rebel realms are ruled by llama3.2:3b minds, so the world now holds **seven LLM minds** (2× qwen3:8b, 1× qwen3:1.7b, 4× llama3.2:3b) plus the scribe. Maldric's first council: a muster.
- The Crown of Galcrag (young Queen Daggard, llama) has collapsed to 4 towns. Mardun (script) holds 31 of 96. Daggard tried to muster at Galcrag, which she no longer owned.

**Narrative memory extended to qwen3:1.7b.** Queen Falbert declared war on Thornby three councils running (already at war the whole time), and earlier sent King Halis word for word the envoy she'd sent his predecessor. The same copy-your-own-memory pattern as llama3.2:3b. The default `NARRATIVE_MEMORY` is now `llama|1\.7b`. Only qwen3:8b keeps chat memory.

### End of Year 6: nine realms, eight minds
- **A third rebellion:** General Pergar rose against Queen Falbert at Quenmarch ("the men are sick of waiting") and proclaimed the Dominion of Quenmarch. That's two of Falbert's generals in revolt in one season. Galdun now fights Thornby, Kelford, Ashmoor and Quenmarch at once.
- **The first alliance involving a mind:** Queen Rosvin (llama3.2:3b, narrative memory, multi-step) held a four-command council: a (redundant) war declaration on Galdun, then **accepting Mardun's alliance offer**, then orders to General Rosdis. "The Kelford Realm and the Mardun Realm swear alliance."
- The continent now holds nine realms and **eight minds** (qwen3:8b ×2, qwen3:1.7b ×1, llama3.2:3b ×5) plus the scribe. A round of councils takes ~15–20 minutes, so a year now takes about an hour and a half.
- Small-model noise: King Maldric issued a command with a missing argument ("no place undefined"). Queen Daggard keeps trying to muster at Galcrag, her lost seat, although her memory records that "it is not yours".

### Year 6 annal and the grand alliance
The scribe named the continent: *"…the world of **Eridoria** was beset on all sides by tumult and strife."* Nothing in its input had a name for the world; it invented one. The annal ran to five paragraphs and garbled some facts (it put Maldric's rebellion against Mardun rather than Thornby), but it caught the turn: **King Caswyn allied with Mardun**. The scripted superpower now leads an alliance with two minds (Thornby and Kelford) against Galdun, Normere and Galcrag.

**Mind stats after ~17 councils** (multi-step since Year 6):

| Mind | Realm | councils | avg s | tools |
|---|---|---|---|---|
| qwen3:8b | Thornby | 17 | 168 | envoy 7, march 6, muster 4, hire 2, proclaim 2, war 1 |
| qwen3:8b | Normere | 17 | 191 | march 12, hire 5, war 3, muster 3, hold 1, envoy 1, proclaim 1 |
| qwen3:1.7b | Galdun | 17 | 55 | war 7 (mostly redundant), envoy 4, muster 4, hire 3, hold 1 |
| llama3.2:3b | Galcrag | 18 | 71 | hire 13, muster 4, march 2, hold 2, war 1 (4 misfires) |
| llama3.2:3b | Kelford | 17 | 71 | hire 10, war 3, muster 3, march 2, envoy 1, hold 1 |

Multi-step councils visibly widened the qwen3:8b repertoire: Caswyn is now a diplomat (7 envoys) and Halrin a campaigner (12 marches). Zero silent councils from any mind all night.

Also: a missing tool argument now reads "You gave a command to muster but did not name the settlement." instead of "a place called undefined".
