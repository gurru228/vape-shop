const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 表示"库存已扣减"的状态
const CONSUMING = new Set(['paid', 'shipped', 'delivered']);
const isConsuming = (s) => CONSUMING.has(s);

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

async function rpcStock(rpc, items) {
    const log = [];
    for (const item of (items || [])) {
        const { productId, flavorName } = parseItemKey(item);
        if (Number.isNaN(productId)) {
            log.push({ item: item.id, ok: false, error: 'invalid productId' });
            continue;
        }
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({ p_product_id: productId, p_flavor_name: flavorName, p_qty: item.quantity })
            });
            const body = await res.text();
            log.push({ item: item.id, productId, flavorName, qty: item.quantity, status: res.status, ok: res.ok, body });
            if (!res.ok) console.error(`${rpc} failed`, productId, flavorName, res.status, body);
        } catch (err) {
            log.push({ item: item.id, ok: false, error: String(err) });
            console.error(`${rpc} threw:`, err);
        }
    }
    return log;
}

const decrementInventory = (items) => rpcStock('decrement_stock', items);
const restoreInventory   = (items) => rpcStock('increment_stock', items);

exports.handler = async (event) => {
    if (event.httpMethod !== 'PATCH') return { statusCode: 405, body: 'Method Not Allowed' };

    const { password, orderId, status } = JSON.parse(event.body);

    if (password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // 读取当前状态决定库存动作
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=payment_status,items`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const orders = await orderRes.json();
    const order = orders[0];

    let inventoryLog = null;
    let action = 'none';
    if (order) {
        const wasConsuming = isConsuming(order.payment_status);
        const willConsume  = isConsuming(status);
        if (!wasConsuming && willConsume) {
            action = 'decrement';
            inventoryLog = await decrementInventory(order.items);
        } else if (wasConsuming && !willConsume) {
            action = 'restore';
            inventoryLog = await restoreInventory(order.items);
        }
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ payment_status: status })
    });

    return {
        statusCode: res.ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            success: res.ok,
            oldStatus: order ? order.payment_status : null,
            newStatus: status,
            itemCount: order && Array.isArray(order.items) ? order.items.length : 0,
            inventoryAction: action,
            inventoryLog
        })
    };
};
