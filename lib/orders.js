const {
    quoteCart,
    buildWhatsAppMessage,
    whatsappUrl,
    storedItems,
} = require('./pricing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const PAYMENT_METHODS = new Set(['bizum', 'wechat', 'alipay', 'cash', 'card', 'whatsapp']);

function json(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(body),
    };
}

function priceQuote(body) {
    const payload = body || {};
    const quote = quoteCart({
        items: payload.items || payload.cart,
        deliveryType: payload.deliveryType,
        country: payload.country,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        address: payload.address,
        orderNumber: payload.orderNumber,
    });
    if (!quote.ok) return { error: json(400, { error: quote.error, id: quote.id, quantity: quote.quantity }) };

    if (payload.paymentMethod === 'cash' && quote.deliveryType === 'postal') {
        return { error: json(400, { error: 'cash_postal_unavailable' }) };
    }
    if (!quote.deliveryAllowed && payload.paymentMethod) {
        return { error: json(400, { error: 'delivery_minimum', minimum: quote.deliveryMinimum }) };
    }
    return { quote };
}

function normalizeOrderNumber(value) {
    if (typeof value === 'string' && /^ORD-\d{10,16}$/.test(value)) return value;
    return `ORD-${Date.now()}`;
}

async function insertOrder(order) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return { ok: false, status: 0, text: 'Supabase is not configured' };
    }
    const attempt = async (payload) => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
    };

    let result = await attempt(order);
    if (!result.ok && order.source && /source/i.test(result.text) && /column|schema cache|PGRST204/i.test(result.text)) {
        const { source, ...rest } = order;
        result = await attempt(rest);
        result.strippedSource = true;
    }
    return result;
}

function buildOrderRecord({ quote, orderNumber, customerName, customerPhone, paymentMethod, paymentStatus, address, deliveryTime, agentRef, userId, stripeSessionId, source }) {
    const name = String(customerName || '').trim();
    const phone = String(customerPhone || '').trim();
    return {
        order_number: orderNumber,
        customer_name: name || (paymentMethod === 'whatsapp' ? 'WhatsApp' : ''),
        customer_phone: phone || (paymentMethod === 'whatsapp' ? '—' : ''),
        items: storedItems(quote),
        total: quote.total,
        shipping_fee: quote.shippingFee,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        delivery_type: quote.deliveryType,
        address: address || '',
        delivery_time: deliveryTime || '',
        ...(stripeSessionId ? { stripe_session_id: stripeSessionId } : {}),
        ...(agentRef ? { agent_ref: agentRef } : {}),
        ...(userId ? { user_id: userId } : {}),
        ...(source ? { source } : {}),
    };
}

function telegramText(order, heading) {
    const subtotal = (order.items || []).reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const discount = +(subtotal + Number(order.shipping_fee || 0) - Number(order.total)).toFixed(2);
    const itemLines = (order.items || []).map(item => `  • ${item.name} x${item.quantity} — €${(item.price * item.quantity).toFixed(2)}`).join('\n');
    const deliveryInfo = order.delivery_type === 'delivery'
        ? `\n📦 Entrega a domicilio\n📍 ${order.address}\n🕐 ${order.delivery_time}`
        : order.delivery_type === 'postal'
            ? `\n✉️ Envio postal\n📍 ${order.address}${order.shipping_fee > 0 ? `\n📬 Envio: €${Number(order.shipping_fee).toFixed(2)}` : '\n📬 Envio gratuito'}`
            : '\n🏪 Recogida en tienda';
    const discountLine = discount > 0.001 ? `\n🏷 Descuento: -€${discount.toFixed(2)}` : '';
    return `${heading}\n\n` +
        `📋 ${order.order_number}\n` +
        `👤 ${order.customer_name}\n` +
        `📱 ${order.customer_phone}\n` +
        `\n${itemLines}\n` +
        discountLine +
        `\n💶 Total: €${Number(order.total).toFixed(2)}` +
        deliveryInfo;
}

async function sendTelegram(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    }).catch(err => console.error('Telegram notify failed:', err));
}

function whatsappLink(quote, meta) {
    return whatsappUrl(buildWhatsAppMessage(quote, meta));
}

module.exports = {
    PAYMENT_METHODS,
    json,
    priceQuote,
    normalizeOrderNumber,
    insertOrder,
    buildOrderRecord,
    telegramText,
    sendTelegram,
    whatsappLink,
};
