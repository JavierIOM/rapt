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

    // GET — return current state
    if (event.httpMethod === 'GET') {
        try {
            const value = await store.get(BLOB_KEY, { type: 'json' });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ coldCrash: value === true }),
            };
        } catch (e) {
            return { statusCode: 200, headers, body: JSON.stringify({ coldCrash: false }) };
        }
    }

    // POST — set state from query param or JSON body
    if (event.httpMethod === 'POST') {
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
