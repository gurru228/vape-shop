const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const time = new Date(entry.t).toLocaleString('zh-CN', { timeZone: 'Europe/Madrid' });
            const loc = entry.city ? `${entry.city}, ${entry.country}` : (entry.country || '未知');
            const text = `👀 有人进入网站\n\n` +
                `🕐 ${time} (Madrid)\n` +
                `📍 ${loc}\n` +
                `📄 ${entry.path}\n` +
                `📣 渠道: ${entry.from || 'direct'}\n` +
                `🔗 来源: ${entry.ref || '直接'}\n` +
                `📱 ${entry.device}`;
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
            }).catch(err => console.error('Telegram visit notify failed:', err));
        }

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
