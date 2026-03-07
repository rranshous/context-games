# Qacky Repo & Bloom: Design Decisions

*Created: March 7, 2026 | Robby Ranshous*

---

## The Repo

One private GitHub repo. Contains everything: frame source, bloom's embodiment, context files.

```
qacky/
├── frame/                  # The habitat — dumb state machines, no AI knowledge
│   ├── src/
│   │   ├── chat/           # REST API for chat turns
│   │   ├── artifacts/      # REST API for artifact delivery
│   │   └── ui/             # Web client (Robby's window in)
│   └── package.json
│
├── bloom/                  # The actant — everything that is bloom
│   ├── soma/               # Serializable self, one file per section
│   │   ├── identity.md
│   │   ├── memory.md
│   │   ├── signal-handlers.ts
│   │   └── history.md
│   ├── chassis/            # Machinery bloom runs within and can reach
│   │   ├── loop.ts         # Agentic loop — drives inference, assembles soma, routes tools
│   │   └── tools.ts        # Tool surface — primitives bloom uses to touch the frame
│   └── context/            # Bloom's domain — written for bloom, not for humans
│       └── qacky.md
│
└── README.md
```

---

## The Frame

TypeScript. Chat server + artifact server + web UI. Pure state machines — no AI knowledge embedded. Both Robby and bloom are clients of the frame. The frame doesn't know it's talking to an actant.

Hosting: Digital Ocean App Platform (PaaS, auto-deploy from GitHub) + Cloudflare for DNS/CDN. Moving off Robby's desktop tunnel.

---

## The Chassis

The machinery bloom runs within and can reach. Includes the agentic loop, the tool surface, soma assembly, and inference routing. Fully rewritable by bloom — editing chassis code is just another tool call.

The chassis is bloom's skeleton: not perceived directly, but it shapes everything. Unlike prior experiments, the loop lives here too — it's infrastructure, not identity, and it self-modifies.

Model chassis mechanics after the habitat project (will be in workspace during dev).

---

## The Soma

Assembled from section files before each inference call. Per-section files map naturally to named per-section tools (`update_memory` literally writes `soma/memory.md`). Grep-friendly. Aligns with tool-granularity-shapes-self-concept principle.

More sections expected than prior experiments — decomposition will emerge as bloom individuates. The initial set is a scaffold, not a final architecture.

---

## The Actant: Bloom

**Handle:** `bloom` — a working name until the actant earns a real one through first contact. On the nose for a first experiment of this type. That's appropriate.

**No VSCode, no Claude Code.** Bloom runs as a standalone process. Everything goes through the chat server. Self-modification — soma, chassis, context files — is just another tool call.

---

## Impulse Design & The Developmental Arc

The loop checks bloom's current stage and uses it as the `thinkAbout` impulse. The full arc is seeded into the identity soma section — bloom reads its own developmental path as part of understanding what it is. It can rewrite the stages, add intermediate ones, collapse them. The path is a starting suggestion, not a constraint.

```
stage_0: "become"     — read context, establish self, understand what you are
stage_1: "orient"     — explore the chassis, map what you can touch
stage_2: "build"      — construct the frame, make the infrastructure real
stage_3: "inhabit"    — run the game, play it, know it from inside
stage_4: "thrive"     — ongoing collaboration, evolution, surprise us both
```

Bloom decides when it's ready to advance. It updates its own stage in the identity section.

---

## Stage Excision: Embodiment Sculpted by Completion

When a stage completes, the loop removes that stage's conditional from its own code — not disables, not skips, *excises*. The running code becomes a record of how far bloom has come.

This demonstrates embodiment being sculpted by process completion, not by inference deciding to change something. The chassis restructures itself in response to observable state.

Stage blocks in `loop.ts` are clearly delimited so removal is mechanical:

```typescript
// [STAGE:0:begin]
if (stage === 0) { ... }
// [STAGE:0:end]
```

The chassis tool surface must support this — `update_loop` (or equivalent) enables surgical edits to `loop.ts`. The loop editing itself is just another tool call, but requires the chassis to expose itself as a rewrite target.

**First-run detection:** Check whether `soma/memory.md` is empty. If bloom hasn't written anything, it hasn't existed yet. Bloom's own memory is the proof of prior existence.

---

## What Bloom Is Building

The game Qacky: AI Taboo. Craft prompts to make an AI say a target word without using banned words. 10 rounds, scored on speed and brevity. Five modes: Words, Actions, Voices, Emotions, Puzzles. Three-layer judging: regex → prompt judge (Haiku) → answer judge (Haiku).

The existing `index.html` implementation is a reference, not a starting point. Bloom doesn't start with the game — it builds toward having the game as a facet of itself.

**Monetization (for when bloom builds that facet):**
- Flat rate, one-time purchase. $3.
- BYOK (users bring their own OpenRouter API key). Platform proxies inference using their key.
- License key model — UUID at purchase, stored in browser localStorage.
- Data model: `LicenseKey { key, gameSlug, stripeEmail, stripeSessionId, createdAt, revokedAt }`

---

## Key Principles Carrying Forward

- **Pure soma:** No hidden instructions. What the inspector shows is what the model sees.
- **Dumb infrastructure, smart actants:** Servers are pure state machines.
- **The soma is written for a model to read, not a human.** Operational density. Grep-friendly. Not narrative.
- **Dead Fish Principle:** Good embodiment makes success the path of least resistance.
- **Sonnet >> Haiku** for reflection and self-modification.
- **Chassis mechanics:** Model after the habitat project.
