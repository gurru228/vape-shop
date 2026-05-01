const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 解析 cart item 的 productId 和 flavorName。
// 普通商品 id：{productId}-{flavorName}
// 赠品 id：FREE-{productId}-{flavorName}-{timestamp}
function parseItemKey(item) {
    const idStr = String(item.id);
    if (item.isFree && idStr.startsWith('FREE-')) {
        const parts = idStr.split('-');
        return {
            productId: parseInt(parts[1]),
            flavorName: parts.length > 3 ? parts.slice(2, -1).join('-') : 'default'
        };
    }
    const parts = idStr.split('-');
    return {
        productId: parseInt(parts[0]),
        flavorName: parts.length > 1 ? parts.slice(1).join('-') : 'default'
    };
}

async function restoreInventory(items) {
    for (const item of (items || [])) {
        const { productId, flavorName } = parseItemKey(item);
        if (Number.isNaN(productId)) continue;
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({ p_product_id: productId, p_flavor_name: flavorName, p_qty: item.quantity })
        }).catch(err => console.error('Inventory restore failed:', err));
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'DELETE') return { statusCode: 405, body: 'Method Not Allowed' };

    const { password, orderId } = JSON.parse(event.body);

    if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // 仅当订单当前处于"已扣库存"状态（paid/shipped/delivered）才回库；
    // pending/cancelled 状态从未扣库存，删除时不需回库。
    const CONSUMING = new Set(['paid', 'shipped', 'delivered']);
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=payment_status,items`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const orders = await orderRes.json();
    const order = orders[0];
    if (order && CONSUMING.has(order.payment_status)) {
        await restoreInventory(order.items);
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        }
    });

    return { statusCode: res.ok ? 200 : 500, body: JSON.stringify({ success: res.ok }) };
};
