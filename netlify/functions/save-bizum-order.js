const { getVerifiedUserId } = require('../lib/verify-user');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { METHOD_LABELS, formatOrderDetails, sendTelegram } = require('../lib/telegram');

// 注：库存不在下单时扣减；改为后台确认付款（payment_status -> paid/shipped/delivered）时由 update-order.js 扣减。

async function sendTelegramNotification(order) {
    const methodLabel = METHOD_LABELS[order.payment_method] || 'Bizum';
    await sendTelegram(`🛒 新订单 Nuevo pedido ${methodLabel}\n\n` +
        formatOrderDetails(order) +
        `\n\n⏳ Estado: Pendiente confirmacion / 待确认`);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { cart, customerName, customerPhone, deliveryType, address, deliveryTime, shippingFee, agentRef, paymentMethod, orderNumber: clientOrderNumber } = JSON.parse(event.body);
        if (!cart?.length || !customerName || !customerPhone) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const userId = await getVerifiedUserId(event.headers);
        const orderNumber = clientOrderNumber || `ORD-${Date.now()}`;
        const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const shipping = parseFloat(shippingFee) || 0;
        const total = +(subtotal + shipping).toFixed(2);

        const order = {
            order_number: orderNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
            items: cart,
            total,
            shipping_fee: shipping,
            payment_method: paymentMethod || 'bizum',
            payment_status: 'pending',
            delivery_type: deliveryType || 'pickup',
            address: address || '',
            delivery_time: deliveryTime || '',
            ...(agentRef ? { agent_ref: agentRef } : {}),
            ...(userId ? { user_id: userId } : {})
        };

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

        if (!res.ok) {
            const errText = await res.text();
            console.error('Supabase save failed:', errText);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supabase_error: errText, supabase_status: res.status })
            };
        }

        await sendTelegramNotification(order);

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
