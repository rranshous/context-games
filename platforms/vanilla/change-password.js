#!/usr/bin/env node

/**
 * Vanilla Platform Password Changer
 *
 * Command line tool to change user passwords in the Vanilla platform database.
 *
 * Usage:
 *   node change-password.js <username> <new-password>
 *
 * Examples:
 *   node change-password.js admin mynewpassword123
 */

const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function changePassword(username, newPassword) {
  const dbPath = path.join(__dirname, 'vanilla.db');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(new Error(`Failed to open database: ${err.message}`));
        return;
      }
    });

    // Hash the new password
    bcrypt.hash(newPassword, 10, (hashErr, passwordHash) => {
      if (hashErr) {
        db.close();
        reject(new Error(`Failed to hash password: ${hashErr.message}`));
        return;
      }

      // Update the user's password
      const sql = `
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE username = ?
      `;

      const now = new Date().toISOString();

      db.run(sql, [passwordHash, now, username], function(err) {
        if (err) {
          db.close();
          reject(new Error(`Failed to update password: ${err.message}`));
          return;
        }

        if (this.changes === 0) {
          db.close();
          reject(new Error(`User '${username}' not found`));
          return;
        }

        console.log(`✅ Password changed successfully for user: ${username}`);
        db.close();
        resolve();
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('Usage: node change-password.js <username> <new-password>');
    console.error('');
    console.error('Examples:');
    console.error('  node change-password.js admin mynewpassword123');
    console.error('  node change-password.js testuser secretpass');
    process.exit(1);
  }

  const [username, newPassword] = args;

  if (newPassword.length < 6) {
    console.error('Error: Password must be at least 6 characters long');
    process.exit(1);
  }

  try {
    await changePassword(username, newPassword);
    console.log('');
    console.log('🔐 Password change complete!');
    console.log(`   Username: ${username}`);
    console.log('   You can now login with the new password.');
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

module.exports = { changePassword };