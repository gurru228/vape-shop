const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { cart, customerName, customerPhone } = JSON.parse(event.body);
        if (!cart?.length || !customerName || !customerPhone) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const orderNumber = `ORD-${Date.now()}`;
        const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

        const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                order_number: orderNumber,
                customer_name: customerName,
                customer_phone: customerPhone,
                items: cart,
                total,
                payment_method: 'bizum',
                payment_status: 'pending'
            })
        });

        if (!res.ok) console.error('Supabase save failed:', await res.text());

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNumber, total })
        };
    } catch (err) {
        console.error('save-bizum-order error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
