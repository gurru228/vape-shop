const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { adminOk, denied, parse } = require('../lib/admin-auth');

exports.handler = async (event) => {
    const { password, status } = event.queryStringParameters || {};

    if (!adminOk(password)) return denied();

    // Env var sanity check
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                debug_error: `Missing env vars: SUPABASE_URL=${!!SUPABASE_URL}, SUPABASE_SERVICE_KEY=${!!SUPABASE_KEY}`,
                status: 0
            })
        };
    }

    let url = `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc&payment_status=neq.stripe_pending`;
    if (status && status !== 'all') url += `&payment_status=eq.${encodeURIComponent(status)}`;

    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    const text = await res.text();

    if (!res.ok) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ debug_error: text, status: res.status })
        };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: text
    };
};
