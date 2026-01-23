#!/usr/bin/env node

/**
 * Game Deployment Template
 *
 * Copy this file to your game's root directory and customize for your project.
 * This template shows how to integrate the Vanilla platform uploader into your build process.
 *
 * Usage:
 *   node deploy.js [environment]
 *
 * Environments:
 *   dev     - Deploy to local development platform
 *   prod    - Deploy to production platform
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration for different environments
const environments = {
  dev: {
    url: 'http://localhost:3000',
    username: 'admin',
    password: 'admin123'
  },
  prod: {
    url: process.env.VANILLA_PROD_URL || 'https://your-platform.com',
    username: process.env.VANILLA_PROD_USERNAME || 'deploy',
    password: process.env.VANILLA_PROD_PASSWORD || 'your-secret-password'
  }
};

// Get package info
function getPackageInfo() {
  const packagePath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error('package.json not found in current directory');
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return {
    name: pkg.name,
    version: pkg.version,
    displayName: pkg.displayName || pkg.name
  };
}

// Build your game (customize this for your build process)
function buildGame() {
  console.log('🔨 Building game...');

  // Example: Run your build command
  // execSync('npm run build', { stdio: 'inherit' });

  // For simple HTML games, just ensure index.html exists
  const indexPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('index.html not found. Build your game first.');
  }

  console.log('✅ Build complete');
}

// Create ZIP file
function createZip(version) {
  console.log('📦 Creating ZIP file...');

  const zipName = `${getPackageInfo().name}-v${version}.zip`;
  const zipPath = path.join(__dirname, 'dist', zipName);

  // Ensure dist directory exists
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

  // Copy index.html to dist and zip it
  const indexPath = path.join(__dirname, 'index.html');
  const tempIndexPath = path.join(__dirname, 'dist', 'index.html');
  fs.copyFileSync(indexPath, tempIndexPath);

  // Create ZIP (you might want to use a library like adm-zip for more complex zipping)
  execSync(`cd dist && zip ${zipName} index.html`, { stdio: 'inherit' });

  // Clean up temp file
  fs.unlinkSync(tempIndexPath);

  console.log(`✅ Created ${zipPath}`);
  return zipPath;
}

// Upload to Vanilla platform
function uploadGame(zipPath, gameName, env) {
  console.log(`🚀 Uploading to ${env} platform...`);

  const config = environments[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}`);
  }

  const uploadCommand = `node ${path.join(__dirname, '../../bin/upload-game.js')} \\
    --url "${config.url}" \\
    --username "${config.username}" \\
    --password "${config.password}" \\
    -n "${gameName}" \\
    "${zipPath}"`;

  execSync(uploadCommand, { stdio: 'inherit' });
}

// Main deployment function
function deploy(environment = 'dev') {
  try {
    console.log('🎮 Game Deployment Starting\n');

    const pkg = getPackageInfo();
    const gameName = `${pkg.displayName} v${pkg.version}`;

    console.log(`📋 Game: ${gameName}`);
    console.log(`🌍 Environment: ${environment}\n`);

    // Build the game
    buildGame();

    // Create ZIP
    const zipPath = createZip(pkg.version);

    // Upload to platform
    uploadGame(zipPath, gameName, environment);

    console.log('\n🎉 Deployment successful!');
    console.log(`🎮 Your game is now live on the ${environment} platform`);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// CLI interface
const env = process.argv[2] || 'dev';
if (env === '--help' || env === '-h') {
  console.log(`
Game Deployment Tool

Usage:
  node deploy.js [environment]

Environments:
  dev     - Deploy to local development platform (default)
  prod    - Deploy to production platform

Environment Variables for Production:
  VANILLA_PROD_URL         - Production platform URL
  VANILLA_PROD_USERNAME    - Production admin username
  VANILLA_PROD_PASSWORD    - Production admin password

Examples:
  node deploy.js              # Deploy to dev
  node deploy.js prod         # Deploy to production
  VANILLA_PROD_URL=https://games.example.com node deploy.js prod
`);
  process.exit(0);
}

deploy(env);