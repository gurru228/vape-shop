const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { password, items } = JSON.parse(event.body);
        if (password !== ADMIN_PASSWORD) return { statusCode: 401, body: 'Unauthorized' };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(items)
        });

        if (!res.ok) throw new Error(await res.text());
        return { statusCode: 200, body: 'ok' };
    } catch (err) {
        return { statusCode: 500, body: err.message };
    }
};
