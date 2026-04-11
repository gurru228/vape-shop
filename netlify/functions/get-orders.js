const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
    const { password, status } = event.queryStringParameters || {};

    if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

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
    if (status && status !== 'all') url += `&payment_status=eq.${status}`;

    console.log('Fetching:', url);
    console.log('Key prefix:', SUPABASE_KEY.substring(0, 20));

    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    const text = await res.text();
    console.log('Supabase status:', res.status, 'body:', text.substring(0, 300));

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
