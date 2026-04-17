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
    tempDangerMax: process.env.TEMP_DANGER_MAX ? parseFloat(process.env.TEMP_DANGER_MAX) : 28,
};

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
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

function buildSummary(device, telemetry24h, og) {
    // Sort ascending for analysis
    const sorted = [...telemetry24h].sort((a, b) => new Date(a.createdOn) - new Date(b.createdOn));
    const latest = sorted[sorted.length - 1];

    // Temperature stats over last 24h (exclude null readings to avoid skewed stats)
    const temps = sorted.map(t => t.temperature).filter(t => t != null);
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const minTemp = temps.length > 0 ? Math.min(...temps) : null;
    const maxTemp = temps.length > 0 ? Math.max(...temps) : null;

    // ABV and attenuation from latest reading
    const ogSG = og / 1000;
    const fgSG = latest.gravity / 1000;
    const abv = Math.max(0, (ogSG - fgSG) * 131.25);
    const attenuationRaw = ogSG > 1.0 ? ((ogSG - fgSG) / (ogSG - 1.0)) * 100 : null;
    const attenuation = attenuationRaw != null ? Math.max(0, Math.min(100, attenuationRaw)) : null;

    // Gravity velocity from latest reading (already in telemetry if available)
    const gravVelocity = latest.gravityVelocity != null ? latest.gravityVelocity : null;

    // How many days since first reading we have
    const firstReading = sorted[0];
    const daysSinceFirst = ((new Date(latest.createdOn) - new Date(firstReading.createdOn)) / 86400000).toFixed(1);

    // Temperature status
    const tempStatus = maxTemp == null
        ? 'No data'
        : maxTemp > CONFIG.tempDangerMax
        ? 'Above safe max!'
        : minTemp < CONFIG.tempDangerMin
        ? 'Below safe min!'
        : 'Within range';

    const lines = [
        `<b>Raptzilla Daily Summary - ${device.name}</b>`,
        ``,
        `<b>Gravity</b>`,
        `  Current: <b>${fgSG.toFixed(3)}</b>  (OG: ${ogSG.toFixed(3)})`,
        `  ABV: <b>${abv.toFixed(2)}%</b>`,
        attenuation != null ? `  Attenuation: <b>${attenuation.toFixed(1)}%</b>` : null,
        gravVelocity != null
            ? `  Gravity velocity: ${gravVelocity.toFixed(2)} ppd`
            : null,
        ``,
        `<b>Temperature (last 24h)</b>`,
        avgTemp != null
            ? `  Avg: <b>${avgTemp.toFixed(1)}C</b>   Min: ${minTemp.toFixed(1)}C   Max: ${maxTemp.toFixed(1)}C`
            : `  Avg: N/A   Min: N/A   Max: N/A`,
        `  Status: ${tempStatus}`,
        ``,
        `<b>Device</b>`,
        `  Battery: ${latest.battery != null ? latest.battery.toFixed(0) + '%' : 'N/A'}`,
        `  Readings today: ${sorted.length}`,
        `  Days data: ${daysSinceFirst}`,
    ].filter(l => l !== null);

    return lines.join('\n');
}

// Netlify scheduled function — runs daily at 07:30 and 19:30 UTC
exports.handler = async (event) => {
    console.log('daily-summary: running');

    if (!CONFIG.email || !CONFIG.apiSecret || !CONFIG.telegramToken || !CONFIG.telegramChatId) {
        console.error('Missing required config');
        return { statusCode: 500, body: 'Missing config' };
    }

    try {
        const accessToken = await authenticate();

        const devices = await makeRequest(`${CONFIG.apiUrl}/Hydrometers/GetHydrometers`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });

        for (const device of devices) {
            // Fetch last 25h so we have a full 24h window with a little buffer
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - (25 * 60 * 60 * 1000));
            const url = `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${device.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;

            const telemetry = await makeRequest(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
            });

            if (!telemetry || telemetry.length === 0) {
                await sendTelegram(`<b>Raptzilla Daily Summary - ${device.name || device.id}</b>\n\nNo telemetry data in the last 24 hours.`);
                continue;
            }

            // Determine OG — read directly from activeProfileSession (already on device object),
            // normalise from SG format (e.g. 1.047) to RAPT units (e.g. 1047.0)
            let og = null;

            if (device.activeProfileSession && device.activeProfileSession.originalGravity) {
                const raw = device.activeProfileSession.originalGravity;
                og = raw < 2.0 ? raw * 1000 : raw;
                console.log(`OG from profile session: ${og} (${(og / 1000).toFixed(3)})`);
            }

            if (!og && process.env.RAPT_MANUAL_OG) og = parseFloat(process.env.RAPT_MANUAL_OG);
            if (!og) {
                const oldest = [...telemetry].sort((a, b) => new Date(a.createdOn) - new Date(b.createdOn))[0];
                og = oldest.gravity;
                console.log(`OG from first telemetry reading: ${og}`);
            }

            const message = buildSummary(device, telemetry, og);
            console.log(`Sending daily summary for ${device.name || device.id}`);
            await sendTelegram(message);
        }

        return { statusCode: 200, body: 'Daily summaries sent' };

    } catch (err) {
        console.error('daily-summary error:', err.message);
        try {
            await sendTelegram(`<b>Raptzilla Summary Error</b>\n\nCould not generate daily summary:\n<code>${err.message}</code>`);
        } catch (_) {}
        return { statusCode: 500, body: err.message };
    }
};
