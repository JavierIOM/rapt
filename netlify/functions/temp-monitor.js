const https = require('https');
const { URL, URLSearchParams } = require('url');

const CONFIG = {
    email: process.env.RAPT_EMAIL,
    apiSecret: process.env.RAPT_API_SECRET,
    authUrl: 'https://id.rapt.io/connect/token',
    apiUrl: 'https://api.rapt.io/api',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    tempDangerMin: process.env.TEMP_DANGER_MIN ? parseFloat(process.env.TEMP_DANGER_MIN) : 18,
    tempWarningMin: process.env.TEMP_WARNING_MIN ? parseFloat(process.env.TEMP_WARNING_MIN) : 20,
    tempWarningMax: process.env.TEMP_WARNING_MAX ? parseFloat(process.env.TEMP_WARNING_MAX) : 26,
    tempDangerMax: process.env.TEMP_DANGER_MAX ? parseFloat(process.env.TEMP_DANGER_MAX) : 28,
    // Minimum gravity change (RAPT units) over 48h before a stall is declared
    gravityStallThreshold: process.env.GRAVITY_STALL_THRESHOLD ? parseFloat(process.env.GRAVITY_STALL_THRESHOLD) : 2,
    // Cooldown in minutes between repeat alerts for the same condition
    alertCooldownMinutes: process.env.ALERT_COOLDOWN_MINUTES ? parseInt(process.env.ALERT_COOLDOWN_MINUTES) : 60,
    // Stall alerts repeat less frequently — default 6 hours
    stallCooldownMinutes: process.env.STALL_COOLDOWN_MINUTES ? parseInt(process.env.STALL_COOLDOWN_MINUTES) : 360,
};

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
                    try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function authenticate() {
    const params = new URLSearchParams({
        client_id: 'rapt-user',
        grant_type: 'password',
        username: CONFIG.email,
        password: CONFIG.apiSecret
    });

    const data = await makeRequest(CONFIG.authUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(params.toString())
        },
        body: params.toString()
    });

    return data.access_token;
}

async function getDeviceReadings(accessToken) {
    const devices = await makeRequest(`${CONFIG.apiUrl}/Hydrometers/GetHydrometers`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    const readings = [];

    for (const device of devices) {
        // Fetch 49h — enough to cover the 48h stall check with a small buffer
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (49 * 60 * 60 * 1000));
        const url = `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${device.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

        try {
            const telemetry = await makeRequest(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
            });

            if (telemetry && telemetry.length > 0) {
                const sorted = [...telemetry].sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
                const latest = sorted[0];

                readings.push({
                    id: device.id,
                    name: device.name || 'Unnamed Device',
                    temperature: latest.temperature,
                    gravity: latest.gravity,
                    battery: latest.battery,
                    timestamp: latest.createdOn,
                    telemetry: sorted  // full 49h sorted newest-first, for stall check
                });
            }
        } catch (err) {
            console.error(`Failed to fetch telemetry for ${device.name || device.id}:`, err.message);
        }
    }

    return readings;
}

async function sendTelegram(message) {
    const url = `https://api.telegram.org/bot${CONFIG.telegramToken}/sendMessage`;
    const body = JSON.stringify({
        chat_id: CONFIG.telegramChatId,
        text: message,
        parse_mode: 'HTML'
    });

    await makeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        body
    });
}

function getTempStatus(temp) {
    if (temp > CONFIG.tempDangerMax)  return 'danger-high';
    if (temp < CONFIG.tempDangerMin)  return 'danger-low';
    if (temp > CONFIG.tempWarningMax) return 'warning-high';
    if (temp < CONFIG.tempWarningMin) return 'warning-low';
    return 'ok';
}

// Returns true if gravity hasn't moved enough over 48h to indicate active fermentation.
// Requires at least 48h of data to be present — skips the check if the brew is younger than that.
function isGravityStalled(telemetry) {
    if (!telemetry || telemetry.length < 2) return false;

    const now = new Date();
    const cutoff48h = new Date(now.getTime() - (48 * 60 * 60 * 1000));

    // Find readings from ~48h ago (oldest reading that's at least 48h old)
    const oldReadings = telemetry.filter(t => new Date(t.createdOn) <= cutoff48h);
    if (oldReadings.length === 0) {
        // Less than 48h of data — brew too young to call a stall
        return false;
    }

    // Oldest reading within our 48h window
    const oldest = oldReadings.sort((a, b) => new Date(a.createdOn) - new Date(b.createdOn))[0];
    // Most recent reading
    const newest = telemetry[0]; // already sorted newest-first

    const gravityChange = Math.abs(newest.gravity - oldest.gravity);
    console.log(`Gravity stall check: oldest=${oldest.gravity} (${oldest.createdOn}), newest=${newest.gravity}, change=${gravityChange.toFixed(1)}, threshold=${CONFIG.gravityStallThreshold}`);

    return gravityChange < CONFIG.gravityStallThreshold;
}

function buildTempAlertMessage(device, status) {
    const statusLabels = {
        'danger-high':  'DANGER - Temperature too high',
        'danger-low':   'DANGER - Temperature too low',
        'warning-high': 'Warning - Temperature running high',
        'warning-low':  'Warning - Temperature running low',
    };

    const lines = [
        `<b>Raptzilla Alert - ${device.name}</b>`,
        ``,
        `${statusLabels[status]}: <b>${device.temperature.toFixed(1)}C</b>`,
        (status === 'danger-high' || status === 'warning-high')
            ? `Safe max: ${CONFIG.tempDangerMax}C`
            : `Safe min: ${CONFIG.tempDangerMin}C`,
    ];

    if (device.battery != null) lines.push(`Battery: ${device.battery.toFixed(0)}%`);
    lines.push(``, `<a href="https://rapt.rockyroo.fish">View Dashboard</a>`);

    return lines.join('\n');
}

function buildStallAlertMessage(device) {
    const gravityPoints = (device.gravity / 1000).toFixed(3);
    const lines = [
        `<b>Raptzilla Alert - ${device.name}</b>`,
        ``,
        `Gravity unchanged for 48+ hours`,
        `Current gravity: <b>${gravityPoints}</b>`,
        ``,
        `Fermentation may be complete or stalled.`,
        `Check your brew and confirm it has reached terminal gravity.`,
    ];

    if (device.battery != null) lines.push(`Battery: ${device.battery.toFixed(0)}%`);
    lines.push(``, `<a href="https://rapt.rockyroo.fish">View Dashboard</a>`);

    return lines.join('\n');
}

// Netlify scheduled function — runs every 15 minutes
exports.handler = async (event) => {
    console.log('temp-monitor: running check');

    if (!CONFIG.email || !CONFIG.apiSecret) {
        console.error('Missing RAPT credentials');
        return { statusCode: 500, body: 'Missing RAPT credentials' };
    }

    if (!CONFIG.telegramToken || !CONFIG.telegramChatId) {
        console.error('Missing Telegram config');
        return { statusCode: 500, body: 'Missing Telegram config' };
    }

    try {
        const accessToken = await authenticate();
        const devices = await getDeviceReadings(accessToken);

        if (devices.length === 0) {
            console.log('No device readings available');
            return { statusCode: 200, body: 'No readings' };
        }

        // Load alert state and cold crash flag from Netlify Blobs
        let alertState = {};
        let coldCrashMode = false;
        try {
            const { getStore } = require('@netlify/blobs');
            const store = getStore('rapt-alerts');
            const saved = await store.get('alert-state', { type: 'json' });
            if (saved) alertState = saved;
            // Read as raw string — avoid type:'json' which can fail silently on boolean blobs
            const ccRaw = await store.get('cold-crash');
            coldCrashMode = ccRaw === 'true' || ccRaw === true;
            console.log(`Cold crash blob raw value: ${JSON.stringify(ccRaw)} → coldCrashMode=${coldCrashMode}`);
        } catch (e) {
            console.log('Blobs unavailable, skipping cooldown state:', e.message);
        }

        if (coldCrashMode) {
            console.log('Cold crash mode is active — low temperature alerts suppressed');
        }

        const now = Date.now();
        const cooldownMs = CONFIG.alertCooldownMinutes * 60 * 1000;
        const stallCooldownMs = CONFIG.stallCooldownMinutes * 60 * 1000;
        let stateChanged = false;

        for (const device of devices) {

            // --- Temperature check ---
            if (device.temperature == null) {
                console.log(`${device.name}: temperature is null — skipping temp check`);
            } else {
                const tempStatus = getTempStatus(device.temperature);
                // Suppress low-temp alerts during a deliberate cold crash
                const isLowStatus = tempStatus === 'danger-low' || tempStatus === 'warning-low';
                const effectiveStatus = (isLowStatus && coldCrashMode) ? 'ok' : tempStatus;
                const tempKey = `${device.id}-temp-${effectiveStatus}`;

                if (effectiveStatus === 'ok') {
                    // Clear temp alert state so it re-alerts if it goes bad again later
                    const tempKeys = Object.keys(alertState).filter(k => k.startsWith(`${device.id}-temp-`));
                    if (tempKeys.length > 0) {
                        tempKeys.forEach(k => delete alertState[k]);
                        stateChanged = true;
                    }
                    if (isLowStatus && coldCrashMode) {
                        console.log(`${device.name}: temp ${device.temperature.toFixed(1)}C - low suppressed (cold crash active)`);
                    } else {
                        console.log(`${device.name}: temp ${device.temperature.toFixed(1)}C - OK`);
                    }
                } else if (alertState[tempKey]) {
                    console.log(`${device.name}: ${effectiveStatus} already reported — waiting for temp to recover`);
                } else {
                    console.log(`${device.name}: ${effectiveStatus} at ${device.temperature.toFixed(1)}C — alerting`);
                    await sendTelegram(buildTempAlertMessage(device, effectiveStatus));
                    alertState[tempKey] = now;
                    stateChanged = true;
                }
            }

            // --- Gravity stall check ---
            // Fire once when stall is first detected; stay silent until gravity moves again.
            const stallKey = `${device.id}-stall`;
            const stalled = isGravityStalled(device.telemetry);

            if (!stalled) {
                if (alertState[stallKey]) {
                    delete alertState[stallKey];
                    stateChanged = true;
                }
                console.log(`${device.name}: gravity active - no stall`);
            } else if (alertState[stallKey]) {
                console.log(`${device.name}: stall already reported — waiting for gravity to move`);
            } else {
                console.log(`${device.name}: gravity stalled — alerting`);
                await sendTelegram(buildStallAlertMessage(device));
                alertState[stallKey] = now;
                stateChanged = true;
            }
        }

        // Persist updated alert state
        if (stateChanged) {
            try {
                const { getStore } = require('@netlify/blobs');
                const store = getStore('rapt-alerts');
                await store.set('alert-state', JSON.stringify(alertState));
            } catch (e) {
                console.log('Could not persist alert state:', e.message);
            }
        }

        return { statusCode: 200, body: `Checked ${devices.length} device(s)` };

    } catch (err) {
        console.error('temp-monitor error:', err.message);
        try {
            await sendTelegram(`<b>Raptzilla Monitor Error</b>\n\nCould not fetch fermentation data:\n<code>${err.message}</code>`);
        } catch (_) {}
        return { statusCode: 500, body: err.message };
    }
};
