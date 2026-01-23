#!/usr/bin/env node

/**
 * Vanilla Platform Game Uploader
 *
 * Command line tool to upload games to the Vanilla platform.
 * Supports ZIP files and handles authentication automatically.
 *
 * Usage:
 *   node upload-game.js [options] <zip-file>
 *
 * Options:
 *   -n, --name <name>        Game name (defaults to filename)
 *   -u, --url <url>          Platform URL (default: http://localhost:3000)
 *   --username <username>    Admin username (default: admin)
 *   --password <password>    Admin password (default: admin123)
 *   -h, --help               Show this help
 *
 * Environment variables:
 *   VANILLA_URL              Platform URL
 *   VANILLA_USERNAME         Admin username
 *   VANILLA_PASSWORD         Admin password
 *
 * Examples:
 *   node upload-game.js my-game.zip
 *   node upload-game.js -n "My Awesome Game" my-game.zip
 *   node upload-game.js --url https://my-platform.com my-game.zip
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    name: null,
    url: process.env.VANILLA_URL || 'http://localhost:3000',
    username: process.env.VANILLA_USERNAME || 'admin',
    password: process.env.VANILLA_PASSWORD || 'admin123',
    zipFile: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-n':
      case '--name':
        options.name = args[++i];
        break;
      case '-u':
      case '--url':
        options.url = args[++i];
        break;
      case '--username':
        options.username = args[++i];
        break;
      case '--password':
        options.password = args[++i];
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
      default:
        if (!options.zipFile && arg.endsWith('.zip')) {
          options.zipFile = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          showHelp();
          process.exit(1);
        }
    }
  }

  if (!options.zipFile) {
    console.error('Error: No ZIP file specified');
    showHelp();
    process.exit(1);
  }

  if (!fs.existsSync(options.zipFile)) {
    console.error(`Error: ZIP file not found: ${options.zipFile}`);
    process.exit(1);
  }

  // Default name to filename without extension
  if (!options.name) {
    options.name = path.basename(options.zipFile, '.zip');
  }

  return options;
}

function showHelp() {
  console.log(`
Vanilla Platform Game Uploader

Usage:
  node upload-game.js [options] <zip-file>

Options:
  -n, --name <name>        Game name (defaults to filename)
  -u, --url <url>          Platform URL (default: http://localhost:3000)
  --username <username>    Admin username (default: admin)
  --password <password>    Admin password (default: admin123)
  -h, --help               Show this help

Environment variables:
  VANILLA_URL              Platform URL
  VANILLA_USERNAME         Admin username
  VANILLA_PASSWORD         Admin password

Examples:
  node upload-game.js my-game.zip
  node upload-game.js -n "My Awesome Game" my-game.zip
  node upload-game.js --url https://my-platform.com my-game.zip
`);
}

// Make HTTP request with promise
function makeRequest(url, options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

// Login and get session cookie
async function login(baseUrl, username, password) {
  console.log(`🔐 Logging in as ${username}...`);

  const loginUrl = `${baseUrl}/auth/login`;
  const loginData = JSON.stringify({
    username: username,
    password: password
  });

  const response = await makeRequest(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  }, loginData);

  if (response.statusCode !== 200 || !response.body.success) {
    throw new Error(`Login failed: ${response.body?.error || 'Unknown error'}`);
  }

  // Extract session cookie
  const setCookie = response.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('No session cookie received');
  }

  const sessionCookie = setCookie.find(cookie => cookie.startsWith('connect.sid='));
  if (!sessionCookie) {
    throw new Error('Session cookie not found');
  }

  console.log('✅ Login successful');
  return sessionCookie;
}

// Upload game ZIP file
async function uploadGame(baseUrl, sessionCookie, gameName, zipFilePath) {
  console.log(`📤 Uploading ${gameName}...`);

  const uploadUrl = `${baseUrl}/api/games`;

  // Create multipart form data
  const boundary = `----FormBoundary${Date.now()}`;
  const fileName = path.basename(zipFilePath);
  const fileData = fs.readFileSync(zipFilePath);

  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="name"\r\n\r\n`;
  body += `${gameName}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="game"; filename="${fileName}"\r\n`;
  body += `Content-Type: application/zip\r\n\r\n`;

  const bodyStart = Buffer.from(body, 'utf8');
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const requestBody = Buffer.concat([bodyStart, fileData, bodyEnd]);

  const response = await makeRequest(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Cookie': sessionCookie,
      'Content-Length': requestBody.length
    }
  }, requestBody);

  if (response.statusCode !== 200) {
    throw new Error(`Upload failed: ${response.body?.error || response.statusCode}`);
  }

  console.log('✅ Upload successful');
  return response.body.game;
}

// Main function
async function main() {
  try {
    const options = parseArgs();

    console.log(`🎮 Vanilla Game Uploader`);
    console.log(`📁 File: ${options.zipFile}`);
    console.log(`🎯 Name: ${options.name}`);
    console.log(`🌐 URL: ${options.url}`);
    console.log('');

    // Login
    const sessionCookie = await login(options.url, options.username, options.password);

    // Upload game
    const game = await uploadGame(options.url, sessionCookie, options.name, options.zipFile);

    console.log('');
    console.log('🎉 Game uploaded successfully!');
    console.log(`📋 Game ID: ${game.id}`);
    console.log(`📅 Uploaded: ${game.uploadDate}`);
    console.log(`🎮 Play at: ${options.url}/games/${game.id}/`);

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { uploadGame, login };