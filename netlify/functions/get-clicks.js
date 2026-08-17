const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async (event) => {
    const { password } = event.queryStringParameters || {};
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    try {
        connectLambda(event);
    } catch (e) {
        // runtime may have configured blobs via environment already
    }
    try {
        const store = getStore('clicks');
        let list = [];
        try {
            const raw = await store.get('log', { type: 'json' });
            if (Array.isArray(raw)) list = raw;
        } catch (e) {
            // no log yet
        }
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clicks: list.slice().reverse() })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
    }
};
