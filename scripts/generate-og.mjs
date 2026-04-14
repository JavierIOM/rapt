import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Read favicon SVG for icon use
let faviconSvg = '';
try {
  faviconSvg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
} catch {}

// Bubble decoration positions (simulating fermentation bubbles)
const bubbles = [
  { cx: 980, cy: 180, r: 48, opacity: 0.18 },
  { cx: 1060, cy: 280, r: 28, opacity: 0.12 },
  { cx: 1120, cy: 150, r: 20, opacity: 0.09 },
  { cx: 940, cy: 310, r: 18, opacity: 0.10 },
  { cx: 1090, cy: 420, r: 36, opacity: 0.13 },
  { cx: 1150, cy: 340, r: 14, opacity: 0.08 },
  { cx: 1010, cy: 460, r: 22, opacity: 0.10 },
];

const bubbleSvg = bubbles.map(b =>
  `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="#7c3aed" stroke-width="2" opacity="${b.opacity}"/>`
).join('\n  ');

// Fermentation curve — gentle sine-like arc across mid section
const curvePath = 'M 60 480 C 200 440 350 400 500 390 C 650 380 750 360 900 340 C 1000 328 1100 320 1180 315';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="100%" stop-color="#1a1230"/>
    </linearGradient>
    <linearGradient id="title-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="50%" stop-color="#e879f9"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
    <linearGradient id="curve-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F56400" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.4"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="6" height="630" fill="#F56400"/>

  <!-- Subtle grid lines -->
  <line x1="36" y1="0" x2="36" y2="630" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="0" y1="120" x2="1200" y2="120" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="0" y1="240" x2="1200" y2="240" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="0" y1="360" x2="1200" y2="360" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="0" y1="480" x2="1200" y2="480" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>

  <!-- Fermentation telemetry curve -->
  <path d="${curvePath}" fill="none" stroke="url(#curve-grad)" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
  <!-- Second curve offset slightly — simulating gravity over time -->
  <path d="M 60 520 C 200 490 350 460 500 445 C 650 430 750 415 900 400 C 1000 390 1100 380 1180 375" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>

  <!-- Bubble decorations -->
  ${bubbleSvg}

  <!-- Top-right corner glow -->
  <circle cx="1180" cy="60" r="180" fill="#7c3aed" opacity="0.06"/>

  <!-- RAPT.io label (small) -->
  <text x="36" y="90" font-family="'Courier New', Courier, monospace" font-size="18" font-weight="700" fill="#F56400" letter-spacing="4" opacity="0.9">RAPT.IO</text>

  <!-- Main title -->
  <text x="36" y="220" font-family="'Courier New', Courier, monospace" font-size="74" font-weight="700" fill="url(#title-grad)" letter-spacing="-1">RAPT.io Dashboard</text>

  <!-- Subtitle -->
  <text x="36" y="285" font-family="'Courier New', Courier, monospace" font-size="28" font-weight="400" fill="#94a3b8" letter-spacing="1">Real-time fermentation monitoring</text>

  <!-- Feature pills -->
  <rect x="36" y="330" width="170" height="38" rx="6" fill="#7c3aed" opacity="0.25"/>
  <text x="51" y="354" font-family="'Courier New', Courier, monospace" font-size="15" font-weight="600" fill="#a78bfa">Temperature</text>

  <rect x="218" y="330" width="120" height="38" rx="6" fill="#7c3aed" opacity="0.25"/>
  <text x="233" y="354" font-family="'Courier New', Courier, monospace" font-size="15" font-weight="600" fill="#a78bfa">Gravity</text>

  <rect x="350" y="330" width="90" height="38" rx="6" fill="#7c3aed" opacity="0.25"/>
  <text x="365" y="354" font-family="'Courier New', Courier, monospace" font-size="15" font-weight="600" fill="#a78bfa">ABV</text>

  <rect x="452" y="330" width="150" height="38" rx="6" fill="#F56400" opacity="0.2"/>
  <text x="467" y="354" font-family="'Courier New', Courier, monospace" font-size="15" font-weight="600" fill="#fb923c">Attenuation</text>

  <!-- Domain -->
  <text x="36" y="598" font-family="'Courier New', Courier, monospace" font-size="18" font-weight="500" fill="#475569" letter-spacing="1">rapt.rockyroo.fish</text>

  <!-- Right side — stylised metric display -->
  <rect x="780" y="130" width="2" height="300" fill="#F56400" opacity="0.4"/>
  <text x="800" y="170" font-family="'Courier New', Courier, monospace" font-size="13" fill="#475569" letter-spacing="2">TEMPERATURE</text>
  <text x="800" y="215" font-family="'Courier New', Courier, monospace" font-size="52" font-weight="700" fill="#4ade80">21.4°C</text>

  <text x="800" y="275" font-family="'Courier New', Courier, monospace" font-size="13" fill="#475569" letter-spacing="2">GRAVITY</text>
  <text x="800" y="318" font-family="'Courier New', Courier, monospace" font-size="46" font-weight="700" fill="#a78bfa">1.042</text>

  <text x="800" y="370" font-family="'Courier New', Courier, monospace" font-size="13" fill="#475569" letter-spacing="2">ABV</text>
  <text x="800" y="413" font-family="'Courier New', Courier, monospace" font-size="46" font-weight="700" fill="#60a5fa">4.2%</text>
</svg>`;

const outputPath = join(root, 'public', 'og-image.png');

await sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath);

console.log(`OG image generated: ${outputPath}`);
