# RAPT.io Dashboard

Real-time fermentation monitoring dashboard for RAPT.io devices.

## Features

- Real-time temperature, gravity, ABV, and attenuation monitoring
- Interactive charts with customizable time ranges
- Dark mode and monochrome theme support
- Low battery and high temperature warnings
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

2. **Connect to Netlify**
   - Log in to your Netlify account
   - Click "Add new site" → "Import an existing project"
   - Connect to your GitHub repository
   - Select this repository

3. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

4. **Add Environment Variables**
   Go to Site settings → Environment variables and add:
   - `RAPT_EMAIL`: Your RAPT.io account email
   - `RAPT_API_SECRET`: Your RAPT.io API secret
   - `RAPT_MANUAL_OG` (optional): Manual Original Gravity (e.g., `1063.4`)
   - `TEMP_DANGER_MIN` (optional): Minimum safe temperature in °C (default: 18)
   - `TEMP_WARNING_MIN` (optional): Lower optimal temperature in °C (default: 20)
   - `TEMP_WARNING_MAX` (optional): Upper optimal temperature in °C (default: 26)
   - `TEMP_DANGER_MAX` (optional): Maximum safe temperature in °C (default: 28)

5. **Deploy**
   - Click "Deploy site"
   - Netlify will automatically build and deploy your site

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

- **RAPT_EMAIL** (required): Your RAPT.io account email
- **RAPT_API_SECRET** (required): Your RAPT.io API secret/password
- **RAPT_MANUAL_OG** (optional): Set a manual Original Gravity if the API doesn't provide it

### Temperature Warnings

The dashboard shows colored indicators for temperature based on configurable ranges:

**Default Temperature Ranges:**
- **Green (Good)**: 20-26°C (optimal fermentation range)
- **Orange (Warning)**: 18-20°C or 26-28°C (acceptable but caution advised)
- **Red (Danger)**: Below 18°C or above 28°C (may harm fermentation)

**Custom Temperature Limits:**

You can customize these ranges using environment variables to match your specific fermentation needs:

- **TEMP_DANGER_MIN** (default: 18): Minimum safe temperature - below this shows red
- **TEMP_WARNING_MIN** (default: 20): Lower optimal temperature - between danger and warning shows orange
- **TEMP_WARNING_MAX** (default: 26): Upper optimal temperature - between warning min/max shows green
- **TEMP_DANGER_MAX** (default: 28): Maximum safe temperature - above this shows red

**Example:** For a lager fermentation (cooler temps), you might set:
```
TEMP_DANGER_MIN=8
TEMP_WARNING_MIN=10
TEMP_WARNING_MAX=13
TEMP_DANGER_MAX=15
```

### Calculation Formulas

The dashboard automatically calculates ABV and attenuation from gravity readings:

**ABV (Alcohol by Volume):**
```
ABV = (OG - FG) × 131.25
```
Where OG = Original Gravity, FG = Final/Current Gravity

This is the standard formula used in brewing. Example:
- OG: 1.0634 (63.4 points)
- FG: 1.0100 (10 points)
- ABV: (1.0634 - 1.0100) × 131.25 = 7.01%

**Attenuation (Apparent Attenuation):**
```
Attenuation = ((OG - FG) / (OG - 1.000)) × 100
```

This shows what percentage of available sugars have been consumed. Example:
- OG: 1.0634, FG: 1.0100
- Attenuation: ((1.0634 - 1.0100) / (1.0634 - 1.000)) × 100 = 84.2%

**Data Sources:**
- Original Gravity (OG) is obtained from:
  1. Profile session data (if available)
  2. Manual OG setting (`RAPT_MANUAL_OG` environment variable)
  3. First telemetry reading (fallback)
- Current/Final Gravity comes from each telemetry reading

## Technology Stack

- **Frontend**: Vanilla JavaScript, Vite
- **Charts**: Chart.js
- **Styling**: Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **Hosting**: Netlify

## License

MIT License
