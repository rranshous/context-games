# Qwestworld

A continent-scale RTS that runs forever in the background. A few kings are local LLMs (Ollama); everything else is tens of thousands of rule-following hands. You watch through a window.

```
npm install && npm run build
npm run sim          # the world (daemon, :4200) — keeps running with or without viewers
npm run view         # the window (:4201) — open http://<host>:4201 from any machine on the LAN
npm run qw -- map    # the terminal window: status | kings | chronicle [n] | map [cols] | pause | resume
```

Needs Ollama with `qwen3:8b` (or set `KING_MODEL`). `KINGS=script,script,script,script` runs with no inference at all. See `docs/journal.md` for knobs and design.
