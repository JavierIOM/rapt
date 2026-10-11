const https = require('https');
const { URL, URLSearchParams } = require('url');

// Get credentials and configuration from environment variables
const CONFIG = {
    email: process.env.RAPT_EMAIL,
    apiSecret: process.env.RAPT_API_SECRET,
    authUrl: 'https://id.rapt.io/connect/token',
    apiUrl: 'https://api.rapt.io/api',
    manualOriginalGravity: process.env.RAPT_MANUAL_OG ? parseFloat(process.env.RAPT_MANUAL_OG) : null,
    // Temperature limits (defaults: danger < 18 or > 28, warning 18-20 or 26-28, good 20-26)
    tempDangerMin: process.env.TEMP_DANGER_MIN ? parseFloat(process.env.TEMP_DANGER_MIN) : 18,
    tempWarningMin: process.env.TEMP_WARNING_MIN ? parseFloat(process.env.TEMP_WARNING_MIN) : 20,
    tempWarningMax: process.env.TEMP_WARNING_MAX ? parseFloat(process.env.TEMP_WARNING_MAX) : 26,
    tempDangerMax: process.env.TEMP_DANGER_MAX ? parseFloat(process.env.TEMP_DANGER_MAX) : 28,
    // Debug mode - enables verbose logging (not recommended for production)
    debug: process.env.DEBUG === 'true'
};

// RAPT allows 5 calls a minute per endpoint per account (undocumented, found 11 Oct 2026).
// A short in-memory cache stops refresh-hammering and the desk display from spending it,
// and the last good response is served stale if RAPT refuses or falls over.
const CACHE_FRESH_MS = 60 * 1000;
const CACHE_STALE_MAX_MS = 30 * 60 * 1000;

// Telemetry is fetched over a wide window so the gravity jump that marks pitching stays
// visible for a whole ferment. Only the last week of the session goes to the client,
// which keeps the payload the size the desk display was built for.
const SESSION_SEARCH_DAYS = 30;
const TELEMETRY_RETURN_DAYS = 7;

let accessToken = null;
let tokenExpiry = null;
let cache = null; // { at, devices }

// Helper function to make HTTPS requests
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    const err = new Error(`HTTP ${res.statusCode}: ${data}`);
                    err.statusCode = res.statusCode;
                    err.retryAfter = parseInt(res.headers['retry-after'], 10) || null;
                    reject(err);
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

// Authenticate with RAPT.io
async function authenticate() {
    console.log('🔐 Authenticating with RAPT.io...');

    const params = new URLSearchParams({
        client_id: 'rapt-user',
        grant_type: 'password',
        username: CONFIG.email,
        password: CONFIG.apiSecret
    });

    try {
        const data = await makeRequest(CONFIG.authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(params.toString())
            },
            body: params.toString()
        });

        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);
        console.log('✅ Authentication successful!');
        return true;
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        return false;
    }
}

// Check if token is valid
function isTokenValid() {
    return accessToken && tokenExpiry && Date.now() < tokenExpiry;
}

// Fetch telemetry data for a specific hydrometer
async function fetchTelemetry(hydrometerId) {
    if (!isTokenValid()) {
        await authenticate();
    }

    console.log(`📈 Fetching telemetry for hydrometer ${hydrometerId}...`);

    // RAPT now rejects a telemetry request without a start and end date, so there is no
    // fallback to try. A rate limit is rethrown so the handler can serve the cache.
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (SESSION_SEARCH_DAYS * 24 * 60 * 60 * 1000));

    try {
        const url = `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${hydrometerId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

        const data = await makeRequest(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log(`✅ Fetched ${data.length || 0} telemetry points`);

        // Log first telemetry point to see all available fields (debug mode only)
        if (CONFIG.debug && data && data.length > 0) {
            console.log('📊 Sample telemetry data (first point):');
            console.log(JSON.stringify(data[0], null, 2));
        }

        return data;
    } catch (error) {
        if (error.statusCode === 429) throw error;
        console.error(`❌ Telemetry request failed:`, error.message);
        return [];
    }
}

// Detect the start of the current brew session from telemetry.
// A new brew is indicated by a significant gravity increase (pill removed, cleaned, repitched).
// Returns the date of the last such jump, or null if there is none in the window.
function findCurrentSessionStart(telemetry) {
    const sorted = [...telemetry].sort((a, b) => new Date(a.createdOn) - new Date(b.createdOn));
    const GRAVITY_JUMP_THRESHOLD = 8; // points (e.g. 1.010 -> 1.060 = 50pt jump)
    let sessionStart = null;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].gravity;
        const curr = sorted[i].gravity;
        if (curr - prev >= GRAVITY_JUMP_THRESHOLD) {
            sessionStart = sorted[i].createdOn;
        }
    }

    return sessionStart ? new Date(sessionStart) : null;
}

// Fetch hydrometers data
async function fetchHydrometers() {
    if (!isTokenValid()) {
        await authenticate();
    }

    console.log('📊 Fetching hydrometers data...');

    try {
        const data = await makeRequest(`${CONFIG.apiUrl}/Hydrometers/GetHydrometers`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log(`✅ Found ${data.length} device(s)`);

        // Log first device structure to see all available fields (debug mode only)
        if (CONFIG.debug && data && data.length > 0) {
            console.log('📊 Sample device data (first device):');
            console.log(JSON.stringify(data[0], null, 2));
        }

        for (let device of data) {
            console.log(`   Device: ${device.name || device.id}`);

            let telemetry = await fetchTelemetry(device.id);
            if (telemetry && telemetry.length > 0) {
                device.telemetry = telemetry;
                console.log(`   Enhanced telemetry points: ${telemetry.length}`);

                let og = null;

                let sessionStartDate = null;

                if (device.activeProfileSession && device.activeProfileSession.id) {
                    const aps = device.activeProfileSession;

                    // Name is directly on the activeProfileSession object
                    if (aps.name) {
                        device.profileName = aps.name;
                        console.log(`   Profile name: ${device.profileName}`);
                    }

                    // OG: stored in SG format (e.g. 1.047), normalise to RAPT units (e.g. 1047.0)
                    if (aps.originalGravity) {
                        og = aps.originalGravity < 2.0 ? aps.originalGravity * 1000 : aps.originalGravity;
                        console.log(`   Found OG in profile session: ${og} (${(og/1000).toFixed(3)})`);
                    }

                    // Target FG: same SG-to-RAPT normalisation
                    if (aps.finalGravity) {
                        device.targetFG = aps.finalGravity < 2.0 ? aps.finalGravity * 1000 : aps.finalGravity;
                        console.log(`   Target FG from profile: ${device.targetFG} (${(device.targetFG/1000).toFixed(3)})`);
                    }

                    // Start date is directly available
                    const rawDate = aps.startDate || aps.createdOn || aps.startedAt || aps.startedOn || null;
                    if (rawDate) {
                        const parsed = new Date(rawDate);
                        if (!isNaN(parsed.getTime())) {
                            sessionStartDate = parsed;
                            device.sessionStartDate = parsed.toISOString();
                            console.log(`   Session start date from profile: ${sessionStartDate.toISOString()}`);
                        } else {
                            console.warn(`   Invalid session start date value: ${rawDate}`);
                        }
                    }
                }

                // Filter telemetry to current brew session only.
                // Priority: profile session start date -> gravity-jump detection.
                // RAPT stopped sending activeProfileSession in Oct 2026, so in practice the
                // jump is all there is, and it doubles as the session start for "Day N".
                if (!sessionStartDate) {
                    sessionStartDate = findCurrentSessionStart(telemetry);
                    if (sessionStartDate) {
                        device.sessionStartDate = sessionStartDate.toISOString();
                        console.log(`   Session start detected from gravity jump: ${device.sessionStartDate}`);
                    }
                }
                if (sessionStartDate) {
                    const sessionTelemetry = telemetry.filter(t => new Date(t.createdOn) >= sessionStartDate);
                    console.log(`   Telemetry after session filter: ${sessionTelemetry.length} of ${telemetry.length} readings`);
                    telemetry = sessionTelemetry.length > 0 ? sessionTelemetry : telemetry;
                }

                if (!og && CONFIG.manualOriginalGravity) {
                    og = CONFIG.manualOriginalGravity;
                    console.log(`   Using manual OG from config: ${og} (${(og/1000).toFixed(3)})`);
                }

                if (!og) {
                    const sortedByDate = [...telemetry].sort((a, b) =>
                        new Date(a.createdOn) - new Date(b.createdOn)
                    );
                    og = sortedByDate[0].gravity;
                    console.log(`   Using first telemetry reading as OG: ${og} (${(og/1000).toFixed(3)})`);
                }

                // Expose OG on device for frontend calculations
                device.og = og;

                // OG is settled, so the client only needs the last week of the session
                const returnFrom = Date.now() - (TELEMETRY_RETURN_DAYS * 24 * 60 * 60 * 1000);
                telemetry = telemetry.filter(t => new Date(t.createdOn).getTime() >= returnFrom);

                device.telemetry = telemetry.map((t, idx) => {
                    // Convert gravity values - RAPT appears to use format like 1063.4 for SG 1.0634
                    const ogSG = og / 1000;
                    const fgSG = t.gravity / 1000;

                    // Calculate ABV using standard formula
                    const abv = (ogSG - fgSG) * 131.25;

                    // Calculate attenuation: ((OG - FG) / (OG - 1.000)) × 100
                    // This shows how much of the available sugars have been consumed
                    const attenuation = ((ogSG - fgSG) / (ogSG - 1.0)) * 100;

                    // Log first reading for verification
                    if (idx === 0) {
                        console.log(`   Sample calculation: OG=${ogSG.toFixed(4)}, FG=${fgSG.toFixed(4)}, ABV=${abv.toFixed(2)}%, Attenuation=${attenuation.toFixed(1)}%`);
                    }

                    return {
                        ...t,
                        abv: parseFloat(Math.max(0, abv).toFixed(2)),
                        attenuation: parseFloat(Math.max(0, Math.min(100, attenuation)).toFixed(1))
                    };
                });
            }
        }

        return data;
    } catch (error) {
        console.error('❌ Failed to fetch hydrometers:', error.message);
        throw error;
    }
}

// Netlify Function handler
exports.handler = async (event, context) => {
    // Determine allowed origin based on request
    const origin = event.headers.origin || event.headers.Origin || '';
    const allowedOrigins = [
        'http://localhost:5173',  // Vite dev server
        'http://localhost:8888',  // Netlify dev
        'https://rapt-dashboard.netlify.app',  // Netlify deploy URL
        'https://rapt.rockyroo.fish',  // Production custom domain
    ];

    const isAllowedOrigin = allowedOrigins.some(allowed => origin.startsWith(allowed));
    const corsOrigin = isAllowedOrigin ? origin : allowedOrigins[allowedOrigins.length - 1];

    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const respond = (devices, fetchedAt, stale) => ({
        statusCode: 200,
        headers,
        body: JSON.stringify({
            devices,
            config: {
                tempDangerMin: CONFIG.tempDangerMin,
                tempWarningMin: CONFIG.tempWarningMin,
                tempWarningMax: CONFIG.tempWarningMax,
                tempDangerMax: CONFIG.tempDangerMax
            },
            fetchedAt: new Date(fetchedAt).toISOString(),
            stale
        })
    });

    if (cache && Date.now() - cache.at < CACHE_FRESH_MS) {
        console.log('📦 Serving cached response');
        return respond(cache.devices, cache.at, false);
    }

    try {
        const data = await fetchHydrometers();
        cache = { at: Date.now(), devices: data };
        return respond(data, cache.at, false);
    } catch (error) {
        if (cache && Date.now() - cache.at < CACHE_STALE_MAX_MS) {
            console.warn(`⚠️  Upstream failed (${error.message}), serving stale data`);
            return respond(cache.devices, cache.at, true);
        }
        if (error.statusCode === 429) {
            const retryAfter = error.retryAfter || 60;
            return {
                statusCode: 429,
                headers: { ...headers, 'Retry-After': String(retryAfter) },
                body: JSON.stringify({
                    error: `RAPT is rate limiting requests, try again in ${retryAfter} seconds`,
                    retryAfter
                })
            };
        }
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
