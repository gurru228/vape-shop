const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { formatOrderDetails, sendTelegram } = require('../lib/telegram');

async function getOrder(sessionId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?stripe_session_id=eq.${sessionId}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) ? data[0] : null;
}

async function markPaid(sessionId) {
    await fetch(`${SUPABASE_URL}/rest/v1/orders?stripe_session_id=eq.${sessionId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ payment_status: 'paid' })
    });
}

async function sendTelegramNotification(order) {
    await sendTelegram(`✅ 新订单 · 刷卡已付款 Pago con tarjeta confirmado\n\n` + formatOrderDetails(order));
}

// 解析 cart item 的 productId 和 flavorName。
// 普通商品 id：{productId}-{flavorName}
// 赠品 id：FREE-{productId}-{flavorName}-{timestamp}
function parseItemKey(item) {
    const idStr = String(item.id);
    if (item.isFree && idStr.startsWith('FREE-')) {
        const parts = idStr.split('-');
        return {
            productId: parseInt(parts[1]),
            flavorName: parts.length > 3 ? parts.slice(2, -1).join('-') : 'default'
        };
    }
    const parts = idStr.split('-');
    return {
        productId: parseInt(parts[0]),
        flavorName: parts.length > 1 ? parts.slice(1).join('-') : 'default'
    };
}

async function decrementInventory(cart) {
    for (const item of cart) {
        const { productId, flavorName } = parseItemKey(item);
        if (Number.isNaN(productId)) continue;
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/decrement_stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({ p_product_id: productId, p_flavor_name: flavorName, p_qty: item.quantity })
        }).catch(err => console.error('Inventory decrement failed:', err));
    }
}

exports.handler = async (event) => {
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        const order = await getOrder(session.id);
        await markPaid(session.id);
        if (order) {
            await Promise.all([
                sendTelegramNotification(order),
                decrementInventory(order.items || [])
            ]);
        }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
