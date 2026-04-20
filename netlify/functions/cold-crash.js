// cold-crash.js — GET returns current cold crash state, POST sets it
// State is persisted in Netlify Blobs so temp-monitor.js can read it server-side

const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:8888',
    'https://rapt-dashboard.netlify.app',
    'https://rapt.rockyroo.fish',
];

const STORE_NAME = 'rapt-alerts';
const BLOB_KEY = 'cold-crash';

exports.handler = async (event) => {
    const origin = event.headers.origin || event.headers.Origin || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    const corsOrigin = isAllowed ? origin : ALLOWED_ORIGINS[ALLOWED_ORIGINS.length - 1];

    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    let store;
    try {
        const { getStore } = require('@netlify/blobs');
        store = getStore(STORE_NAME);
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Blobs unavailable' }) };
    }

    // GET — return current state (cold crash + paused)
    if (event.httpMethod === 'GET') {
        try {
            const ccRaw = await store.get(BLOB_KEY);
            const pausedRaw = await store.get('alerts-paused');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    coldCrash: ccRaw === 'true' || ccRaw === true,
                    alertsPaused: pausedRaw === 'true' || pausedRaw === true,
                }),
            };
        } catch (e) {
            return { statusCode: 200, headers, body: JSON.stringify({ coldCrash: false, alertsPaused: false }) };
        }
    }

    // POST — requires Authorization: Bearer <COLD_CRASH_SECRET>
    if (event.httpMethod === 'POST') {
        const secret = process.env.COLD_CRASH_SECRET;
        if (secret) {
            const authHeader = event.headers.authorization || event.headers.Authorization || '';
            const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
            if (provided !== secret) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
            }
        }

        let state;

        // Accept ?state=true/false as query param
        const params = event.queryStringParameters || {};
        if (params.state !== undefined) {
            state = params.state === 'true';
        } else {
            // Fall back to JSON body
            try {
                const body = JSON.parse(event.body || '{}');
                state = !!body.coldCrash;
            } catch {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
            }
        }

        await store.set(BLOB_KEY, JSON.stringify(state));
        console.log(`Cold crash mode set to: ${state}`);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ coldCrash: state }),
        };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
