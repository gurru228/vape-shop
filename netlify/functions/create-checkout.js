const { toStripeLineItems } = require('../../lib/pricing');
const {
    json,
    priceQuote,
    normalizeOrderNumber,
    insertOrder,
    buildOrderRecord,
} = require('../../lib/orders');

const BASE_URL = process.env.URL || 'https://tangerine-heliotrope-a2bd74.netlify.app';

function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not set');
    }
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    try {
        const body = JSON.parse(event.body || '{}');
        const { customerName, customerPhone, deliveryType, address, deliveryTime, agentRef, userId } = body;
        if (!customerName || !customerPhone) return json(400, { error: 'missing_customer' });

        const priced = priceQuote({ ...body, paymentMethod: 'card' });
        if (priced.error) return priced.error;
        const quote = priced.quote;

        const orderNumber = normalizeOrderNumber(body.orderNumber);
        const lineItems = toStripeLineItems(quote);
        const session = await getStripe().checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${BASE_URL}/checkout-success.html?order=${orderNumber}`,
            cancel_url: `${BASE_URL}/`,
            metadata: {
                order_number: orderNumber,
                customer_name: String(customerName).slice(0, 500),
                customer_phone: String(customerPhone).slice(0, 500),
                total_cents: String(quote.totalCents),
            },
        });

        const order = buildOrderRecord({
            quote,
            orderNumber,
            customerName,
            customerPhone,
            paymentMethod: 'card',
            paymentStatus: 'stripe_pending',
            address: address || '',
            deliveryTime: deliveryType === 'delivery' ? (deliveryTime || '') : (deliveryTime || ''),
            agentRef,
            userId,
            stripeSessionId: session.id,
        });
        await insertOrder(order).catch(err => console.error('Supabase save failed:', err));

        return json(200, { url: session.url, orderNumber, total: quote.total });
    } catch (err) {
        console.error('create-checkout error:', err);
        return json(500, { error: err.message });
    }
};
