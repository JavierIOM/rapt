# Changelog

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
