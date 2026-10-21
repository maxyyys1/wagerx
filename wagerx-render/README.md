# WagerX

Play-money social casino with 19 games, one virtual wallet, site accounts, live chat, and a shared leaderboard. No deposits, no withdrawals, no real-money wagering.

**WagerX runs two ways.** For shared accounts, chat, and leaderboard data, run the included Node server (`server.js`). On a static-only host such as Netlify, the browser automatically switches to **local mode**: signup/login, chat, and the leaderboard still work, but accounts and messages are saved in that one browser with `localStorage` and are not shared with other visitors.

## Quick start

From this folder:

```powershell
npm start
```

Then open:

```text
http://localhost:4173/wagerx/
```

Or double-click `start-wagerx.bat` on Windows. It starts the server and opens the page.

- The first run creates an empty `data.json`.
- Delete `data.json` to reset all accounts, chat, and leaderboard data.
- Do not open `index.html` with `file://`; use the server URL.

### Ports and paths

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4173` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` when deploying |
| `BASE_PATH` | `/wagerx` | Use `/` to serve at the domain root |
| `DATA_FILE` | `./data.json` | Point at a persistent disk when deploying |
| `UPSTASH_REDIS_REST_URL` | — | Optional free persistent storage; set together with the token |
| `UPSTASH_REDIS_REST_TOKEN` | — | Optional Upstash Redis REST token |
| `WAGERX_DATA_KEY` | `wagerx:data` | Upstash key used when remote storage is enabled |

Example for a root-hosted deployment:

```powershell
$env:HOST="0.0.0.0"
$env:BASE_PATH="/"
$env:DATA_FILE="D:\wagerx-data\data.json"
npm start
```

## Accounts, chat, and leaderboard

- **Signup** creates a server-side account with a scrypt password hash and an HttpOnly session cookie.
- **Login** restores the account and its balance/stats.
- **Chat** requires an account. Guests can read the chat but cannot post.
- **Leaderboard** is public to read. Signed-in players are highlighted; guests see a signup prompt.
- **Stats sync** after bets, bonuses, and account changes. The server is the source of truth when you log in.
- **No demo accounts.** Chat, the leaderboard, and recent wins show only real accounts and real rounds.
- **Discord verification is not the site login.** Discord only confirms server membership for the one-time $3,000 bonus. You still need a WagerX account to chat and rank.

### Local mode (static hosting)

When `/api` is missing, the client falls back to local mode instead of failing:

- `wagerx.local.accounts.v1` — local accounts and salted password hashes.
- `wagerx.local.session.v1` — the signed-in local account.
- `wagerx.local.chat.v1` — local chat messages.
- The leaderboard shows only real local accounts created in that browser.
- Accounts, chat, and stats are per browser and per origin. They do not sync across devices, incognito windows, or visitors.
- Local passwords use salted SHA-256, not the server's scrypt. Never reuse a real password.
- Clearing site data deletes local accounts and chat. There is no email recovery.

If `/api` responds, server mode is used and the local keys are ignored.

### Forgot password

There is no email recovery. On the machine running the server, reset one account without wiping everyone else:

```powershell
npm run reset-password -- WagerXOfficial newpassword123
```

This rewrites `data.json`, hashes the new password, and signs out that account's existing sessions. To reset everything, stop the server, delete `data.json`, and start it again.

Local-mode accounts have no recovery flow. Use **Account → Delete account** in the same browser or clear site data for the site.

### API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Log in |
| `POST` | `/api/auth/logout` | Log out |
| `GET` | `/api/me` | Current user (`null` when signed out) |
| `PATCH` | `/api/me` | Change username |
| `PATCH` | `/api/me/stats` | Sync balance/stats |
| `DELETE` | `/api/me` | Delete account and its messages |
| `GET` | `/api/chat?after=N` | Read chat |
| `POST` | `/api/chat` | Post a message |
| `GET` | `/api/leaderboard?sort=balance` | Leaderboard (`balance`, `wagered`, `best`, `net`) |

## Discord bonus setup

The site uses Discord OAuth2 implicit grant with `identify guilds`. No bot, client secret, or privileged intent is required.

1. Go to <https://discord.com/developers/applications>.
2. Create/open the WagerX application.
3. In **OAuth2 → Redirects**, add the exact page URL(s) you use:
   - `http://localhost:4173/wagerx/index.html`
   - `http://127.0.0.1:4173/wagerx/index.html`
   - your production URL, e.g. `https://your-app.onrender.com/index.html`
4. Copy the **Client ID** from **OAuth2 → General**. The current value is in `core.js`:

```js
const DISCORD_CLIENT_ID = "1562177769654329384";
```

5. Confirm the guild ID in `core.js` matches the server behind the invite:

```js
const DISCORD_GUILD_ID = "1562160185445974118";
```

The invite is <https://discord.gg/xhaaRPVjJu>. The actual server name in Discord is controlled in Discord's server settings; the website can only label it WagerX. The redirect URL must match the address bar exactly, including `index.html` if it is present. The token is read once, removed from the URL, and never stored.

If you change the invite, look up the new guild ID:

```powershell
Invoke-WebRequest -UseBasicParsing "https://discord.com/api/v10/invites/YOUR_INVITE_CODE" |
  Select-Object -ExpandProperty Content
```

## Publish it

### Netlify / static hosts (quickest for the current site)

Use the clean static export, not the whole project folder:

- `wagerx-publish/` — upload these files, or
- `wagerx-netlify.zip` — drag the zip onto Netlify.

The export contains only `index.html`, `styles.css`, `games.css`, `core.js`, `games.js`, `assets/`, `404.html`, `_headers`, and `_redirects`. Netlify serves it at the domain root. The `_redirects` file makes `/api/*` return 404, which triggers local mode immediately.

**Never upload `data.json`, `server.js`, `package.json`, or `README.md` to a static host.** `data.json` contains password hashes and session tokens.

After deploying, open the site, hard-refresh once, and create a new account. The account is stored in that browser. To test, open the site in a normal window and an incognito window: each has its own local floor.

### Node host (shared accounts and chat)

Deploy the whole `wagerx` folder to a host that runs Node. Do **not** upload only `index.html`.

#### Render (quickest, free)

1. Push this folder to a GitHub repository. Do not upload `data.json`; the clean `wagerx-render/` folder already excludes it.
2. In Render, create a **New Web Service** from that repo.
3. Render reads `render.yaml`, or use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `HOST=0.0.0.0`, `BASE_PATH=/` (root), `NODE_ENV=production`
4. Add the deployed URL to Discord's redirect list.
5. Free Render web services sleep after 15 minutes of inactivity and use an ephemeral filesystem. Without extra storage, accounts and chat reset whenever the service restarts, redeploys, or spins down.

##### Free durable storage with Upstash (optional)

Render's free web service is $0. To keep accounts and chat across restarts for $0, use a free Upstash Redis database:

1. Create a free Redis database at <https://upstash.com>.
2. Open the database, find **REST API**, and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. In Render, open your WagerX service → **Environment** → add both variables → save. Render redeploys automatically.
4. Check the Render logs for `Data backend: Upstash Redis`, or open `/api/health` and look for `"storage":"upstash"`.

The server stores the whole data object in one Redis key (`wagerx:data` by default). Writes are batched (about every 3 seconds) to stay within the free command allowance, and a graceful shutdown flushes immediately. The Upstash free plan includes 250 MB and 500K commands per month, which is enough for a small play-money site. If the two variables are not set, the server falls back to `data.json`.

The free Render service still sleeps after inactivity, so the first visit after a quiet period can take about a minute. The data itself stays in Upstash and is not lost when Render sleeps.

#### Railway / Fly / any Node host

Use `npm start` as the start command, set `HOST=0.0.0.0`, and mount a persistent volume for `data.json`. A `Procfile` is included.

#### Docker

```powershell
docker build -t wagerx .
docker run -p 4173:4173 -v wagerx-data:/data wagerx
```

The Docker image serves at `http://localhost:4173/` and stores data in `/data/data.json`.

#### Split hosting

A Netlify frontend can stay static while a Node host runs `server.js`. Because the frontend calls same-origin `/api`, the simplest split is a Netlify proxy rewrite such as:

```text
/api/*  https://YOUR-APP.onrender.com/api/:splat  200
```

That keeps cookies same-origin, so no CORS changes are needed. A configurable API base URL plus CORS is the alternative. Until either is configured, use local mode on Netlify or deploy the full Node app on one host.

## Rebuild the static export

The ready-to-upload files live in `wagerx-publish/` and `wagerx-netlify.zip` in the parent folder. To rebuild the zip on Windows without backslash paths:

```powershell
tar -a -c -f ..\wagerx-netlify.zip -C ..\wagerx-publish 404.html assets core.js games.css games.js index.html styles.css _headers _redirects
```

If you change `core.js`, `games.js`, or the CSS, bump `?v=` in `index.html` first so browsers pick up the new files.

## Notes

- This is play money. Wallet values and client-side state can be edited with devtools; the server sync is for convenience and social features, not anti-cheat.
- Passwords are hashed with scrypt and sessions are HttpOnly `SameSite=Lax` cookies. Do not reuse a real password.
- Local-mode passwords use salted SHA-256 and are stored in the browser. They are not sent anywhere.
- The server stores data in a JSON file, or in one Upstash Redis key when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. It is fine for a demo/small community, not for high-traffic production.
- If the page shows **Join the local floor**, it is on a static host and local mode is active. This is expected on Netlify. For shared chat and ranking, deploy the Node server.
- If the chat says **Chat is offline**, the page found `/api` but the Node server is not responding. Check the server, port, and `BASE_PATH`, then reload.
- If a static host is caching old JS, the asset links include a version query. Bump `?v=` in `index.html` after changing `core.js`, `games.js`, or the CSS.
