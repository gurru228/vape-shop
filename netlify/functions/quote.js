const { quoteCart } = require('../../lib/pricing');
const { json } = require('../../lib/orders');

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'invalid_json' });
    }

    const quote = quoteCart(body);
    if (!quote.ok) return json(400, { error: quote.error, id: quote.id, quantity: quote.quantity });
    return json(200, quote);
};
