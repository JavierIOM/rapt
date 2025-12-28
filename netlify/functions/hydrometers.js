const https = require('https');
const { URL, URLSearchParams } = require('url');

// Get credentials from environment variables
const CONFIG = {
    email: process.env.RAPT_EMAIL,
    apiSecret: process.env.RAPT_API_SECRET,
    authUrl: 'https://id.rapt.io/connect/token',
    apiUrl: 'https://api.rapt.io/api',
    manualOriginalGravity: process.env.RAPT_MANUAL_OG ? parseFloat(process.env.RAPT_MANUAL_OG) : null
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
                'Content-Length': params.toString().length
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

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));

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

        for (let profile of data) {
            if (profile.sessions) {
                const session = profile.sessions.find(s => s.id === sessionId);
                if (session) {
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

        for (let device of data) {
            console.log(`   Device: ${device.name || device.id}`);

            const telemetry = await fetchTelemetry(device.id);
            if (telemetry && telemetry.length > 0) {
                device.telemetry = telemetry;
                console.log(`   Enhanced telemetry points: ${telemetry.length}`);

                let og = null;

                if (device.activeProfileSession && device.activeProfileSession.id) {
                    console.log(`   Fetching profile session for OG...`);
                    const session = await fetchProfileSession(device.activeProfileSession.id);
                    if (session && session.originalGravity) {
                        og = session.originalGravity;
                        console.log(`   Found OG in profile session: ${og} (${(og/1000).toFixed(3)})`);
                    }
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

                device.telemetry = telemetry.map(t => {
                    const ogSG = og / 1000;
                    const fgSG = t.gravity / 1000;
                    const abv = (ogSG - fgSG) * 131.25;
                    return {
                        ...t,
                        abv: parseFloat(Math.max(0, abv).toFixed(2))
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
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
