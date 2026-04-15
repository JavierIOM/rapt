# Raptzilla Dashboard

Real-time fermentation monitoring dashboard for RAPT.io devices. Live at **[rapt.rockyroo.fish](https://rapt.rockyroo.fish)**.

**Current version: v3.3.1**

## Features

- Real-time temperature, gravity, ABV, and attenuation monitoring
- Fermentation progress bar — shows how far you are from OG to target FG
- Brew day counter, target FG, estimated final ABV, and ETA to target gravity
- Automatic session detection — old brew data filtered out when a new session starts
- Interactive charts with customisable time ranges (3h, 6h, 12h, 18h, 24h, 36h, all time)
- Charts hidden on mobile for a clean stat-card view
- Hover tooltips on all stat cards (desktop only)
- Four themes: dark (default), light, monochrome, dark monochrome
- Cold crash mode — suppresses low-temperature Telegram alerts and UI warnings during intentional cold crashing; password protected
- Telegram alerts:
  - Danger/warning temperature alerts (high and low)
  - Gravity stall detection — alerts if gravity hasn't moved in 48 hours
  - Daily brew summary at 07:30 and 19:30 UTC
- Configurable temperature warning/danger thresholds via Settings panel or env vars
- Auto-refreshes data every 15 minutes

---

## Prerequisites

Before you start you'll need:

- A [Netlify](https://www.netlify.com/) account (free tier is fine)
- A [RAPT.io](https://rapt.io) account with at least one RAPT Pill hydrometer
- Node.js 18+ installed locally
- A Telegram bot — optional, only needed for alerts (instructions below)

---

## 1. RAPT App Setup

For the best experience, create an active **Profile Session** in the RAPT app before deploying:

1. Open the RAPT app and go to **Profiles**
2. Create a profile for your brew — set a name, original gravity (OG), and target final gravity (FG)
3. Start a session and link it to your RAPT Pill

This gives the dashboard your OG, target FG, profile name, and session start date automatically. Without an active session the dashboard falls back to gravity-jump detection for session filtering and uses the first telemetry reading as OG.

---

## 2. Clone and Install

```bash
git clone https://github.com/JavierIOM/rapt.git
cd rapt
npm install
```

---

## 3. Telegram Bot Setup (optional)

Skip this section if you don't want Telegram alerts.

1. Open Telegram and search for **[@BotFather](https://t.me/botfather)**
2. Send `/newbot` and follow the prompts to name your bot
3. BotFather will give you a **bot token** — save this as `TELEGRAM_BOT_TOKEN`
4. Search for your new bot in Telegram and press **Start** to open a conversation
5. To get your **chat ID**, visit this URL in your browser (replace `<TOKEN>` with your token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Send your bot any message, refresh the URL, and look for `"chat":{"id":XXXXXXX}` — that number is your `TELEGRAM_CHAT_ID`

---

## 4. Deploy to Netlify

### Option A — Deploy via Netlify UI

1. Push your fork to GitHub
2. Log in to Netlify → **Add new site** → **Import an existing project** → connect your repo
3. Build settings are picked up automatically from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Add environment variables (see section 5 below)
5. Click **Deploy site**

### Option B — Deploy via Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --build --prod
```

### Scheduled Functions

The `netlify.toml` already configures the scheduled functions — no extra setup needed:

- `temp-monitor` — runs every 15 minutes, sends temperature and stall alerts
- `daily-summary` — runs at 07:30 and 19:30 UTC, sends a daily brew summary

These require **Netlify's background functions** which are available on the free tier.

### Netlify Blobs

Cold crash state and alert cooldowns are persisted using [Netlify Blobs](https://docs.netlify.com/blobs/overview/). This is enabled automatically on all Netlify sites — no extra configuration needed.

---

## 5. Environment Variables

Add these in Netlify → **Site configuration** → **Environment variables**:

### Required

| Variable | Description |
|---|---|
| `RAPT_EMAIL` | Your RAPT.io account email |
| `RAPT_API_SECRET` | Your RAPT.io password / API secret |

### Optional — Gravity

| Variable | Default | Description |
|---|---|---|
| `RAPT_MANUAL_OG` | — | Manual Original Gravity (e.g. `1047.0`) — only needed if you have no active RAPT profile session |

### Optional — Temperature Thresholds

| Variable | Default | Description |
|---|---|---|
| `TEMP_DANGER_MIN` | 17 | Below this = red danger alert |
| `TEMP_WARNING_MIN` | 18 | Below this (above danger) = orange warning |
| `TEMP_WARNING_MAX` | 23 | Above this (below danger) = orange warning |
| `TEMP_DANGER_MAX` | 24 | Above this = red danger alert |

### Optional — Telegram Alerts

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID |
| `ALERT_COOLDOWN_MINUTES` | 60 | Minutes between repeat temperature alerts |
| `STALL_COOLDOWN_MINUTES` | 360 | Minutes between repeat gravity stall alerts |
| `GRAVITY_STALL_THRESHOLD` | 2 | Min gravity change (RAPT units) over 48h before a stall is declared |

### Optional — Cold Crash

| Variable | Description |
|---|---|
| `COLD_CRASH_SECRET` | Password required to toggle cold crash mode — without this anyone can hit the API endpoint. Set something strong. |

### Optional — Debug

| Variable | Default | Description |
|---|---|---|
| `DEBUG` | false | Set to `true` for verbose function logging — **never use in production** |

---

## 6. Cold Crash Mode

Cold crash mode suppresses low-temperature Telegram alerts and UI warnings when you intentionally drop fermentation temperature to clarify your beer. High-temperature alerts still fire.

**To use it:**

1. Set `COLD_CRASH_SECRET` to a password of your choice in Netlify env vars
2. On the dashboard, click the **Cold Crash** button — you'll be prompted for the password on first use
3. The password is saved in your browser — subsequent toggles don't prompt again
4. The button turns **bright red with a pulsing animation** when active so it's impossible to miss
5. Toggle it off the same way when your cold crash is done

The state is stored server-side in Netlify Blobs so it persists across page loads and applies to Telegram alerts regardless of which device you're using.

---

## 7. Local Development

```bash
npm install -g netlify-cli
netlify login
netlify dev
```

This runs the Vite dev server and the Netlify Functions locally. You'll need a `.env` file with your credentials:

```env
RAPT_EMAIL=your@email.com
RAPT_API_SECRET=yourpassword
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
COLD_CRASH_SECRET=yourpassword
TEMP_DANGER_MIN=17
TEMP_WARNING_MIN=18
TEMP_WARNING_MAX=23
TEMP_DANGER_MAX=24
```

---

## How It Works

### Session Detection

Detection priority when filtering telemetry to the current brew:

1. **Profile session start date** — if you have an active session in the RAPT app, its start date is used
2. **Gravity jump detection** — scans for a gravity increase of ≥ 8 points, indicating the Pill was repitched into a new brew

### Calculation Formulas

**ABV:**
```
ABV = (OG - FG) × 131.25
```

**Attenuation:**
```
Attenuation = ((OG - FG) / (OG - 1.000)) × 100
```

OG source priority: active profile session → `RAPT_MANUAL_OG` env var → first telemetry reading of current session.

---

## Technology Stack

- **Frontend**: Vanilla JavaScript, Vite, Tailwind CSS v3, Chart.js
- **Backend**: Netlify Functions (Node.js, serverless)
- **Alerts**: Telegram Bot API
- **State persistence**: Netlify Blobs (cold crash mode, alert cooldowns)
- **OG image**: sharp (generated at build time)
- **Hosting**: Netlify

---

## License

MIT License
