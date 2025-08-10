# IPI: Games README Documentation

**Date:** August 10, 2025  
**Collaborators:** Robby + Claude  

## Introduce 🎯

**Goal:** Create a systematic approach to documenting all game projects, starting with a minimal overview and building up details incrementally.

**Context:** We have 11 game projects as submodules and need a central README that helps with collaboration. The current README was created with all details upfront, but we want to start thin and build up systematically.

**Desired Outcome:** 
- Central games directory README that enables easy collaboration
- Complete understanding of each project's status, AI integration, and unique features
- Logical organization based on actual project characteristics

## Plan 📋

### Phase 1: Create Minimal README ⭐ (Current Focus)
- Replace current detailed README with minimal version
- Include only: project names + relative links  
- No categories, no details, no status - just the foundation
- Document: Simple list format for easy scanning

### Phase 2: Systematic Research & Documentation
- **First:** Survey itch.io to identify which games are already published
- Go through each game project one by one in order
- For each project, research and document:
  - Current status (published, active dev, MVP complete, experimental)
  - AI integration details (none, planned, active - which APIs/services)
  - Core summary (1-2 sentences about what the game is)
  - Unique mechanics/innovations (what makes it special or experimental)
- Add details to README incrementally as we research each project

### Phase 3: itch.io API Integration
- Research itch.io API to see if we can programmatically retrieve published game listings
- If API is available, create a script in `/bin` that Claude can use during collaboration sessions
- Script should fetch current publication status and metadata (download counts, ratings, etc.)
- This enables Claude to verify/update documentation with current itch.io data during our sessions

### Phase 4: Organization & Categories  
- Once all project details are complete, analyze patterns
- Create logical groupings based on actual data collected
- Reorganize README with meaningful categories
- Consider additional organizational schemes (by technology, by status, by theme)

## Implementation Progress 🚀

### Phase 1 Status: ✅ Complete
- [x] Replace current README with minimal version
- [x] Test that all relative links work correctly
- [x] Commit minimal README as baseline

### Phase 2 Status: ✅ Complete
**itch.io Survey Complete:** ✅ 5 games published:
- RaceOn: https://rranshous.itch.io/raceon
- DarkHall: https://rranshous.itch.io/darkhall
- stacksonstacks: https://rranshous.itch.io/stacksonstacks
- Wallverine: https://rranshous.itch.io/wallver
- Dinosaur Dance Extravaganza: https://rranshous.itch.io/dinosaur-dance-extravaganza

**Research Complete:** ✅ All 11 projects documented
**Completed:** raceon ✅, darkhall ✅, sparkly-sim ✅, diplomatic-waters ✅, world-weaver ✅, wallverine ✅, stacksonstacks ✅, dinosaur-dance ✅, all-around-you ✅, ai-orchestration-game ✅, sacred-scribe ✅

### Phase 3 Status: ✅ Complete
- [x] Research itch.io API documentation and capabilities
- [x] Create script in `/bin` that Claude can use during collaboration sessions
- [x] Set up .env support and .gitignore for API keys
- [x] Run script to fetch current publication status and metadata
- [x] Update games README with current itch.io data
- [x] Mark Phase 3 complete

### Research Order for Phase 2:
1. raceon
2. darkhall  
3. sparkly-sim
4. diplomatic-waters
5. world-weaver
6. wallverine
7. stacksonstacks
8. dinosaur-dance
9. all-around-you
10. ai-orchestration-game
11. hard-find-metatrial/sacred-scribe

## Notes & Decisions

- **Why start minimal?** Avoids assumptions and ensures we base organization on actual project characteristics
- **Why document one-by-one?** Ensures thorough understanding and prevents overlooking details
- **Why IPI approach?** Provides clear structure and allows for course correction at each phase

## Next Steps

1. Execute Phase 1: Create minimal README
2. Begin systematic research starting with `raceon`
3. Document findings and build up README incrementally
