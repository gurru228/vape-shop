const {
    json,
    priceQuote,
    normalizeOrderNumber,
    insertOrder,
    buildOrderRecord,
    telegramText,
    sendTelegram,
    whatsappLink,
    PAYMENT_METHODS,
} = require('../../lib/orders');

const METHOD_LABEL = {
    bizum: 'Bizum',
    wechat: 'WeChat',
    alipay: 'Alipay',
    cash: 'Efectivo',
    whatsapp: 'WhatsApp',
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    try {
        const body = JSON.parse(event.body || '{}');
        const paymentMethod = body.paymentMethod || 'bizum';
        if (!PAYMENT_METHODS.has(paymentMethod) || paymentMethod === 'card') {
            return json(400, { error: 'invalid_payment_method' });
        }

        const isWhatsapp = paymentMethod === 'whatsapp';
        const customerName = String(body.customerName || '').trim();
        const customerPhone = String(body.customerPhone || '').trim();
        if (!isWhatsapp && (!customerName || !customerPhone)) {
            return json(400, { error: 'missing_customer' });
        }

        const priced = priceQuote({ ...body, paymentMethod });
        if (priced.error) return priced.error;
        const quote = priced.quote;
        const orderNumber = normalizeOrderNumber(body.orderNumber);
        const link = isWhatsapp ? whatsappLink(quote, {
            customerName,
            customerPhone,
            address: body.address,
            deliveryTime: body.deliveryTime,
            orderNumber,
        }) : undefined;

        const order = buildOrderRecord({
            quote,
            orderNumber,
            customerName,
            customerPhone,
            paymentMethod,
            paymentStatus: 'pending',
            address: body.address || '',
            deliveryTime: body.deliveryTime || '',
            agentRef: body.agentRef,
            userId: body.userId,
            source: isWhatsapp ? 'whatsapp' : undefined,
        });

        const saved = await insertOrder(order);
        if (!saved.ok) {
            console.error('Supabase save failed:', saved.text);
            return json(200, {
                orderNumber,
                total: quote.total,
                whatsappUrl: link,
                saved: false,
                supabase_error: saved.text,
                supabase_status: saved.status,
            });
        }

        const heading = isWhatsapp
            ? '💬 Nuevo pedido WhatsApp'
            : `🛒 Nuevo pedido ${METHOD_LABEL[paymentMethod] || paymentMethod}`;
        const statusLine = isWhatsapp
            ? '\n\n💬 Estado: Pendiente por WhatsApp'
            : '\n\n⏳ Estado: Pendiente confirmacion';
        await sendTelegram(telegramText(order, heading) + statusLine);

        return json(200, { orderNumber, total: quote.total, whatsappUrl: link, saved: true });
    } catch (err) {
        console.error('save-bizum-order error:', err);
        return json(500, { error: err.message });
    }
};
