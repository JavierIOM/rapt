import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Palette lifted straight from the dark theme tokens in src/style.css.
// Keep these in step if the theme changes.
const C = {
  bg: '#141312',
  surface: '#1C1B19',
  border: '#2E2B28',
  text: '#EDEAE5',
  muted: '#A8A29A',
  dim: '#7A746C',
  accent: '#D08850',
  good: '#7FA87A',
  abv: '#79A6B5'
};

const SANS = "Arial, Helvetica, 'DejaVu Sans', sans-serif";
const MONO = "Consolas, 'DejaVu Sans Mono', 'Courier New', monospace";

// Rising bubbles, the same restrained outline treatment as the dashboard
const bubbles = [
  { cx: 980, cy: 180, r: 44 }, { cx: 1062, cy: 286, r: 26 },
  { cx: 1124, cy: 152, r: 18 }, { cx: 938, cy: 316, r: 16 },
  { cx: 1092, cy: 424, r: 32 }, { cx: 1152, cy: 344, r: 12 },
  { cx: 1008, cy: 462, r: 20 },
];

const bubbleSvg = bubbles.map(b =>
  `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="${C.muted}" stroke-width="1.5" opacity="0.14"/>`
).join('\n  ');

// Gravity falling over time: steep at first, then flattening out as the
// yeast runs out of sugar. Down the screen means down in gravity.
const curve = 'M 40 316 C 240 356 400 384 600 398 C 800 410 980 416 1160 419';

const barX = 40, barY = 452, barW = 660, barH = 6, barFill = Math.round(660 * 0.62);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.bg}"/>

  <!-- Single accent rule down the left edge -->
  <rect x="0" y="0" width="4" height="630" fill="${C.accent}"/>

  <!-- Very faint horizontal rhythm -->
  <line x1="40" y1="140" x2="1160" y2="140" stroke="${C.border}" stroke-width="1"/>
  <line x1="40" y1="530" x2="1160" y2="530" stroke="${C.border}" stroke-width="1"/>

  ${bubbleSvg}

  <!-- Gravity curve -->
  <path d="${curve}" fill="none" stroke="${C.dim}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>

  <!-- Wordmark -->
  <text x="40" y="96" font-family="${SANS}" font-size="46" font-weight="600" fill="${C.text}" letter-spacing="-1">Raptzilla</text>
  <text x="40" y="126" font-family="${SANS}" font-size="19" font-weight="400" fill="${C.muted}">Fermentation monitoring</text>

  <!-- Metrics, laid out like the dashboard tiles -->
  <text x="40" y="220" font-family="${SANS}" font-size="12" font-weight="500" fill="${C.dim}" letter-spacing="2">TEMPERATURE</text>
  <text x="40" y="272" font-family="${MONO}" font-size="52" font-weight="700" fill="${C.good}">20.7°C</text>

  <text x="300" y="220" font-family="${SANS}" font-size="12" font-weight="500" fill="${C.dim}" letter-spacing="2">GRAVITY</text>
  <text x="300" y="272" font-family="${MONO}" font-size="52" font-weight="700" fill="${C.text}">1.014</text>

  <text x="560" y="220" font-family="${SANS}" font-size="12" font-weight="500" fill="${C.dim}" letter-spacing="2">ABV</text>
  <text x="560" y="272" font-family="${MONO}" font-size="52" font-weight="700" fill="${C.abv}">4.46%</text>

  <text x="820" y="220" font-family="${SANS}" font-size="12" font-weight="500" fill="${C.dim}" letter-spacing="2">ATTENUATION</text>
  <text x="820" y="272" font-family="${MONO}" font-size="52" font-weight="700" fill="${C.text}">70.8%</text>

  <!-- Fermentation progress -->
  <text x="40" y="${barY - 16}" font-family="${MONO}" font-size="13" fill="${C.dim}">OG 1.048</text>
  <text x="${barX + barW}" y="${barY - 16}" font-family="${MONO}" font-size="13" fill="${C.dim}" text-anchor="end">Target 1.011</text>
  <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="${C.surface}"/>
  <rect x="${barX}" y="${barY}" width="${barFill}" height="${barH}" rx="3" fill="${C.accent}"/>

  <!-- Domain -->
  <text x="40" y="580" font-family="${MONO}" font-size="16" fill="${C.muted}">rapt.rockyroo.fish</text>
</svg>`;

const outputPath = join(root, 'public', 'og-image.png');

await sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath);

console.log(`OG image generated: ${outputPath}`);
