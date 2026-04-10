const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const STATUS_LABELS = {
    pending:   '⏳ 待付款',
    paid:      '✅ 已付款',
    shipped:   '🚚 已发货',
    delivered: '🎉 已完成'
};

const WA_TEMPLATES = {
    paid:      (name, order, total) => `Hola ${name}! Tu pedido ${order} ha sido confirmado. Total: €${total}. Gracias por tu compra! 🙏`,
    shipped:   (name, order)        => `Hola ${name}! Tu pedido ${order} ha sido enviado. Pronto lo recibirás. 📦`,
    delivered: (name, order)        => `Hola ${name}! ¿Cómo fue tu experiencia con tu pedido ${order}? Nos encantaría saber tu opinión. 😊`
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { customerName, customerPhone, orderNumber, status, total } = JSON.parse(event.body);
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { statusCode: 200, body: 'ok' };

        const statusLabel = STATUS_LABELS[status] || status;
        const phone = (customerPhone || '').replace(/\s+/g, '').replace(/^\+/, '');
        const template = WA_TEMPLATES[status];
        const waText = template ? encodeURIComponent(template(customerName, orderNumber, parseFloat(total).toFixed(2))) : '';
        const waLink = waText ? `https://wa.me/${phone}?text=${waText}` : `https://wa.me/${phone}`;

        const text = `🔔 订单状态更新\n\n` +
            `📋 ${orderNumber}\n` +
            `👤 ${customerName}\n` +
            `📱 ${customerPhone}\n` +
            `\n状态变更为：${statusLabel}\n` +
            `\n👇 点击发送 WhatsApp 消息：\n${waLink}`;

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
        });

        return { statusCode: 200, body: 'ok' };
    } catch (err) {
        console.error('notify-status error:', err);
        return { statusCode: 500, body: err.message };
    }
};
