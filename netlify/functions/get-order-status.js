const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const { order_number } = event.queryStringParameters || {};
    if (!order_number) return { statusCode: 400, body: 'Missing order_number' };

    const { data, error } = await supabase
        .from('orders')
        .select('order_number, payment_status, created_at')
        .eq('order_number', order_number)
        .single();

    if (error || !data) return { statusCode: 404, body: JSON.stringify({ error: '订单不存在' }) };

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            order_number: data.order_number,
            status: data.payment_status,
            created_at: data.created_at
        })
    };
};
