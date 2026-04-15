import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Fermentation bubbles — green tones
const bubbles = [
  { cx: 980, cy: 180, r: 48, opacity: 0.18 },
  { cx: 1060, cy: 280, r: 28, opacity: 0.14 },
  { cx: 1120, cy: 150, r: 20, opacity: 0.10 },
  { cx: 940,  cy: 310, r: 18, opacity: 0.12 },
  { cx: 1090, cy: 420, r: 36, opacity: 0.15 },
  { cx: 1150, cy: 340, r: 14, opacity: 0.09 },
  { cx: 1010, cy: 460, r: 22, opacity: 0.11 },
];

const bubbleSvg = bubbles.map(b =>
  `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="#4ade80" stroke-width="2" opacity="${b.opacity}"/>`
).join('\n  ');

// Fermentation gravity curve — dropping over time
const curvePath  = 'M 60 480 C 200 440 350 400 500 390 C 650 380 750 360 900 340 C 1000 328 1100 320 1180 315';
const curvePath2 = 'M 60 520 C 200 490 350 460 500 445 C 650 430 750 415 900 400 C 1000 390 1100 380 1180 375';

// Fermentation progress bar (18% filled)
const barX = 36, barY = 440, barW = 680, barH = 14, barFill = Math.round(680 * 0.18);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f0a"/>
      <stop offset="100%" stop-color="#0f1a0f"/>
    </linearGradient>
    <linearGradient id="title-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#166534"/>
      <stop offset="35%"  stop-color="#4ade80"/>
      <stop offset="65%"  stop-color="#166534"/>
      <stop offset="100%" stop-color="#86efac"/>
    </linearGradient>
    <linearGradient id="curve-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#F56400" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#4ade80" stop-opacity="0.4"/>
    </linearGradient>
    <linearGradient id="bar-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="6" height="630" fill="#F56400"/>

  <!-- Subtle grid lines -->
  <line x1="36"  y1="0"   x2="36"   y2="630" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>
  <line x1="0"   y1="120" x2="1200" y2="120" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>
  <line x1="0"   y1="240" x2="1200" y2="240" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>
  <line x1="0"   y1="360" x2="1200" y2="360" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>
  <line x1="0"   y1="480" x2="1200" y2="480" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>

  <!-- Fermentation curve decorations -->
  <path d="${curvePath}"  fill="none" stroke="url(#curve-grad)" stroke-width="3"   stroke-linecap="round" opacity="0.45"/>
  <path d="${curvePath2}" fill="none" stroke="#4ade80"          stroke-width="1.5" stroke-linecap="round" opacity="0.18"/>

  <!-- Bubble decorations -->
  ${bubbleSvg}

  <!-- Top-right corner glow -->
  <circle cx="1180" cy="60" r="200" fill="#166534" opacity="0.08"/>

  <!-- Brand label -->
  <text x="36" y="90" font-family="'Courier New', Courier, monospace" font-size="16" font-weight="700" fill="#F56400" letter-spacing="5" opacity="0.9">RAPTZILLA</text>

  <!-- Main title -->
  <text x="36" y="215" font-family="'Courier New', Courier, monospace" font-size="72" font-weight="700" fill="url(#title-grad)" letter-spacing="-1">Raptzilla Dashboard</text>

  <!-- Subtitle -->
  <text x="36" y="275" font-family="'Courier New', Courier, monospace" font-size="26" font-weight="400" fill="#4b7a5a" letter-spacing="1">Real-time fermentation monitoring</text>

  <!-- Feature pills -->
  <rect x="36"  y="310" width="150" height="36" rx="6" fill="#166534" opacity="0.35"/>
  <text x="51"  y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#4ade80">Temperature</text>

  <rect x="198" y="310" width="110" height="36" rx="6" fill="#166534" opacity="0.35"/>
  <text x="213" y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#4ade80">Gravity</text>

  <rect x="320" y="310" width="80"  height="36" rx="6" fill="#166534" opacity="0.35"/>
  <text x="335" y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#4ade80">ABV</text>

  <rect x="412" y="310" width="145" height="36" rx="6" fill="#F56400" opacity="0.18"/>
  <text x="427" y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#fb923c">Attenuation</text>

  <rect x="569" y="310" width="100" height="36" rx="6" fill="#166534" opacity="0.35"/>
  <text x="584" y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#4ade80">Brew Day</text>

  <rect x="681" y="310" width="105" height="36" rx="6" fill="#166534" opacity="0.35"/>
  <text x="696" y="333" font-family="'Courier New', Courier, monospace" font-size="14" font-weight="600" fill="#4ade80">ETA to FG</text>

  <!-- Fermentation progress bar -->
  <text x="36"  y="${barY - 12}" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a" letter-spacing="2">FERMENTATION PROGRESS</text>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="7" fill="#1a2e1a"/>
  <rect x="${barX}" y="${barY}" width="${barFill}" height="${barH}" rx="7" fill="url(#bar-grad)"/>
  <text x="${barX}" y="${barY + barH + 20}" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a">OG 1.047</text>
  <text x="${barX + barFill - 10}" y="${barY - 4}" font-family="'Courier New', Courier, monospace" font-size="11" fill="#a78bfa">18%</text>
  <text x="${barX + barW}" y="${barY + barH + 20}" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a" text-anchor="end">Target 1.010</text>

  <!-- Domain -->
  <text x="36" y="598" font-family="'Courier New', Courier, monospace" font-size="17" font-weight="500" fill="#2d4a2d" letter-spacing="1">rapt.rockyroo.fish</text>

  <!-- Right side metric display -->
  <rect x="790" y="130" width="2" height="300" fill="#F56400" opacity="0.35"/>

  <text x="810" y="168" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a" letter-spacing="2">TEMPERATURE</text>
  <text x="810" y="215" font-family="'Courier New', Courier, monospace" font-size="52" font-weight="700" fill="#4ade80">20.7°C</text>

  <text x="810" y="272" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a" letter-spacing="2">GRAVITY</text>
  <text x="810" y="318" font-family="'Courier New', Courier, monospace" font-size="46" font-weight="700" fill="#86efac">1.040</text>

  <text x="810" y="368" font-family="'Courier New', Courier, monospace" font-size="12" fill="#4b7a5a" letter-spacing="2">ABV</text>
  <text x="810" y="413" font-family="'Courier New', Courier, monospace" font-size="46" font-weight="700" fill="#4ade80">0.86%</text>
</svg>`;

const outputPath = join(root, 'public', 'og-image.png');

await sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath);

console.log(`OG image generated: ${outputPath}`);
