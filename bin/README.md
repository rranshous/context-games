# Bin Directory

This directory contains utility scripts for maintaining the games documentation.

## Scripts

### `fetch-itch-games.js`

Fetches published games from the itch.io API for documentation updates.

**Usage:**
```bash
# With API key as argument
node bin/fetch-itch-games.js YOUR_API_KEY

# With environment variable
export ITCH_API_KEY="your_api_key_here"
node bin/fetch-itch-games.js
```

**Setup:**
1. Get your API key from [itch.io API keys page](https://itch.io/api-keys)
2. Run the script to get current publication status and metadata

**Output:**
- Detailed game information (downloads, views, earnings)
- Summary list formatted for easy copy/paste into documentation
- Games sorted by publication date (newest first)

**Note:** This script is designed for Claude to use during collaboration sessions to verify and update game documentation with current itch.io data.

### `upload-game.js`

Command line tool to upload games to the Vanilla platform programmatically.

**Usage:**
```bash
# Basic upload with default settings
node bin/upload-game.js my-game.zip

# Upload with custom name
node bin/upload-game.js -n "My Awesome Game" my-game.zip

# Upload to remote platform
node bin/upload-game.js --url https://my-platform.com my-game.zip

# Upload with custom credentials
node bin/upload-game.js --username admin --password secret my-game.zip
```

**Options:**
- `-n, --name <name>`: Game name (defaults to filename without .zip)
- `-u, --url <url>`: Platform URL (default: http://localhost:3000)
- `--username <username>`: Admin username (default: admin)
- `--password <password>`: Admin password (default: admin123)

**Environment Variables:**
- `VANILLA_URL`: Platform URL
- `VANILLA_USERNAME`: Admin username  
- `VANILLA_PASSWORD`: Admin password

**Examples:**
```bash
# Upload to local development platform
node bin/upload-game.js dist/my-game.zip

# Upload to production with environment variables
export VANILLA_URL="https://games.example.com"
export VANILLA_USERNAME="deploy"
export VANILLA_PASSWORD="secret123"
node bin/upload-game.js -n "Production Game" my-game.zip
```

**Note:** This tool handles authentication automatically and can be integrated into CI/CD pipelines or build scripts for automated game deployment.

### `deploy-template.js`

Template script for integrating game deployment into your project's build process.

**Usage:**
```bash
# Copy to your game directory
cp bin/deploy-template.js games/your-game/deploy.js

# Customize for your game (edit buildGame(), createZip(), etc.)
# Then deploy:
node deploy.js dev    # Deploy to local platform
node deploy.js prod   # Deploy to production platform
```

**Features:**
- Environment-based configuration (dev/prod)
- Automatic ZIP creation
- Version-aware naming
- Error handling and logging
- Environment variable support for credentials

**Setup:**
1. Copy `deploy-template.js` to your game directory
2. Customize the `buildGame()` and `createZip()` functions for your build process
3. Set production environment variables:
   ```bash
   export VANILLA_PROD_URL="https://your-platform.com"
   export VANILLA_PROD_USERNAME="deploy-user"
   export VANILLA_PROD_PASSWORD="secret"
   ```
4. Run `node deploy.js prod` to deploy

### `change-password.js`

Command line tool to change user passwords in the Vanilla platform database.

**Usage:**
```bash
# Change admin password
node bin/change-password.js admin newpassword123

# Change any user's password
node bin/change-password.js username newpassword123
```

**Requirements:**
- The Vanilla platform must be stopped (not running) when changing passwords
- Passwords must be at least 6 characters long
- Run from the project root directory

**Examples:**
```bash
# Change default admin password
node bin/change-password.js admin mysecurepassword

# Change a regular user's password
node bin/change-password.js player1 newplayerpass
```

**Security Notes:**
- Passwords are hashed using bcrypt before storage
- The script updates the database directly
- Make sure to restart the platform after changing passwords
