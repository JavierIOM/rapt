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

The dashboard shows colored indicators for temperature:
- **Green**: 20-26°C (optimal range)
- **Orange**: 18-20°C or 26-28°C (warning range)
- **Red**: Below 18°C or above 28°C (danger range)

## Technology Stack

- **Frontend**: Vanilla JavaScript, Vite
- **Charts**: Chart.js
- **Styling**: Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **Hosting**: Netlify

## License

MIT License
