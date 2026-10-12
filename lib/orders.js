const {
    quoteCart,
    storedItems,
} = require('./pricing');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// 网站不收款：订单只登记下来，由卖家联系客户确认。旧订单里的 bizum / card 等记录只在后台展示。
const ORDER_CHANNEL = 'whatsapp';

function json(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(body),
    };
}

function priceQuote(body, { placingOrder = false } = {}) {
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

    if (!quote.deliveryAllowed && placingOrder) {
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

function buildOrderRecord({ quote, orderNumber, customerName, customerPhone, address, deliveryTime, agentRef, userId, source }) {
    return {
        order_number: orderNumber,
        customer_name: String(customerName || '').trim(),
        customer_phone: String(customerPhone || '').trim(),
        items: storedItems(quote),
        total: quote.total,
        shipping_fee: quote.shippingFee,
        payment_method: ORDER_CHANNEL,
        payment_status: 'pending',
        delivery_type: quote.deliveryType,
        address: address || '',
        delivery_time: deliveryTime || '',
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

module.exports = {
    ORDER_CHANNEL,
    json,
    priceQuote,
    normalizeOrderNumber,
    insertOrder,
    buildOrderRecord,
    telegramText,
    sendTelegram,
};
