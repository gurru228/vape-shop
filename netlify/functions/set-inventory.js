const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { adminOk, denied, parse } = require('../lib/admin-auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { password, items } = parse(event.body);
        if (!adminOk(password)) return denied();
        if (!Array.isArray(items) || items.length > 500) return { statusCode: 400, body: 'bad items' };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory?on_conflict=product_id,flavor_name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(items)
        });

        if (!res.ok) throw new Error(await res.text());
        return { statusCode: 200, body: 'ok' };
    } catch (err) {
        return { statusCode: 500, body: err.message };
    }
};
