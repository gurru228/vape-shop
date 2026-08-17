const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const MAX_LOG = 3000;
const LOG_KEY = 'log';

exports.handler = async (event) => {
    const q = event.queryStringParameters || {};
    const headers = event.headers || {};
    const ip = headers['x-nf-client-connection-ip'] || '';

    try {
        connectLambda(event);
    } catch (e) {
        // runtime may have configured blobs via environment already
    }

    if (q.debug === '1') {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hasBlobsField: typeof event.blobs === 'string' && event.blobs.length > 0,
                siteIdHeader: headers['x-nf-site-id'] || null,
                deployIdHeader: headers['x-nf-deploy-id'] || null,
                envContext: typeof process.env.NETLIFY_BLOBS_CONTEXT === 'string' && process.env.NETLIFY_BLOBS_CONTEXT.length > 0
            })
        };
    }

    const entry = {
        t: new Date().toISOString(),
        from: (q.from || 'direct').slice(0, 50),
        path: (event.path || '/').slice(0, 120),
        ref: (headers.referer || q.ref || '').slice(0, 200),
        country: headers['x-nf-geo-country'] || '',
        city: headers['x-nf-geo-city'] || '',
        device: (headers['user-agent'] || '').slice(0, 100),
        lang: (headers['accept-language'] || '').slice(0, 30),
        ipHash: ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12) : ''
    };

    try {
        const store = getStore('clicks');
        let list = [];
        try {
            const raw = await store.get(LOG_KEY, { type: 'json' });
            if (Array.isArray(raw)) list = raw;
        } catch (e) {
            // no log yet
        }
        list.push(entry);
        if (list.length > MAX_LOG) list = list.slice(list.length - MAX_LOG);
        await store.set(LOG_KEY, JSON.stringify(list));
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true, total: list.length })
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: false, error: String(err) })
        };
    }
};
