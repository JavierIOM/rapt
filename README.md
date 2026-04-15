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
- Cold crash mode — suppresses low-temperature Telegram alerts and UI warnings during intentional cold crashing; requires password to toggle
- Telegram alerts via `@raptzilla_bot`:
  - Danger/warning temperature alerts (high and low)
  - Gravity stall detection — alerts if gravity hasn't moved in 48 hours
  - Daily brew summary at 07:30 and 19:30 UTC
- Configurable temperature warning/danger thresholds via Settings panel or env vars
- Auto-refreshes data every 15 minutes
- Low battery and temperature alert banners in the UI

## Deployment to Netlify

### Prerequisites

- A [Netlify](https://www.netlify.com/) account
- RAPT.io account with at least one RAPT Pill device
- A Telegram bot (create one via [@BotFather](https://t.me/botfather)) — optional, for alerts

### Setup Instructions

1. **Fork or Clone this Repository**
   ```bash
   git clone https://github.com/JavierIOM/rapt.git
   cd rapt
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Connect to Netlify**
   - Log in to your Netlify account
   - Click "Add new site" → "Import an existing project"
   - Connect to your GitHub repository

4. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

5. **Add Environment Variables**
   Go to Site settings → Environment variables and add the variables listed below.

6. **Deploy**
   - Click "Deploy site" — Netlify builds and deploys automatically

### Local Development

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Run Development Server**
   ```bash
   netlify dev
   ```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RAPT_EMAIL` | Yes | — | RAPT.io account email |
| `RAPT_API_SECRET` | Yes | — | RAPT.io password / API secret |
| `RAPT_MANUAL_OG` | No | — | Manual Original Gravity (e.g. `1047.0`) — only needed if no active RAPT profile session |
| `TEMP_DANGER_MIN` | No | 17 | Below this = red danger |
| `TEMP_WARNING_MIN` | No | 18 | Below this (above danger) = orange warning |
| `TEMP_WARNING_MAX` | No | 23 | Above this (below danger) = orange warning |
| `TEMP_DANGER_MAX` | No | 24 | Above this = red danger |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | No | — | Your Telegram chat ID — send a message to your bot then check the Telegram API to find it |
| `ALERT_COOLDOWN_MINUTES` | No | 60 | Minutes between repeat temperature alerts |
| `STALL_COOLDOWN_MINUTES` | No | 360 | Minutes between repeat gravity stall alerts |
| `GRAVITY_STALL_THRESHOLD` | No | 2 | Minimum gravity change (RAPT units) over 48h before a stall is declared |
| `COLD_CRASH_SECRET` | No | — | Password required to toggle cold crash mode via the API — set this to prevent unauthorised toggling |
| `DEBUG` | No | false | Verbose function logging — development only, do not enable in production |

## How It Works

### Session Detection

When a new brew starts the dashboard automatically filters out all previous brew data. Detection priority:

1. **Profile session start date** — if you have an active session in the RAPT app, its start date is used directly
2. **Gravity jump detection** — if no profile session is active, telemetry is scanned for a gravity increase of ≥ 8 points (e.g. 1.010 → 1.060), indicating the Pill was repitched into a new brew

### Fermentation Stats

When an active RAPT profile session is detected, the following are pulled directly from it:

- **Profile name** — displayed on the device card (e.g. "Helles")
- **Original gravity (OG)** — used for ABV and attenuation calculations
- **Target final gravity (FG)** — used for progress bar and ETA
- **Session start date** — used for brew day counter and session filtering

### Temperature Warnings

Default ranges (customisable via env vars or Settings panel):
- **Green (Good)**: 18–23°C
- **Orange (Warning)**: 17–18°C or 23–24°C
- **Red (Danger)**: below 17°C or above 24°C

**Cold Crash Mode**: enable via the Cold Crash button (top-right) to suppress low-temperature warnings and Telegram alerts while intentionally dropping temperature to clarify your beer. High-temperature alerts still fire. Requires `COLD_CRASH_SECRET` to toggle — state is persisted server-side in Netlify Blobs.

### Telegram Alerts

Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to be set.

#### Setting up your Telegram bot

1. Open Telegram and search for **[@BotFather](https://t.me/botfather)**
2. Send `/newbot` and follow the prompts to name your bot
3. BotFather will give you a token — this is your `TELEGRAM_BOT_TOKEN`
4. Start a conversation with your new bot (search for it by name and hit Start)
5. To find your `TELEGRAM_CHAT_ID`, visit this URL in your browser (replace `<TOKEN>` with your token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Send your bot a message first, then look for `"chat":{"id":` in the response — that number is your `TELEGRAM_CHAT_ID`

Add both values to your Netlify environment variables and the alerts will start working on the next scheduled check.

#### What gets alerted

- **Temperature alerts** — fires when temp goes above/below warning/danger thresholds; repeats after cooldown if condition persists
- **Gravity stall** — fires if gravity hasn't changed by more than `GRAVITY_STALL_THRESHOLD` RAPT units over 48 hours
- **Daily summary** — sent at 07:30 and 19:30 UTC with current gravity, OG, ABV, attenuation, gravity velocity, 24h temperature stats, battery level, and reading count

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

## Technology Stack

- **Frontend**: Vanilla JavaScript, Vite, Tailwind CSS v3, Chart.js
- **Backend**: Netlify Functions (Node.js, serverless)
- **Alerts**: Telegram Bot API
- **State persistence**: Netlify Blobs (cold crash mode, alert cooldowns)
- **OG image**: sharp (generated at build time)
- **Hosting**: Netlify

## License

MIT License
