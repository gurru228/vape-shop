const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const itemLines = order.items.map(i => `  • ${i.name} x${i.quantity} — €${(i.price * i.quantity).toFixed(2)}`).join('\n');
    const deliveryInfo = order.delivery_type === 'delivery'
        ? `\n📦 Entrega a domicilio\n📍 ${order.address}\n🕐 ${order.delivery_time}`
        : order.delivery_type === 'postal'
        ? `\n✉️ Envio postal\n📍 ${order.address}${order.shipping_fee > 0 ? `\n📬 Envio: €${order.shipping_fee.toFixed(2)}` : '\n📬 Envio gratuito'}`
        : '\n🏪 Recogida en tienda';
    const text = `✅ Pago con tarjeta confirmado\n\n` +
        `📋 ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `📱 ${order.customer_phone}\n` +
        `\n${itemLines}\n` +
        `\n💶 Total: €${order.total.toFixed(2)}` +
        deliveryInfo;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    }).catch(err => console.error('Telegram notify failed:', err));
}

async function decrementInventory(cart) {
    for (const item of cart) {
        if (item.isFree) continue;
        const parts = String(item.id).split('-');
        const productId = parseInt(parts[0]);
        const flavorName = parts.length > 1 ? parts.slice(1).join('-') : 'default';
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
