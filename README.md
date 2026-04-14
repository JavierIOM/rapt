# Raptzilla Dashboard

Real-time fermentation monitoring dashboard for RAPT.io devices. Live at **[rapt.rockyroo.fish](https://rapt.rockyroo.fish)**.

**Current version: v2.4.0**

## Features

- Real-time temperature, gravity, ABV, and attenuation monitoring
- Automatic session detection — old brew data is filtered out when a new session starts
- Interactive charts with customisable time ranges (6h, 12h, 18h, 24h, 36h, all time)
- Four themes: dark (default), light, monochrome, dark monochrome
- Cold crash mode — suppresses low-temperature warnings during intentional crashing
- Low battery and temperature alert banners
- Configurable temperature warning/danger thresholds (persisted in localStorage)
- Responsive design for mobile and desktop

## Deployment to Netlify

### Prerequisites

- A [Netlify](https://www.netlify.com/) account
- RAPT.io account credentials (email and API secret)

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
   Go to Site settings → Environment variables and add:
   - `RAPT_EMAIL`: Your RAPT.io account email
   - `RAPT_API_SECRET`: Your RAPT.io API secret
   - `RAPT_MANUAL_OG` (optional): Manual Original Gravity e.g. `1047.0` — only needed if no active profile session
   - `TEMP_DANGER_MIN` (optional): Minimum safe temperature in °C (default: 18)
   - `TEMP_WARNING_MIN` (optional): Lower optimal temperature in °C (default: 20)
   - `TEMP_WARNING_MAX` (optional): Upper optimal temperature in °C (default: 26)
   - `TEMP_DANGER_MAX` (optional): Maximum safe temperature in °C (default: 28)
   - `DEBUG` (optional): Set to `true` for verbose function logging — **NOT for production**

6. **Deploy**
   - Click "Deploy site" — Netlify builds and deploys automatically

### Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create Environment File**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your RAPT.io credentials.

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Test with Netlify Functions Locally**
   ```bash
   npm install -g netlify-cli
   netlify dev
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RAPT_EMAIL` | Yes | — | RAPT.io account email |
| `RAPT_API_SECRET` | Yes | — | RAPT.io password / API secret |
| `RAPT_MANUAL_OG` | No | — | Manual Original Gravity (e.g. `1047.0`). Used only if no active profile session |
| `TEMP_DANGER_MIN` | No | 18 | Below this = red danger |
| `TEMP_WARNING_MIN` | No | 20 | Below this (above danger) = orange warning |
| `TEMP_WARNING_MAX` | No | 26 | Above this (below danger) = orange warning |
| `TEMP_DANGER_MAX` | No | 28 | Above this = red danger |
| `DEBUG` | No | false | Verbose logging — development only |

### Session Detection

When a new brew starts, the dashboard automatically filters out all previous brew data. Detection priority:

1. **Profile session start date** — if you have an active session in the RAPT app, the start date is used directly
2. **Gravity jump detection** — if no profile session is active, the function scans telemetry for a gravity increase of ≥ 8 points (e.g. 1.010 → 1.060), indicating the Pill was repitched into a new brew

### Temperature Warnings

Default ranges:
- **Green (Good)**: 20–26°C
- **Orange (Warning)**: 18–20°C or 26–28°C
- **Red (Danger)**: below 18°C or above 28°C

Customise via environment variables or the Settings panel in the UI (persisted per-browser in localStorage).

**Cold Crash Mode**: enable via the snowflake button (top-right) to suppress low-temperature warnings while intentionally dropping temperature to clarify your beer.

### Calculation Formulas

**ABV:**
```
ABV = (OG - FG) × 131.25
```

**Attenuation:**
```
Attenuation = ((OG - FG) / (OG - 1.000)) × 100
```

OG source priority: profile session → `RAPT_MANUAL_OG` env var → first telemetry reading of current session.

## Technology Stack

- **Frontend**: Vanilla JavaScript, Vite
- **Charts**: Chart.js
- **Styling**: Tailwind CSS v3
- **Backend**: Netlify Functions (Node.js, serverless)
- **OG image**: sharp (generated at build time)
- **Hosting**: Netlify

## License

MIT License
