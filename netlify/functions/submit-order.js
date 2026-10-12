const {
    json,
    priceQuote,
    normalizeOrderNumber,
    insertOrder,
    buildOrderRecord,
    telegramText,
    sendTelegram,
    ORDER_CHANNEL,
} = require('../../lib/orders');

// 下单登记：网站不收款，订单保存后通过 Telegram 通知卖家，由卖家联系客户确认。
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    try {
        const body = JSON.parse(event.body || '{}');
        const customerName = String(body.customerName || '').trim();
        const customerPhone = String(body.customerPhone || '').trim();
        if (!customerName || !customerPhone) {
            return json(400, { error: 'missing_customer' });
        }

        const priced = priceQuote(body, { placingOrder: true });
        if (priced.error) return priced.error;
        const quote = priced.quote;
        const orderNumber = normalizeOrderNumber(body.orderNumber);

        const order = buildOrderRecord({
            quote,
            orderNumber,
            customerName,
            customerPhone,
            address: body.address || '',
            deliveryTime: body.deliveryTime || '',
            agentRef: body.agentRef,
            userId: body.userId,
            source: ORDER_CHANNEL,
        });

        const saved = await insertOrder(order);
        if (!saved.ok) {
            console.error('Supabase save failed:', saved.text);
            return json(200, {
                orderNumber,
                total: quote.total,
                saved: false,
                supabase_error: saved.text,
                supabase_status: saved.status,
            });
        }

        const heading = '📋 Nuevo pedido / 新订单';
        const statusLine = '\n\nEstado: Pendiente de confirmación / 待卖家确认';
        await sendTelegram(telegramText(order, heading) + statusLine);

        return json(200, { orderNumber, total: quote.total, saved: true });
    } catch (err) {
        console.error('submit-order error:', err);
        return json(500, { error: err.message });
    }
};
