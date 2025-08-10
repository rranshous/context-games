#!/usr/bin/env node

/**
 * itch.io API Game Fetcher
 * 
 * Fetches published games from itch.io API for documentation updates.
 * Usage: node fetch-itch-games.js [API_KEY]
 * 
 * Configuration (in order of precedence):
 * 1. Command line argument: node fetch-itch-games.js YOUR_API_KEY
 * 2. .env file: ITCH_API_KEY=your_key
 * 3. Environment variable: ITCH_API_KEY
 * 
 * Get your API key from: https://itch.io/api-keys
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple .env file loader (avoiding external dependencies)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load .env file before processing
loadEnv();

function fetchItchGames(apiKey) {
  if (!apiKey) {
    console.error('Error: No API key provided.');
    console.error('Usage: node fetch-itch-games.js [API_KEY]');
    console.error('Or set ITCH_API_KEY in .env file or environment variable');
    console.error('Get your API key from: https://itch.io/api-keys');
    process.exit(1);
  }

  const url = `https://itch.io/api/1/${apiKey}/my-games`;
  
  console.log('Fetching games from itch.io API...\n');
  
  https.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        
        if (response.errors) {
          console.error('API Error:', response.errors.join(', '));
          process.exit(1);
        }
        
        if (!response.games || response.games.length === 0) {
          console.log('No games found.');
          return;
        }
        
        console.log(`Found ${response.games.length} games:\n`);
        
        // Sort games by publication date (newest first)
        const sortedGames = response.games
          .filter(game => game.published)
          .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
        
        sortedGames.forEach((game, index) => {
          console.log(`${index + 1}. ${game.title}`);
          console.log(`   URL: ${game.url}`);
          console.log(`   Published: ${game.published_at}`);
          console.log(`   Downloads: ${game.downloads_count || 0}`);
          console.log(`   Views: ${game.views_count || 0}`);
          console.log(`   Price: $${(game.min_price / 100).toFixed(2)}`);
          console.log(`   Platforms: ${getPlatforms(game)}`);
          if (game.short_text) {
            console.log(`   Description: ${game.short_text.substring(0, 100)}${game.short_text.length > 100 ? '...' : ''}`);
          }
          if (game.earnings && game.earnings.length > 0) {
            console.log(`   Earnings: ${game.earnings[0].amount_formatted}`);
          }
          console.log('');
        });
        
        // Summary
        console.log('='.repeat(50));
        console.log('SUMMARY FOR DOCUMENTATION:');
        console.log('='.repeat(50));
        sortedGames.forEach(game => {
          console.log(`✅ ${game.title}: ${game.url}`);
        });
        
      } catch (error) {
        console.error('Error parsing JSON response:', error.message);
        console.error('Raw response:', data);
      }
    });
    
  }).on('error', (error) => {
    console.error('HTTP request error:', error.message);
  });
}

function getPlatforms(game) {
  const platforms = [];
  if (game.p_windows) platforms.push('Windows');
  if (game.p_osx) platforms.push('macOS');
  if (game.p_linux) platforms.push('Linux');
  if (game.p_android) platforms.push('Android');
  return platforms.length > 0 ? platforms.join(', ') : 'Browser';
}

// Get API key from command line argument or environment variable
const apiKey = process.argv[2] || process.env.ITCH_API_KEY;
fetchItchGames(apiKey);
