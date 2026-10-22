// Server rules a script could try to bend: one full card = one gift (no "01" / "1.0" duplicate keys),
// a stale session is refused instead of becoming a guest order, a cancelled member order can't be revived,
// sold-out gifts are refused, account deletion detaches its orders.
const url = process.env.QA_URL || 'http://localhost:8899/';
const post = async (path, body, token, method = 'POST') => { const r = await fetch(url + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const admin = (path, body) => post(path, { password: 'admin-test', ...body });
const form = { name: 'A', phone: '612340001' };
const reg = await post('api/register', { account: 'abuse@example.com', name: 'Ab', password: 'secret1', adult: true });
await admin('api/admin/stamp', { id: 'abuse@example.com', pid: 1, n: 10 });
const out = [];
const dup = await post('api/order', { items: [], form, gifts: { 1: 'Lemon Tea', '01': 'Green Grape', '1.0': 'Kiwi Ice', ' 1': 'Lime Ice' } }, reg.token);
out.push(['duplicate gift keys refused', dup.status === 400, dup.error]);
const two = await post('api/order', { items: [], form, gifts: { 1: 'Lemon Tea', 3: 'Mango' } }, reg.token);
out.push(['gift on a card that is not full refused', two.status === 400, two.error]);
const ok = await post('api/order', { items: [], form, gifts: { 1: 'Lemon Tea' } }, reg.token);
out.push(['one gift ok, total 0', ok.no && ok.total === 0, ok.no + ' ' + ok.total]);
const again = await post('api/order', { items: [], form, gifts: { 1: 'Lemon Tea' } }, reg.token);
out.push(['second gift on the spent card refused', again.status === 400, again.error]);
const stale = await post('api/order', { items: [{ pid: 1, flavor: 'Lemon Tea', qty: 1 }], form }, 'f'.repeat(64));
out.push(['stale session → 401, not a guest order', stale.status === 401, stale.error]);
// cancel the gift order (10 stamps back), then try to bring it back
const orders = await (await fetch(url + '.netlify/functions/get-orders?password=admin-test&status=all')).json();
const row = orders.find(o => o.order_number === ok.no);
await admin('api/admin/status', { orderId: row.id, status: 'cancelled' });
const back = await admin('api/admin/status', { orderId: row.id, status: 'paid' });
const me = await (await fetch(url + 'api/me', { headers: { authorization: 'Bearer ' + reg.token } })).json();
out.push(['cancelled member order cannot come back', back.status === 409 && me.user.stamps['1'] === 10, back.error + ' | stamps ' + JSON.stringify(me.user.stamps)]);
// account deletion detaches its orders
await post('api/me', {}, reg.token, 'DELETE');
const after = (await (await fetch(url + '.netlify/functions/get-orders?password=admin-test&status=all')).json()).find(o => o.order_number === ok.no);
out.push(['deleted account: order kept, detached', after && after.member_id === null, String(after?.member_id)]);
for (const [k, pass, info] of out) console.log(pass ? 'ok  ' : 'FAIL', k, '|', info);
console.log('errors:', out.some(x => !x[1]) ? out.filter(x => !x[1]).map(x => x[0]) : 'none');
