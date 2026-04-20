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

async function sendTelegram(chatId, message) {
    const url = `https://api.telegram.org/bot${CONFIG.telegramToken}/sendMessage`;
    const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    await makeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        body
    });
}

async function getDeviceData() {
    const token = await authenticate();
    const devices = await makeRequest(`${CONFIG.apiUrl}/Hydrometers/GetHydrometers`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    const results = [];

    for (const device of devices) {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (2 * 60 * 60 * 1000));
        const telemetry = await makeRequest(
            `${CONFIG.apiUrl}/Hydrometers/GetTelemetry?hydrometerId=${device.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
            { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
        );

        const latest = telemetry && telemetry.length > 0
            ? [...telemetry].sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))[0]
            : null;

        let og = null;
        let profileName = null;
        let targetFG = null;

        if (device.activeProfileSession) {
            const aps = device.activeProfileSession;
            profileName = aps.name || null;
            if (aps.originalGravity) og = aps.originalGravity < 2.0 ? aps.originalGravity * 1000 : aps.originalGravity;
            if (aps.finalGravity) targetFG = aps.finalGravity < 2.0 ? aps.finalGravity * 1000 : aps.finalGravity;
        }

        results.push({ device, latest, og, profileName, targetFG });
    }

    return results;
}

function tempStatus(temp) {
    if (temp == null) return 'No reading';
    if (temp > CONFIG.tempDangerMax) return `Too high (danger > ${CONFIG.tempDangerMax}C)`;
    if (temp > CONFIG.tempWarningMax) return `High (warning > ${CONFIG.tempWarningMax}C)`;
    if (temp < CONFIG.tempDangerMin) return `Too low (danger < ${CONFIG.tempDangerMin}C)`;
    if (temp < CONFIG.tempWarningMin) return `Low (warning < ${CONFIG.tempWarningMin}C)`;
    return 'Good';
}

function greeting() {
    const hour = new Date().getUTCHours() + 1; // GMT+1 (BST)
    if (hour >= 5 && hour < 12) return 'Good morning, Javier';
    if (hour >= 12 && hour < 18) return 'Good afternoon, Javier';
    return 'Good evening, Javier';
}

function buildResponse(command, readings) {
    if (readings.length === 0) return `${greeting()} — no devices found.`;

    const lines = [`${greeting()} — here's your brew update:\n`];

    for (const { device, latest, og, profileName, targetFG } of readings) {
        const name = profileName || device.name || device.id;
        const temp = latest ? latest.temperature : null;
        const gravity = latest ? latest.gravity : null;
        const gravSG = gravity != null ? (gravity / 1000).toFixed(3) : null;
        const ogSG = og ? og / 1000 : null;
        const abv = ogSG && gravSG ? Math.max(0, (ogSG - parseFloat(gravSG)) * 131.25) : null;
        const attenuation = ogSG && gravSG
            ? Math.max(0, Math.min(100, ((ogSG - parseFloat(gravSG)) / (ogSG - 1.0)) * 100))
            : null;

        if (command === '/temp') {
            lines.push(`<b>${name}</b>`);
            lines.push(temp != null ? `  ${temp.toFixed(1)}C — ${tempStatus(temp)}` : '  No temperature data');

        } else if (command === '/gravity') {
            lines.push(`<b>${name}</b>`);
            lines.push(gravSG ? `  ${gravSG} SG` : '  No gravity data');
            if (ogSG) lines.push(`  OG: ${ogSG.toFixed(3)}`);
            if (targetFG) lines.push(`  Target FG: ${(targetFG / 1000).toFixed(3)}`);

        } else if (command === '/abv') {
            lines.push(`<b>${name}</b>`);
            lines.push(abv != null ? `  ABV: ${abv.toFixed(2)}%` : '  Not enough data to calculate ABV');
            if (attenuation != null) lines.push(`  Attenuation: ${attenuation.toFixed(1)}%`);

        } else if (command === '/battery') {
            lines.push(`<b>${name}</b>`);
            lines.push(latest && latest.battery != null ? `  Battery: ${latest.battery.toFixed(0)}%` : '  No battery data');

        } else if (command === '/status') {
            lines.push(`<b>${name}</b>`);
            if (temp != null) lines.push(`  Temp: ${temp.toFixed(1)}C (${tempStatus(temp)})`);
            if (gravSG) lines.push(`  Gravity: ${gravSG} SG`);
            if (abv != null) lines.push(`  ABV: ${abv.toFixed(2)}%`);
            if (attenuation != null) lines.push(`  Attenuation: ${attenuation.toFixed(1)}%`);
            if (latest && latest.battery != null) lines.push(`  Battery: ${latest.battery.toFixed(0)}%`);
        }

        lines.push('');
    }

    return lines.join('\n').trim();
}

const HELP_TEXT = `Raptzilla Bot — available commands:

/temp — current temperature
/gravity — current gravity (SG)
/abv — current ABV and attenuation
/battery — battery level
/status — everything at once
/pause — silence all alerts
/resume — re-enable alerts
/help — this message`;

async function setAlertsPaused(paused) {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('rapt-alerts');
    await store.set('alerts-paused', paused ? 'true' : 'false');
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 200, body: 'ok' };
    }

    let update;
    try {
        update = JSON.parse(event.body);
    } catch {
        return { statusCode: 200, body: 'ok' };
    }

    const message = update.message || update.edited_message;
    if (!message || !message.text) return { statusCode: 200, body: 'ok' };

    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase().split('@')[0];

    // Only respond to the configured chat (security — ignore messages from other chats)
    if (CONFIG.telegramChatId && String(chatId) !== String(CONFIG.telegramChatId)) {
        console.log(`Ignored message from unauthorized chat ${chatId}`);
        return { statusCode: 200, body: 'ok' };
    }

    const commands = ['/temp', '/gravity', '/abv', '/battery', '/status'];

    if (text === '/help' || text === '/start') {
        await sendTelegram(chatId, HELP_TEXT);
        return { statusCode: 200, body: 'ok' };
    }

    if (text === '/pause') {
        try { await setAlertsPaused(true); } catch (e) { console.error('setAlertsPaused error:', e.message); }
        await sendTelegram(chatId, `${greeting()} — alerts paused. Send /resume whenever you want them back.`);
        return { statusCode: 200, body: 'ok' };
    }

    if (text === '/resume') {
        try { await setAlertsPaused(false); } catch (e) { console.error('setAlertsPaused error:', e.message); }
        await sendTelegram(chatId, `${greeting()} — alerts are back on. I'll let you know if anything looks off.`);
        return { statusCode: 200, body: 'ok' };
    }

    if (!commands.includes(text)) {
        return { statusCode: 200, body: 'ok' };
    }

    try {
        const readings = await getDeviceData();
        const reply = buildResponse(text, readings);
        await sendTelegram(chatId, reply);
    } catch (err) {
        console.error('bot-webhook error:', err.message);
        await sendTelegram(chatId, `Error fetching data: ${err.message}`);
    }

    return { statusCode: 200, body: 'ok' };
};
