const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
    if (event.httpMethod !== 'PATCH') return { statusCode: 405, body: 'Method Not Allowed' };

    const { password, orderId, status } = JSON.parse(event.body);

    if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ payment_status: status })
    });

    return { statusCode: res.ok ? 200 : 500, body: JSON.stringify({ success: res.ok }) };
};
