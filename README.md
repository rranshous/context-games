# Games Context

This is a repo which is the top level context for my game making efforts

## Repo organization

All game projects have their own directory in `/games/`

Game platforms (hosting infrastructure) are in `/platforms/`

Game projects may be submodules so that they can have their own repo to be published to.

## Game Projects

Each game project will have a README.md file which describes the game and how to play it.

If the game has been published to itch.io the README.md file should contain a link to the game on itch.

## Platforms

### [Vanilla Platform](./platforms/vanilla/)
A simple HTML5 game hosting platform with AI inference capabilities. Features:
- Game browsing and hosting
- User authentication
- AI inference proxy (Anthropic/Ollama) - games can use AI without exposing API keys
- Dev mode for game development (`/dev/game-name/`)
- Admin dashboard for user and game management

## Technical Guidelines

For new games we're probably going to use: HTML5, Canvas, Typescript with a publication target of itch.io

No more than one backend server per game project.

Be sure to always judiciously add gitignore files

## Documentation

- [`/games/README.md`](./games/README.md) - Complete overview of all game projects with current status
- [`/platforms/vanilla/README.md`](./platforms/vanilla/README.md) - Vanilla platform documentation
- [`/platforms/vanilla/docs/game-making-guide.md`](./platforms/vanilla/docs/game-making-guide.md) - Guide for building games for the platform
- [`/docs/collaboration-guide.md`](./docs/collaboration-guide.md) - Guide for AI assistants and collaborators
- [`/docs/development-patterns.md`](./docs/development-patterns.md) - Preferred coding patterns and architectures
- [`/docs/technical-setup.md`](./docs/technical-setup.md) - Environment setup and development workflows