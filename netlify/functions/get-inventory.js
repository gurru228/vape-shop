const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const { adminOk, denied } = require('../lib/admin-auth');

// exact stock levels are for the admin page; the storefront only needs /api/stock (which flavors are sold out)
exports.handler = async (event) => {
    if (!adminOk((event.queryStringParameters || {}).password)) return denied();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory?select=*&order=product_id,flavor_name`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    };
};
