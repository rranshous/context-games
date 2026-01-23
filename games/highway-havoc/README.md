# Highway Havoc

A cooperative 2-player HTML5 game where you and a friend battle through an endless highway filled with enemies and obstacles.

## How to Play

**Player 1 (Driver):** Use left stick to steer the vehicle and stay on the road. Dodge mines, barriers, and other obstacles.

**Player 2 (Gunner):** Use right stick to aim the turret and trigger to shoot enemies.

Work together to survive as long as possible and rack up the highest score!

## Controls

- **Player 1:** Left stick - Steer vehicle
- **Player 2:** Right stick - Aim turret, Trigger - Shoot

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
- Vite for development and building