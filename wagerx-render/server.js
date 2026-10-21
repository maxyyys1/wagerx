"use strict";

/*
  WagerX social server
  - Serves the static site at /wagerx/
  - Provides signup/login, chat, and leaderboard APIs
  - Zero npm dependencies; data lives in data.json or an optional Upstash Redis key

  Run:
    node server.js
    # or: npm start

  Environment:
    PORT=4173
    HOST=127.0.0.1
    BASE_PATH=/wagerx
    DATA_FILE=./data.json
    UPSTASH_REDIS_REST_URL=...
    UPSTASH_REDIS_REST_TOKEN=...
    WAGERX_DATA_KEY=wagerx:data
    WAGERX_ADMIN_USERNAMES=WagerX
*/

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const BASE_PATH = (process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : "/wagerx").replace(/\/+$/, "");
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(ROOT, "data.json");

// Optional free persistent storage. When both values are set, the whole data
// object is stored in one Upstash Redis key instead of data.json.
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim().replace(/\/+$/, "");
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
const UPSTASH_KEY = process.env.WAGERX_DATA_KEY || "wagerx:data";
const REMOTE_STORAGE = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const SESSION_COOKIE = "wagerx_sid";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 32 * 1024;

// Only these account usernames can open the admin panel or call admin APIs.
// Set WAGERX_ADMIN_USERNAMES to a comma-separated list in production.
const ADMIN_USERNAMES = new Set(
  String(process.env.WAGERX_ADMIN_USERNAMES || "WagerX")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
);

const USERNAME_RE = /^[A-Za-z0-9_]{3,18}$/;
const COLORS = ["#c4b5fd", "#c8ff3d", "#ff9f43", "#3de0ff", "#ff7ba8", "#fbbf24", "#b69bff", "#86efac"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

class ApiError extends Error {
  constructor(status, message, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function now() {
  return Date.now();
}

function clampNumber(value, max = 1e12) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n * 100) / 100);
}

function levelFor(wagered) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(wagered) || 0) / 200)) + 1);
}

function colorFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function defaultData() {
  return {
    version: 1,
    createdAt: now(),
    seq: 0,
    users: {},
    sessions: {},
    messages: [],
    announcement: null,
    adminLog: [],
  };
}

function normalizeData(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("invalid data file");
  parsed.users = parsed.users && typeof parsed.users === "object" ? parsed.users : {};
  parsed.sessions = parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
  parsed.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  parsed.seq = Number.isFinite(parsed.seq)
    ? parsed.seq
    : parsed.messages.reduce((max, message) => Math.max(max, Number(message.seq) || 0), 0);
  parsed.announcement =
    parsed.announcement &&
    typeof parsed.announcement === "object" &&
    parsed.announcement.id &&
    typeof parsed.announcement.text === "string" &&
    parsed.announcement.text.trim()
      ? {
          id: String(parsed.announcement.id),
          text: parsed.announcement.text.trim().slice(0, 300),
          createdAt: Number(parsed.announcement.createdAt) || now(),
          author: String(parsed.announcement.author || "WagerX").slice(0, 18),
        }
      : null;
  parsed.adminLog = Array.isArray(parsed.adminLog) ? parsed.adminLog.slice(-200) : [];
  for (const [id, user] of Object.entries(parsed.users)) {
    if (!user || typeof user !== "object") {
      delete parsed.users[id];
      continue;
    }
    user.balanceRevision = Number.isFinite(Number(user.balanceRevision))
      ? Math.max(0, Math.floor(Number(user.balanceRevision)))
      : 0;
    if (user.lastGift && typeof user.lastGift !== "object") delete user.lastGift;
  }
  return parsed;
}

function loadFileData() {
  try {
    return normalizeData(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Could not read data.json; starting a fresh floor.", err.message);
      try {
        fs.copyFileSync(DATA_FILE, `${DATA_FILE}.bak`);
      } catch (copyErr) {
        /* ignore */
      }
    }
    return defaultData();
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadRemoteData() {
  const res = await fetchWithTimeout(`${UPSTASH_URL}/get/${encodeURIComponent(UPSTASH_KEY)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET failed (${res.status})`);
  const payload = await res.json();
  if (payload.error) throw new Error(payload.error);
  if (payload.result == null || payload.result === "") {
    // One-time safety net: if this host still has the old file-based data,
    // import it instead of starting with an empty floor.
    const legacy = loadFileData();
    if (Object.keys(legacy.users || {}).length || (legacy.messages || []).length) {
      console.log("Upstash is empty; importing existing data.json.");
      return legacy;
    }
    return defaultData();
  }
  const parsed = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
  return normalizeData(parsed);
}

async function loadData() {
  if (!REMOTE_STORAGE) return loadFileData();
  return loadRemoteData();
}

function removeDemoData(target) {
  let changed = false;
  for (const [id, user] of Object.entries(target.users)) {
    if (user && (user.seed || id.startsWith("demo_"))) {
      delete target.users[id];
      changed = true;
    }
  }
  const before = target.messages.length;
  target.messages = target.messages.filter((message) => !String(message.userId || "").startsWith("demo_"));
  return changed || target.messages.length !== before;
}

let data = defaultData();
let remoteDirty = false;
let remoteSaving = false;
let remoteRetryAt = 0;

function writeLocalData() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Could not save data.json:", err.message);
  }
}

function saveData() {
  if (REMOTE_STORAGE) {
    remoteDirty = true;
    return;
  }
  writeLocalData();
}

async function flushRemoteSave() {
  if (!REMOTE_STORAGE || remoteSaving || !remoteDirty || Date.now() < remoteRetryAt) return;
  remoteSaving = true;
  try {
    while (remoteDirty) {
      remoteDirty = false;
      const body = JSON.stringify(data);
      const res = await fetchWithTimeout(`${UPSTASH_URL}/set/${encodeURIComponent(UPSTASH_KEY)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!res.ok) throw new Error(`Upstash SET failed (${res.status})`);
      const payload = await res.json().catch(() => ({}));
      if (payload.error) throw new Error(payload.error);
    }
    remoteRetryAt = 0;
  } catch (err) {
    remoteDirty = true;
    remoteRetryAt = Date.now() + 5000;
    console.error("Could not save data to Upstash:", err.message);
  } finally {
    remoteSaving = false;
  }
}

if (REMOTE_STORAGE) {
  // Batch writes so a busy table does not burn through the free Upstash
  // command allowance. Graceful shutdown flushes immediately.
  const timer = setInterval(() => {
    void flushRemoteSave();
  }, 3000);
  if (timer.unref) timer.unref();
}

function isAdmin(user) {
  return Boolean(
    user && ADMIN_USERNAMES.has(String(user.usernameLower || user.username || "").trim().toLowerCase())
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    color: user.color,
    createdAt: user.createdAt,
    balance: user.balance,
    wagered: user.wagered,
    won: user.won,
    rounds: user.rounds,
    bestWin: user.bestWin,
    level: levelFor(user.wagered),
    discordClaimed: !!user.discordClaimed,
  };
}

function selfUser(user) {
  return {
    ...publicUser(user),
    admin: isAdmin(user),
    balanceRevision: Number(user.balanceRevision) || 0,
    lastGift: user.lastGift || null,
  };
}

function publicAnnouncement(announcement) {
  if (!announcement || !announcement.id || !announcement.text) return null;
  return {
    id: announcement.id,
    text: announcement.text,
    createdAt: announcement.createdAt,
    author: announcement.author || "WagerX",
  };
}

function logAdminAction(admin, type, details = {}) {
  data.adminLog.push({
    id: newId("al"),
    at: now(),
    type,
    adminId: admin.id,
    adminUsername: admin.username,
    ...details,
  });
  if (data.adminLog.length > 200) data.adminLog = data.adminLog.slice(-200);
}

function requireAdmin(req) {
  const found = requireUser(req);
  if (!isAdmin(found.user)) throw new ApiError(403, "Admin access only.");
  return found;
}

function findUserByName(username) {
  const lower = String(username || "").trim().toLowerCase();
  return Object.values(data.users).find(
    (user) => String(user.usernameLower || user.username || "").trim().toLowerCase() === lower
  );
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function currentSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || token.length < 20) return null;
  const key = hashToken(token);
  const session = data.sessions[key];
  if (!session) return null;
  if (session.expiresAt <= now()) {
    delete data.sessions[key];
    return null;
  }
  const user = data.users[session.userId];
  if (!user) {
    delete data.sessions[key];
    return null;
  }
  if (now() - (session.lastSeen || 0) > 60 * 1000) {
    session.lastSeen = now();
  }
  return { key, session, user };
}

function requireUser(req) {
  const found = currentSession(req);
  if (!found) throw new ApiError(401, "Sign in to continue.");
  return found;
}

function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const key = hashToken(token);
  const session = {
    userId: user.id,
    createdAt: now(),
    lastSeen: now(),
    expiresAt: now() + SESSION_TTL,
    ip: req.socket.remoteAddress || "",
  };
  data.sessions[key] = session;
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL / 1000
    )}${secure}`
  );
  return session;
}

function clearSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) delete data.sessions[hashToken(token)];
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${
      req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""
    }`
  );
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function passwordMatches(password, user) {
  if (!user.salt || !user.passwordHash) return false;
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function validateUsername(username) {
  if (!USERNAME_RE.test(username)) {
    throw new ApiError(400, "Username must be 3-18 characters: letters, numbers or underscore.");
  }
  if (findUserByName(username)) {
    throw new ApiError(409, "That username already has an account. Use Log in instead.", "ACCOUNT_EXISTS");
  }
  return username;
}

function applyStats(user, stats) {
  if (!stats || typeof stats !== "object") return;
  const currentRevision = Number(user.balanceRevision) || 0;
  const incomingRevision = Number.isFinite(Number(stats.balanceRevision)) ? Number(stats.balanceRevision) : 0;
  const clientBalance = clampNumber(stats.balance, 1e9);
  if (incomingRevision >= currentRevision) {
    // The client has seen the latest admin gift (or this is a fresh account).
    user.balance = clientBalance;
  } else if (Number.isFinite(Number(stats.balanceBase))) {
    // A gift landed while this client was playing. Keep the gift and apply only
    // the player's balance change since their last known server balance.
    const base = clampNumber(stats.balanceBase, 1e9);
    user.balance = clampNumber(user.balance + (clientBalance - base), 1e9);
  }
  user.wagered = clampNumber(stats.wagered, 1e12);
  user.won = clampNumber(stats.won, 1e12);
  user.rounds = Math.floor(clampNumber(stats.rounds, 1e9));
  user.bestWin = clampNumber(stats.bestWin, 1e9);
  if (stats.discordClaimed === true) user.discordClaimed = true;
}

function messageFor(message) {
  const user = data.users[message.userId];
  const username = user ? user.username : message.usernameAtSend || "deleted";
  const color = user ? user.color : "#8a8a9a";
  return {
    id: message.id,
    seq: message.seq,
    userId: message.userId,
    username,
    color,
    text: message.text,
    createdAt: message.createdAt,
  };
}

function onlineCount() {
  const cutoff = now() - 5 * 60 * 1000;
  return Object.values(data.sessions).filter((session) => session.expiresAt > now() && session.lastSeen > cutoff).length;
}

function leaderboardPlayers(sort) {
  const players = Object.values(data.users).map((user) => {
    const row = publicUser(user);
    row.net = Math.round((row.won - row.wagered) * 100) / 100;
    return row;
  });
  const sorters = {
    balance: (a, b) => b.balance - a.balance || b.wagered - a.wagered,
    wagered: (a, b) => b.wagered - a.wagered || b.balance - a.balance,
    best: (a, b) => b.bestWin - a.bestWin || b.balance - a.balance,
    net: (a, b) => b.net - a.net || b.balance - a.balance,
  };
  players.sort(sorters[sort] || sorters.balance);
  players.forEach((player, index) => {
    player.rank = index + 1;
  });
  return players.slice(0, 100);
}

const authAttempts = new Map();
const chatAttempts = new Map();
const adminAttempts = new Map();

function rateLimit(map, key, max, windowMs) {
  const timestamp = now();
  const list = (map.get(key) || []).filter((time) => timestamp - time < windowMs);
  if (list.length >= max) {
    map.set(key, list);
    return false;
  }
  list.push(timestamp);
  map.set(key, list);
  return true;
}

function clientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "local"
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        settled = true;
        reject(new ApiError(413, "Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new ApiError(400, "Invalid JSON body."));
      }
    });
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function sendJson(res, status, payload) {
  const body = payload === null || status === 204 ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
  });
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(String(text));
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method;

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      name: "WagerX social",
      storage: REMOTE_STORAGE ? "upstash" : "file",
      online: onlineCount(),
      users: Object.keys(data.users).length,
      messages: data.messages.length,
    });
  }

  if (method === "POST" && pathname === "/api/auth/signup") {
    if (!rateLimit(authAttempts, clientIp(req), 8, 10 * 60 * 1000)) {
      throw new ApiError(429, "Too many attempts. Wait a few minutes and try again.");
    }
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    validateUsername(username);
    if (password.length < 8 || password.length > 128) {
      throw new ApiError(400, "Password must be 8-128 characters.");
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const user = {
      id: newId("u"),
      username,
      usernameLower: username.toLowerCase(),
      salt,
      passwordHash: hashPassword(password, salt),
      color: colorFor(username.toLowerCase()),
      createdAt: now(),
      balance: 10000,
      wagered: 0,
      won: 0,
      rounds: 0,
      bestWin: 0,
      discordClaimed: false,
      balanceRevision: 0,
    };
    applyStats(user, body.stats);
    data.users[user.id] = user;
    createSession(res, user, req);
    saveData();
    return sendJson(res, 201, { user: selfUser(user) });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    if (!rateLimit(authAttempts, clientIp(req), 12, 10 * 60 * 1000)) {
      throw new ApiError(429, "Too many attempts. Wait a few minutes and try again.");
    }
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = findUserByName(username);
    if (!user) {
      throw new ApiError(
        401,
        "No account found with that username. Use Create account to make one.",
        "NO_ACCOUNT"
      );
    }
    if (!passwordMatches(password, user)) {
      throw new ApiError(401, "Wrong password. Try again.", "WRONG_PASSWORD");
    }
    createSession(res, user, req);
    saveData();
    return sendJson(res, 200, { user: selfUser(user) });
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    clearSession(req, res);
    saveData();
    return sendJson(res, 204, null);
  }

  if (method === "GET" && pathname === "/api/me") {
    const found = currentSession(req);
    return sendJson(res, 200, { user: found ? selfUser(found.user) : null });
  }

  if (method === "PATCH" && pathname === "/api/me") {
    const { user } = requireUser(req);
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    if (username.toLowerCase() !== user.usernameLower && findUserByName(username)) {
      throw new ApiError(409, "That username is already on the floor.");
    }
    if (!USERNAME_RE.test(username)) {
      throw new ApiError(400, "Username must be 3-18 characters: letters, numbers or underscore.");
    }
    user.username = username;
    user.usernameLower = username.toLowerCase();
    user.color = colorFor(username.toLowerCase());
    saveData();
    return sendJson(res, 200, { user: selfUser(user) });
  }

  if (method === "PATCH" && pathname === "/api/me/stats") {
    const { user } = requireUser(req);
    const body = await readJson(req);
    applyStats(user, body);
    saveData();
    return sendJson(res, 200, { user: selfUser(user) });
  }

  if (method === "DELETE" && pathname === "/api/me") {
    const { user } = requireUser(req);
    for (const [key, session] of Object.entries(data.sessions)) {
      if (session.userId === user.id) delete data.sessions[key];
    }
    data.messages = data.messages.filter((message) => message.userId !== user.id);
    delete data.users[user.id];
    clearSession(req, res);
    saveData();
    return sendJson(res, 204, null);
  }

  if (method === "GET" && pathname === "/api/announcement") {
    return sendJson(res, 200, { announcement: publicAnnouncement(data.announcement) });
  }

  if (method === "GET" && pathname === "/api/admin/users") {
    requireAdmin(req);
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const users = Object.values(data.users)
      .filter((user) => !query || String(user.usernameLower || user.username || "").toLowerCase().includes(query))
      .sort((a, b) => Number(b.balance) - Number(a.balance) || String(a.username).localeCompare(String(b.username)))
      .slice(0, 50)
      .map((user) => ({ ...publicUser(user), admin: isAdmin(user) }));
    return sendJson(res, 200, {
      users,
      total: Object.keys(data.users).length,
      announcement: publicAnnouncement(data.announcement),
      log: data.adminLog.slice(-25).reverse(),
    });
  }

  if (method === "POST" && pathname === "/api/admin/grant") {
    const { user: admin } = requireAdmin(req);
    if (!rateLimit(adminAttempts, admin.id, 60, 60 * 1000)) {
      throw new ApiError(429, "Slow down. Wait a minute and try again.");
    }
    const body = await readJson(req);
    const targetId = String(body.userId || "").trim();
    const target = data.users[targetId] || findUserByName(body.username);
    if (!target) throw new ApiError(404, "That player was not found.");
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, "Enter a cash amount greater than zero.");
    }
    if (amount > 1000000) {
      throw new ApiError(400, "The maximum single gift is $1,000,000.");
    }
    const note = String(body.note || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    target.balance = clampNumber(Number(target.balance) + amount, 1e9);
    target.balanceRevision = (Number(target.balanceRevision) || 0) + 1;
    target.lastGift = {
      id: newId("g"),
      amount,
      note,
      at: now(),
      from: admin.username,
    };
    logAdminAction(admin, "grant", {
      targetId: target.id,
      targetUsername: target.username,
      amount,
      note,
    });
    saveData();
    return sendJson(res, 200, {
      user: publicUser(target),
      amount,
      note,
      announcement: publicAnnouncement(data.announcement),
    });
  }

  if (method === "POST" && pathname === "/api/admin/announcement") {
    const { user: admin } = requireAdmin(req);
    if (!rateLimit(adminAttempts, admin.id, 60, 60 * 1000)) {
      throw new ApiError(429, "Slow down. Wait a minute and try again.");
    }
    const body = await readJson(req);
    const text = String(body.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    if (!text) throw new ApiError(400, "Write an announcement first.");
    data.announcement = {
      id: newId("n"),
      text,
      createdAt: now(),
      author: admin.username,
    };
    logAdminAction(admin, "announcement", { text });
    saveData();
    return sendJson(res, 200, { announcement: publicAnnouncement(data.announcement) });
  }

  if (method === "DELETE" && pathname === "/api/admin/announcement") {
    const { user: admin } = requireAdmin(req);
    data.announcement = null;
    logAdminAction(admin, "announcement-clear");
    saveData();
    return sendJson(res, 200, { announcement: null });
  }

  if (method === "GET" && pathname === "/api/chat") {
    const after = Math.max(0, Math.floor(Number(url.searchParams.get("after")) || 0));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 80)));
    let messages;
    if (after > 0) {
      messages = data.messages.filter((message) => message.seq > after).slice(0, limit);
    } else {
      messages = data.messages.slice(-limit);
    }
    return sendJson(res, 200, {
      messages: messages.map(messageFor),
      latest: data.seq,
      online: onlineCount(),
    });
  }

  if (method === "POST" && pathname === "/api/chat") {
    const { user } = requireUser(req);
    if (!rateLimit(chatAttempts, user.id, 1, 1500)) {
      throw new ApiError(429, "Easy there. One message every couple of seconds.");
    }
    const body = await readJson(req);
    const text = String(body.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (!text) throw new ApiError(400, "Message is empty.");
    data.seq += 1;
    const message = {
      id: newId("m"),
      seq: data.seq,
      userId: user.id,
      usernameAtSend: user.username,
      text,
      createdAt: now(),
    };
    data.messages.push(message);
    if (data.messages.length > 500) data.messages = data.messages.slice(-500);
    saveData();
    return sendJson(res, 201, { message: messageFor(message) });
  }

  if (method === "GET" && pathname === "/api/leaderboard") {
    const sort = String(url.searchParams.get("sort") || "balance");
    const players = leaderboardPlayers(sort);
    const found = currentSession(req);
    const me = found ? players.find((player) => player.id === found.user.id) || publicUser(found.user) : null;
    return sendJson(res, 200, { sort, players, me });
  }

  throw new ApiError(404, "API route not found.");
}

function staticFileFor(pathname) {
  if (!BASE_PATH) return pathname === "/" ? "/index.html" : pathname;
  if (pathname === BASE_PATH) return null;
  if (!pathname.startsWith(`${BASE_PATH}/`)) return null;
  const relative = pathname.slice(BASE_PATH.length);
  return relative === "/" ? "/index.html" : relative;
}

function serveStatic(req, res, url) {
  if (!BASE_PATH && url.pathname === "/") {
    res.writeHead(302, { Location: "/index.html" });
    return res.end();
  }
  if (BASE_PATH && (url.pathname === "/" || url.pathname === BASE_PATH)) {
    res.writeHead(302, { Location: `${BASE_PATH}/` });
    return res.end();
  }
  const filePath = staticFileFor(url.pathname);
  if (!filePath) return sendText(res, 404, "Not found");
  let decoded;
  try {
    decoded = decodeURIComponent(filePath);
  } catch (err) {
    return sendText(res, 400, "Bad path");
  }
  if (decoded.includes("\0")) return sendText(res, 400, "Bad path");
  let absolute = path.resolve(ROOT, `.${decoded}`);
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, "Forbidden");
  }
  try {
    if (fs.statSync(absolute).isDirectory()) absolute = path.join(absolute, "index.html");
    const body = fs.readFileSync(absolute);
    const ext = path.extname(absolute).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } catch (err) {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendText(res, 405, "Method not allowed");
    }
    serveStatic(req, res, url);
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message, ...(err.code ? { code: err.code } : {}) });
    } else {
      console.error("Unhandled request error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Server error." });
      else res.end();
    }
  }
});

function pruneSessions() {
  const timestamp = now();
  let changed = false;
  for (const [key, session] of Object.entries(data.sessions)) {
    if (session.expiresAt <= timestamp) {
      delete data.sessions[key];
      changed = true;
    }
  }
  if (changed) saveData();
}

async function start() {
  if ((UPSTASH_URL && !UPSTASH_TOKEN) || (!UPSTASH_URL && UPSTASH_TOKEN)) {
    console.warn("Upstash is only half configured; set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Using data.json.");
  }
  data = await loadData();
  removeDemoData(data);
  pruneSessions();
  saveData();
  if (REMOTE_STORAGE) await flushRemoteSave();

  const missingAdmins = [...ADMIN_USERNAMES].filter(
    (name) =>
      !Object.values(data.users).some(
        (user) => String(user.usernameLower || user.username || "").trim().toLowerCase() === name
      )
  );
  if (missingAdmins.length) {
    console.warn(`Admin account not registered yet: ${missingAdmins.join(", ")}. Sign up with that exact username.`);
  }

  server.listen(PORT, HOST, () => {
    console.log(`WagerX social server running at http://${HOST}:${PORT}${BASE_PATH}/`);
    console.log(`Data backend: ${REMOTE_STORAGE ? "Upstash Redis" : `file (${DATA_FILE})`}`);
    console.log(`Admin usernames: ${ADMIN_USERNAMES.size ? [...ADMIN_USERNAMES].join(", ") : "none"}`);
  });
}

async function shutdown() {
  if (REMOTE_STORAGE) {
    remoteDirty = true;
    const deadline = Date.now() + 2500;
    while ((remoteDirty || remoteSaving) && Date.now() < deadline) {
      await flushRemoteSave();
      if (remoteDirty || remoteSaving) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } else {
    saveData();
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  console.error("Could not start WagerX:", err.message);
  process.exit(1);
});
