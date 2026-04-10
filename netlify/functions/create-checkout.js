const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE_URL = process.env.URL || 'https://tangerine-heliotrope-a2bd74.netlify.app';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(order) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const itemLines = order.items.map(i => `  • ${i.name} x${i.quantity} — €${(i.price * i.quantity).toFixed(2)}`).join('\n');
    const deliveryInfo = order.delivery_type === 'delivery'
        ? `\n📦 Entrega a domicilio\n📍 ${order.address}\n🕐 ${order.delivery_time}`
        : order.delivery_type === 'postal'
        ? `\n✉️ Envio postal\n📍 ${order.address}${order.shipping_fee > 0 ? `\n📬 Envio: €${order.shipping_fee.toFixed(2)}` : '\n📬 Envio gratuito'}`
        : '\n🏪 Recogida en tienda';
    const text = `💳 Nuevo pedido con tarjeta\n\n` +
        `📋 ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `📱 ${order.customer_phone}\n` +
        `\n${itemLines}\n` +
        `\n💶 Total: €${order.total.toFixed(2)}` +
        deliveryInfo +
        `\n\n⏳ Estado: Pendiente pago`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
    }).catch(err => console.error('Telegram notify failed:', err));
}

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
        const { cart, customerName, customerPhone, deliveryType, address, deliveryTime, shippingFee } = JSON.parse(event.body);
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
            payment_status: 'pending',
            stripe_session_id: session.id,
            delivery_type: deliveryType || 'pickup',
            address: address || '',
            delivery_time: deliveryTime || ''
        };
        await Promise.all([
            saveOrder(orderData).catch(err => console.error('Supabase save failed:', err)),
            sendTelegramNotification(orderData).catch(err => console.error('Telegram failed:', err))
        ]);

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
