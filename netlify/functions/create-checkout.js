const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE_URL = process.env.URL || 'https://tangerine-heliotrope-a2bd74.netlify.app';

async function saveOrder(order) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(order)
    });
    if (!res.ok) throw new Error(await res.text());
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { cart, customerName, customerPhone, deliveryType, address, deliveryTime, shippingFee, agentRef } = JSON.parse(event.body);
        if (!cart?.length || !customerName || !customerPhone) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const orderNumber = `ORD-${Date.now()}`;
        const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const shipping = parseFloat(shippingFee) || 0;
        const total = +(subtotal + shipping).toFixed(2);

        const lineItems = cart.map(item => ({
            price_data: {
                currency: 'eur',
                product_data: { name: item.name },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));
        if (shipping > 0) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'Envio postal / 邮费' },
                    unit_amount: Math.round(shipping * 100),
                },
                quantity: 1,
            });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${BASE_URL}/checkout-success.html?order=${orderNumber}`,
            cancel_url: `${BASE_URL}/`,
            metadata: { order_number: orderNumber, customer_name: customerName, customer_phone: customerPhone }
        });

        const orderData = {
            order_number: orderNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
            items: cart,
            total,
            shipping_fee: shipping,
            payment_method: 'card',
            payment_status: 'stripe_pending',
            stripe_session_id: session.id,
            delivery_type: deliveryType || 'pickup',
            address: address || '',
            delivery_time: deliveryTime || '',
            ...(agentRef ? { agent_ref: agentRef } : {})
        };
        // 只保存订单记录，通知和库存扣减等 Stripe webhook 确认付款后再做
        await saveOrder(orderData).catch(err => console.error('Supabase save failed:', err));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: session.url, orderNumber })
        };
    } catch (err) {
        console.error('create-checkout error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
