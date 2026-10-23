// Repeat-purchase analysis (site/src/retention.js) on hand-made orders, plus the made-up data used by admin-lab.html.
// Plain node, no database:  node qa/retention.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rtAnalyze, rtPhone } = require('../site/src/retention.js');
const { rtDemo } = require('../site/src/retention-demo.js');
const products = require('../site/src/products.json');

const DAY = 864e5, T0 = Date.parse('2026-06-01T12:00:00Z');
const at = d => new Date(T0 + d * DAY).toISOString();
let seq = 0;
const row = (o = {}) => ({
  id: 'o' + ++seq, order_number: 'T-' + seq, customer_name: o.name || '顾客', customer_phone: o.phone ?? '+34 611 000 001',
  items: o.items || [{ id: '1-Lemon Tea', productId: 1, flavor: 'Lemon Tea', price: 17.9, quantity: o.qty || 2 }],
  total: o.total ?? 17.9 * (o.qty || 2), shipping_fee: o.ship || 0, payment_method: o.pm || 'whatsapp', payment_status: o.status || 'delivered',
  created_at: at(o.day || 0), delivery_type: o.mode || 'pickup', agent_ref: o.agent || null, member_id: o.member || null,
  coupon: o.coupon || null, form: o.form === null ? null : { name: o.name || '顾客', ...(o.leak ? { ackLeak: true } : {}) }, user_id: o.user || null,
});
const run = (orders, members = [], day = 0, opts = {}) => rtAnalyze(orders, members, { now: T0 + day * DAY, ...opts });
const find = (r, name) => r.customers.find(c => c.name === name);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('phone numbers written differently are one person', () => {
  assert.equal(rtPhone('+34 611 222 333'), '34611222333');
  assert.equal(rtPhone('611222333'), '34611222333');
  assert.equal(rtPhone('0034 611-222-333'), '34611222333');
  const r = run([row({ name: 'A', phone: '+34 611 222 333', form: null, pm: 'bizum' }), row({ name: 'A', phone: '611222333', day: 30 }), row({ name: 'A', phone: '0034611222333', day: 60 })], [], 70);
  assert.equal(r.customers.length, 1);
  assert.equal(r.customers[0].nBuys, 3);
});

test('a guest order before registering joins the member', () => {
  const r = run([row({ name: '小林', phone: '612000555' }), row({ name: '小林', phone: '+34 612 000 555', member: '34612000555', day: 30 })],
    [{ id: '34612000555', name: '小林', phone: '34612000555', created: T0 + 20 * DAY }], 40);
  assert.equal(r.customers.length, 1);
  const c = r.customers[0];
  assert.equal(c.member, true); assert.equal(c.nBuys, 2); assert.equal(c.key, 'm:34612000555');
});

test('old-site account id links orders without a matching phone', () => {
  const r = run([row({ name: 'Old', phone: '+34 633 444 555', user: 'uid-1', form: null, pm: 'bizum' }), row({ name: 'Old', phone: '+34 699 999 999', member: 'old@example.com', day: 25 })],
    [{ id: 'old@example.com', name: 'Old', phone: null, authUid: 'uid-1' }], 30);
  assert.equal(r.customers.length, 1);
});

test('cancelled, pending, stripe_pending and gift-only orders are not purchases', () => {
  const r = run([
    row({ name: 'B' }), row({ name: 'B', day: 10, status: 'cancelled' }), row({ name: 'B', day: 11, status: 'pending' }), row({ name: 'B', day: 12, status: 'stripe_pending' }),
    row({ name: 'B', day: 13, total: 0, items: [{ id: 'FREE-1-Lemon Tea-1', productId: 1, flavor: 'Lemon Tea', price: 0, quantity: 1, isFree: true }] }),
  ], [], 14);
  const c = r.customers[0];
  assert.equal(c.nBuys, 1); assert.equal(c.cancelled, 1); assert.equal(c.giftOrders, 1); assert.equal(c.gifts, 1);
  assert.equal(c.orders.length, 4); // stripe_pending dropped entirely
  assert.equal(c.units, 2);
});

test('orders within 24 hours are one purchase', () => {
  const r = run([row({ name: 'C' }), row({ name: 'C', day: 0.2, qty: 1 }), row({ name: 'C', day: 40 })], [], 41);
  const c = r.customers[0];
  assert.equal(c.nOrders, 3); assert.equal(c.nBuys, 2); assert.equal(c.occ[0].units, 3);
});

test('run-out date and status follow the customer\'s own pace', () => {
  // 2 Dash = 8000 puffs, back after 40 days → 200 puffs a day; the second 8000 should last 40 days → day 80
  const orders = [row({ name: 'D' }), row({ name: 'D', day: 40 })];
  const at70 = find(run(orders, [], 70), 'D');
  assert.equal(Math.round(at70.personalRate), 200); assert.equal(at70.rateFrom, 'own');
  assert.equal(Math.round(at70.expectDays), 40); assert.equal(Math.round((at70.runOutAt - T0) / DAY), 80);
  assert.equal(at70.status, 'ok');
  assert.equal(find(run(orders, [], 78), 'D').status, 'near');
  assert.equal(find(run(orders, [], 90), 'D').status, 'overdue');
  assert.equal(find(run(orders, [], 125), 'D').status, 'lost');   // 85 days silent, past 2× the 40 expected
  assert.equal(find(run(orders, [], 101), 'D').status, 'lost');   // 61 days silent > lostDays, and overdue
});

test('one-time buyers use the shop rate: default until 3 repeat customers, then measured', () => {
  const few = run([row({ name: 'E' }), row({ name: 'E', day: 20 }), row({ name: 'F', phone: '611000002' })], [], 1);
  assert.equal(few.shopRateFrom, 'default'); assert.equal(few.shopRate, 250);
  assert.equal(find(few, 'F').rateFrom, 'shop'); assert.equal(Math.round(find(few, 'F').expectDays), 32); // 8000 / 250
  const orders = [];
  ['G', 'H', 'I'].forEach((n, k) => { const phone = '61100001' + k; orders.push(row({ name: n, phone }), row({ name: n, phone, day: [20, 40, 80][k] })); });
  orders.push(row({ name: 'J', phone: '611000099' }));
  const many = run(orders, [], 1);
  assert.equal(many.shopRateFrom, 'measured'); assert.equal(Math.round(many.shopRate), 200); // median of 400, 200, 100
  assert.equal(Math.round(find(many, 'J').expectDays), 40);
});

test('reasons for one-time buyers who should be back by now', () => {
  const r = run([
    row({ name: 'leak', phone: '611000101', leak: true, items: [{ id: '2-Fresh Lemon', productId: 2, flavor: 'Fresh Lemon', price: 15.9, quantity: 1 }], total: 15.9 }),
    row({ name: 'post', phone: '611000102', mode: 'postal', ship: 6, member: 'm102' }),
    row({ name: 'old', phone: '611000103', form: null, pm: 'bizum' }),
    row({ name: 'agent', phone: '611000104', agent: 'ana', member: 'm104' }),
    row({ name: 'out', phone: '611000105', member: 'm105', items: [{ id: '1-Mineral Water', productId: 1, flavor: 'Mineral Water', price: 17.9, quantity: 2 }] }),
    row({ name: 'bad', phone: '611000106', member: 'm106' }), row({ name: 'bad', phone: '611000106', member: 'm106', day: 1, status: 'cancelled' }),
    row({ name: 'trial', phone: '611000107', qty: 1 }),
    row({ name: 'king', phone: '611000108', member: 'm108', coupon: 'AMIGO5', items: [{ id: '4-Green Tea', productId: 4, flavor: 'Green Tea', price: 30, quantity: 1 }], total: 30 }),
    row({ name: 'fresh', phone: '611000109', day: 95 }),
  ], [['m102', 'post'], ['m104', 'agent'], ['m105', 'out'], ['m106', 'bad'], ['m108', 'king']].map(([id, name]) => ({ id, name })), 100, { soldOut: ['1-Mineral Water'] });
  const main = n => find(r, n).reasons[0];
  assert.equal(main('leak'), 'leak'); assert.ok(find(r, 'leak').reasons.includes('deal') && find(r, 'leak').reasons.includes('guest'));
  assert.equal(main('post'), 'delivery');
  assert.equal(main('old'), 'oldSite');
  assert.equal(main('agent'), 'agent');
  assert.equal(main('out'), 'soldOut');
  assert.equal(main('bad'), 'bad');
  assert.equal(main('trial'), 'guest'); assert.ok(find(r, 'trial').reasons.includes('trial'));
  assert.equal(find(r, 'king').status, 'ok'); assert.equal(main('king'), 'notDue'); // 40000 puffs last ~160 days
  assert.ok(find(r, 'king').reasons.includes('deal') && find(r, 'king').reasons.includes('price'));
  assert.equal(main('fresh'), 'notDue');
  assert.ok(r.lists.notDue.some(c => c.name === 'fresh')); assert.ok(!r.lists.due.some(c => c.name === 'fresh'));
  assert.equal(r.reasons.primary.leak.n, 1);
});

test('never-paid customers are listed separately', () => {
  const r = run([row({ name: 'K', status: 'cancelled' }), row({ name: 'L', phone: '611000201', status: 'pending' })], [], 10);
  assert.equal(r.lists.never.length, 2); assert.equal(r.metrics.buyers, 0); assert.equal(r.metrics.repeatRate, null);
  assert.ok(find(r, 'K').reasons.includes('bad'));
});

test('repeat rate, windows and first-gap buckets', () => {
  const orders = [row({ name: 'M', phone: '611000301' }), row({ name: 'M', phone: '611000301', day: 20 }),
    row({ name: 'N', phone: '611000302' }), row({ name: 'N', phone: '611000302', day: 50 }),
    row({ name: 'O', phone: '611000303' }), row({ name: 'P', phone: '611000304', day: 80 })];
  const m = run(orders, [], 100).metrics;
  assert.equal(m.buyers, 4); assert.equal(m.repeaters, 2); assert.equal(m.repeatRate, 0.5);
  const w30 = m.windows.find(w => w.days === 30), w60 = m.windows.find(w => w.days === 60);
  assert.deepEqual([w30.eligible, w30.repeated], [3, 1]); assert.deepEqual([w60.eligible, w60.repeated], [3, 2]);
  assert.equal(m.gapBuckets.find(b => b.label === '3 周–1 月').n, 0);
  assert.equal(m.gapBuckets.find(b => b.label === '2–3 周').n, 1); assert.equal(m.gapBuckets.find(b => b.label === '1.5–2 月').n, 1);
  assert.equal(m.medianGap, 35);
});

test('items and form stored as JSON text (CSV export) still parse', () => {
  const o = row({ name: 'Q' });
  const r = run([{ ...o, items: JSON.stringify(o.items), form: JSON.stringify({ ackLeak: true }) }], [], 1);
  assert.equal(r.customers[0].units, 2); assert.equal(r.customers[0].occ[0].leak, true);
});

test('made-up data: repeatable, fake phone block, every list filled', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const a = rtDemo(products, now), b = rtDemo(products, now);
  assert.deepEqual(a, b);
  assert.ok(a.orders.length > 200);
  for (const o of a.orders) assert.match(rtPhone(o.customer_phone), /^346000\d{5}$/);
  const r = rtAnalyze(a.orders, a.members, { now, soldOut: a.soldOut });
  assert.ok(r.metrics.customers >= 120, 'customers ' + r.metrics.customers);
  for (const k of ['near', 'notDue', 'due', 'never']) assert.ok(r.lists[k].length > 0, k + ' is empty');
  for (const k of ['leak', 'delivery', 'oldSite', 'agent', 'soldOut', 'guest']) assert.ok(r.reasons.all[k]?.n > 0, 'no ' + k);
  assert.equal(r.shopRateFrom, 'measured');
  assert.ok(r.metrics.segments.member.rate > r.metrics.segments.guest.rate);
});

console.log(`\n${passed} tests passed`);
