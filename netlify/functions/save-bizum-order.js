const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

async function sendTelegramNotification(order) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const itemLines = order.items.map(i => `  • ${i.name} x${i.quantity} — €${(i.price * i.quantity).toFixed(2)}`).join('\n');
    const deliveryInfo = order.delivery_type === 'delivery'
        ? `\n📦 Entrega a domicilio\n📍 ${order.address}\n🕐 ${order.delivery_time}`
        : order.delivery_type === 'postal'
        ? `\n✉️ Envio postal\n📍 ${order.address}${order.shipping_fee > 0 ? `\n📬 Envio: €${order.shipping_fee.toFixed(2)}` : '\n📬 Envio gratuito'}`
        : '\n🏪 Recogida en tienda';
    const text = `🛒 Nuevo pedido Bizum\n\n` +
        `📋 ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `📱 ${order.customer_phone}\n` +
        `\n${itemLines}\n` +
        `\n💶 Total: €${order.total.toFixed(2)}` +
        deliveryInfo +
        `\n\n⏳ Estado: Pendiente confirmacion`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    }).catch(err => console.error('Telegram notify failed:', err));
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { cart, customerName, customerPhone, deliveryType, address, deliveryTime, shippingFee, agentRef, paymentMethod, orderNumber: clientOrderNumber } = JSON.parse(event.body);
        if (!cart?.length || !customerName || !customerPhone) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

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
            ...(agentRef ? { agent_ref: agentRef } : {})
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
        decrementInventory(cart).catch(() => {});

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
