const test = require('node:test');
const assert = require('node:assert/strict');

// Isolated fake services: these tests never create real orders or send messages.
process.env.SUPABASE_URL = 'https://orders.test';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = 'test-chat';
const { handler } = require('../netlify/functions/submit-order');
const payload = {
    items: [{ id: '1-Jasmine LongJing Tea', quantity: 6, price: 0.01 }],
    customerName: 'Checkout Test', customerPhone: '+34 600000000',
    deliveryType: 'pickup', orderNumber: 'ORD-1234567890123',
};
const event = body => ({ httpMethod: 'POST', body: JSON.stringify(body) });

test('checkout saves a pending order and notifies Telegram without a payment request', async t => {
    const calls = [];
    t.mock.method(global, 'fetch', async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 201, text: async () => '', json: async () => ({ ok: true }) };
    });
    const response = await handler(event(payload));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).saved, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://orders.test/rest/v1/orders');
    assert.equal(calls[0].body.total, 99.4);
    assert.equal(calls[0].body.payment_status, 'pending');
    assert.match(calls[1].url, /api.telegram.org/);
    assert.match(calls[1].body.text, /ORD-1234567890123/);
    assert.match(calls[1].body.text, /Total: €99.40/);
    assert.match(calls[1].body.text, /Checkout Test/);
});

test('failed order save does not send a notification or report saved', async t => {
    const calls = [];
    t.mock.method(console, 'error', () => {});
    t.mock.method(global, 'fetch', async url => {
        calls.push(url);
        return { ok: false, status: 503, text: async () => 'service unavailable' };
    });
    const response = await handler(event(payload));
    assert.equal(JSON.parse(response.body).saved, false);
    assert.equal(calls.length, 1);
});

test('checkout rejects missing contact details and invalid products before saving', async t => {
    t.mock.method(global, 'fetch', () => { throw new Error('Unexpected network call'); });
    for (const [body, error] of [
        [{ ...payload, customerPhone: '' }, 'missing_customer'],
        [{ ...payload, items: [{ id: 'unknown', quantity: 1 }] }, 'unknown_item'],
    ]) {
        const response = await handler(event(body));
        assert.equal(response.statusCode, 400);
        assert.equal(JSON.parse(response.body).error, error);
    }
});
