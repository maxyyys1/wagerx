"use strict";

/*
  Reset a WagerX account password.

  Usage:
    npm run reset-password -- <username> <new-password>
    node reset-password.js <username> <new-password>

  This edits data.json in place and signs out every existing session for
  that account. It is meant for the machine that runs the WagerX server.
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const [username, newPassword] = process.argv.slice(2);
const dataFile = path.join(__dirname, "data.json");

if (!username || !newPassword) {
  console.error("Usage: node reset-password.js <username> <new-password>");
  process.exit(1);
}
if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) {
  console.error("Username must be 3-18 characters: letters, numbers or underscore.");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
if (!fs.existsSync(dataFile)) {
  console.error("No data.json found. Start the WagerX server once first.");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
} catch (err) {
  console.error("data.json is not valid JSON:", err.message);
  process.exit(1);
}

const key = Object.keys(data.users || {}).find(
  (id) => String(data.users[id].usernameLower || "").toLowerCase() === username.toLowerCase()
);
if (!key) {
  console.error(`No account named "${username}".`);
  process.exit(1);
}

const user = data.users[key];
const salt = crypto.randomBytes(16).toString("hex");
user.salt = salt;
user.passwordHash = crypto.scryptSync(newPassword, salt, 64).toString("hex");

let removed = 0;
for (const [sessionKey, session] of Object.entries(data.sessions || {})) {
  if (session.userId === user.id) {
    delete data.sessions[sessionKey];
    removed++;
  }
}

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
console.log(`Password reset for ${user.username}. ${removed} session(s) signed out.`);
