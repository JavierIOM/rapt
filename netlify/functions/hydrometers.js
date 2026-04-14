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

let accessToken = null;
let tokenExpiry = null;

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
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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

    // Fetch last 7 days of data to support all time ranges in the UI
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000));

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
        console.log(`⚠️  Telemetry endpoint failed, trying alternative...`);

        try {
            const url2 = `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${hydrometerId}`;
            const data2 = await makeRequest(url2, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            console.log(`✅ Fetched ${data2.length || 0} telemetry points (alternative endpoint)`);
            return data2;
        } catch (error2) {
            console.error(`❌ Both telemetry endpoints failed`);
            return [];
        }
    }
}

// Fetch profile session details
async function fetchProfileSession(sessionId) {
    if (!isTokenValid()) {
        await authenticate();
    }

    try {
        const url = `${CONFIG.apiUrl}/Profiles/GetProfiles`;
        const data = await makeRequest(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Log profile data to see all available fields (debug mode only)
        if (CONFIG.debug && data && data.length > 0) {
            console.log('📊 Sample profile data (first profile):');
            console.log(JSON.stringify(data[0], null, 2));
        }

        for (let profile of data) {
            if (profile.sessions) {
                const session = profile.sessions.find(s => s.id === sessionId);
                if (session) {
                    if (CONFIG.debug) {
                        console.log('📊 Found profile session:');
                        console.log(JSON.stringify(session, null, 2));
                    }
                    // Attach the profile name so the frontend can display it
                    session._profileName = profile.name || session.name || null;
                    return session;
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`❌ Failed to fetch profile session:`, error.message);
        return null;
    }
}

// Detect the start of the current brew session from telemetry.
// A new brew is indicated by a significant gravity increase (pill removed, cleaned, repitched).
// Returns the index in the sorted-ascending array where the current session begins.
function findCurrentSessionStart(telemetry) {
    const sorted = [...telemetry].sort((a, b) => new Date(a.createdOn) - new Date(b.createdOn));
    const GRAVITY_JUMP_THRESHOLD = 8; // points (e.g. 1.010 -> 1.060 = 50pt jump)
    let sessionStartIndex = 0;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].gravity;
        const curr = sorted[i].gravity;
        if (curr - prev >= GRAVITY_JUMP_THRESHOLD) {
            sessionStartIndex = i;
        }
    }

    return new Date(sorted[sessionStartIndex].createdOn);
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
                    console.log(`   Fetching profile session for OG and start date...`);
                    const session = await fetchProfileSession(device.activeProfileSession.id);
                    if (session && session.originalGravity) {
                        og = session.originalGravity;
                        console.log(`   Found OG in profile session: ${og} (${(og/1000).toFixed(3)})`);
                    }
                    if (session && session._profileName) {
                        device.profileName = session._profileName;
                        console.log(`   Profile name: ${device.profileName}`);
                    }
                    // Try common field names for session start date
                    if (session) {
                        const rawDate = session.startDate || session.createdOn || session.startedAt || session.startedOn || null;
                        if (rawDate) {
                            const parsed = new Date(rawDate);
                            if (!isNaN(parsed.getTime())) {
                                sessionStartDate = parsed;
                                console.log(`   Session start date from profile: ${sessionStartDate.toISOString()}`);
                            } else {
                                console.warn(`   Invalid session start date value: ${rawDate}`);
                            }
                        }
                    }
                }

                // Filter telemetry to current brew session only.
                // Priority: profile session start date -> gravity-jump detection.
                const cutoff = sessionStartDate || findCurrentSessionStart(telemetry);
                console.log(`   Filtering telemetry to current session (cutoff: ${cutoff.toISOString()})`);
                const sessionTelemetry = telemetry.filter(t => new Date(t.createdOn) >= cutoff);
                console.log(`   Telemetry after session filter: ${sessionTelemetry.length} of ${telemetry.length} readings`);
                telemetry = sessionTelemetry.length > 0 ? sessionTelemetry : telemetry;

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

    try {
        const data = await fetchHydrometers();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                devices: data,
                config: {
                    tempDangerMin: CONFIG.tempDangerMin,
                    tempWarningMin: CONFIG.tempWarningMin,
                    tempWarningMax: CONFIG.tempWarningMax,
                    tempDangerMax: CONFIG.tempDangerMax
                }
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
