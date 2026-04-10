const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
    const { password, status } = event.queryStringParameters || {};

    if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let url = `${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`;
    if (status && status !== 'all') url += `&payment_status=eq.${status}`;

    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: await res.text()
    };
};
