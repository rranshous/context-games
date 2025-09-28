# Runaway Platform

A simple HTML5 game platform with AI inference support.

## Overview

Runaway consists of two main components:

**Game Platform**: Hosts and serves HTML5 games with discovery and publishing features  
**Inference Proxy**: Separate AI model backend that games can access via API

This separation allows:
- Independent development and deployment of each service
- Games to optionally use AI inference without tight coupling
- Different scaling and hosting strategies for each component

## Documentation

- [Introduction](docs/introduction.md) - Vision, goals, and requirements
- [Technical Architecture](docs/architecture.md) - System design and implementation plan

## Structure

```
runaway/
├── docs/              # Documentation
├── game-platform/     # Game hosting platform (React + TypeScript backend)
├── inference-proxy/   # AI inference backend service
├── cli/              # Publishing CLI tools (TBD)
└── README.md         # This file
```

---

*Platform: Runaway*  
*Created: September 28, 2025*