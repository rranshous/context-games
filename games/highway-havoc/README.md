# Highway Havoc

A cooperative 2-player HTML5 game where you and a friend battle through an endless highway filled with enemies and obstacles.

## How to Play

**Player 1 (Driver):** Use left stick to steer the vehicle and stay on the road. Dodge mines, barriers, and other obstacles while collecting power-ups.

**Player 2 (Gunner):** Use right stick to aim the turret and trigger to shoot enemies. Destroy enemy vehicles and obstacles to rack up points.

Work together to survive as long as possible and achieve the highest score!

## Controls

- **Player 1:** Left stick - Steer vehicle
- **Player 2:** Right stick - Aim turret, Trigger - Shoot

## Features

- **Cooperative Gameplay:** Two players work together - one drives, one shoots
- **Endless Highway:** Procedurally generated road with increasing difficulty
- **Power-ups:** Collect health, speed boosts, damage multipliers, and armor upgrades
- **Obstacles:** Avoid mines, barriers, and potholes that damage your vehicle
- **Enemies:** AI-controlled enemy vehicles that spawn from all directions
- **Scoring System:** Points for destroying enemies, collecting pickups, and surviving
- **High Score:** Persistent high score saved locally

## Development

```bash
npm install
npm run dev
```

## Build for Distribution

```bash
npm run build:itch
```

This creates a ZIP file in the `releases/` folder ready for itch.io upload.

## Tech

- TypeScript + Canvas
- Gamepad API for controller support
- Local storage for high scores
- Vite for development and building