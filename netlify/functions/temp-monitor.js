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
    // Cooldown in minutes — don't re-alert for the same condition within this window
    alertCooldownMinutes: process.env.ALERT_COOLDOWN_MINUTES ? parseInt(process.env.ALERT_COOLDOWN_MINUTES) : 60,
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
            'Content-Length': params.toString().length
        },
        body: params.toString()
    });

    return data.access_token;
}

async function getLatestReadings(accessToken) {
    const devices = await makeRequest(`${CONFIG.apiUrl}/Hydrometers/GetHydrometers`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    const readings = [];

    for (const device of devices) {
        // Fetch just the last 2 hours of telemetry — we only need the latest reading
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (2 * 60 * 60 * 1000));
        const url = `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${device.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

        try {
            const telemetry = await makeRequest(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
            });

            if (telemetry && telemetry.length > 0) {
                const latest = telemetry.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))[0];
                readings.push({
                    id: device.id,
                    name: device.name || 'Unnamed Device',
                    temperature: latest.temperature,
                    battery: latest.battery,
                    timestamp: latest.createdOn
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
    if (temp > CONFIG.tempDangerMax) return 'danger-high';
    if (temp < CONFIG.tempDangerMin) return 'danger-low';
    if (temp > CONFIG.tempWarningMax) return 'warning-high';
    if (temp < CONFIG.tempWarningMin) return 'warning-low';
    return 'ok';
}

function buildAlertMessage(device, status) {
    const statusLabels = {
        'danger-high': `DANGER - Temperature too high`,
        'danger-low':  `DANGER - Temperature too low`,
        'warning-high': `Warning - Temperature running high`,
        'warning-low':  `Warning - Temperature running low`,
    };

    const lines = [
        `<b>RAPT Alert - ${device.name}</b>`,
        ``,
        `${statusLabels[status]}: <b>${device.temperature.toFixed(1)}C</b>`,
    ];

    if (status === 'danger-high' || status === 'warning-high') {
        lines.push(`Safe max: ${CONFIG.tempDangerMax}C`);
    } else {
        lines.push(`Safe min: ${CONFIG.tempDangerMin}C`);
    }

    if (device.battery !== null && device.battery !== undefined) {
        lines.push(`Battery: ${device.battery.toFixed(0)}%`);
    }

    lines.push(``);
    lines.push(`<a href="https://rapt.rockyroo.fish">View Dashboard</a>`);

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
        const readings = await getLatestReadings(accessToken);

        if (readings.length === 0) {
            console.log('No device readings available');
            return { statusCode: 200, body: 'No readings' };
        }

        // Load alert state from Netlify Blobs to enforce cooldown
        let alertState = {};
        try {
            const { getStore } = require('@netlify/blobs');
            const store = getStore('rapt-alerts');
            const saved = await store.get('alert-state', { type: 'json' });
            if (saved) alertState = saved;
        } catch (e) {
            // Blobs not available (e.g. local dev) — proceed without cooldown
            console.log('Blobs unavailable, skipping cooldown state:', e.message);
        }

        const now = Date.now();
        const cooldownMs = CONFIG.alertCooldownMinutes * 60 * 1000;
        let stateChanged = false;

        for (const device of readings) {
            const status = getTempStatus(device.temperature);
            const stateKey = `${device.id}-${status}`;

            if (status === 'ok') {
                // Clear any stored alert state for this device so it re-alerts if it goes bad again
                if (alertState[device.id]) {
                    delete alertState[device.id];
                    stateChanged = true;
                }
                console.log(`${device.name}: ${device.temperature.toFixed(1)}C - OK`);
                continue;
            }

            // Check cooldown — only alert if we haven't sent this exact status recently
            const lastAlert = alertState[stateKey];
            if (lastAlert && (now - lastAlert) < cooldownMs) {
                const minsAgo = Math.round((now - lastAlert) / 60000);
                console.log(`${device.name}: ${status} alert suppressed (sent ${minsAgo}m ago, cooldown ${CONFIG.alertCooldownMinutes}m)`);
                continue;
            }

            console.log(`${device.name}: ${status} at ${device.temperature.toFixed(1)}C — sending alert`);
            await sendTelegram(buildAlertMessage(device, status));
            alertState[stateKey] = now;
            stateChanged = true;
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

        return { statusCode: 200, body: `Checked ${readings.length} device(s)` };

    } catch (err) {
        console.error('temp-monitor error:', err.message);
        // Alert via Telegram if the monitor itself errors
        try {
            await sendTelegram(`<b>RAPT Monitor Error</b>\n\nCould not fetch fermentation data:\n<code>${err.message}</code>`);
        } catch (_) {}
        return { statusCode: 500, body: err.message };
    }
};
