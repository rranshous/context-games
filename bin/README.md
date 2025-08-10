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
