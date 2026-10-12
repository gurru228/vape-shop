/**
 * 服务端唯一计价模块。浏览器只能提交商品/口味 id 和数量。
 *
 * 现行规则（与 script.js 展示逻辑一致，买五送一未启用）：
 * - 单价以 lib/catalog.json 为准（分），忽略客户端 price / name / isFree
 * - 满减只取最高一档，不叠加：满 €90 减 €8，满 €180 减 €20（按优惠前小计）
 * - 优惠码已暂停，discountCode / discountPercent 一律忽略
 * - 买五送一：前端会在读购物车时丢掉 isFree 赠品，当前没有自动赠送。不要按赠品把价格改成 0
 * - 运费只在西班牙本地邮寄时收取 €9.99；优惠后金额满 €150 免运费
 *   欧盟其他国家邮寄：结账不收运费，标记为另询
 * - 自取、马德里外送不收运费。外送少于 5 件由下单接口拒绝，报价仍返回金额
 */
const catalog = require('./catalog.json');
const { WHATSAPP_PHONE } = require('./contact');

const TIERED_DISCOUNTS = [
    { thresholdCents: 18000, amountCents: 2000, label: '满€180减€20', labelEs: 'Desde €180: -€20' },
    { thresholdCents: 9000, amountCents: 800, label: '满€90减€8', labelEs: 'Desde €90: -€8' },
];

const SHIPPING_FEE_CENTS = 999;
const FREE_SHIPPING_THRESHOLD_CENTS = 15000;
const MAX_QTY = 99;
const DELIVERY_TYPES = new Set(['pickup', 'delivery', 'postal']);
const DELIVERY_MIN_QTY = 5;

const DELIVERY_LABELS = {
    pickup: '自取 / Recogida en tienda (Metro El Capricho)',
    delivery: '外送 / Entrega a domicilio (Madrid)',
    postal: '邮寄 / Envío postal',
};

const byId = new Map(catalog.map(product => [product.id, product]));

function money(cents) {
    return cents / 100;
}

function roundMoney(cents) {
    return +money(cents).toFixed(2);
}

function fail(error, extra) {
    return { ok: false, error, ...extra };
}

function resolveLine(raw) {
    if (!raw || typeof raw !== 'object') return fail('invalid_item');

    let productId;
    let flavor;
    if (raw.productId != null && raw.flavor != null && String(raw.flavor).length) {
        productId = Number(raw.productId);
        flavor = String(raw.flavor);
    } else if (raw.id != null) {
        const id = String(raw.id);
        const dash = id.indexOf('-');
        if (dash <= 0) return fail('unknown_item', { id });
        productId = Number(id.slice(0, dash));
        flavor = id.slice(dash + 1);
    } else {
        return fail('unknown_item');
    }

    const product = byId.get(productId);
    const flavorRow = product && product.flavors.find(item => item.name === flavor);
    const id = `${productId}-${flavor}`;
    if (!product || !flavorRow) return fail('unknown_item', { id });

    const quantity = raw.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
        return fail('invalid_quantity', { id, quantity });
    }

    return {
        ok: true,
        id,
        productId,
        flavor: flavorRow.name,
        flavorNameCn: flavorRow.nameCn,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity,
    };
}

function appliedTier(subtotalCents) {
    return TIERED_DISCOUNTS.find(tier => subtotalCents >= tier.thresholdCents) || null;
}

function nextTier(subtotalCents) {
    const ascending = [...TIERED_DISCOUNTS].reverse();
    return ascending.find(tier => subtotalCents < tier.thresholdCents) || null;
}

function shippingFor(deliveryType, country, discountedCents) {
    if (deliveryType !== 'postal') {
        return { shippingFeeCents: 0, shippingQuoteRequired: false };
    }
    if (country !== 'ES') {
        return { shippingFeeCents: 0, shippingQuoteRequired: true };
    }
    if (discountedCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
        return { shippingFeeCents: 0, shippingQuoteRequired: false };
    }
    return { shippingFeeCents: SHIPPING_FEE_CENTS, shippingQuoteRequired: false };
}

function quoteCart(input) {
    const body = input || {};
    const rawItems = Array.isArray(body.items) ? body.items : Array.isArray(body.cart) ? body.cart : null;
    if (!rawItems || rawItems.length === 0) return fail('empty_cart');

    const deliveryType = body.deliveryType || 'pickup';
    if (!DELIVERY_TYPES.has(deliveryType)) return fail('invalid_delivery', { deliveryType });

    const country = String(body.country || 'ES').trim().toUpperCase() || 'ES';
    const merged = new Map();

    for (const raw of rawItems) {
        const line = resolveLine(raw);
        if (!line.ok) return line;
        const prev = merged.get(line.id);
        if (prev) {
            const quantity = prev.quantity + line.quantity;
            if (quantity > MAX_QTY) return fail('invalid_quantity', { id: line.id, quantity });
            prev.quantity = quantity;
        } else {
            merged.set(line.id, line);
        }
    }

    const lines = [...merged.values()].map(line => {
        const lineTotalCents = line.unitPriceCents * line.quantity;
        return {
            id: line.id,
            productId: line.productId,
            flavor: line.flavor,
            flavorNameCn: line.flavorNameCn,
            productName: line.productName,
            name: `${line.productName} - ${line.flavorNameCn} / ${line.flavor}`,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            lineTotalCents,
            unitPrice: roundMoney(line.unitPriceCents),
            lineTotal: roundMoney(lineTotalCents),
        };
    });

    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const tier = appliedTier(subtotalCents);
    const discountCents = tier ? tier.amountCents : 0;
    const discountedCents = Math.max(0, subtotalCents - discountCents);
    const shipping = shippingFor(deliveryType, country, discountedCents);
    const totalCents = discountedCents + shipping.shippingFeeCents;
    const upcoming = nextTier(subtotalCents);
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);

    const quote = {
        ok: true,
        lines,
        currency: 'EUR',
        subtotalCents,
        discountCents,
        shippingFeeCents: shipping.shippingFeeCents,
        totalCents,
        subtotal: roundMoney(subtotalCents),
        discountAmount: roundMoney(discountCents),
        discounts: tier ? [{
            type: 'tiered',
            label: tier.label,
            labelEs: tier.labelEs,
            amount: roundMoney(tier.amountCents),
        }] : [],
        shippingFee: roundMoney(shipping.shippingFeeCents),
        shippingQuoteRequired: shipping.shippingQuoteRequired,
        total: roundMoney(totalCents),
        deliveryType,
        deliveryLabel: DELIVERY_LABELS[deliveryType],
        country,
        quantity,
        deliveryMinimum: DELIVERY_MIN_QTY,
        deliveryAllowed: deliveryType !== 'delivery' || quantity >= DELIVERY_MIN_QTY,
        appliedDiscount: tier ? {
            label: tier.label,
            labelEs: tier.labelEs,
            amount: roundMoney(tier.amountCents),
        } : null,
        nextTier: upcoming ? {
            threshold: roundMoney(upcoming.thresholdCents),
            amount: roundMoney(upcoming.amountCents),
            remaining: roundMoney(upcoming.thresholdCents - subtotalCents),
        } : null,
    };

    const text = buildWhatsAppMessage(quote, {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        address: body.address,
        deliveryTime: body.deliveryTime,
        orderNumber: body.orderNumber,
    });
    quote.whatsappText = text;
    quote.whatsappUrl = whatsappUrl(text);
    return quote;
}

function buildWhatsAppMessage(quote, meta) {
    const info = meta || {};
    const itemLines = quote.lines.map(line => (
        `• ${line.productName}\n  ${line.flavorNameCn} / ${line.flavor}\n  x${line.quantity} × €${line.unitPrice.toFixed(2)} = €${line.lineTotal.toFixed(2)}`
    )).join('\n');

    const discountLine = quote.discountAmount > 0
        ? quote.discounts.map(item => `${item.label} / ${item.labelEs}`).join('\n')
        : '优惠 / Descuento: 无 / Ninguno';

    let shippingLine;
    if (quote.shippingQuoteRequired) {
        shippingLine = '运费 / Envío: 另询 / A confirmar por WhatsApp';
    } else if (quote.deliveryType === 'postal' && quote.shippingFee === 0) {
        shippingLine = '运费 / Envío: 免运费 / Gratis';
    } else if (quote.shippingFee > 0) {
        shippingLine = `运费 / Envío: €${quote.shippingFee.toFixed(2)}`;
    } else {
        shippingLine = '运费 / Envío: €0.00';
    }

    const name = String(info.customerName || '').trim();
    const phone = String(info.customerPhone || '').trim();
    const address = String(info.address || '').trim();
    const parts = [
        '【口粮专卖店 / Pedido por WhatsApp】',
    ];
    if (info.orderNumber) parts.push(`订单号 / Pedido: ${info.orderNumber}`);
    parts.push(
        '',
        itemLines,
        '',
        `小计 / Subtotal: €${quote.subtotal.toFixed(2)}`,
        discountLine,
        shippingLine,
        `合计 / Total: €${quote.total.toFixed(2)}`,
        '',
        `配送 / Entrega: ${quote.deliveryLabel}`,
    );
    if (info.deliveryTime) parts.push(`时间 / Horario: ${info.deliveryTime}`);
    if (address) parts.push(`地址 / Dirección:\n${address}`);
    parts.push(`姓名 / Nombre: ${name || '（未填写 / Sin indicar）'}`);
    parts.push(`电话 / Teléfono: ${phone || '（未填写 / Sin indicar）'}`);
    return parts.join('\n');
}

function whatsappUrl(text) {
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}

function storedItems(quote) {
    return quote.lines.map(line => ({
        id: line.id,
        name: line.name,
        price: line.unitPrice,
        quantity: line.quantity,
        productId: line.productId,
        flavor: line.flavor,
    }));
}

module.exports = {
    WHATSAPP_PHONE,
    TIERED_DISCOUNTS,
    SHIPPING_FEE_CENTS,
    FREE_SHIPPING_THRESHOLD_CENTS,
    DELIVERY_MIN_QTY,
    DELIVERY_LABELS,
    catalog,
    quoteCart,
    buildWhatsAppMessage,
    whatsappUrl,
    storedItems,
};
