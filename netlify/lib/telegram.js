const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const STATUS_LABELS = {
    stripe_pending: '💳 待刷卡',
    pending:   '⏳ 待付款',
    paid:      '✅ 已付款',
    shipped:   '🚚 已发货',
    delivered: '🎉 已完成',
    cancelled: '❌ 已取消'
};

const METHOD_LABELS = { bizum: 'Bizum', wechat: 'WeChat', alipay: 'Alipay', cash: 'Efectivo', card: 'Tarjeta' };

const WA_TEMPLATES = {
    paid:      (name, order, total) => `Hola ${name}! Tu pedido ${order} ha sido confirmado. Total: €${total}. Gracias por tu compra! 🙏`,
    shipped:   (name, order)        => `Hola ${name}! Tu pedido ${order} ha sido enviado. Pronto lo recibirás. 📦`,
    delivered: (name, order)        => `Hola ${name}! ¿Cómo fue tu experiencia con tu pedido ${order}? Nos encantaría saber tu opinión. 😊`
};

const money = (v) => (parseFloat(v) || 0).toFixed(2);

function madridTime(date) {
    return new Date(date || Date.now()).toLocaleString('zh-CN', { timeZone: 'Europe/Madrid' });
}

function formatDelivery(order) {
    const addressLines = String(order.address || '').split('\n').map(l => l.trim()).filter(Boolean);
    const address = addressLines.length ? addressLines.map(l => `   ${l}`).join('\n') : '   (sin dirección / 未填写)';
    if (order.delivery_type === 'delivery') {
        return `📦 Entrega a domicilio / 送货上门\n📍 Dirección / 地址:\n${address}` +
            (order.delivery_time ? `\n🕐 ${order.delivery_time}` : '');
    }
    if (order.delivery_type === 'postal') {
        const fee = parseFloat(order.shipping_fee) || 0;
        return `✉️ Envio postal / 邮寄\n📍 Dirección / 地址:\n${address}` +
            (fee > 0 ? `\n📬 Envio: €${money(fee)}` : '\n📬 Envio gratuito');
    }
    return '🏪 Recogida en tienda / 自取';
}

// Plain-text block with everything the owner needs to fulfil an order.
function formatOrderDetails(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemLines = items.length
        ? items.map(i => `  • ${i.name} x${i.quantity} — €${money((i.price || 0) * (i.quantity || 0))}`).join('\n')
        : '  (sin artículos)';
    const method = METHOD_LABELS[order.payment_method] || order.payment_method || '-';
    return `📋 ${order.order_number}\n` +
        `👤 ${order.customer_name || '-'}\n` +
        `📱 ${order.customer_phone || '-'}\n` +
        `\n${itemLines}\n` +
        `\n💶 Total: €${money(order.total)} (${method})\n` +
        `\n${formatDelivery(order)}` +
        (order.agent_ref ? `\n\n🤝 Agente: ${order.agent_ref}` : '');
}

function whatsappLink(order, status) {
    const phone = String(order.customer_phone || '').replace(/[^\d]/g, '');
    if (!phone) return '';
    const template = WA_TEMPLATES[status];
    const text = template ? `?text=${encodeURIComponent(template(order.customer_name, order.order_number, money(order.total)))}` : '';
    return `https://wa.me/${phone}${text}`;
}

async function sendTelegram(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
        });
        if (!res.ok) console.error('Telegram notify failed:', res.status, await res.text());
        return res.ok;
    } catch (err) {
        console.error('Telegram notify failed:', err);
        return false;
    }
}

module.exports = { STATUS_LABELS, METHOD_LABELS, madridTime, formatOrderDetails, whatsappLink, sendTelegram };
