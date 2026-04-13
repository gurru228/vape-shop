const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SUPABASE_WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // 验证 Supabase Webhook 签名
    const authHeader = event.headers['authorization'] || '';
    if (SUPABASE_WEBHOOK_SECRET && authHeader !== `Bearer ${SUPABASE_WEBHOOK_SECRET}`) {
        return { statusCode: 401, body: 'Unauthorized' };
    }

    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    // Supabase Auth Hook payload: { type, email, ... }
    const email = payload.email || payload.record?.email || '未知';
    const createdAt = payload.created_at || payload.record?.created_at || new Date().toISOString();
    const time = new Date(createdAt).toLocaleString('zh-CN', { timeZone: 'Europe/Madrid' });

    const text = `🆕 新用户注册\n\n📧 ${email}\n🕐 ${time} (Madrid)`;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
        }).catch(err => console.error('Telegram notify failed:', err));
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
