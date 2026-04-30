const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// 表示"库存已扣减"的状态
const CONSUMING = new Set(['paid', 'shipped', 'delivered']);
const isConsuming = (s) => CONSUMING.has(s);

async function rpcStock(rpc, items) {
    for (const item of (items || [])) {
        if (item.isFree) continue;
        const parts = String(item.id).split('-');
        const productId = parseInt(parts[0]);
        const flavorName = parts.length > 1 ? parts.slice(1).join('-') : 'default';
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({ p_product_id: productId, p_flavor_name: flavorName, p_qty: item.quantity })
        }).catch(err => console.error(`${rpc} failed:`, err));
    }
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

    if (order) {
        const wasConsuming = isConsuming(order.payment_status);
        const willConsume  = isConsuming(status);
        if (!wasConsuming && willConsume) {
            await decrementInventory(order.items);   // 首次确认付款 -> 扣库存
        } else if (wasConsuming && !willConsume) {
            await restoreInventory(order.items);     // 撤销已确认 -> 回库
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

    return { statusCode: res.ok ? 200 : 500, body: JSON.stringify({ success: res.ok }) };
};
