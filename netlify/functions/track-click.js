const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const { getVerifiedUser } = require('../lib/verify-user');
const { madridTime, sendTelegram } = require('../lib/telegram');

const MAX_LOG = 3000;
const LOG_KEY = 'log';
const STATE_KEY = 'notify-state';
const DEDUPE_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_NOTIFY_PER_HOUR = parseInt(process.env.VISIT_NOTIFY_MAX_PER_HOUR, 10) || 20;
const HASH_SALT = process.env.VISIT_HASH_SALT || process.env.SUPABASE_SERVICE_KEY || 'vapeshop';

const BOT_RE = /bot|crawl|spider|slurp|scrap|preview|fetch|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|axios|go-http|java\/|libwww|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|quora/i;

function isBot(headers, ua) {
    if (!ua || ua.length < 20) return true;
    if (BOT_RE.test(ua)) return true;
    const purpose = String(headers['sec-purpose'] || headers['purpose'] || '').toLowerCase();
    return purpose.includes('prefetch') || purpose.includes('prerender');
}

function deviceSummary(ua) {
    const os = /iPhone/.test(ua) ? 'iPhone'
        : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'Android tablet')
        : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
        : /CrOS/.test(ua) ? 'ChromeOS'
        : /Linux/.test(ua) ? 'Linux' : 'Otro';
    const browser = /MicroMessenger/i.test(ua) ? 'WeChat'
        : /Instagram/i.test(ua) ? 'Instagram'
        : /FBAN|FBAV/i.test(ua) ? 'Facebook'
        : /Edg\//.test(ua) ? 'Edge'
        : /SamsungBrowser/.test(ua) ? 'Samsung'
        : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Firefox|FxiOS/.test(ua) ? 'Firefox'
        : /Chrome|CriOS/.test(ua) ? 'Chrome'
        : /Safari/.test(ua) ? 'Safari' : 'Otro';
    return `${os} · ${browser}`;
}

// Drop query string / fragment: they can carry personal data or tracking ids.
function cleanReferrer(ref) {
    if (!ref) return '';
    try {
        const u = new URL(ref);
        return `${u.origin}${u.pathname}`.slice(0, 200);
    } catch {
        return '';
    }
}

// Rotates daily and is never stored beyond the 30-minute dedupe window, so it
// cannot be turned back into an IP or used to follow a visitor across days.
function visitorKey(ip, ua) {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    return crypto.createHmac('sha256', HASH_SALT).update(`${day}|${ip}|${ua}`).digest('hex').slice(0, 16);
}

async function readJson(store, key, fallback) {
    try {
        const raw = await store.get(key, { type: 'json' });
        return raw == null ? fallback : raw;
    } catch {
        return fallback;
    }
}

exports.handler = async (event) => {
    const q = event.queryStringParameters || {};
    const headers = event.headers || {};
    const ip = headers['x-nf-client-connection-ip'] || '';
    const ua = String(headers['user-agent'] || '');
    const json = (body) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    try {
        connectLambda(event);
    } catch (e) {
        // runtime may have configured blobs via environment already
    }

    if (q.debug === '1') {
        return json({
            hasBlobsField: typeof event.blobs === 'string' && event.blobs.length > 0,
            siteIdHeader: headers['x-nf-site-id'] || null,
            deployIdHeader: headers['x-nf-deploy-id'] || null,
            envContext: typeof process.env.NETLIFY_BLOBS_CONTEXT === 'string' && process.env.NETLIFY_BLOBS_CONTEXT.length > 0
        });
    }

    if (isBot(headers, ua)) return json({ ok: true, skipped: 'bot' });

    const now = Date.now();
    const entry = {
        t: new Date(now).toISOString(),
        from: String(q.from || 'direct').slice(0, 50),
        path: String(q.path || '/').slice(0, 120),
        ref: cleanReferrer(q.ref || headers.referer || ''),
        country: headers['x-nf-geo-country'] || '',
        city: headers['x-nf-geo-city'] || '',
        device: deviceSummary(ua),
        lang: String(headers['accept-language'] || '').split(',')[0].slice(0, 15)
    };

    try {
        const store = getStore('clicks');

        const state = await readJson(store, STATE_KEY, {});
        const recent = {};
        for (const [k, ts] of Object.entries(state.recent || {})) {
            if (now - ts < DEDUPE_MS) recent[k] = ts;
        }
        const sent = (state.sent || []).filter(ts => now - ts < HOUR_MS);
        let suppressed = state.suppressed || 0;

        const key = visitorKey(ip, ua);
        if (recent[key]) return json({ ok: true, skipped: 'duplicate' });
        recent[key] = now;

        const list = await readJson(store, LOG_KEY, []);
        const log = Array.isArray(list) ? list : [];
        log.push(entry);
        await store.set(LOG_KEY, JSON.stringify(log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log));

        let notified = false;
        if (sent.length < MAX_NOTIFY_PER_HOUR) {
            const user = await getVerifiedUser(headers);
            const loc = entry.city ? `${entry.city}, ${entry.country}` : (entry.country || '未知');
            const text = `👀 有人进入网站 Nueva visita\n\n` +
                `🕐 ${madridTime(now)} (Madrid)\n` +
                `📍 ${loc}\n` +
                `📄 ${entry.path}\n` +
                `📣 渠道: ${entry.from || 'direct'}\n` +
                `🔗 来源: ${entry.ref || '直接'}\n` +
                `📱 ${entry.device}` +
                (user && user.email ? `\n👤 ${user.email}` : '') +
                (suppressed > 0 ? `\n\n(+${suppressed} 次访问因频率限制未推送 / omitidas por límite)` : '');
            notified = await sendTelegram(text);
            if (notified) {
                sent.push(now);
                suppressed = 0;
            }
        } else {
            suppressed += 1;
        }

        await store.set(STATE_KEY, JSON.stringify({ recent, sent, suppressed }));

        return json({ ok: true, total: log.length, notified });
    } catch (err) {
        return json({ ok: false, error: String(err) });
    }
};
