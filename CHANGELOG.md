# Changelog

## [2.4.0] - 2026-04-14

### Added
- OG image generated at `public/og-image.png` (1200x630, fermentation-themed dark design)
- `scripts/generate-og.mjs` — sharp-based OG image generator, auto-runs before build
- `fb:app_id` meta tag added to index.html
- `og:image`, `og:image:width`, `og:image:height` and `twitter:image` meta tags
- CSS `--accent` variable (`#F56400`) for consistent orange accent across all themes
- `.time-range-select` CSS class — theme-aware select element replacing hardcoded `bg-white`
- Focus-visible rings on all interactive elements (buttons, inputs, select, links)
- `.device-card-header`, `.device-name`, `.device-meta`, `.device-id`, `.device-stats`, `.firmware-update` CSS classes for theme-aware device card content
- `.site-title`, `.site-subtitle`, `.site-footer`, `.footer-link`, `.footer-sep`, `.footer-muted`, `.refresh-btn`, `.status` CSS classes replacing hardcoded Tailwind dark-only colours

### Changed
- Dark mode is now the default — first-visit users see dark theme; light mode preference is persisted in localStorage
- `og:url` and `twitter:url` corrected from `rapt-dashboard.netlify.app` to `rapt.rockyroo.fish`
- Light theme palette updated to owner spec: page `#FAF7F4`, cards `#FFFFFF`, text `#222222`, secondary `#595959`, borders `#D9D9D9`
- Theme toggle buttons are now fully visible in light mode (were white-on-transparent, invisible)
- Modal, settings inputs, and all form elements now use CSS custom properties — work correctly in all four themes
- Chart.js legend, axis labels, tick colours, and grid lines now adapt correctly to dark/light mode
- Device card name, metadata, IDs, and firmware badge now use CSS variables (were hardcoded Tailwind classes)
- Header title, subtitle, status bar, footer, and refresh button now theme-aware

### Fixed
- Emoji removed from all alert banners: `⚠️ Low Battery Warning`, `🌡️ High Temperature Warning`, `🌡️ Low Temperature Warning`, `⚠️ Update Available`
- Time range select was hardcoded `bg-white` — broke in dark mode; now uses `.time-range-select`
- Modal content, header/footer borders, setting labels/descriptions/inputs all converted to CSS variable-driven styles
- Body element no longer carries a hardcoded Tailwind purple gradient class — light/dark backgrounds are fully CSS-controlled

## [2.3.0] - 2026-04-14

### Fixed
- Old brew data no longer shown when a new brew session starts — telemetry is now filtered to the current session only
- Session detection uses profile session start date (from RAPT.io API) when available, falling back to gravity-jump detection (threshold: 8 gravity points) for sessions without profile data
- OG fallback now correctly uses the first reading of the current session, not historical data

## [2.2.0] - 2026-04-13

### Added
- Favicon and comprehensive SEO meta tags

### Changed
- Updated documentation and version display to v2.2.0

### Fixed
- CORS restriction hardened to specific allowed origins
- Conditional verbose logging behind `DEBUG` env var (disabled by default)

## [2.1.0]

### Added
- Cold crash mode — suppresses low-temperature warnings when intentionally crashing
- Monochrome theme option
- Configurable temperature warning/danger thresholds (persisted in localStorage)
- Settings modal with reset-to-defaults

## [2.0.0]

### Added
- Multi-axis Chart.js charts (temperature, ABV, attenuation, gravity velocity)
- Time range selector per device (6h, 12h, 18h, 24h, 36h, all time)
- Dark/light mode toggle
- Animated floating bubbles background
- Low battery and temperature alert banners
- Firmware update available indicator

## [1.0.0]

### Added
- Initial release — RAPT.io API integration via Netlify Function
- Real-time temperature, gravity, ABV, and attenuation display
- ABV and attenuation calculated from telemetry with OG from profile session or manual override
