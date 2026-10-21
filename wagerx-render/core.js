/* ============================================================
   WAGERX — core: wallet, fairness, shell, home, modals
   Play-money social casino. No real-money wagering.
   ============================================================ */
(function () {
  "use strict";

  const DISCORD_URL = "https://discord.gg/xhaaRPVjJu";
  // Discord membership verification (OAuth2 implicit grant, no secret required).
  // One-time setup: create an app at https://discord.com/developers/applications,
  // add this page URL as an OAuth2 redirect, then paste its Client ID below.
  // The $3,000 drop stays locked until verification is configured and passes.
  const DISCORD_CLIENT_ID = "1562177769654329384";
  const DISCORD_GUILD_ID = "1562160185445974118";
  const DISCORD_API = "https://discord.com/api/v10";
  const DISCORD_PENDING_KEY = "wagerx.discord.pending.v1";
  const DISCORD_REDIRECT_URI = (() => {
    if (location.protocol === "file:") return "";
    const url = new URL(location.href);
    url.hash = "";
    url.search = "";
    return url.toString();
  })();
  const discordConfigured = () => /^\d{17,20}$/.test(DISCORD_CLIENT_ID);
  const STORAGE_KEY = "wagerx.player.v1";
  const START_BALANCE = 10000;
  const MAX_BET = 10000;
  const DAILY_AMOUNT = 1000;
  const DAILY_MS = 24 * 60 * 60 * 1000;
  const DISCORD_BONUS = 3000;
  const BAILOUT_AMOUNT = 500;
  const BAILOUT_MS = 10 * 60 * 1000;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ============================== GAME CATALOG ============================== */

  const GAME_META = [
    {
      id: "crash",
      name: "Crash",
      cat: "originals",
      desc: "Cash out before the curve turns.",
      art: "The longer you wait, the harder you fall.",
      c1: "#8b5cf6",
      c2: "#ff4d8d",
      label: "3% edge",
      hot: true,
    },
    {
      id: "mines",
      name: "Mines",
      desc: "Find the gems. Dodge the bombs.",
      cat: "originals",
      art: "A five by five field and one clean exit.",
      c1: "#7c3aed",
      c2: "#3de0ff",
      label: "3% edge",
      hot: true,
    },
    {
      id: "dice",
      name: "Dice",
      desc: "Set the odds. Roll the line.",
      cat: "originals",
      art: "Two decimals between you and the number.",
      c1: "#6d28d9",
      c2: "#c8ff3d",
      label: "1% edge",
    },
    {
      id: "plinko",
      name: "Plinko",
      desc: "Drop a ball. Let the pegs decide.",
      cat: "originals",
      art: "Every peg is a coin flip with a view.",
      c1: "#ff4d8d",
      c2: "#8b5cf6",
      label: "99% RTP",
      hot: true,
    },
    {
      id: "limbo",
      name: "Limbo",
      desc: "Pick a target. Beat the roll.",
      cat: "originals",
      art: "One number, one chance, no ceiling.",
      c1: "#3de0ff",
      c2: "#8b5cf6",
      label: "1% edge",
    },
    {
      id: "wheel",
      name: "Wheel",
      desc: "Twenty segments. One spin.",
      cat: "originals",
      art: "Zero is heavier than it looks.",
      c1: "#ff4d8d",
      c2: "#ff9f43",
      label: "3% edge",
    },
    {
      id: "keno",
      name: "Keno",
      desc: "Pick ten. Catch the draw.",
      cat: "originals",
      art: "Forty numbers, ten chances to matter.",
      c1: "#8b5cf6",
      c2: "#3de0ff",
      label: "95% RTP",
    },
    {
      id: "coinflip",
      name: "Coinflip",
      desc: "Heads or tails, doubled.",
      cat: "originals",
      art: "The oldest argument in the room.",
      c1: "#eab308",
      c2: "#c8ff3d",
      label: "2% edge",
    },
    {
      id: "towers",
      name: "Towers",
      desc: "Climb the rows. Cash out high.",
      cat: "originals",
      art: "Eight rows between floor and sky.",
      c1: "#8b5cf6",
      c2: "#ff4d8d",
      label: "3% edge",
    },
    {
      id: "chicken",
      name: "Chicken",
      desc: "Cross the road. Keep the cash.",
      cat: "originals",
      art: "Every lane has a car with your name.",
      c1: "#f59e0b",
      c2: "#ef4444",
      label: "3% edge",
    },
    {
      id: "cases",
      name: "Cases",
      desc: "Open a case. Sell the drop.",
      cat: "originals",
      art: "Three crates, one glow you remember.",
      c1: "#ff9f43",
      c2: "#ff4d8d",
      label: "up to $50k",
      hot: true,
    },
    {
      id: "upgrader",
      name: "Upgrader",
      desc: "Slide the odds. Press your luck.",
      cat: "originals",
      art: "A dial that rewards the brave and the brief.",
      c1: "#22c55e",
      c2: "#c8ff3d",
      label: "3% edge",
    },
    {
      id: "blackjack",
      name: "Blackjack",
      desc: "Beat the dealer to 21.",
      cat: "table",
      art: "The only table where thinking is allowed.",
      c1: "#16a34a",
      c2: "#c8ff3d",
      label: "3:2 BJ",
      hot: true,
    },
    {
      id: "roulette",
      name: "Roulette",
      desc: "Single zero. Full board.",
      cat: "table",
      art: "Thirty-seven ways to be certain.",
      c1: "#dc2626",
      c2: "#f59e0b",
      label: "single zero",
    },
    {
      id: "baccarat",
      name: "Baccarat",
      desc: "Player, banker, or tie.",
      cat: "table",
      art: "Two hands, no decisions after the deal.",
      c1: "#2563eb",
      c2: "#93c5fd",
      label: "5% commission",
    },
    {
      id: "videopoker",
      name: "Video Poker",
      desc: "Jacks or better, five cards.",
      cat: "table",
      art: "Hold what matters. Replace the rest.",
      c1: "#8b5cf6",
      c2: "#22d3ee",
      label: "9/6",
    },
    {
      id: "dragontiger",
      name: "Dragon Tiger",
      desc: "High card takes the hand.",
      cat: "table",
      art: "One card each. One second of hope.",
      c1: "#ef4444",
      c2: "#f59e0b",
      label: "8:1 tie",
    },
    {
      id: "hilo",
      name: "Hi-Lo",
      desc: "Call the next card. Build the streak.",
      cat: "table",
      art: "Higher or lower, and the deck is counting.",
      c1: "#22d3ee",
      c2: "#ff4d8d",
      label: "3% edge",
    },
    {
      id: "slots",
      name: "Slots",
      desc: "Five lines. Six symbols. One spin.",
      cat: "slots",
      art: "The old machine still knows your name.",
      c1: "#f59e0b",
      c2: "#ff4d8d",
      label: "5 lines",
    },
  ];

  const GAME_BY_ID = Object.fromEntries(GAME_META.map((g) => [g.id, g]));
  const gameImpls = {};

  /* ============================== ICONS ============================== */

  function icon(name) {
    const wrap = (body) =>
      `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    switch (name) {
      case "crash":
        return wrap(`<path d="M6 41h36M7 41V7" opacity=".35"/><path d="M12 34l9-11 6 5 13-16"/><path d="M33 12h7v7"/>`);
      case "dice":
        return wrap(`<rect x="9" y="9" width="30" height="30" rx="7"/><circle cx="17.5" cy="17.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="30.5" cy="17.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="1.8" fill="currentColor" stroke="none"/><circle cx="17.5" cy="30.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="30.5" cy="30.5" r="1.8" fill="currentColor" stroke="none"/>`);
      case "mines":
        return wrap(`<path d="M24 5 42 19 24 43 6 19Z"/><path d="M6 19h36M16 19l8 24 8-24M24 5l-8 14 8 0 8 0-8-14Z" opacity=".6"/>`);
      case "plinko":
        return wrap(`<circle cx="24" cy="9" r="1.7" fill="currentColor" stroke="none"/><circle cx="17" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="31" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="27" r="1.7" fill="currentColor" stroke="none"/><circle cx="24" cy="27" r="1.7" fill="currentColor" stroke="none"/><circle cx="38" cy="27" r="1.7" fill="currentColor" stroke="none"/><circle cx="17" cy="36" r="1.7" fill="currentColor" stroke="none"/><circle cx="31" cy="36" r="1.7" fill="currentColor" stroke="none"/><circle cx="24" cy="43" r="3.2" fill="currentColor" stroke="none"/>`);
      case "cases":
        return wrap(`<rect x="7" y="20" width="34" height="21" rx="3"/><path d="M5 12h38v8H5z"/><path d="M24 24l7 5-7 6-7-6 7-5Z" fill="currentColor" stroke="none" opacity=".85"/>`);
      case "blackjack":
        return wrap(`<rect x="10" y="10" width="18" height="27" rx="2.5" transform="rotate(-8 19 23.5)"/><rect x="22" y="13" width="18" height="27" rx="2.5" transform="rotate(6 31 26.5)"/><text x="27" y="29" font-size="9" font-family="Inter,sans-serif" font-weight="700" fill="currentColor" stroke="none" transform="rotate(6 27 29)">A</text>`);
      case "limbo":
        return wrap(`<circle cx="24" cy="24" r="17" opacity=".4"/><path d="M15 30l8-8 5 4 8-10"/><path d="M30 16h6v6"/><circle cx="15" cy="30" r="1.8" fill="currentColor" stroke="none"/><circle cx="23" cy="22" r="1.8" fill="currentColor" stroke="none"/>`);
      case "wheel":
        return wrap(`<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="3.5"/><path d="M24 7v7M24 34v7M7 24h7M34 24h7M12 12l5 5M31 31l5 5M36 12l-5 5M17 31l-5 5" opacity=".55"/><circle cx="24" cy="10" r="2" fill="currentColor" stroke="none"/>`);
      case "keno":
        return wrap(`<rect x="7" y="7" width="14" height="14" rx="3"/><rect x="27" y="7" width="14" height="14" rx="3"/><rect x="7" y="27" width="14" height="14" rx="3"/><rect x="27" y="27" width="14" height="14" rx="3"/><circle cx="14" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="34" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="14" cy="34" r="1.5" fill="currentColor" stroke="none"/><circle cx="34" cy="34" r="1.5" fill="currentColor" stroke="none"/>`);
      case "coinflip":
        return wrap(`<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="11" opacity=".45"/><path d="M24 16v16M20 20h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6" stroke-width="2"/>`);
      case "towers":
        return wrap(`<rect x="9" y="31" width="30" height="8" rx="2"/><rect x="12" y="20" width="24" height="8" rx="2"/><rect x="16" y="9" width="16" height="8" rx="2"/><path d="M24 5v2" opacity=".5"/>`);
      case "chicken":
        return wrap(`<path d="M17 37c0-8 2-14 8-16 5-2 10 0 11 5 1 4-1 8-5 9"/><circle cx="34" cy="17" r="6"/><path d="M40 16h4l-4 3"/><path d="M31 11l1-4 2 4 3-3v5" fill="currentColor"/><path d="M18 34l-1 6M24 34l1 6" opacity=".7"/><circle cx="36" cy="16" r="1.1" fill="currentColor" stroke="none"/>`);
      case "upgrader":
        return wrap(`<path d="M8 36a17 17 0 1 1 32 0" opacity=".45"/><path d="M24 33V17"/><path d="M17 24l7-8 7 8"/><circle cx="24" cy="36" r="3"/>`);
      case "roulette":
        return wrap(`<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="7" opacity=".5"/><path d="M24 7v5M24 36v5M7 24h5M36 24h5M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4" opacity=".55"/><circle cx="24" cy="11" r="2" fill="currentColor" stroke="none"/>`);
      case "baccarat":
        return wrap(`<rect x="8" y="12" width="17" height="25" rx="2.5" transform="rotate(-7 16.5 24.5)"/><rect x="23" y="12" width="17" height="25" rx="2.5" transform="rotate(7 31.5 24.5)"/><text x="12" y="28" font-size="8" font-family="Inter,sans-serif" font-weight="700" fill="currentColor" stroke="none" transform="rotate(-7 12 28)">P</text><text x="28" y="28" font-size="8" font-family="Inter,sans-serif" font-weight="700" fill="currentColor" stroke="none" transform="rotate(7 28 28)">B</text>`);
      case "videopoker":
        return wrap(`<rect x="6" y="14" width="15" height="23" rx="2.5" transform="rotate(-10 13.5 25.5)"/><rect x="17" y="11" width="15" height="23" rx="2.5"/><rect x="28" y="14" width="15" height="23" rx="2.5" transform="rotate(10 35.5 25.5)"/><path d="M23 17h3M23 21h3M23 25h3" opacity=".6"/>`);
      case "dragontiger":
        return wrap(`<path d="M8 33V15l7 6 5-6 4 9-5 9H8Z" opacity=".9"/><path d="M40 33V15l-7 6-5-6-4 9 5 9h11Z" opacity=".9"/><path d="M18 39h12" opacity=".5"/>`);
      case "hilo":
        return wrap(`<rect x="16" y="12" width="16" height="24" rx="3"/><path d="M24 8l4 5H20l4-5Z" fill="currentColor" stroke="none"/><path d="M20 33l4-5 4 5" opacity=".65"/><path d="M11 20l4-4 4 4M11 28l4 4 4-4" opacity=".55"/><path d="M33 20l4-4 4 4M33 28l4 4 4-4" opacity=".55"/>`);
      case "slots":
        return wrap(`<rect x="7" y="10" width="34" height="28" rx="4"/><path d="M18 10v28M30 10v28" opacity=".5"/><text x="19" y="29" font-size="12" font-family="Inter,sans-serif" font-weight="800" fill="currentColor" stroke="none" text-anchor="middle">7</text><text x="31" y="29" font-size="12" font-family="Inter,sans-serif" font-weight="800" fill="currentColor" stroke="none" text-anchor="middle">7</text><text x="43" y="29" font-size="12" font-family="Inter,sans-serif" font-weight="800" fill="currentColor" stroke="none" text-anchor="middle">7</text><circle cx="12" cy="29" r="2" fill="currentColor" stroke="none"/>`);
      case "discord":
        return wrap(`<path d="M15 14c5-2 13-2 18 0 3 5 4 12 3 17-3 2-6 3-8 3l-2-3c2 0 4-1 5-2-4 2-9 2-14 0 1 1 3 2 5 2l-2 3c-2 0-5-1-8-3-1-5 0-12 3-17Z"/><circle cx="20" cy="24" r="1.5" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="1.5" fill="currentColor" stroke="none"/>`);
      default:
        return wrap(`<circle cx="24" cy="24" r="16"/><path d="M24 15v18M15 24h18"/>`);
    }
  }

  /* ============================== STATE ============================== */

  function randomHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function defaultState() {
    return {
      version: 1,
      name: "guest",
      account: null,
      balance: START_BALANCE,
      balanceRevision: 0,
      balanceBase: START_BALANCE,
      seenGift: "",
      wagered: 0,
      won: 0,
      rounds: 0,
      bestWin: 0,
      lastLevel: 1,
      seenWelcome: false,
      history: [],
      settings: { sound: true, reduceMotion: false },
      bonuses: { discord: null, daily: 0, bailout: 0 },
      fair: {
        serverSeed: randomHex(24),
        clientSeed: randomHex(8),
        nonce: 0,
        previous: null,
      },
    };
  }

  function loadState() {
    const base = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return base;
      const merged = {
        ...base,
        ...saved,
        settings: { ...base.settings, ...(saved.settings || {}) },
        bonuses: { ...base.bonuses, ...(saved.bonuses || {}) },
        fair: { ...base.fair, ...(saved.fair || {}) },
      };
      merged.balance = Number.isFinite(merged.balance) ? merged.balance : START_BALANCE;
      merged.balanceRevision = Number.isFinite(Number(merged.balanceRevision))
        ? Math.max(0, Math.floor(Number(merged.balanceRevision)))
        : 0;
      merged.balanceBase = Number.isFinite(Number(merged.balanceBase)) ? Number(merged.balanceBase) : merged.balance;
      merged.seenGift = typeof merged.seenGift === "string" ? merged.seenGift : "";
      merged.wagered = Number.isFinite(merged.wagered) ? merged.wagered : 0;
      merged.won = Number.isFinite(merged.won) ? merged.won : 0;
      merged.rounds = Number.isFinite(merged.rounds) ? merged.rounds : 0;
      merged.bestWin = Number.isFinite(merged.bestWin) ? merged.bestWin : 0;
      merged.history = Array.isArray(merged.history) ? merged.history.slice(0, 80) : [];
      const cachedAccount =
        merged.account && typeof merged.account === "object" && merged.account.id && merged.account.username
          ? {
              id: String(merged.account.id),
              username: String(merged.account.username).slice(0, 18),
              createdAt: Number(merged.account.createdAt) || 0,
            }
          : null;
      merged.account = cachedAccount;
      merged.name = cachedAccount ? cachedAccount.username : "guest";
      merged.fair.serverSeed = merged.fair.serverSeed || randomHex(24);
      merged.fair.clientSeed = merged.fair.clientSeed || randomHex(8);
      merged.fair.nonce = Number.isFinite(merged.fair.nonce) ? merged.fair.nonce : 0;
      return merged;
    } catch (err) {
      return base;
    }
  }

  const state = loadState();

  let authReady = false;
  let socialOnline = true;
  let statsSyncTimer = 0;
  let statsSyncInflight = null;
  let statsSyncQueued = false;
  let lastStatsSignature = "";

  function save({ skipSync = false } = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* storage full or blocked — keep playing in memory */
    }
    if (!skipSync) {
      if (localMode) syncLocalAccount();
      else scheduleStatsSync();
    }
  }

  if (state.settings.reduceMotion) document.documentElement.classList.add("reduce-motion");
  if (!state.settings.sound) document.body.classList.add("is-muted");

  /* ============================== FAIR RNG ============================== */

  function cyrb128(str) {
    let h1 = 1779033703,
      h2 = 3144134277,
      h3 = 1013904242,
      h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  function fingerprint(str) {
    return cyrb128(str)
      .map((n) => n.toString(16).padStart(8, "0"))
      .join("");
  }

  function makeRng(seed) {
    const h = cyrb128(String(seed));
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    const next = () => {
      a |= 0;
      b |= 0;
      c |= 0;
      d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    next.range = (min, max) => min + next() * (max - min);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.shuffle = (arr) => {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    return next;
  }

  function newRng() {
    const seed = `${state.fair.serverSeed}:${state.fair.clientSeed}:${state.fair.nonce}`;
    state.fair.nonce += 1;
    save();
    return makeRng(seed);
  }

  function weightedPick(rng, items, weightKey = "weight") {
    const total = items.reduce((sum, item) => sum + item[weightKey], 0);
    let roll = rng() * total;
    for (const item of items) {
      roll -= item[weightKey];
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
    return result;
  }

  /* ============================== FORMATTING ============================== */

  function fmtMoney(value) {
    const n = round2(value);
    const hasCents = Math.abs(n % 1) > 0.001;
    return (
      "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2,
      })
    );
  }

  function fmtCompact(value) {
    const n = Math.abs(value);
    if (n >= 1_000_000) return (value / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 10_000) return (value / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "") + "k";
    if (n >= 1000) return (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(value));
  }

  function fmtMult(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.00×";
    if (n >= 100) return n.toFixed(0) + "×";
    if (n >= 10) return n.toFixed(1) + "×";
    return n.toFixed(2) + "×";
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 45) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function levelInfo(wagered = state.wagered) {
    const level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, wagered) / 200)) + 1);
    const floor = 200 * Math.pow(level - 1, 2);
    const next = 200 * Math.pow(level, 2);
    const pct = clamp(((wagered - floor) / Math.max(1, next - floor)) * 100, 0, 100);
    return { level, floor, next, pct };
  }

  /* ============================== SOUND ============================== */

  const sound = {
    ctx: null,
    ensure() {
      if (!state.settings.sound) return null;
      try {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return null;
          this.ctx = new AudioCtx();
        }
        if (this.ctx.state === "suspended") this.ctx.resume();
        return this.ctx;
      } catch (err) {
        return null;
      }
    },
    tone(freq, duration = 0.08, type = "sine", volume = 0.045, delay = 0) {
      if (!state.settings.sound) return;
      const ctx = this.ensure();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      } catch (err) {
        /* audio is decoration */
      }
    },
    click() {
      this.tone(220, 0.035, "square", 0.025);
    },
    tick() {
      this.tone(620, 0.03, "triangle", 0.02);
    },
    chip() {
      this.tone(880, 0.04, "triangle", 0.025);
    },
    win(mult = 2) {
      const base = 523.25;
      this.tone(base, 0.12, "triangle", 0.05);
      this.tone(base * 1.25, 0.14, "triangle", 0.045, 0.08);
      this.tone(base * 1.5, 0.2, "triangle", 0.04, 0.16);
      if (mult >= 5) this.tone(base * 2, 0.3, "sine", 0.045, 0.26);
      if (mult >= 25) {
        this.tone(base * 2.5, 0.28, "sine", 0.04, 0.36);
        this.tone(base * 3, 0.4, "sine", 0.035, 0.46);
      }
    },
    lose() {
      this.tone(220, 0.16, "sawtooth", 0.025);
      this.tone(165, 0.22, "sawtooth", 0.02, 0.1);
    },
    push() {
      this.tone(330, 0.09, "triangle", 0.035);
    },
  };

  /* ============================== TOASTS / CONFETTI ============================== */

  const toastRoot = $("#toasts");

  function toast(title, text = "", type = "info", ms = 4200) {
    if (!toastRoot) return;
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.innerHTML = `<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ""}`;
    toastRoot.appendChild(el);
    window.setTimeout(() => {
      el.classList.add("is-leaving");
      window.setTimeout(() => el.remove(), 240);
    }, ms);
  }

  const fx = $("#fxCanvas");
  let fxParticles = [];
  let fxRunning = false;
  let fxDpr = 1;

  function sizeFx() {
    if (!fx) return;
    fxDpr = Math.min(2, window.devicePixelRatio || 1);
    fx.width = Math.floor(window.innerWidth * fxDpr);
    fx.height = Math.floor(window.innerHeight * fxDpr);
    fx.style.width = window.innerWidth + "px";
    fx.style.height = window.innerHeight + "px";
  }

  function confetti(count = 110) {
    if (!fx) return;
    if (state.settings.reduceMotion) return;
    sizeFx();
    const colors = ["#c8ff3d", "#8b5cf6", "#ff4d8d", "#3de0ff", "#ffffff", "#ff9f43"];
    for (let i = 0; i < count; i++) {
      fxParticles.push({
        x: window.innerWidth * (0.35 + Math.random() * 0.3),
        y: window.innerHeight * (0.28 + Math.random() * 0.15),
        vx: (Math.random() - 0.5) * 13,
        vy: -Math.random() * 11 - 3,
        g: 0.28 + Math.random() * 0.18,
        size: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.35,
        life: 1,
        decay: 0.006 + Math.random() * 0.009,
        shape: Math.random() < 0.25 ? "circle" : "rect",
      });
    }
    if (!fxRunning) {
      fxRunning = true;
      requestAnimationFrame(drawFx);
    }
  }

  function drawFx() {
    if (!fx) return;
    const ctx = fx.getContext("2d");
    ctx.clearRect(0, 0, fx.width, fx.height);
    ctx.save();
    ctx.scale(fxDpr, fxDpr);
    const w = window.innerWidth;
    const h = window.innerHeight;
    fxParticles = fxParticles.filter((p) => p.life > 0 && p.y < h + 30);
    for (const p of fxParticles) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.994;
      p.rot += p.spin;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    }
    ctx.restore();
    if (fxParticles.length) requestAnimationFrame(drawFx);
    else {
      fxRunning = false;
      ctx.clearRect(0, 0, fx.width, fx.height);
    }
  }

  /* ============================== WALLET ============================== */

  function updateBalanceUI(bump = false) {
    $$("[data-balance]").forEach((el) => {
      el.textContent = fmtMoney(state.balance);
      if (bump) {
        const pill = el.closest(".balance-pill");
        if (pill) {
          pill.classList.remove("is-bumped");
          void pill.offsetWidth;
          pill.classList.add("is-bumped");
        }
      }
    });
  }

  function updateUI() {
    updateBalanceUI();
    $$("[data-stat='wagered']").forEach((el) => (el.textContent = fmtMoney(state.wagered)));
    $$("[data-stat='rounds']").forEach((el) => (el.textContent = state.rounds.toLocaleString("en-US")));
    $$("[data-stat='best']").forEach((el) => (el.textContent = fmtMoney(state.bestWin)));
    $$("[data-stat='level']").forEach((el) => (el.textContent = String(levelInfo().level)));

    const signedIn = !!state.account;
    const initials = signedIn ? state.name.slice(0, 2).toUpperCase() || "?" : "?";
    $$(".avatar").forEach((el) => {
      if (el.id === "sideAvatar" || el.id === "accountBtn") el.textContent = initials;
    });
    $("#sideName") && ($("#sideName").textContent = signedIn ? state.name : "Guest");
    const lv = levelInfo();
    $("#sideLevel") &&
      ($("#sideLevel").textContent = signedIn
        ? `Level ${lv.level} · ${fmtMoney(state.wagered)} wagered`
        : "Log in or sign up to chat & rank");
    $("#sideLevelBar") && ($("#sideLevelBar").style.width = (signedIn ? lv.pct : 0) + "%");
    const sideAuth = $("#sideAuth");
    if (sideAuth) sideAuth.classList.toggle("is-hidden", signedIn);
    const isAdminAccount = Boolean(signedIn && state.account && state.account.admin);
    $$(".admin-only").forEach((el) => el.classList.toggle("is-hidden", !isAdminAccount));
    const accountBtn = $("#accountBtn");
    if (accountBtn) accountBtn.title = signedIn ? `@${state.name}` : "Create an account";

    const discordFoot = $("#discordCardFoot");
    if (discordFoot) {
      discordFoot.textContent = state.bonuses.discord ? "Claimed · welcome to the floor" : "One per account · instant credit";
    }

    updateDailyUI();
    updateSoundUI();
    updateAuthUI();
    renderRecentWins();

    if (currentGame) {
      const gvBalance = $("#gameView [data-balance]");
      if (gvBalance) gvBalance.textContent = fmtMoney(state.balance);
    }
  }

  function updateSoundUI() {
    document.body.classList.toggle("is-muted", !state.settings.sound);
    const btn = $("#soundBtn");
    if (btn) btn.setAttribute("aria-label", state.settings.sound ? "Mute sound" : "Enable sound");
  }

  function updateDailyUI() {
    const remaining = Math.max(0, DAILY_MS - (Date.now() - (state.bonuses.daily || 0)));
    const ready = remaining <= 0;
    const timer = $("#dailyHomeTimer");
    const homeBtn = $("#dailyHomeBtn");
    if (timer) {
      timer.textContent = ready ? "Ready to claim" : `Next drop in ${countdownText(remaining)}`;
    }
    if (homeBtn) {
      homeBtn.disabled = !ready;
      homeBtn.textContent = ready ? "Claim $1,000" : "Claimed today";
    }
    $$("[data-daily-label]").forEach((el) => {
      el.textContent = ready ? "Ready now" : `Next drop in ${countdownText(remaining)}`;
    });
    $$("[data-daily-btn]").forEach((el) => {
      el.disabled = !ready;
      el.textContent = ready ? "Claim $1,000" : "Claimed";
    });
    $$("[data-bailout-label]").forEach((el) => {
      const cd = Math.max(0, BAILOUT_MS - (Date.now() - (state.bonuses.bailout || 0)));
      if (state.balance >= 100) el.textContent = "Available when your balance drops under $100";
      else if (cd > 0) el.textContent = `Available again in ${countdownText(cd)}`;
      else el.textContent = "Emergency drop for a dry balance";
    });
    $$("[data-bailout-btn]").forEach((el) => {
      const cd = Math.max(0, BAILOUT_MS - (Date.now() - (state.bonuses.bailout || 0)));
      const eligible = state.balance < 100 && cd <= 0;
      el.disabled = !eligible;
      el.textContent = eligible ? `Claim $${BAILOUT_AMOUNT}` : state.balance >= 100 ? "Available under $100" : "Cooldown";
    });
  }

  function countdownText(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  function takeStake(amount) {
    const bet = round2(amount);
    if (!Number.isFinite(bet) || bet < 1) {
      toast("Minimum bet is $1", "Raise the stake to play.", "error");
      return false;
    }
    if (bet > MAX_BET) {
      toast(`Table limit is ${fmtMoney(MAX_BET)}`, "Lower the stake and try again.", "error");
      return false;
    }
    if (bet > state.balance) {
      toast("Not enough cash", "Open the cashier for a free top-up.", "error");
      return false;
    }
    state.balance = round2(state.balance - bet);
    state.wagered = round2(state.wagered + bet);
    updateBalanceUI(true);
    updateUI();
    save();
    sound.chip();
    return true;
  }

  function credit(amount) {
    const value = round2(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    state.balance = round2(state.balance + value);
    updateBalanceUI(true);
    save();
  }

  function settle({ game, bet, mult = 0, payout = 0, note = "" }) {
    const id = typeof game === "object" ? game.id : game;
    const meta = GAME_BY_ID[id] || { name: String(game) };
    const stake = round2(bet);
    const win = round2(Math.max(0, payout));
    const m = round2(Math.max(0, mult || (stake > 0 ? win / stake : 0)));

    if (win > 0) credit(win);
    state.won = round2(state.won + win);
    state.rounds += 1;
    if (win > state.bestWin) state.bestWin = round2(win);

    state.history.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      game: id,
      name: meta.name,
      bet: stake,
      mult: m,
      payout: win,
      note,
      time: Date.now(),
    });
    state.history = state.history.slice(0, 80);

    const lv = levelInfo();
    if (lv.level > state.lastLevel) {
      let bonusTotal = 0;
      for (let l = state.lastLevel + 1; l <= lv.level; l++) bonusTotal += l * 100;
      state.lastLevel = lv.level;
      if (bonusTotal > 0) {
        state.balance = round2(state.balance + bonusTotal);
        updateBalanceUI(true);
        toast(`Level ${lv.level}`, `${fmtMoney(bonusTotal)} level-up drop credited.`, "success", 5000);
      }
    }

    if (win > stake) {
      sound.win(m);
      if (m >= 10 && win >= 200) confetti(m >= 50 ? 180 : 110);
    } else if (win <= 0) {
      sound.lose();
    } else {
      sound.push();
    }

    save();
    updateUI();
    return { win, m };
  }

  function claimDaily() {
    const remaining = DAILY_MS - (Date.now() - (state.bonuses.daily || 0));
    if (remaining > 0) {
      toast("Daily drop not ready", `Come back in ${countdownText(remaining)}.`, "error");
      return false;
    }
    state.bonuses.daily = Date.now();
    state.balance = round2(state.balance + DAILY_AMOUNT);
    updateBalanceUI(true);
    updateUI();
    save();
    sound.win(2);
    confetti(80);
    toast("Daily drop claimed", `+${fmtMoney(DAILY_AMOUNT)} added to your balance.`, "success");
    return true;
  }

  function claimBailout() {
    const cd = Math.max(0, BAILOUT_MS - (Date.now() - (state.bonuses.bailout || 0)));
    if (state.balance >= 100) {
      toast("You're not dry yet", "The emergency drop unlocks under $100.", "error");
      return false;
    }
    if (cd > 0) {
      toast("Cooldown active", `Try again in ${countdownText(cd)}.`, "error");
      return false;
    }
    state.bonuses.bailout = Date.now();
    state.balance = round2(state.balance + BAILOUT_AMOUNT);
    updateBalanceUI(true);
    updateUI();
    save();
    sound.tick();
    toast("Emergency drop", `+${fmtMoney(BAILOUT_AMOUNT)} keeps the night alive.`, "success");
    return true;
  }

  /* ============================== MODALS ============================== */

  const modalRoot = $("#modalRoot");
  let modalCleanup = null;

  function openModal({ title, subtitle = "", body = "", size = "", onMount = null }) {
    if (!modalRoot) return null;
    closeSidebar();
    closeModal(true);
    const wide = size === "wide" ? " modal-panel--wide" : size === "slim" ? " modal-panel--slim" : "";
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>
      <div class="modal-panel${wide}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
        <div class="modal-head">
          <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
          <button class="modal-close" type="button" data-modal-close aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body">${body}</div>
      </div>`;
    modalRoot.classList.add("is-open");
    modalRoot.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const panel = $(".modal-panel", modalRoot);
    panel.focus({ preventScroll: true });
    const close = () => closeModal();
    if (typeof onMount === "function") modalCleanup = onMount($(".modal-body", modalRoot), close) || null;
    return { root: modalRoot, panel, close };
  }

  function closeModal(silent = false) {
    if (!modalRoot || !modalRoot.classList.contains("is-open")) return;
    if (typeof modalCleanup === "function") {
      try {
        modalCleanup();
      } catch (err) {
        /* ignore */
      }
    }
    modalCleanup = null;
    modalRoot.classList.remove("is-open");
    modalRoot.setAttribute("aria-hidden", "true");
    modalRoot.innerHTML = "";
    if (!document.body.classList.contains("game-open")) document.body.classList.remove("modal-open");
    if (!silent) sound.click();
  }

  function openConfirm({ title, body, confirmLabel = "Confirm", onConfirm }) {
    openModal({
      title,
      size: "slim",
      body: `<p class="confirm-copy">${body}</p>
        <div class="modal-actions">
          <button class="btn btn-outline" type="button" data-modal-close>Cancel</button>
          <button class="btn btn-lime" type="button" id="confirmYes">${esc(confirmLabel)}</button>
        </div>`,
      onMount: () => {
        $("#confirmYes").addEventListener("click", () => {
          closeModal();
          if (typeof onConfirm === "function") onConfirm();
        });
      },
    });
  }

  /* ============================== CASHIER ============================== */

  function openCashier() {
    const lv = levelInfo();
    const discordClaimed = !!state.bonuses.discord;
    openModal({
      title: "Cashier",
      subtitle: "Free play cash. No deposits, no withdrawals.",
      body: `
        <div class="cash-hero">
          <span>Your balance</span>
          <b>${fmtMoney(state.balance)}</b>
          <small>Level ${lv.level} · <b>${fmtMoney(state.wagered)}</b> wagered all time</small>
          <div class="cash-level">
            <div class="cash-level-row"><span>Level ${lv.level}</span><span>${Math.floor(lv.pct)}% to level ${lv.level + 1}</span></div>
            <div class="level-bar"><i style="width:${lv.pct}%"></i></div>
          </div>
        </div>

        <div class="cash-section">
          <h4>Free cash</h4>
          <div class="cash-card">
            <span class="cash-card-icon cash-card-icon--violet">✳</span>
            <div class="cash-card-copy"><strong>Discord community drop</strong><span>${discordClaimed ? "Claimed · thanks for joining" : "Join the server for a one-time $3,000 credit"}</span></div>
            <button class="btn btn-lime" type="button" data-open="discord">${discordClaimed ? "Claimed" : "Claim"}</button>
          </div>
          <div class="cash-card">
            <span class="cash-card-icon cash-card-icon--lime">◈</span>
            <div class="cash-card-copy"><strong>Daily drop</strong><span data-daily-label></span></div>
            <button class="btn btn-outline" type="button" data-daily-btn>Claim $1,000</button>
          </div>
          <div class="cash-card">
            <span class="cash-card-icon cash-card-icon--pink">♡</span>
            <div class="cash-card-copy"><strong>Emergency drop</strong><span data-bailout-label></span></div>
            <button class="btn btn-outline" type="button" data-bailout-btn>Claim $500</button>
          </div>
        </div>

        <div class="cash-section">
          <h4>Account</h4>
          <div class="cash-card">
            <span class="cash-card-icon cash-card-icon--violet">▤</span>
            <div class="cash-card-copy"><strong>Bet history</strong><span>Every wager on this browser</span></div>
            <button class="btn btn-outline" type="button" data-open="history">Open</button>
          </div>
          <div class="cash-card">
            <span class="cash-card-icon cash-card-icon--lime">◇</span>
            <div class="cash-card-copy"><strong>Provably fair</strong><span>Check seeds and rotate the server seed</span></div>
            <button class="btn btn-outline" type="button" data-open="fairness">View</button>
          </div>
        </div>
        <p class="cash-note">WagerX cash is virtual play money. It cannot be bought, sold, transferred, or withdrawn. Bonus timers run on this browser.</p>
      `,
      size: "wide",
      onMount: (body, close) => {
        updateDailyUI();
        body.querySelectorAll("[data-daily-btn]").forEach((btn) => {
          btn.addEventListener("click", () => {
            claimDaily();
            updateDailyUI();
          });
        });
        body.querySelectorAll("[data-bailout-btn]").forEach((btn) => {
          btn.addEventListener("click", () => {
            claimBailout();
            updateDailyUI();
          });
        });
        return null;
      },
    });
  }

  /* ============================== DISCORD ============================== */

  function discordStateToken() {
    const bytes = new Uint8Array(16);
    try {
      window.crypto.getRandomValues(bytes);
    } catch (err) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function discordOAuthStart() {
    if (state.bonuses.discord) {
      openDiscord();
      return false;
    }
    if (!discordConfigured()) {
      openDiscordProblem({
        title: "Verification locked",
        subtitle: "One-time setup required",
        message: "The $3,000 Discord drop cannot be claimed until this build is connected to a Discord application.",
        detail: DISCORD_REDIRECT_URI || "Serve the site over http(s) before configuring Discord OAuth.",
        hint: "Add your Discord Client ID to DISCORD_CLIENT_ID in core.js, and register the redirect URL above in the Discord Developer Portal.",
        retry: false,
      });
      return false;
    }
    if (!DISCORD_REDIRECT_URI) {
      openDiscordProblem({
        title: "Hosting required",
        subtitle: "Discord cannot redirect back to a local file",
        message: "Open the site from an http(s) address, add that exact URL to your Discord app redirects, then try again.",
        retry: false,
      });
      return false;
    }

    const stateToken = discordStateToken();
    try {
      sessionStorage.setItem(DISCORD_PENDING_KEY, JSON.stringify({ state: stateToken, at: Date.now() }));
    } catch (err) {
      /* private browsing can block session storage; the state check will fail safely */
    }
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "token",
      redirect_uri: DISCORD_REDIRECT_URI,
      scope: "identify guilds",
      state: stateToken,
    });
    window.location.assign(`https://discord.com/oauth2/authorize?${params.toString()}`);
    return true;
  }

  async function fetchDiscordGuilds(token) {
    const guilds = [];
    let after = "";
    for (let page = 0; page < 6; page++) {
      const url = new URL(`${DISCORD_API}/users/@me/guilds`);
      url.searchParams.set("limit", "200");
      if (after) url.searchParams.set("after", after);
      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Discord rejected that login. Start the verification again.");
        if (res.status === 429) throw new Error("Discord is rate limiting. Wait a minute and try again.");
        throw new Error(`Discord returned ${res.status}.`);
      }
      const batch = await res.json();
      if (!Array.isArray(batch)) throw new Error("Discord returned an unexpected response.");
      guilds.push(...batch);
      if (batch.length < 200) break;
      after = batch[batch.length - 1].id;
    }
    return guilds;
  }

  async function grantDiscordBonus() {
    if (state.bonuses.discord) {
      openDiscord();
      return;
    }
    // Let any sync that started before verification finish first, so the
    // claim cannot be replaced by an older server snapshot.
    if (state.account && !localMode && statsSyncInflight) {
      try {
        await statsSyncInflight;
      } catch (err) {
        /* the retry below will persist the claim */
      }
    }
    state.bonuses.discord = Date.now();
    state.balance = round2(state.balance + DISCORD_BONUS);
    updateBalanceUI(true);
    save();
    // Persist the verified claim before showing success. Without this, a fast
    // reload can pull the old server balance back over the local bonus.
    if (state.account && !localMode) await syncStatsNow(true);
    updateUI();
    sound.win(3);
    confetti(160);
    toast("Discord bonus", `+${fmtMoney(DISCORD_BONUS)} added to your balance.`, "success", 5000);
    openDiscord();
  }

  function openDiscordProblem({ title, subtitle, message, detail = "", hint = "", retry = true }) {
    openModal({
      title,
      subtitle,
      body: `
        <div class="discord-hero">
          <div class="discord-big">!</div>
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
        </div>
        ${
          detail
            ? `<div class="invite-box">
                <code>${esc(detail)}</code>
                <button class="copy-btn" type="button" id="copyProblem">COPY</button>
              </div>`
            : ""
        }
        ${hint ? `<p class="cash-note">${esc(hint)}</p>` : ""}
        <div class="discord-actions">
          ${retry ? `<button class="btn btn-lime" type="button" id="discordRetry">Try again</button>` : ""}
          <button class="btn btn-outline" type="button" data-modal-close>Close</button>
        </div>
        <p class="cash-note">Nothing is credited until Discord confirms that your account is in the server.</p>
      `,
      onMount: (body) => {
        if (detail) bindCopyText(body, "#copyProblem", detail);
        const retryBtn = $("#discordRetry", body);
        if (retryBtn) {
          retryBtn.addEventListener("click", () => {
            closeModal(true);
            discordOAuthStart();
          });
        }
        return null;
      },
    });
  }

  async function handleDiscordRedirect() {
    const raw = window.location.hash ? window.location.hash.slice(1) : "";
    if (!raw) return;
    const params = new URLSearchParams(raw);
    if (!params.has("access_token") && !params.has("error")) return;

    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (err) {
      window.location.hash = "";
    }

    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(DISCORD_PENDING_KEY) || "null");
      sessionStorage.removeItem(DISCORD_PENDING_KEY);
    } catch (err) {
      pending = null;
    }

    if (state.bonuses.discord) {
      openDiscord();
      return;
    }

    const error = params.get("error");
    if (error) {
      if (error === "access_denied") {
        openDiscordProblem({
          title: "Authorization cancelled",
          subtitle: "Nothing was claimed",
          message: "Discord verification was cancelled before we could read your server list.",
          retry: true,
        });
      } else if (error === "redirect_uri_mismatch") {
        openDiscordProblem({
          title: "Redirect mismatch",
          subtitle: "The Discord app is not pointed at this page",
          message: "Add this exact URL to your Discord application's OAuth2 redirect list, then try again.",
          detail: DISCORD_REDIRECT_URI,
          retry: false,
        });
      } else {
        openDiscordProblem({
          title: "Discord verification failed",
          subtitle: "Nothing was claimed",
          message: "Discord rejected the authorization request before the membership check could finish.",
          detail: DISCORD_REDIRECT_URI,
          hint: `Discord error: ${error}. Make sure this exact URL is listed under OAuth2 → Redirects in the Discord Developer Portal.`,
          retry: true,
        });
      }
      return;
    }

    const token = params.get("access_token");
    const returnedState = params.get("state") || "";
    if (
      !token ||
      !pending ||
      pending.state !== returnedState ||
      Date.now() - Number(pending.at) > 15 * 60 * 1000
    ) {
      openDiscordProblem({
        title: "Verification expired",
        subtitle: "Start the check again",
        message: "This Discord verification link is no longer valid, or it was started in another tab.",
        retry: true,
      });
      return;
    }

    try {
      const guilds = await fetchDiscordGuilds(token);
      const joined = guilds.some((guild) => String(guild.id) === DISCORD_GUILD_ID);
      if (!joined) {
        openDiscordProblem({
          title: "Not in the server yet",
          subtitle: "The $3,000 is still locked",
          message: "Discord confirmed your account, but it is not in WagerX. Join with the invite below, then verify again.",
          detail: DISCORD_URL,
          hint: "Already joined? Wait a few seconds for Discord to update, then press Try again.",
          retry: true,
        });
        return;
      }
      // Make sure the session is restored before crediting so the claim is
      // written to the account, not just to this browser's local state.
      if (!authReady) await initSocial();
      await grantDiscordBonus();
    } catch (err) {
      openDiscordProblem({
        title: "Could not verify",
        subtitle: "Nothing was claimed",
        message: err && err.message ? err.message : "The Discord membership check failed.",
        retry: true,
      });
    }
  }

  function openDiscord() {
    const claimed = !!state.bonuses.discord;
    if (claimed) {
      openModal({
        title: "Community",
        subtitle: "You're verified and in.",
        body: `
          <div class="discord-hero">
            <div class="discord-big">✳</div>
            <h3>One of us</h3>
            <p>The $3,000 community drop is sitting in your balance, verified through Discord. The server is where drops, rain and new games get announced first.</p>
          </div>
          <div class="invite-box">
            <code>${esc(DISCORD_URL)}</code>
            <button class="copy-btn" type="button" id="copyInvite">COPY</button>
          </div>
          <div class="discord-actions">
            <a class="btn btn-lime" href="${esc(DISCORD_URL)}" target="_blank" rel="noopener">Open Discord <span aria-hidden="true">↗</span></a>
            <button class="btn btn-outline" type="button" data-modal-close>Close</button>
          </div>
          <div class="claim-status is-visible is-done">Membership verified · ${fmtMoney(DISCORD_BONUS)} credited one time.</div>
        `,
        onMount: (body) => {
          bindCopyInvite(body);
          return null;
        },
      });
      return;
    }

    openModal({
      title: "Discord bonus",
      subtitle: "Join the server. Verify. Take the three thousand.",
      body: `
        <div class="discord-hero">
          <div class="discord-big">✳</div>
          <h3>Join the floor.<br><span>Claim $3,000.</span></h3>
          <p>A one-time community drop for verified server members. Join Discord, approve the membership check, and the cash lands straight in your balance.</p>
        </div>
        <div class="discord-steps">
          <div class="discord-step"><i>1</i><div><strong>Open the WagerX Discord</strong><span>Permanent invite · stays valid.</span></div></div>
          <div class="discord-step"><i>2</i><div><strong>Join WagerX</strong><span>Accept the invite and enter the server.</span></div></div>
          <div class="discord-step"><i>3</i><div><strong>Verify with Discord</strong><span>We check your server list before crediting.</span></div></div>
        </div>
        <div class="invite-box">
          <code>${esc(DISCORD_URL)}</code>
          <button class="copy-btn" type="button" id="copyInvite">COPY</button>
        </div>
        <div class="discord-actions">
          <a class="btn btn-outline" href="${esc(DISCORD_URL)}" target="_blank" rel="noopener" id="discordJoin">Open invite</a>
          <button class="btn btn-lime" type="button" id="discordClaim">Verify with Discord</button>
        </div>
        <div class="claim-status" id="claimStatus"><span class="verify-dots"><i></i><i></i><i></i></span><span id="claimStatusText">Waiting for Discord verification…</span></div>
        ${
          discordConfigured()
            ? `<p class="cash-note">Verification reads your Discord server list once, then discards the access token. This does not create a WagerX account - use Sign up to chat and rank. One $3,000 credit per account.</p>`
            : `<p class="cash-note">This build is not connected to a Discord app yet. The drop is locked until DISCORD_CLIENT_ID is configured in core.js.</p>`
        }
      `,
      onMount: (body) => {
        bindCopyInvite(body);
        const claimBtn = $("#discordClaim", body);
        const status = $("#claimStatus", body);
        const statusText = $("#claimStatusText", body);
        if (!claimBtn) return null;
        claimBtn.addEventListener("click", () => {
          if (claimBtn.disabled) return;
          claimBtn.disabled = true;
          claimBtn.textContent = "Opening Discord…";
          if (status) {
            status.classList.add("is-visible");
            status.classList.remove("is-error", "is-done");
          }
          if (statusText) statusText.textContent = "Taking you to Discord for a membership check…";
          const started = discordOAuthStart();
          if (!started) {
            claimBtn.disabled = false;
            claimBtn.textContent = "Verify with Discord";
          }
        });
        return null;
      },
    });
  }

  async function bindCopyText(root, selector, text) {
    const btn = root.querySelector(selector);
    if (!btn) return;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "COPIED";
        toast("Copied", "Paste it where you need it.", "success", 2400);
      } catch (err) {
        const temp = document.createElement("textarea");
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        try {
          document.execCommand("copy");
          btn.textContent = "COPIED";
          toast("Copied", "Paste it where you need it.", "success", 2400);
        } catch (e) {
          toast("Copy failed", text, "error", 5000);
        }
        temp.remove();
      }
      window.setTimeout(() => (btn.textContent = "COPY"), 2200);
    };
    btn.addEventListener("click", copy);
  }

  function bindCopyInvite(root) {
    bindCopyText(root, "#copyInvite", DISCORD_URL);
  }

  /* ============================== HISTORY ============================== */

  function openHistory() {
    const returned = round2(state.won);
    const net = round2(state.won - state.wagered);
    const rows = state.history.length
      ? state.history
          .map((h) => {
            const meta = GAME_BY_ID[h.game];
            const win = h.payout > h.bet;
            return `<div class="history-row">
              <span class="history-icon">${meta ? icon(meta.id) : ""}</span>
              <div class="history-copy">
                <strong>${esc(h.name || (meta ? meta.name : "Game"))}</strong>
                <span>${fmtMoney(h.bet)} stake · ${timeAgo(h.time)}</span>
              </div>
              <span class="history-mult">${h.payout > 0 ? fmtMult(h.mult) : "—"}</span>
              <span class="history-pay ${win ? "is-win" : "is-loss"}">${h.payout > 0 ? "+" + fmtMoney(h.payout) : "—"}</span>
            </div>`;
          })
          .join("")
      : `<div class="history-empty"><b>No bets yet</b>Open a game and put the first chip on the felt.</div>`;

    openModal({
      title: "My bets",
      subtitle: `${state.rounds.toLocaleString("en-US")} rounds on this browser`,
      size: "wide",
      body: `
        <div class="history-summary">
          <div><span>Wagered</span><b>${fmtMoney(state.wagered)}</b></div>
          <div><span>Returned</span><b>${fmtMoney(returned)}</b></div>
          <div><span>Net</span><b class="${net >= 0 ? "lime" : ""}" style="${net < 0 ? "color:#ff7c89" : ""}">${net >= 0 ? "+" : "−"}${fmtMoney(Math.abs(net))}</b></div>
        </div>
        <div class="history-list">${rows}</div>
      `,
    });
  }

  /* ============================== FAIRNESS ============================== */

  function openFairness() {
    const fair = state.fair;
    const hash = fingerprint(fair.serverSeed);
    const previous = fair.previous;
    openModal({
      title: "Provably fair",
      subtitle: "Seeds, nonce, reproducible rounds.",
      body: `
        <div class="fair-grid">
          <div class="fair-row">
            <label>Server seed fingerprint</label>
            <div class="fair-inline"><code id="fairHash">${hash}</code><button class="fair-copy" type="button" id="copyHash">COPY</button></div>
          </div>
          <div class="fair-row">
            <label>Client seed</label>
            <div class="fair-inline">
              <input class="input-line input-line--sm" id="clientSeed" value="${esc(fair.clientSeed)}" spellcheck="false" />
              <button class="fair-copy" type="button" id="saveClient">SAVE</button>
            </div>
          </div>
          <div class="fair-row">
            <label>Nonce</label>
            <code>${fair.nonce.toLocaleString("en-US")} rounds seeded on this client</code>
          </div>
          ${previous ? `<div class="fair-row"><label>Previous server seed (revealed)</label><code>${esc(previous.seed)}</code></div>` : ""}
        </div>
        <div class="fair-actions">
          <button class="btn btn-outline" type="button" id="revealSeed">Rotate &amp; reveal</button>
          <button class="btn btn-outline" type="button" id="copySeed">Copy server seed</button>
        </div>
        <p class="fair-note"><b>How it works:</b> every round draws from a deterministic stream seeded by server seed + client seed + nonce. Rotating the server seed reveals the old one so past rounds can be checked. This is a play-money build — seeds live in this browser and the fingerprint is a 128-bit local hash, not a server commitment.</p>
      `,
      onMount: (body) => {
        const copy = async (text, label) => {
          try {
            await navigator.clipboard.writeText(text);
            toast("Copied", label, "success", 2200);
          } catch (err) {
            toast("Copy failed", "Select the value manually.", "error");
          }
        };
        $("#copyHash", body).addEventListener("click", () => copy(fingerprint(state.fair.serverSeed), "Server seed fingerprint"));
        $("#copySeed", body).addEventListener("click", () => copy(state.fair.serverSeed, "Server seed"));
        $("#saveClient", body).addEventListener("click", () => {
          const value = $("#clientSeed", body).value.trim();
          if (!value) {
            toast("Client seed can't be empty", "Type a seed or rotate instead.", "error");
            return;
          }
          state.fair.clientSeed = value.slice(0, 64);
          state.fair.nonce = 0;
          save();
          toast("Client seed saved", "Nonce reset to zero.", "success");
          openFairness();
        });
        $("#revealSeed", body).addEventListener("click", () => {
          state.fair.previous = { seed: state.fair.serverSeed, hash: fingerprint(state.fair.serverSeed) };
          state.fair.serverSeed = randomHex(24);
          state.fair.nonce = 0;
          save();
          toast("Server seed rotated", "The old seed is now revealed above.", "success");
          openFairness();
        });
      },
    });
  }

  /* ============================== ACCOUNT ============================== */

  function openAccount() {
    const lv = levelInfo();
    const net = state.won - state.wagered;
    const signedIn = !!state.account;
    const initials = state.name.slice(0, 2).toUpperCase() || "?";

    const identity = signedIn
      ? `<div class="account-signed">
           <span class="avatar avatar--sm">${esc(initials)}</span>
           <div><strong>@${esc(state.account.username)}</strong><span>${localMode ? "Local account · saved in this browser" : "Signed in · leaderboard active"}</span></div>
           <button class="btn btn-outline" type="button" id="accountLogout" style="height:30px;font-size:9px">Log out</button>
         </div>
         <div class="account-row">
           <div class="account-row-copy"><strong>Username</strong><span>Shown in chat and on the leaderboard</span></div>
           <div class="account-name" style="width:210px">
             <input class="input-line input-line--sm" id="accountName" maxlength="18" value="${esc(state.account.username)}" />
             <button class="btn btn-lime" type="button" id="saveName" style="height:32px;padding:0 10px;font-size:9.5px">Save</button>
           </div>
         </div>`
      : `<div class="auth-callout">
           <div class="auth-callout-icon">✦</div>
           <div>
             <h3>Claim your name</h3>
             <p>Create a free account to chat in #general and put your stats on the leaderboard. Your current balance and progress come with you.</p>
           </div>
         </div>
         <div class="discord-actions" style="margin-bottom:6px">
           <button class="btn btn-lime" type="button" id="accountSignup">Create account</button>
           <button class="btn btn-outline" type="button" id="accountLogin">Log in</button>
         </div>`;

    openModal({
      title: "Account",
      subtitle: signedIn ? "Your floor identity." : "Guest profile, local cash.",
      size: "wide",
      body: `
        <div class="account-grid">
          <div class="account-stat"><span>Balance</span><b>${fmtMoney(state.balance)}</b></div>
          <div class="account-stat"><span>Level</span><b>${lv.level}</b></div>
          <div class="account-stat"><span>Wagered</span><b>${fmtMoney(state.wagered)}</b></div>
          <div class="account-stat"><span>Net</span><b style="color:${net >= 0 ? "#c8ff3d" : "#ff7c89"}">${net >= 0 ? "+" : "-"}${fmtMoney(Math.abs(net))}</b></div>
          <div class="account-stat"><span>Best win</span><b>${fmtMoney(state.bestWin)}</b></div>
          <div class="account-stat"><span>Rounds</span><b>${state.rounds.toLocaleString("en-US")}</b></div>
        </div>
        ${identity}
        ${
          state.account && state.account.admin
            ? `<div class="account-row">
                 <div class="account-row-copy"><strong>Admin panel</strong><span>Give cash and post site announcements</span></div>
                 <button class="btn btn-lime" type="button" data-open="admin" style="height:30px;font-size:9.5px">Open</button>
               </div>`
            : ""
        }
        <div class="account-row">
          <div class="account-row-copy"><strong>Sound effects</strong><span>Small synth clicks and win cues</span></div>
          <button class="toggle ${state.settings.sound ? "is-on" : ""}" type="button" id="toggleSound" aria-label="Toggle sound"></button>
        </div>
        <div class="account-row">
          <div class="account-row-copy"><strong>Reduced motion</strong><span>Calm the spinning, flipping and confetti</span></div>
          <button class="toggle ${state.settings.reduceMotion ? "is-on" : ""}" type="button" id="toggleMotion" aria-label="Toggle reduced motion"></button>
        </div>
        <div class="account-row">
          <div class="account-row-copy"><strong>Provably fair</strong><span>Seeds and nonce</span></div>
          <button class="btn btn-outline" type="button" data-open="fairness" style="height:30px;font-size:9.5px">Open</button>
        </div>
        <div class="account-row">
          <div class="account-row-copy"><strong>${signedIn ? "Delete account" : "Reset local wallet"}</strong><span>${signedIn ? (localMode ? "Removes your local login and chat messages from this browser" : "Removes your login, chat messages and leaderboard entry") : "Wipes this browser's balance, history and settings"}</span></div>
          <button class="btn btn-outline${signedIn ? " account-danger" : ""}" type="button" id="${signedIn ? "deleteAccount" : "resetAccount"}" style="height:30px;font-size:9.5px">${signedIn ? "Delete" : "Reset"}</button>
        </div>
      `,
      onMount: (body) => {
        $("#toggleSound", body).addEventListener("click", (e) => {
          state.settings.sound = !state.settings.sound;
          save();
          updateSoundUI();
          e.currentTarget.classList.toggle("is-on", state.settings.sound);
          if (state.settings.sound) sound.click();
        });
        $("#toggleMotion", body).addEventListener("click", (e) => {
          state.settings.reduceMotion = !state.settings.reduceMotion;
          document.documentElement.classList.toggle("reduce-motion", state.settings.reduceMotion);
          save();
          e.currentTarget.classList.toggle("is-on", state.settings.reduceMotion);
        });

        if (signedIn) {
          $("#saveName", body).addEventListener("click", async (e) => {
            const value = $("#accountName", body).value.trim();
            if (!/^[A-Za-z0-9_]{3,18}$/.test(value)) {
              toast("Pick a valid username", "3-18 letters, numbers or underscore.", "error");
              return;
            }
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = "Saving…";
            const ok = await changeUsername(value);
            btn.disabled = false;
            btn.textContent = "Save";
            if (ok) {
              $("#accountName", body).value = state.account.username;
            }
          });
          $("#accountLogout", body).addEventListener("click", () => logoutAccount());
          $("#deleteAccount", body).addEventListener("click", () => {
            openConfirm({
              title: "Delete this account?",
              body: localMode
                ? "This removes your local login and chat messages from this browser. It cannot be undone."
                : "This removes your login, chat messages and leaderboard entry from the server. Your browser's local save is cleared too. It cannot be undone.",
              confirmLabel: "Delete account",
              onConfirm: () => deleteAccount(),
            });
          });
        } else {
          $("#accountSignup", body).addEventListener("click", () => openAuth("signup"));
          $("#accountLogin", body).addEventListener("click", () => openAuth("login"));
          $("#resetAccount", body).addEventListener("click", () => {
            openConfirm({
              title: "Reset everything?",
              body: "This wipes your balance, bet history, level, bonuses and settings on this browser. It cannot be undone.",
              confirmLabel: "Reset wallet",
              onConfirm: () => {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch (err) {
                  /* ignore */
                }
                window.location.reload();
              },
            });
          });
        }
      },
    });
  }

  /* ============================== ANNOUNCEMENTS ============================== */

  const ANNOUNCEMENT_DISMISS_KEY = "wagerx.announcement.dismissed.v1";
  let announcementPollTimer = 0;

  function renderAnnouncement(announcement, force = false) {
    const banner = $("#siteAnnouncement");
    if (!banner) return;
    const textEl = $("#siteAnnouncementText");
    if (!announcement || !announcement.id || !announcement.text) {
      banner.hidden = true;
      banner.dataset.announcementId = "";
      return;
    }
    let dismissed = "";
    try {
      dismissed = localStorage.getItem(ANNOUNCEMENT_DISMISS_KEY) || "";
    } catch (err) {
      /* storage can be unavailable in private mode */
    }
    if (!force && dismissed === announcement.id) {
      banner.hidden = true;
      return;
    }
    if (textEl) textEl.textContent = announcement.text;
    banner.dataset.announcementId = announcement.id;
    banner.hidden = false;
  }

  async function loadAnnouncement(force = false) {
    if (localMode) {
      renderAnnouncement(null);
      return;
    }
    try {
      const data = await socialApi("/announcement");
      renderAnnouncement(data && data.announcement, force);
    } catch (err) {
      if (err.status === 404) renderAnnouncement(null);
    }
  }

  function dismissAnnouncement() {
    const banner = $("#siteAnnouncement");
    if (!banner) return;
    const id = banner.dataset.announcementId || "";
    if (id) {
      try {
        localStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, id);
      } catch (err) {
        /* ignore */
      }
    }
    banner.hidden = true;
  }

  function startAnnouncementPolling() {
    if (announcementPollTimer) return;
    announcementPollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadAnnouncement();
    }, 20000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") loadAnnouncement();
    });
  }

  /* ============================== ADMIN ============================== */

  function formatAdminTime(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function adminLogMarkup(entry) {
    if (!entry) return "";
    let text = "";
    if (entry.type === "grant") {
      text = `<b>@${esc(entry.adminUsername || "admin")}</b> gave <b>@${esc(entry.targetUsername || "player")}</b> ${fmtMoney(entry.amount)}`;
      if (entry.note) text += ` · ${esc(entry.note)}`;
    } else if (entry.type === "announcement") {
      text = `<b>@${esc(entry.adminUsername || "admin")}</b> published an announcement`;
    } else if (entry.type === "announcement-clear") {
      text = `<b>@${esc(entry.adminUsername || "admin")}</b> cleared the announcement`;
    } else {
      text = `<b>@${esc(entry.adminUsername || "admin")}</b> updated the floor`;
    }
    return `<div class="admin-log-row"><span>${text}</span><span>${esc(formatAdminTime(entry.at))}</span></div>`;
  }

  function renderAdminAnnouncement(root, announcement) {
    const target = $("#adminCurrent", root);
    if (!target) return;
    if (!announcement) {
      target.innerHTML = `<div class="admin-current-empty">No announcement is live right now.</div>`;
      return;
    }
    target.innerHTML = `<div class="admin-current-head"><strong>Live announcement</strong><span>${esc(
      formatAdminTime(announcement.createdAt)
    )}</span></div><p>${esc(announcement.text)}</p>`;
  }

  function openAdmin() {
    if (localMode || !state.account || !state.account.admin) {
      toast("Admin only", "This panel is locked to the site owner's account.", "error", 5000);
      return;
    }
    openModal({
      title: "Admin panel",
      subtitle: `Signed in as @${state.account.username}. Changes are live immediately.`,
      size: "wide",
      body: `
        <div class="admin-tabs" id="adminTabs">
          <button class="admin-tab is-active" type="button" data-admin-tab="grant">Give cash</button>
          <button class="admin-tab" type="button" data-admin-tab="announce">Announcement</button>
        </div>

        <section data-admin-panel="grant">
          <div class="admin-search">
            <input class="input-line" id="adminSearch" type="search" maxlength="18" placeholder="Search username…" autocomplete="off" />
            <button class="btn btn-outline" type="button" id="adminSearchBtn">Search</button>
          </div>
          <div class="admin-users" id="adminUsers"><div class="admin-empty">Loading players…</div></div>
          <div class="admin-grant">
            <div class="admin-target" id="adminTarget">Pick a player above.</div>
            <div class="admin-grant-row">
              <input class="input-line" id="adminAmount" type="number" min="1" max="1000000" step="1" placeholder="Amount, e.g. 5000" />
              <input class="input-line" id="adminNote" type="text" maxlength="120" placeholder="Note (optional)" />
            </div>
            <div class="admin-quick">
              <button type="button" data-admin-amount="1000">$1,000</button>
              <button type="button" data-admin-amount="5000">$5,000</button>
              <button type="button" data-admin-amount="10000">$10,000</button>
              <button type="button" data-admin-amount="25000">$25,000</button>
            </div>
            <button class="btn btn-lime" type="button" id="adminGrantBtn" disabled>Give cash</button>
          </div>
        </section>

        <section data-admin-panel="announce" hidden>
          <textarea class="admin-textarea" id="adminAnnouncement" maxlength="300" rows="4" placeholder="Write a short message for everyone on the floor…"></textarea>
          <div class="admin-actions">
            <button class="btn btn-lime" type="button" id="adminPublish">Publish announcement</button>
            <button class="btn btn-outline" type="button" id="adminClear" disabled>Remove current</button>
          </div>
          <div class="admin-current" id="adminCurrent"></div>
        </section>

        <div class="admin-log" id="adminLog"></div>
      `,
      onMount: (body) => {
        let selectedUser = null;
        let searchTimer = 0;
        let busy = false;
        let announcementLive = false;
        const searchInput = $("#adminSearch", body);
        const userList = $("#adminUsers", body);
        const targetLabel = $("#adminTarget", body);
        const amountInput = $("#adminAmount", body);
        const noteInput = $("#adminNote", body);
        const grantBtn = $("#adminGrantBtn", body);
        const publishBtn = $("#adminPublish", body);
        const clearBtn = $("#adminClear", body);
        const announceInput = $("#adminAnnouncement", body);
        const logBox = $("#adminLog", body);

        const setTarget = (user) => {
          selectedUser = user;
          targetLabel.innerHTML = user
            ? `Selected: <b>@${esc(user.username)}</b> · ${fmtMoney(user.balance)}`
            : "Pick a player above.";
          grantBtn.disabled = !user;
        };

        const renderUsers = (users) => {
          if (!users.length) {
            userList.innerHTML = `<div class="admin-empty">No players found.</div>`;
            setTarget(null);
            return;
          }
          userList.innerHTML = users
            .map(
              (user) => `<button class="admin-user${selectedUser && selectedUser.id === user.id ? " is-selected" : ""}" type="button" data-admin-user="${esc(user.id)}">
                <span class="admin-avatar" style="background:${safeColor(user.color)}">${esc(String(user.username || "?").slice(0, 2).toUpperCase())}</span>
                <span class="admin-user-copy"><strong>@${esc(user.username)}${user.admin ? ' <i class="admin-tag">ADMIN</i>' : ""}</strong><span>${fmtMoney(user.balance)} · Lv ${user.level || 1}</span></span>
                <span class="admin-user-pick">Select</span>
              </button>`
            )
            .join("");
          userList.querySelectorAll("[data-admin-user]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const picked = users.find((user) => user.id === btn.dataset.adminUser);
              if (!picked) return;
              setTarget(picked);
              userList.querySelectorAll("[data-admin-user]").forEach((other) => {
                other.classList.toggle("is-selected", other === btn);
              });
              amountInput.focus();
            });
          });
        };

        const renderLog = (log) => {
          const entries = Array.isArray(log) ? log : [];
          logBox.innerHTML = `<h4>Recent admin actions</h4>${
            entries.length
              ? entries.map(adminLogMarkup).join("")
              : `<div class="admin-log-empty">No admin actions yet.</div>`
          }`;
        };

        const load = async (query = "") => {
          userList.innerHTML = `<div class="admin-empty">Loading players…</div>`;
          try {
            const data = await socialApi(`/admin/users?q=${encodeURIComponent(query)}`);
            renderUsers(Array.isArray(data.users) ? data.users : []);
            renderLog(data.log);
            renderAdminAnnouncement(body, data.announcement || null);
            announcementLive = !!data.announcement;
            clearBtn.disabled = !announcementLive;
          } catch (err) {
            if (err.status === 401) {
              handleSessionExpired();
              closeModal(true);
              return;
            }
            const message =
              err.status === 403
                ? "This account does not have admin access."
                : err.status === 404
                  ? "The admin API is not deployed yet. Deploy the latest server."
                  : err.message || "Could not load the admin panel.";
            userList.innerHTML = `<div class="admin-empty">${esc(message)}</div>`;
            logBox.innerHTML = "";
          }
        };

        const setTab = (tab) => {
          body.querySelectorAll("[data-admin-tab]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.adminTab === tab);
          });
          body.querySelectorAll("[data-admin-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.adminPanel !== tab;
          });
        };

        body.querySelectorAll("[data-admin-tab]").forEach((btn) => {
          btn.addEventListener("click", () => setTab(btn.dataset.adminTab));
        });

        const runSearch = () => {
          window.clearTimeout(searchTimer);
          load(searchInput.value.trim());
        };
        $("#adminSearchBtn", body).addEventListener("click", runSearch);
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch();
          }
        });
        searchInput.addEventListener("input", () => {
          window.clearTimeout(searchTimer);
          searchTimer = window.setTimeout(runSearch, 300);
        });

        body.querySelectorAll("[data-admin-amount]").forEach((btn) => {
          btn.addEventListener("click", () => {
            amountInput.value = btn.dataset.adminAmount;
            amountInput.focus();
          });
        });

        grantBtn.addEventListener("click", async () => {
          if (!selectedUser || busy) return;
          const amount = Number(amountInput.value);
          if (!Number.isFinite(amount) || amount <= 0) {
            toast("Enter an amount", "Use a cash amount greater than zero.", "error");
            amountInput.focus();
            return;
          }
          busy = true;
          grantBtn.disabled = true;
          grantBtn.textContent = "Sending…";
          try {
            const data = await socialApi("/admin/grant", {
              method: "POST",
              body: { userId: selectedUser.id, amount, note: noteInput.value.trim() },
            });
            toast("Cash sent", `${fmtMoney(amount)} went to @${selectedUser.username}.`, "success", 5000);
            amountInput.value = "";
            noteInput.value = "";
            selectedUser = data.user || selectedUser;
            setTarget(selectedUser);
            await load(searchInput.value.trim());
            await refreshMe();
          } catch (err) {
            if (err.status === 401) handleSessionExpired();
            else toast("Could not send cash", err.message || "Try again.", "error", 5000);
          } finally {
            busy = false;
            grantBtn.disabled = !selectedUser;
            grantBtn.textContent = "Give cash";
          }
        });

        publishBtn.addEventListener("click", async () => {
          if (busy) return;
          const text = announceInput.value.trim();
          if (!text) {
            toast("Write something first", "The announcement cannot be empty.", "error");
            announceInput.focus();
            return;
          }
          busy = true;
          publishBtn.disabled = true;
          publishBtn.textContent = "Publishing…";
          try {
            const data = await socialApi("/admin/announcement", { method: "POST", body: { text } });
            renderAdminAnnouncement(body, data.announcement || null);
            renderAnnouncement(data.announcement || null, true);
            announceInput.value = "";
            announcementLive = !!data.announcement;
            clearBtn.disabled = !announcementLive;
            toast("Announcement live", "Everyone will see it on their next refresh.", "success", 5000);
            await load(searchInput.value.trim());
          } catch (err) {
            if (err.status === 401) handleSessionExpired();
            else toast("Could not publish", err.message || "Try again.", "error", 5000);
          } finally {
            busy = false;
            publishBtn.disabled = false;
            publishBtn.textContent = "Publish announcement";
          }
        });

        clearBtn.addEventListener("click", async () => {
          if (busy) return;
          busy = true;
          clearBtn.disabled = true;
          clearBtn.textContent = "Removing…";
          try {
            await socialApi("/admin/announcement", { method: "DELETE" });
            renderAdminAnnouncement(body, null);
            renderAnnouncement(null, true);
            announcementLive = false;
            clearBtn.disabled = true;
            toast("Announcement removed", "The banner is gone for everyone.", "info", 4500);
            await load(searchInput.value.trim());
          } catch (err) {
            if (err.status === 401) handleSessionExpired();
            else toast("Could not remove", err.message || "Try again.", "error", 5000);
          } finally {
            busy = false;
            clearBtn.disabled = !announcementLive;
            clearBtn.textContent = "Remove current";
          }
        });

        load();
        return () => window.clearTimeout(searchTimer);
      },
    });
  }

  /* ============================== HOME RENDERING ============================== */

  const GROUPS = [
    { id: "originals", label: "Originals" },
    { id: "table", label: "Table" },
    { id: "slots", label: "Slots" },
  ];

  function cardArt(meta) {
    return `<span class="card-glow"></span><span class="card-icon">${icon(meta.id)}</span>`;
  }

  function renderSideNav() {
    const nav = $("#sideNav");
    if (!nav) return;
    nav.innerHTML = GROUPS.map((group) => {
      const games = GAME_META.filter((g) => g.cat === group.id);
      return `<p class="side-label" style="margin-top:${group.id === "originals" ? "2px" : "18px"}">${group.label}</p>` +
        games
          .map(
            (g) => `<button class="side-game" type="button" data-game="${g.id}">
              <span class="sg-icon">${icon(g.id)}</span><span>${esc(g.name)}</span>
              ${g.hot ? '<span class="sg-badge">HOT</span>' : ""}
            </button>`
          )
          .join("");
    }).join("");
  }

  function renderGameGrid() {
    const grid = $("#gameGrid");
    if (!grid) return;
    grid.innerHTML = GAME_META.map(
      (g) => `<button class="game-card" type="button" data-game="${g.id}" data-cat="${g.cat}" style="--c1:${g.c1};--c2:${g.c2}">
        <span class="card-art">
          ${cardArt(g)}
          ${g.hot ? '<span class="card-badge card-badge--hot">HOT</span>' : `<span class="card-badge">${esc(g.cat === "originals" ? "Original" : g.cat === "table" ? "Table" : "Slot")}</span>`}
          <span class="card-rtp">${esc(g.label)}</span>
        </span>
        <span class="card-meta">
          <span><h3>${esc(g.name)}</h3><p>${esc(g.desc)}</p></span>
          <span class="play-chip" aria-hidden="true">▶</span>
        </span>
      </button>`
    ).join("");
  }

  function bindFilters() {
    const filters = $("#gameFilters");
    if (!filters) return;
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      const filter = btn.dataset.filter;
      filters.querySelectorAll(".filter").forEach((b) => b.classList.toggle("is-active", b === btn));
      $$(".game-card").forEach((card) => {
        const show = filter === "all" || card.dataset.cat === filter;
        card.style.display = show ? "" : "none";
      });
      sound.click();
    });
  }

  /* ============================== HERO ============================== */

  let heroIndex = 0;
  let heroTimer = null;

  function goHero(index, manual = false) {
    const track = $("#heroTrack");
    if (!track) return;
    const count = track.children.length;
    heroIndex = ((index % count) + count) % count;
    track.style.transform = `translateX(-${heroIndex * 100}%)`;
    $$("#heroDots .hero-dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === heroIndex);
      dot.setAttribute("aria-selected", i === heroIndex ? "true" : "false");
    });
    if (manual) resetHeroTimer();
  }

  function resetHeroTimer() {
    if (heroTimer) window.clearInterval(heroTimer);
    heroTimer = window.setInterval(() => {
      if (document.hidden) return;
      if (state.settings.reduceMotion) return;
      goHero(heroIndex + 1);
    }, 7000);
  }

  function bindHero() {
    const dots = $("#heroDots");
    if (dots) {
      dots.addEventListener("click", (e) => {
        const dot = e.target.closest("[data-slide]");
        if (!dot) return;
        goHero(Number(dot.dataset.slide), true);
      });
    }
    const hero = $("#heroCarousel");
    if (hero) {
      hero.addEventListener("mouseenter", () => heroTimer && window.clearInterval(heroTimer));
      hero.addEventListener("mouseleave", resetHeroTimer);
    }
    resetHeroTimer();
  }

  /* ============================== ACCOUNTS / SOCIAL ============================== */

  const SOCIAL_API = "/api";
  let socialInitPromise = null;
  let chatLatestSeq = 0;
  let chatPollTimer = 0;
  let chatPollBusy = false;
  let chatPollingStarted = false;
  let leaderboardSort = "balance";

  const LB_SORTS = [
    { id: "balance", label: "Balance" },
    { id: "wagered", label: "Wagered" },
    { id: "best", label: "Best win" },
    { id: "net", label: "Profit" },
  ];

  const LOCAL_ACCOUNTS_KEY = "wagerx.local.accounts.v1";
  const LOCAL_SESSION_KEY = "wagerx.local.session.v1";
  const LOCAL_CHAT_KEY = "wagerx.local.chat.v1";
  const LOCAL_COLORS = ["#c4b5fd", "#c8ff3d", "#ff9f43", "#3de0ff", "#ff7ba8", "#fbbf24", "#b69bff", "#86efac"];
  let localMode = false;

  function localRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function localWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function localAccounts() {
    const list = localRead(LOCAL_ACCOUNTS_KEY, []);
    return Array.isArray(list) ? list.filter((account) => account && account.id && account.username) : [];
  }

  function saveLocalAccounts(accounts) {
    localWrite(LOCAL_ACCOUNTS_KEY, accounts);
  }

  function localSetSession(id) {
    try {
      if (id) localStorage.setItem(LOCAL_SESSION_KEY, id);
      else localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function localChat() {
    const messages = localRead(LOCAL_CHAT_KEY, []);
    if (!Array.isArray(messages)) return [];
    const real = messages.filter((message) => {
      if (!message || !message.userId) return false;
      const id = String(message.userId);
      return !id.startsWith("demo_") && !id.startsWith("local_demo_");
    });
    if (real.length !== messages.length) localWrite(LOCAL_CHAT_KEY, real);
    return real;
  }

  function saveLocalChat(messages) {
    localWrite(LOCAL_CHAT_KEY, messages);
  }

  function localId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return `local_${crypto.randomUUID()}`;
    return `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  function localSalt() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  function localColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return LOCAL_COLORS[hash % LOCAL_COLORS.length];
  }

  function weakHash(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }

  async function localHash(password, salt) {
    const text = `${salt}:${password}:wagerx-local`;
    try {
      if (window.crypto && window.crypto.subtle) {
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch (err) {
      /* fall back below */
    }
    return weakHash(text);
  }

  function localUserRow(account) {
    const wagered = Number(account.wagered) || 0;
    return {
      ...account,
      level: levelInfo(wagered).level,
      net: round2((Number(account.won) || 0) - wagered),
    };
  }

  function applyLocalUser(account, { loadStats = true, keepHistory = false } = {}) {
    if (!account || !account.id) return;
    const previousId = state.account ? state.account.id : null;
    state.account = {
      id: account.id,
      username: account.username,
      color: account.color || localColor(account.username),
      createdAt: Number(account.createdAt) || Date.now(),
      admin: false,
    };
    state.name = state.account.username;
    state.balanceRevision = 0;
    state.balanceBase = state.balance;

    if (loadStats) {
      const safe = (value, fallback) => (Number.isFinite(Number(value)) ? round2(Number(value)) : fallback);
      state.balance = safe(account.balance, state.balance);
      state.wagered = safe(account.wagered, state.wagered);
      state.won = safe(account.won, state.won);
      state.rounds = Number.isFinite(Number(account.rounds)) ? Math.max(0, Math.floor(Number(account.rounds))) : state.rounds;
      state.bestWin = safe(account.bestWin, state.bestWin);
      if (!keepHistory && previousId !== account.id) state.history = [];
      if (account.discordClaimed) state.bonuses.discord = account.discordClaimedAt || state.bonuses.discord || Date.now();
      else if (previousId !== account.id) state.bonuses.discord = null;
    }

    state.lastLevel = levelInfo().level;
    localSetSession(account.id);
    save({ skipSync: true });
    markStatsSynced();
    updateUI();
  }

  function syncLocalAccount() {
    if (!localMode || !state.account) return false;
    const accounts = localAccounts();
    const account = accounts.find((item) => item.id === state.account.id);
    if (!account) return false;
    account.balance = state.balance;
    account.wagered = state.wagered;
    account.won = state.won;
    account.rounds = state.rounds;
    account.bestWin = state.bestWin;
    account.discordClaimed = !!state.bonuses.discord;
    account.discordClaimedAt = state.bonuses.discord || null;
    saveLocalAccounts(accounts);
    lastStatsSignature = statsSignature();
    return true;
  }

  function enableLocalMode() {
    if (localMode) return;
    localMode = true;
    socialOnline = true;
    const accounts = localAccounts();
    const sessionId = (() => {
      try {
        return localStorage.getItem(LOCAL_SESSION_KEY) || "";
      } catch (err) {
        return "";
      }
    })();
    const account = accounts.find((item) => item.id === sessionId);
    if (account) {
      applyLocalUser(account, { loadStats: true, keepHistory: false });
    } else {
      state.account = null;
      state.name = "guest";
      save({ skipSync: true });
      updateUI();
    }
    renderAnnouncement(null);
    updateAuthUI();
  }

  async function localSignup(username, password) {
    const accounts = localAccounts();
    if (accounts.some((item) => String(item.usernameLower || item.username).toLowerCase() === username.toLowerCase())) {
      throw new Error("That username is already on the floor.");
    }
    const salt = localSalt();
    const passwordHash = await localHash(password, salt);
    const account = {
      id: localId(),
      username,
      usernameLower: username.toLowerCase(),
      salt,
      passwordHash,
      color: localColor(username),
      createdAt: Date.now(),
      balance: state.balance,
      wagered: state.wagered,
      won: state.won,
      rounds: state.rounds,
      bestWin: state.bestWin,
      discordClaimed: !!state.bonuses.discord,
      discordClaimedAt: state.bonuses.discord || null,
    };
    accounts.push(account);
    saveLocalAccounts(accounts);
    localSetSession(account.id);
    return account;
  }

  async function localLogin(username, password) {
    const account = localAccounts().find(
      (item) => String(item.usernameLower || item.username).toLowerCase() === username.toLowerCase()
    );
    if (!account) throw new Error("Wrong username or password.");
    const hash = await localHash(password, account.salt);
    if (hash !== account.passwordHash) throw new Error("Wrong username or password.");
    localSetSession(account.id);
    return account;
  }

  function localLeaderboardPlayers() {
    const rows = localAccounts()
      .filter((account) => !String(account.id || "").startsWith("local_demo_"))
      .map(localUserRow);
    if (state.account) {
      const current = rows.find((row) => row.id === state.account.id);
      if (current) {
        current.balance = state.balance;
        current.wagered = state.wagered;
        current.won = state.won;
        current.bestWin = state.bestWin;
        current.rounds = state.rounds;
        current.net = round2(state.won - state.wagered);
      }
    }
    const sorters = {
      balance: (a, b) => b.balance - a.balance || b.wagered - a.wagered,
      wagered: (a, b) => b.wagered - a.wagered || b.balance - a.balance,
      best: (a, b) => b.bestWin - a.bestWin || b.balance - a.balance,
      net: (a, b) => b.net - a.net || b.balance - a.balance,
    };
    rows.sort(sorters[leaderboardSort] || sorters.balance);
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
    return rows;
  }


  async function socialApi(path, { method = "GET", body = null, timeout = 9000 } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(SOCIAL_API + path, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (err) {
          payload = null;
        }
      }
      if (res.status === 204) return null;
      if (!res.ok) {
        const error = new Error((payload && payload.error) || `Server error (${res.status})`);
        error.status = res.status;
        error.code = payload && payload.code ? String(payload.code) : "";
        throw error;
      }
      if (payload === null) {
        const error = new Error("Social API unavailable.");
        error.status = 404;
        throw error;
      }
      return payload;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The social server took too long to respond.");
      if (err instanceof TypeError) throw new Error("Social server offline. Start the WagerX server and try again.");
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function statsPayload() {
    return {
      balance: state.balance,
      balanceRevision: Number(state.balanceRevision) || 0,
      balanceBase: Number(state.balanceBase) || 0,
      wagered: state.wagered,
      won: state.won,
      rounds: state.rounds,
      bestWin: state.bestWin,
      discordClaimed: !!state.bonuses.discord,
    };
  }

  function statsSignature() {
    return JSON.stringify(statsPayload());
  }

  function markStatsSynced() {
    lastStatsSignature = statsSignature();
  }

  function scheduleStatsSync(delay = 700) {
    if (!state.account || !authReady) return;
    if (localMode) {
      syncLocalAccount();
      return;
    }
    window.clearTimeout(statsSyncTimer);
    statsSyncTimer = window.setTimeout(() => {
      syncStatsNow();
    }, delay);
  }

  async function syncStatsNow(force = false) {
    if (!state.account || !authReady) return false;
    if (localMode) {
      syncLocalAccount();
      return true;
    }
    const payload = statsPayload();
    const signature = JSON.stringify(payload);
    if (!force && signature === lastStatsSignature) return true;
    if (statsSyncInflight) {
      statsSyncQueued = true;
      return statsSyncInflight;
    }
    statsSyncInflight = socialApi("/me/stats", { method: "PATCH", body: payload })
      .then((data) => {
        if (data && data.user) {
          if (statsSignature() === signature) {
            applyServerMeta(data.user, { applyBalance: true });
          } else {
            // The player acted again while this request was in flight. Keep the
            // new local state and let the queued sync reconcile it.
            state.account.admin = !!data.user.admin;
            noteGift(data.user);
            save({ skipSync: true });
            updateUI();
            lastStatsSignature = signature;
            scheduleStatsSync(120);
          }
        } else {
          lastStatsSignature = signature;
        }
        socialOnline = true;
        return true;
      })
      .catch((err) => {
        if (err.status === 401) handleSessionExpired();
        return false;
      })
      .finally(() => {
        statsSyncInflight = null;
        if (statsSyncQueued) {
          statsSyncQueued = false;
          scheduleStatsSync(120);
        }
      });
    return statsSyncInflight;
  }

  function handleSessionExpired() {
    if (!state.account) return;
    state.account = null;
    state.name = "guest";
    save({ skipSync: true });
    updateUI();
    updateAuthUI();
    toast("Session expired", "Log in again to chat and rank.", "error", 5000);
  }

  function noteGift(user) {
    const gift = user && user.lastGift;
    if (!gift || !gift.id || gift.id === state.seenGift) return;
    state.seenGift = gift.id;
    const amount = Number(gift.amount) || 0;
    const at = Number(gift.at) || 0;
    if (amount > 0 && (!at || Date.now() - at < 7 * 24 * 60 * 60 * 1000)) {
      const note = gift.note ? ` · ${gift.note}` : "";
      window.setTimeout(() => toast("Cash from the house", `+${fmtMoney(amount)}${note}`, "success", 6500), 450);
    }
  }

  function applyServerMeta(user, { applyBalance = false } = {}) {
    if (!user || !user.id) return;
    if (state.account && state.account.id === String(user.id)) {
      state.account.admin = !!user.admin;
    }
    const revision = Number.isFinite(Number(user.balanceRevision)) ? Number(user.balanceRevision) : 0;
    const serverBalance = Number.isFinite(Number(user.balance)) ? round2(Number(user.balance)) : state.balance;
    if (applyBalance) {
      state.balance = serverBalance;
      state.balanceBase = serverBalance;
      state.balanceRevision = revision;
      updateBalanceUI(true);
      markStatsSynced();
    }
    noteGift(user);
    save({ skipSync: true });
    updateUI();
  }

  function applyServerUser(user, { loadStats = true, keepHistory = true } = {}) {
    if (!user || !user.id) return;
    const previousId = state.account ? state.account.id : null;
    state.account = {
      id: String(user.id),
      username: String(user.username || "player").slice(0, 18),
      color: user.color || "#c8ff3d",
      createdAt: Number(user.createdAt) || Date.now(),
      admin: !!user.admin,
    };
    state.name = state.account.username;
    state.balanceRevision = Number.isFinite(Number(user.balanceRevision)) ? Number(user.balanceRevision) : 0;
    state.balanceBase = Number.isFinite(Number(user.balance)) ? round2(Number(user.balance)) : state.balance;

    if (loadStats) {
      const safe = (value, fallback) => (Number.isFinite(Number(value)) ? round2(Number(value)) : fallback);
      state.balance = safe(user.balance, state.balance);
      state.wagered = safe(user.wagered, state.wagered);
      state.won = safe(user.won, state.won);
      state.rounds = Number.isFinite(Number(user.rounds)) ? Math.max(0, Math.floor(Number(user.rounds))) : state.rounds;
      state.bestWin = safe(user.bestWin, state.bestWin);
      if (!keepHistory && previousId !== state.account.id) state.history = [];
      if (user.discordClaimed) state.bonuses.discord = state.bonuses.discord || Date.now();
      else if (previousId !== state.account.id) state.bonuses.discord = null;
    }

    state.lastLevel = levelInfo().level;
    noteGift(user);
    save({ skipSync: true });
    markStatsSynced();
    updateUI();
  }

  function updateAuthUI() {
    const signedIn = !!state.account;
    const online = socialOnline;
    const input = $("#chatInput");
    const submit = $("#chatForm button[type='submit']");
    if (input) {
      input.readOnly = !signedIn || !online;
      input.placeholder = !online
        ? "Chat is offline"
        : signedIn
          ? "Message #general"
          : "Log in or sign up to chat";
    }
    if (submit) submit.disabled = !signedIn || !online;

    const prompt = $("#chatAuthPrompt");
    if (prompt) prompt.classList.toggle("is-hidden", signedIn && online);
    const title = $("#chatPromptTitle");
    const text = $("#chatPromptText");
    const button = $("#chatAuthBtn");
    const loginButton = $("#chatLoginBtn");
    if (loginButton) loginButton.classList.toggle("is-hidden", !online || signedIn);
    if (title && text && button) {
      if (!online) {
        title.textContent = "Chat is offline";
        text.textContent = "Start the WagerX server, then retry.";
        button.textContent = "Retry";
        button.dataset.open = "chat-retry";
      } else if (!signedIn) {
        title.textContent = localMode ? "Join the local floor" : "Join the conversation";
        text.textContent = localMode
          ? "Log in, or create a local account on this browser."
          : "Log in to an existing account, or create a new one.";
        button.textContent = "Sign up";
        button.dataset.open = "auth";
      } else {
        title.textContent = localMode ? "Local chat" : "You're in";
        text.textContent = localMode ? "Messages stay in this browser." : "Say something to the floor.";
        button.textContent = "Chat";
        button.dataset.open = "chat";
      }
    }

    const sideAuth = $("#sideAuth");
    if (sideAuth) sideAuth.classList.toggle("is-hidden", signedIn);
    const accountBtn = $("#accountBtn");
    if (accountBtn) accountBtn.title = signedIn ? `@${state.name}` : "Create an account";
  }

  async function initSocial() {
    if (socialInitPromise) return socialInitPromise;
    socialInitPromise = (async () => {
      authReady = false;
      try {
        const data = await socialApi("/me");
        if (data && data.user) {
          const previousId = state.account ? state.account.id : null;
          applyServerUser(data.user, { loadStats: true, keepHistory: previousId === data.user.id });
          socialOnline = true;
        } else {
          state.account = null;
          state.name = "guest";
          socialOnline = true;
          save({ skipSync: true });
          updateUI();
        }
      } catch (err) {
        if (err.status === 401) {
          if (state.account) toast("Session expired", "Log in again to chat and rank.", "error", 5000);
          state.account = null;
          state.name = "guest";
          socialOnline = true;
          save({ skipSync: true });
          updateUI();
        } else if (err.status === 404 || err.status === 405 || err.status === 501 || !err.status) {
          enableLocalMode();
        } else {
          socialOnline = false;
          updateUI();
        }
      }
      authReady = true;
      updateAuthUI();
      await loadChat(true);
      startChatPolling();
      startAccountPolling();
      if (state.account) scheduleStatsSync(0);
    })().finally(() => {
      socialInitPromise = null;
    });
    return socialInitPromise;
  }

  let accountPollTimer = 0;
  let accountPollBusy = false;

  async function refreshMe() {
    if (localMode || !state.account || accountPollBusy) return;
    accountPollBusy = true;
    try {
      const data = await socialApi("/me");
      if (!data || !data.user) {
        handleSessionExpired();
        return;
      }
      const user = data.user;
      if (state.account) state.account.admin = !!user.admin;
      const serverRevision = Number(user.balanceRevision) || 0;
      const revisionChanged = serverRevision !== (Number(state.balanceRevision) || 0);
      const dirty = statsSignature() !== lastStatsSignature;
      if (revisionChanged && !dirty && !gameLocked) {
        applyServerMeta(user, { applyBalance: true });
      } else {
        noteGift(user);
        save({ skipSync: true });
        updateUI();
      }
    } catch (err) {
      if (err.status === 401) handleSessionExpired();
    } finally {
      accountPollBusy = false;
    }
  }

  function startAccountPolling() {
    if (accountPollTimer) return;
    accountPollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshMe();
    }, 12000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshMe();
    });
  }

  function openAuth(mode = "signup") {
    if (state.account) {
      openAccount();
      return;
    }
    let tab = mode === "login" ? "login" : "signup";
    openModal({
      title: "Log in or create an account",
      subtitle: localMode
        ? "Log in to an existing local account, or create a new one."
        : "Log in to an existing account, or create a new one. No email required.",
      size: "slim",
      body: `
        <div class="auth-tabs">
          <button class="auth-tab" type="button" data-auth-tab="signup">Create account</button>
          <button class="auth-tab" type="button" data-auth-tab="login">Log in</button>
        </div>
        <form class="auth-form" id="authForm" novalidate>
          <label class="auth-field"><span>Username</span><input class="input-line" id="authUser" name="username" maxlength="18" autocomplete="username" placeholder="3-18 letters, numbers, _" required /></label>
          <label class="auth-field"><span>Password</span><input class="input-line" id="authPass" name="password" type="password" maxlength="128" autocomplete="current-password" placeholder="At least 8 characters" required /></label>
          <label class="auth-field" id="authConfirmWrap"><span>Confirm password</span><input class="input-line" id="authPass2" type="password" maxlength="128" autocomplete="new-password" placeholder="Repeat it" /></label>
          <div class="auth-error" id="authError"></div>
          <button class="btn btn-lime auth-submit" type="submit" id="authSubmit">Create account</button>
          <p class="auth-note">${
            localMode
              ? "Local mode: this page is not connected to the WagerX server. Accounts and chat are saved in this browser only. Do not reuse a real password."
              : "Your username appears in chat and on the leaderboard. Accounts are stored by the WagerX Node server. Do not reuse a real password."
          }</p>
        </form>
        <p class="auth-switch" id="authSwitch"></p>
      `,
      onMount: (body) => {
        const form = $("#authForm", body);
        const userInput = $("#authUser", body);
        const passInput = $("#authPass", body);
        const pass2Input = $("#authPass2", body);
        const confirmWrap = $("#authConfirmWrap", body);
        const errorBox = $("#authError", body);
        const submit = $("#authSubmit", body);
        const switchEl = $("#authSwitch", body);
        let busy = false;

        const showError = (message) => {
          errorBox.textContent = message;
          errorBox.classList.add("is-visible");
        };

        const setTab = (next) => {
          tab = next;
          body.querySelectorAll("[data-auth-tab]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.authTab === tab);
          });
          confirmWrap.style.display = tab === "signup" ? "" : "none";
          passInput.autocomplete = tab === "signup" ? "new-password" : "current-password";
          pass2Input.value = "";
          submit.textContent = tab === "signup" ? "Create account" : "Log in";
          switchEl.innerHTML =
            tab === "signup"
              ? `Already have a name? <button type="button" data-auth-switch="login">Log in</button>`
              : `New to WagerX? <button type="button" data-auth-switch="signup">Create an account</button>`;
          errorBox.classList.remove("is-visible");
          userInput.focus();
        };

        body.querySelectorAll("[data-auth-tab]").forEach((btn) => {
          btn.addEventListener("click", () => setTab(btn.dataset.authTab));
        });
        switchEl.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-auth-switch]");
          if (btn) setTab(btn.dataset.authSwitch);
        });
        setTab(tab);

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (busy) return;
          const username = userInput.value.trim();
          const password = passInput.value;
          if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) {
            showError("Username must be 3-18 characters: letters, numbers or underscore.");
            userInput.focus();
            return;
          }
          if (password.length < 8) {
            showError("Password must be at least 8 characters.");
            passInput.focus();
            return;
          }
          if (tab === "signup" && password !== pass2Input.value) {
            showError("Passwords do not match.");
            pass2Input.focus();
            return;
          }

          busy = true;
          submit.disabled = true;
          submit.textContent = tab === "signup" ? "Creating…" : "Logging in…";
          errorBox.classList.remove("is-visible");
          let usedLocal = localMode;
          try {
            if (!usedLocal) {
              try {
                const data =
                  tab === "signup"
                    ? await socialApi("/auth/signup", {
                        method: "POST",
                        body: { username, password, stats: statsPayload() },
                      })
                    : await socialApi("/auth/login", { method: "POST", body: { username, password } });
                if (!data || !data.user) {
                  const offline = new Error("Social API unavailable.");
                  offline.status = 404;
                  throw offline;
                }
                applyServerUser(data.user, { loadStats: true, keepHistory: tab === "signup" });
              } catch (err) {
                if (err.status === 404 || err.status === 405 || err.status === 501 || !err.status) {
                  enableLocalMode();
                  usedLocal = true;
                } else {
                  throw err;
                }
              }
            }
            if (usedLocal) {
              const account =
                tab === "signup" ? await localSignup(username, password) : await localLogin(username, password);
              applyLocalUser(account, { loadStats: true, keepHistory: tab === "signup" });
            }
            authReady = true;
            socialOnline = true;
            markStatsSynced();
            updateAuthUI();
            closeModal(true);
            toast(
              tab === "signup" ? (usedLocal ? "Local account created" : "Account created") : "Welcome back",
              usedLocal ? "Saved in this browser only. For shared chat and ranking, run the Node server." : `Signed in as ${state.name}.`,
              usedLocal ? "info" : "success",
              usedLocal ? 7000 : 4500
            );
            sound.win(2);
            await loadChat(true);
            const chatInput = $("#chatInput");
            if (chatInput) chatInput.focus();
          } catch (err) {
            if (err.status === 409 && err.code === "ACCOUNT_EXISTS" && tab === "signup") {
              setTab("login");
              showError("That username already has an account. Enter its password to log in.");
              passInput.focus();
              return;
            }
            showError(err && err.message ? err.message : "Could not connect to the social server.");
            if (err.status === 401 && tab === "login") {
              passInput.focus();
              if (err.code === "NO_ACCOUNT") {
                switchEl.innerHTML = `No account yet? <button type="button" data-auth-switch="signup">Create one</button>`;
              }
            }
          } finally {
            busy = false;
            submit.disabled = false;
            submit.textContent = tab === "signup" ? "Create account" : "Log in";
          }
        });
      },
    });
  }

  async function changeUsername(newName) {
    if (!state.account) {
      openAuth("signup");
      return false;
    }
    if (localMode) {
      const accounts = localAccounts();
      const lower = newName.toLowerCase();
      if (accounts.some((item) => item.id !== state.account.id && String(item.usernameLower || item.username).toLowerCase() === lower)) {
        toast("Could not update username", "That username is already on the floor.", "error", 5000);
        return false;
      }
      const account = accounts.find((item) => item.id === state.account.id);
      if (!account) return false;
      account.username = newName;
      account.usernameLower = lower;
      account.color = localColor(newName);
      saveLocalAccounts(accounts);
      state.account.username = newName;
      state.account.color = account.color;
      state.name = newName;
      save({ skipSync: true });
      updateUI();
      await loadChat(true);
      toast("Username updated", `You are now @${newName}.`, "success");
      return true;
    }
    try {
      const data = await socialApi("/me", { method: "PATCH", body: { username: newName } });
      state.account.username = data.user.username;
      state.account.color = data.user.color;
      state.name = data.user.username;
      save({ skipSync: true });
      updateUI();
      await loadChat(true);
      toast("Username updated", `You are now @${state.name}.`, "success");
      return true;
    } catch (err) {
      if (err.status === 401) handleSessionExpired();
      else toast("Could not update username", err.message || "Try a different name.", "error", 5000);
      return false;
    }
  }

  async function logoutAccount() {
    if (localMode) {
      syncLocalAccount();
      localSetSession("");
      state.account = null;
      state.name = "guest";
      lastStatsSignature = "";
      socialOnline = true;
      save({ skipSync: true });
      updateUI();
      updateAuthUI();
      closeModal(true);
      toast("Signed out", "Local session cleared. Your account stays in this browser.", "info", 4500);
      await loadChat(true);
      return;
    }
    try {
      await syncStatsNow(true);
      await socialApi("/auth/logout", { method: "POST" });
    } catch (err) {
      /* still clear the local session */
    }
    state.account = null;
    state.name = "guest";
    lastStatsSignature = "";
    socialOnline = true;
    save({ skipSync: true });
    updateUI();
    updateAuthUI();
    closeModal(true);
    toast("Signed out", "Your local wallet is now a guest wallet.", "info", 4500);
    await loadChat(true);
  }

  async function deleteAccount() {
    if (!state.account) return;
    if (localMode) {
      const id = state.account.id;
      saveLocalAccounts(localAccounts().filter((item) => item.id !== id));
      saveLocalChat(localChat().filter((message) => message.userId !== id));
      localSetSession("");
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(DISCORD_PENDING_KEY);
      } catch (err) {
        /* ignore */
      }
      window.location.reload();
      return;
    }
    try {
      await syncStatsNow(true);
      await socialApi("/me", { method: "DELETE" });
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(DISCORD_PENDING_KEY);
      } catch (err) {
        /* ignore */
      }
      window.location.reload();
    } catch (err) {
      if (err.status === 401) handleSessionExpired();
      else toast("Could not delete account", err.message || "Try again.", "error", 5000);
    }
  }

  function safeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#c8ff3d";
  }

  function openLeaderboard(sort = leaderboardSort) {
    leaderboardSort = LB_SORTS.some((item) => item.id === sort) ? sort : "balance";
    openModal({
      title: "Leaderboard",
      subtitle: localMode
        ? "Local floor — accounts and stats are saved in this browser."
        : "Real accounts on this floor. Play money, real bragging rights.",
      size: "wide",
      body: `
        <div class="lb-tabs" id="lbTabs">
          ${LB_SORTS.map(
            (item) =>
              `<button class="lb-tab ${item.id === leaderboardSort ? "is-active" : ""}" type="button" data-lb-sort="${item.id}">${item.label}</button>`
          ).join("")}
        </div>
        <div class="lb-body" id="lbBody"><div class="lb-loading">Reading the board…</div></div>
      `,
      onMount: (body) => {
        body.querySelectorAll("[data-lb-sort]").forEach((btn) => {
          btn.addEventListener("click", () => {
            leaderboardSort = btn.dataset.lbSort;
            body.querySelectorAll("[data-lb-sort]").forEach((other) => {
              other.classList.toggle("is-active", other === btn);
            });
            loadLeaderboard(body);
          });
        });
        loadLeaderboard(body);
      },
    });
  }

  async function loadLeaderboard(root) {
    const target = $("#lbBody", root);
    if (!target) return;
    target.innerHTML = `<div class="lb-loading">Reading the board…</div>`;
    if (localMode) {
      syncLocalAccount();
      updateAuthUI();
      renderLeaderboard(target, localLeaderboardPlayers());
      return;
    }
    if (state.account) await syncStatsNow(true);
    try {
      const data = await socialApi(`/leaderboard?sort=${encodeURIComponent(leaderboardSort)}`);
      socialOnline = true;
      const players = Array.isArray(data.players) ? data.players.slice() : [];
      if (data.me && !players.some((player) => player.id === data.me.id)) {
        players.push({ ...data.me, rank: players.length + 1 });
      }
      updateAuthUI();
      renderLeaderboard(target, players);
    } catch (err) {
      target.innerHTML = `<div class="lb-empty">Leaderboard offline.<br />Start the WagerX social server and open this window again.</div>`;
    }
  }

  function renderLeaderboard(root, players) {
    if (!players.length) {
      root.innerHTML = `<div class="lb-empty">No players on the board yet.<br /><button class="btn btn-lime" type="button" data-open="auth" style="margin-top:12px">Create the first account</button></div>`;
      return;
    }
    const myId = state.account ? state.account.id : null;
    const top = players.slice(0, 3);
    const podium = `<div class="lb-podium">${top
      .map(
        (player, index) => `<div class="lb-podium-card${index === 0 ? " is-first" : ""}">
          <div class="lb-podium-rank">#${player.rank}${index === 0 ? " · leader" : ""}</div>
          <div class="lb-avatar" style="background:${safeColor(player.color)}">${esc(
          String(player.username || "?").slice(0, 2).toUpperCase()
        )}</div>
          <div class="lb-podium-name">${esc(player.username || "player")}</div>
          <div class="lb-podium-bal">${fmtMoney(player.balance)}</div>
        </div>`
      )
      .join("")}</div>`;

    const lastLabel = leaderboardSort === "net" ? "Profit" : "Best win";
    const head = `<div class="lb-row lb-row--head"><span>#</span><span>Player</span><span>Level</span><span>Balance</span><span>Wagered</span><span>${lastLabel}</span></div>`;
    const rows = players
      .map(
        (player) => `<div class="lb-row${player.id === myId ? " is-me" : ""}">
          <span class="lb-rank">#${player.rank}</span>
          <span class="lb-player">
            <span class="lb-avatar" style="background:${safeColor(player.color)}">${esc(
          String(player.username || "?").slice(0, 2).toUpperCase()
        )}</span>
            <span class="lb-name">${esc(player.username || "player")}</span>
            ${player.id === myId ? '<span class="lb-you">You</span>' : ""}
          </span>
          <span class="lb-num">Lv ${player.level || 1}</span>
          <span class="lb-num lb-num--lime">${fmtMoney(player.balance)}</span>
          <span class="lb-num">${fmtMoney(player.wagered)}</span>
          <span class="lb-num">${fmtMoney(leaderboardSort === "net" ? player.net : player.bestWin)}</span>
        </div>`
      )
      .join("");

    const guest = state.account
      ? ""
      : `<div class="lb-guest"><span>You are browsing as a guest. Log in or create an account to put your name and stats on the board.</span><div class="lb-guest-actions"><button class="btn btn-ghost" type="button" data-open="auth-login">Log in</button><button class="btn btn-lime" type="button" data-open="auth">Create account</button></div></div>`;

    root.innerHTML = `${podium}<div class="lb-table">${head}${rows}</div>${guest}`;
  }

  function openChat() {
    const rail = $(".chat-rail");
    if (!rail) return;
    if (window.matchMedia("(max-width: 1280px)").matches) {
      rail.classList.add("is-open");
      $("#chatBackdrop")?.classList.add("is-open");
      document.body.classList.add("chat-open");
      closeSidebar();
    } else {
      if (state.account) $("#chatInput")?.focus();
      rail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function closeChatDrawer() {
    $(".chat-rail")?.classList.remove("is-open");
    $("#chatBackdrop")?.classList.remove("is-open");
    document.body.classList.remove("chat-open");
  }

  /* ============================== CHAT ============================== */

  function formatChatTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function renderChat() {
    const scroll = $("#chatScroll");
    if (!scroll) return;
    scroll.innerHTML = `<div class="chat-empty" id="chatEmpty">Connecting to the floor…</div>`;
    chatLatestSeq = 0;
    const online = $("#onlineCount");
    if (online) online.textContent = "—";
  }

  function appendChat(msg, doScroll = true) {
    const scroll = $("#chatScroll");
    if (!scroll) return;
    const el = document.createElement("div");
    const username = msg.username || msg.user || "player";
    if (msg.system) {
      el.className = "msg msg--system";
      el.innerHTML = `<b>${esc(username)}</b> won <span>${esc(msg.text)}</span> ✦ ${esc(msg.mult || "")}`;
    } else {
      el.className = "msg";
      el.dataset.seq = String(msg.seq || "");
      el.innerHTML = `<div class="msg-head"><span class="msg-user" style="color:${safeColor(
        msg.color
      )}">${esc(username)}</span><span class="msg-time">${esc(
        msg.time || formatChatTime(msg.createdAt)
      )}</span></div><div class="msg-text">${formatChatText(msg.text || "")}</div>`;
    }
    scroll.appendChild(el);
    if (doScroll) scroll.scrollTop = scroll.scrollHeight;
  }

  function formatChatText(text) {
    return esc(text).replace(/@([a-zA-Z0-9_]+)/g, '<span class="at">@$1</span>');
  }

  async function loadChat(reset = false) {
    if (chatPollBusy) return;
    chatPollBusy = true;
    try {
      const scroll = $("#chatScroll");
      const atBottom = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90;
      if (localMode) {
        socialOnline = true;
        if (reset && scroll) {
          scroll.innerHTML = "";
          chatLatestSeq = 0;
        }
        const messages = localChat();
        const fresh = messages.filter((message) => Number(message.seq) > chatLatestSeq);
        if (fresh.length) {
          $("#chatEmpty")?.remove();
          fresh.forEach((message) => appendChat(message, false));
          chatLatestSeq = Math.max(chatLatestSeq, ...fresh.map((message) => Number(message.seq) || 0));
          if (scroll && (reset || atBottom)) scroll.scrollTop = scroll.scrollHeight;
        } else if (scroll && !scroll.querySelector(".msg")) {
          scroll.innerHTML = `<div class="chat-empty" id="chatEmpty">${
            state.account ? "No messages yet. You're early — say hi." : "No messages yet. Log in or sign up and say hi."
          }</div>`;
        }
        const online = $("#onlineCount");
        if (online) online.textContent = String(Math.max(1, localAccounts().length));
        updateAuthUI();
        return;
      }
      const after = reset ? 0 : chatLatestSeq;
      const data = await socialApi(`/chat?after=${after}&limit=80`);
      socialOnline = true;
      if (reset && scroll) {
        scroll.innerHTML = "";
        chatLatestSeq = 0;
      }
      const fresh = (data.messages || []).filter((message) => Number(message.seq) > chatLatestSeq);
      if (fresh.length) {
        $("#chatEmpty")?.remove();
        fresh.forEach((message) => appendChat(message, false));
        chatLatestSeq = Math.max(chatLatestSeq, ...fresh.map((message) => Number(message.seq) || 0));
        if (scroll && (reset || atBottom)) scroll.scrollTop = scroll.scrollHeight;
      } else if (scroll && !scroll.querySelector(".msg")) {
        scroll.innerHTML = `<div class="chat-empty" id="chatEmpty">${
          state.account ? "No messages yet. You're early — say hi." : "No messages yet. Log in or sign up and say hi."
        }</div>`;
      }
      const online = $("#onlineCount");
      if (online) online.textContent = String(Math.max(1, Number(data.online) || 0));
      updateAuthUI();
    } catch (err) {
      socialOnline = false;
      const scroll = $("#chatScroll");
      if (scroll && !scroll.querySelector(".msg")) {
        scroll.innerHTML = `<div class="chat-empty" id="chatEmpty">Chat is offline. Start the WagerX server, then reload.</div>`;
      }
      updateAuthUI();
    } finally {
      chatPollBusy = false;
    }
  }

  function startChatPolling() {
    if (chatPollingStarted) return;
    chatPollingStarted = true;
    chatPollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadChat(false);
    }, 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") loadChat(false);
    });
  }

  function bindChat() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    if (!form || !input) return;

    input.addEventListener("focus", () => {
      if (!state.account) {
        input.blur();
        openAuth("login");
      } else if (!socialOnline) {
        input.blur();
        toast("Chat offline", "Start the WagerX server and retry.", "error");
      }
    });

    form.addEventListener("click", (e) => {
      if (!state.account) {
        e.preventDefault();
        openAuth("login");
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.account) {
        openAuth("login");
        return;
      }
      if (!socialOnline) {
        toast("Chat offline", "Start the WagerX server and retry.", "error");
        return;
      }
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      if (localMode) {
        const message = {
          seq: Math.max(Date.now(), chatLatestSeq + 1),
          userId: state.account.id,
          username: state.name,
          color: state.account.color || localColor(state.name),
          text,
          createdAt: Date.now(),
        };
        const messages = localChat();
        messages.push(message);
        saveLocalChat(messages);
        socialOnline = true;
        $("#chatEmpty")?.remove();
        appendChat(message);
        chatLatestSeq = message.seq;
        updateAuthUI();
        sound.tick();
        return;
      }
      try {
        const data = await socialApi("/chat", { method: "POST", body: { text } });
        socialOnline = true;
        if (data.message && Number(data.message.seq) > chatLatestSeq) {
          $("#chatEmpty")?.remove();
          appendChat(data.message);
          chatLatestSeq = Number(data.message.seq);
        }
        sound.tick();
      } catch (err) {
        input.value = text;
        if (err.status === 401) handleSessionExpired();
        else toast("Message not sent", err.message || "Try again.", "error", 5000);
      }
    });
  }


  /* ============================== RECENT WINS ============================== */

  function feedRowMarkup(entry, fresh = false) {
    return `<div class="feed-row${fresh ? " is-new" : ""}">
      <span class="feed-player"><span class="feed-avatar" style="background:${entry.color}">${esc(entry.name.slice(0, 2).toUpperCase())}</span><span>${esc(entry.name)}</span></span>
      <span class="feed-game">${esc(entry.game)}</span>
      <span class="feed-mult">${fmtMult(entry.mult)}</span>
      <span class="feed-pay">${fmtMoney(entry.payout)}</span>
    </div>`;
  }

  function recentWinEntries() {
    const name = state.name || "guest";
    const color = safeColor(state.account?.color || (name === "guest" ? "#8a8a9a" : localColor(name)));
    return state.history
      .filter((item) => Number(item.payout) > Number(item.bet))
      .slice(0, 6)
      .map((item) => {
        const meta = GAME_BY_ID[item.game];
        return {
          name,
          color,
          game: item.name || (meta ? meta.name : "Game"),
          mult: Number(item.mult) || 0,
          payout: Number(item.payout) || 0,
        };
      });
  }

  function renderRecentWins() {
    const feed = $("#liveFeed");
    if (!feed) return;
    const entries = recentWinEntries();
    feed.innerHTML = entries.length
      ? entries.map((entry, index) => feedRowMarkup(entry, index === 0)).join("")
      : `<div class="feed-empty">No wins yet. Your real wins will appear here after you play.</div>`;
  }

  /* ============================== GAME VIEW ============================== */

  const gameView = $("#gameView");
  const gameStage = $("#gameStage");
  const gamePanel = $("#gamePanel");
  let currentGame = null;
  let gameLocked = false;

  function openGame(id) {
    const meta = GAME_BY_ID[id];
    const impl = gameImpls[id];
    if (!meta) return;
    if (!impl) {
      toast("Game is still loading", "Give the page a second and try again.", "error");
      return;
    }
    closeModal(true);
    closeSidebar();
    currentGame = { id, meta };
    gameLocked = false;
    if (window.__wagerxActiveCleanup) {
      try {
        window.__wagerxActiveCleanup();
      } catch (err) {
        /* ignore */
      }
      window.__wagerxActiveCleanup = null;
    }
    $("#gvTitle").textContent = meta.name;
    $("#gvSub").textContent = meta.desc;
    $("#gvTag").textContent = meta.cat === "originals" ? "Original" : meta.cat === "table" ? "Table" : "Slot";
    $("#gvIcon").innerHTML = icon(meta.id);
    gameStage.innerHTML = "";
    gamePanel.innerHTML = "";
    gameView.classList.add("is-open");
    gameView.setAttribute("aria-hidden", "false");
    document.body.classList.add("game-open");
    gameView.scrollTop = 0;
    updateUI();
    try {
      impl.mount(gameStage, gamePanel);
    } catch (err) {
      console.error("[wagerx] game mount failed:", err);
      gameStage.innerHTML = `<div class="stage-center"><p style="color:#9494a8;font-size:12px">This table hit a snag. Go back and reopen it.</p></div>`;
    }
    sound.click();
  }

  function closeGame(force = false) {
    if (!gameView || !gameView.classList.contains("is-open")) return;
    if (gameLocked && !force) {
      toast("Finish the round first", "Cash out or let it resolve before leaving.", "error");
      return;
    }
    gameView.classList.remove("is-open");
    gameView.setAttribute("aria-hidden", "true");
    if (!document.body.classList.contains("modal-open")) document.body.classList.remove("game-open");
    if (window.__wagerxActiveCleanup) {
      try {
        window.__wagerxActiveCleanup();
      } catch (err) {
        /* ignore */
      }
      window.__wagerxActiveCleanup = null;
    }
    currentGame = null;
    gameLocked = false;
    gameStage.innerHTML = "";
    gamePanel.innerHTML = "";
    sound.click();
  }

  function setGameLock(locked) {
    gameLocked = !!locked;
  }

  /* ============================== SIDEBAR ============================== */

  function openSidebar() {
    document.body.classList.add("sidebar-open");
  }
  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  /* ============================== BET MODULE ============================== */

  function betModule(panel, opts = {}) {
    const {
      value = 10,
      min = 1,
      max = MAX_BET,
      action = "Play",
      note = "",
      presets = [10, 50, 100, 500],
      extraHtml = "",
    } = opts;
    panel.innerHTML = `
      <div class="gp-card">
        <div class="gp-head"><span>Bet amount</span><button class="gp-max" type="button" data-bet-max>MAX</button></div>
        <div class="bet-input-row">
          <div class="bet-input"><span>$</span><input type="number" min="${min}" max="${max}" step="1" value="${value}" inputmode="decimal" aria-label="Bet amount" /></div>
          <button class="mini-btn" type="button" data-bet-half>½</button>
          <button class="mini-btn" type="button" data-bet-double>2×</button>
        </div>
        <div class="preset-row">${presets.map((p) => `<button type="button" data-bet-set="${p}">$${fmtCompact(p)}</button>`).join("")}</div>
        <div class="gp-options">${extraHtml}</div>
        <button class="act-btn" type="button" data-act>${esc(action)}</button>
        <div class="game-result" aria-live="polite"></div>
        ${note ? `<p class="gp-note">${note}</p>` : ""}
      </div>`;

    const input = $("input", panel);
    const betInputWrap = $(".bet-input", panel);
    const actionBtn = $("[data-act]", panel);
    const result = $(".game-result", panel);
    const options = $(".gp-options", panel);
    const noteEl = $(".gp-note", panel);
    const quickEls = $$("[data-bet-max], [data-bet-half], [data-bet-double], [data-bet-set]", panel);

    const readAmount = () => {
      let n = parseFloat(input.value);
      if (!Number.isFinite(n)) n = min;
      n = Math.round(n * 100) / 100;
      return clamp(n, min, max);
    };
    const setAmount = (n) => {
      const next = clamp(Math.round(Number(n) * 100) / 100, min, max);
      input.value = String(next);
    };
    const lockBet = (locked) => {
      input.disabled = !!locked;
      quickEls.forEach((el) => (el.disabled = !!locked));
      betInputWrap.classList.toggle("is-locked", !!locked);
    };
    const setAction = (label, disabled = false) => {
      actionBtn.textContent = label;
      actionBtn.disabled = !!disabled;
    };
    const setResult = (tone, valueHtml, label) => {
      const toneClass = tone === "win" ? "is-win" : tone === "loss" ? "is-lose" : tone === "push" ? "is-push" : "";
      result.innerHTML = `<div class="result-box ${toneClass}"><strong>${valueHtml}</strong>${label ? `<span>${esc(label)}</span>` : ""}</div>`;
      result.classList.add("is-visible");
    };
    const clearResult = () => {
      result.classList.remove("is-visible");
      result.innerHTML = "";
    };
    const setNote = (html) => {
      if (noteEl) noteEl.innerHTML = html;
    };

    $("[data-bet-max]", panel).addEventListener("click", () => setAmount(Math.min(max, state.balance)));
    $("[data-bet-half]", panel).addEventListener("click", () => setAmount(Math.max(min, readAmount() / 2)));
    $("[data-bet-double]", panel).addEventListener("click", () => setAmount(readAmount() * 2));
    panel.querySelectorAll("[data-bet-set]").forEach((btn) => {
      btn.addEventListener("click", () => setAmount(Number(btn.dataset.betSet)));
    });
    input.addEventListener("change", () => setAmount(readAmount()));
    input.addEventListener("blur", () => setAmount(readAmount()));

    return {
      panel,
      input,
      options,
      action: actionBtn,
      result,
      amount: readAmount,
      setAmount,
      lockBet,
      setAction,
      setResult,
      clearResult,
      setNote,
      note: noteEl,
    };
  }

  /* ============================== CARD HELPERS ============================== */

  const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };

  function makeDeck(decks = 1) {
    const ranks = [
      ["A", 11],
      ["2", 2],
      ["3", 3],
      ["4", 4],
      ["5", 5],
      ["6", 6],
      ["7", 7],
      ["8", 8],
      ["9", 9],
      ["10", 10],
      ["J", 10],
      ["Q", 10],
      ["K", 10],
    ];
    const deck = [];
    for (let d = 0; d < decks; d++) {
      for (const suit of ["s", "h", "d", "c"]) {
        for (const [rank, value] of ranks) {
          deck.push({ rank, suit, value, id: `${d}-${suit}-${rank}` });
        }
      }
    }
    return deck;
  }

  function cardHTML(card, opts = {}) {
    const { size = "", hidden = false, extraClass = "" } = opts;
    const sizeClass = size === "sm" ? " playing-card--sm" : size === "lg" ? " playing-card--lg" : "";
    if (hidden || !card) {
      return `<div class="playing-card is-back${sizeClass}${extraClass ? " " + extraClass : ""}" aria-label="Hidden card"></div>`;
    }
    const red = card.suit === "h" || card.suit === "d";
    const suit = SUITS[card.suit] || "?";
    return `<div class="playing-card${red ? " is-red" : ""}${sizeClass}${extraClass ? " " + extraClass : ""}" aria-label="${card.rank} of ${card.suit}">
      <span class="pc-corner">${card.rank}<i>${suit}</i></span>
      <span class="pc-center">${suit}</span>
      <span class="pc-corner pc-corner--br">${card.rank}<i>${suit}</i></span>
    </div>`;
  }

  function handTotal(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
      total += card.value;
      if (card.rank === "A") aces += 1;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  /* ============================== BOOT / EVENTS ============================== */

  function bindGlobal() {
    document.addEventListener("click", (e) => {
      const gameBtn = e.target.closest("[data-game]");
      if (gameBtn) {
        e.preventDefault();
        openGame(gameBtn.dataset.game);
        return;
      }
      const openBtn = e.target.closest("[data-open]");
      if (openBtn) {
        e.preventDefault();
        const what = openBtn.dataset.open;
        if (what === "cashier" || what === "bonus") openCashier();
        else if (what === "discord") openDiscord();
        else if (what === "chat") openChat();
        else if (what === "auth") openAuth("signup");
        else if (what === "auth-login") openAuth("login");
        else if (what === "leaderboard") openLeaderboard();
        else if (what === "history") openHistory();
        else if (what === "fairness") openFairness();
        else if (what === "account") openAccount();
        else if (what === "admin") openAdmin();
        else if (what === "chat-retry") {
          socialOnline = true;
          initSocial();
        }
        return;
      }
      if (e.target.closest("[data-modal-close]")) {
        closeModal();
        return;
      }
      if (e.target.closest("#chatClose") || e.target.closest("#chatBackdrop")) {
        closeChatDrawer();
        return;
      }
      if (e.target.closest("#siteAnnouncementClose")) {
        dismissAnnouncement();
        return;
      }
      if (e.target.closest("[data-home]")) {
        e.preventDefault();
        closeGame();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (e.target.closest("[data-scroll-games]")) {
        closeSidebar();
        const games = $("#games");
        if (games) games.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (e.target.closest("#menuBtn")) {
        openSidebar();
        return;
      }
      if (e.target.closest("#sideClose") || e.target.closest("#mobileScrim")) {
        closeSidebar();
        return;
      }
      if (e.target.closest("#dailyHomeBtn")) {
        claimDaily();
        return;
      }
      if (e.target.closest("#soundBtn")) {
        state.settings.sound = !state.settings.sound;
        save();
        updateSoundUI();
        if (state.settings.sound) sound.click();
        return;
      }
      if (e.target.closest("#gvBack")) {
        closeGame();
        return;
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (modalRoot && modalRoot.classList.contains("is-open")) {
        closeModal();
      } else if (document.body.classList.contains("chat-open")) {
        closeChatDrawer();
      } else if (document.body.classList.contains("sidebar-open")) {
        closeSidebar();
      } else if (gameView && gameView.classList.contains("is-open")) {
        closeGame();
      }
    });

    window.addEventListener("resize", () => {
      if (fx) sizeFx();
    });

    document.addEventListener(
      "pointerdown",
      () => {
        if (state.settings.sound) sound.ensure();
      },
      { once: true }
    );
  }

  function boot() {
    renderSideNav();
    renderGameGrid();
    bindFilters();
    bindHero();
    renderChat();
    bindChat();
    bindGlobal();
    updateUI();
    goHero(0);
    sizeFx();
    window.setInterval(updateDailyUI, 1000);
    if (!state.seenWelcome) {
      state.seenWelcome = true;
      save();
      window.setTimeout(() => {
        toast(
          "Welcome to WagerX",
          `${fmtMoney(START_BALANCE)} starting cash. Sign up to chat and rank. Discord adds another $3,000.`,
          "success",
          6000
        );
      }, 700);
    }
    if (window.location.hash === "#cashier") openCashier();
    loadAnnouncement();
    startAnnouncementPolling();
    initSocial().catch(() => {});
    handleDiscordRedirect().catch(() => {});
  }

  /* ============================== API ============================== */

  const api = {
    DISCORD_URL,
    MAX_BET,
    START_BALANCE,
    GAME_META,
    GAME_BY_ID,
    games: gameImpls,
    registerGames(obj) {
      Object.assign(gameImpls, obj);
    },
    state,
    save,
    updateUI,
    takeStake,
    credit,
    settle,
    newRng,
    weightedPick,
    comb,
    levelInfo,
    fmtMoney,
    fmtCompact,
    fmtMult,
    round2,
    toast,
    confetti,
    sound,
    openModal,
    closeModal,
    openCashier,
    openDiscord,
    openHistory,
    openFairness,
    openAccount,
    openAdmin,
    loadAnnouncement,
    openAuth,
    openLeaderboard,
    openChat,
    initSocial,
    syncStatsNow,
    loadChat,
    claimDaily,
    openGame,
    closeGame,
    setGameLock,
    betModule,
    cardHTML,
    makeDeck,
    handTotal,
    icon,
    $,
    $$,
  };

  window.WagerX = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
