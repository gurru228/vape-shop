const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WHATSAPP_PHONE,
    quoteCart,
    toStripeLineItems,
    stripeTotalCents,
} = require('../lib/pricing');

const DASH = '1-Jasmine LongJing Tea';
const ICEKING = '4-Grape Ice';
const RELX = '6-Coffee';

test('normal cart uses catalog price and ignores a tampered price', () => {
    const quote = quoteCart({
        items: [{ id: DASH, quantity: 2, price: 0.01, name: 'hacked' }],
    });
    assert.equal(quote.ok, true);
    assert.equal(quote.lines[0].unitPrice, 17.9);
    assert.equal(quote.lines[0].name.includes('龙井'), true);
    assert.equal(quote.subtotal, 35.8);
    assert.equal(quote.discountAmount, 0);
    assert.equal(quote.total, 35.8);
    assert.equal(quote.whatsappText.includes('0.01'), false);
    assert.equal(quote.whatsappText.includes('35.80'), true);
});

test('tier thresholds: below 90, at 90, and 180 is not stacked', () => {
    const below = quoteCart({ items: [{ id: DASH, quantity: 5 }] });
    assert.equal(below.subtotal, 89.5);
    assert.equal(below.discountAmount, 0);
    assert.equal(below.total, 89.5);
    assert.equal(below.nextTier.threshold, 90);
    assert.equal(below.nextTier.amount, 8);

    const tier90 = quoteCart({ items: [{ id: DASH, quantity: 6, price: 1 }] });
    assert.equal(tier90.subtotal, 107.4);
    assert.equal(tier90.discountAmount, 8);
    assert.equal(tier90.discounts.length, 1);
    assert.equal(tier90.total, 99.4);

    const tier180 = quoteCart({
        items: [{ id: ICEKING, quantity: 4, price: 0.5, discountPercent: 90 }],
        discountPercent: 90,
        discountCode: 'FREE',
    });
    assert.equal(tier180.subtotal, 180);
    assert.equal(tier180.discountAmount, 20);
    assert.equal(tier180.total, 160);
    assert.equal(tier180.whatsappText.includes('满€180减€20'), true);
    assert.equal(tier180.whatsappText.includes('160.00'), true);
});

test('unknown id and invalid quantity are rejected', () => {
    const unknown = quoteCart({ items: [{ id: '99-Nope', quantity: 1, price: 1 }] });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.error, 'unknown_item');

    const badFlavor = quoteCart({ items: [{ productId: 1, flavor: 'Not A Flavor', quantity: 1 }] });
    assert.equal(badFlavor.ok, false);
    assert.equal(badFlavor.error, 'unknown_item');

    for (const quantity of [0, -1, 1.5, 100, '2']) {
        const quote = quoteCart({ items: [{ id: RELX, quantity }] });
        assert.equal(quote.ok, false, `quantity ${quantity} should fail`);
        assert.equal(quote.error, 'invalid_quantity');
    }
});

test('postal shipping follows the discounted total and non-ES is quoted later', () => {
    const paid = quoteCart({
        items: [{ id: DASH, quantity: 1, price: 0 }],
        deliveryType: 'postal',
        country: 'ES',
    });
    assert.equal(paid.shippingFee, 9.99);
    assert.equal(paid.total, 27.89);

    const underFree = quoteCart({
        items: [{ id: DASH, quantity: 8 }],
        deliveryType: 'postal',
        country: 'es',
    });
    assert.equal(underFree.subtotal, 143.2);
    assert.equal(underFree.discountAmount, 8);
    assert.equal(underFree.shippingFee, 9.99);
    assert.equal(underFree.total, 145.19);

    const free = quoteCart({
        items: [{ id: ICEKING, quantity: 4 }],
        deliveryType: 'postal',
        country: 'ES',
    });
    assert.equal(free.shippingFee, 0);
    assert.equal(free.total, 160);

    const abroad = quoteCart({
        items: [{ id: RELX, quantity: 1, price: 100 }],
        deliveryType: 'postal',
        country: 'FR',
    });
    assert.equal(abroad.shippingQuoteRequired, true);
    assert.equal(abroad.shippingFee, 0);
    assert.equal(abroad.total, 14.9);
    assert.equal(abroad.whatsappText.includes('另询'), true);
});

test('whatsapp link uses the shop number and server totals', () => {
    const quote = quoteCart({
        items: [{ id: RELX, quantity: 1, price: 1 }],
        deliveryType: 'pickup',
        customerName: 'Ana',
        customerPhone: '+34 600 000 000',
    });
    assert.equal(WHATSAPP_PHONE, '34697332407');
    assert.equal(quote.whatsappUrl.startsWith('https://wa.me/34697332407?text='), true);
    const text = decodeURIComponent(quote.whatsappUrl.split('text=')[1]);
    assert.equal(text.includes('€14.90'), true);
    assert.equal(text.includes('Ana'), true);
    assert.equal(text.includes('+34 600 000 000'), true);
    assert.equal(text.includes('自取'), true);
    const timed = quoteCart({
        items: [{ id: DASH, quantity: 6 }],
        deliveryType: 'delivery',
        deliveryTime: '14:00 - 18:00',
        customerName: 'Ana',
    });
    assert.equal(timed.deliveryAllowed, true);
    assert.equal(timed.whatsappText.includes('14:00 - 18:00'), true);
    assert.equal(timed.whatsappText.includes('Ana'), true);
    assert.equal(text.includes('€1.00'), false);
});

test('stripe line items charge the server total, not the tampered price', () => {
    const quote = quoteCart({
        items: [
            { id: DASH, quantity: 6, price: 0.01 },
            { id: ICEKING, quantity: 1, price: 0.01 },
        ],
        deliveryType: 'postal',
        country: 'ES',
    });
    assert.equal(quote.subtotal, 152.4);
    assert.equal(quote.discountAmount, 8);
    assert.equal(quote.shippingFee, 9.99);
    assert.equal(quote.total, 154.39);
    const lineItems = toStripeLineItems(quote);
    assert.equal(stripeTotalCents(lineItems), quote.totalCents);
    assert.equal(lineItems.some(item => item.price_data.unit_amount === 1), false);
});
