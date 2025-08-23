# RitSim

AI-driven ritual simulator exploring inference-driven game design.

## Development

```bash
# Install dependencies
npm install

# Start development (requires both server and client)
npm run dev

# Or run separately:
npm run server:dev  # Express server with nodemon
npm run client:dev  # Vite dev server

# Build for production
npm run build

# Run production server
npm start
```

## Architecture

- **Frontend**: Vite + TypeScript + HTML5 Canvas
- **Backend**: Express.js serving static files + AI proxy
- **AI**: Claude 3.5 Sonnet via Anthropic SDK

## Current Status

✅ **Milestone 1**: Backend Foundation & Static Serving  
🎯 Next: **Milestone 2**: Canvas Rendering & Asset Loading

## Development Notes

The server runs on port 3000 by default. Vite dev server runs on 5173 during development for hot reload.

For production, only the Express server runs, serving the built static files from the `dist` directory.
