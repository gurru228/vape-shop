// Made-up orders for admin-lab.html's 「假数据」 view and for qa/retention.mjs: about 150 invented customers
// (regulars, people who stopped, one-time buyers of every kind, never-paid). Same seed → same data.
// Every phone number is in the +34 600 0xx xxx block, names are invented; nothing here is a real customer.
function rtDemo(products, now = Date.now(), seed = 20261023) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const DAY = 864e5;
  const byId = new Map(products.map(p => [p.id, p]));
  const NAMES = ['Lucía', 'Marta', 'Carlos', 'Javier', 'Elena', 'Pablo', 'Sofía', 'Diego', 'Laura', 'Andrés', 'Nuria', 'Raúl', 'Irene', 'Hugo', 'Paula',
    '王磊', '李娜', '张伟', '刘洋', '陈静', '杨帆', '赵敏', '黄晓', '周杰', '吴倩', '徐鹏', '孙悦', '马超', '朱琳', '胡斌', '林小', '郭峰', '何芳', '高远', '罗佳'];
  let n = 0, seq = 0;
  const orders = [], members = [], soldOut = [];
  const person = () => { n++; return { name: pick(NAMES) + (n > NAMES.length ? ' ' + String.fromCharCode(65 + (n % 26)) : ''), digits: '346000' + String(10000 + n * 37).slice(-5) }; };
  const show = d => `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  const flavor = pid => pick(byId.get(pid).flavors).name;
  const order = (who, at, lines, o = {}) => {
    seq++;
    const items = lines.map(([pid, fl, qty]) => ({ id: `${pid}-${fl}`, productId: pid, flavor: fl, name: `${byId.get(pid).name} - ${fl}`, price: byId.get(pid).price, quantity: qty }));
    if (o.gift) items.push({ id: `FREE-${o.gift}-${flavor(o.gift)}-${at}`, productId: o.gift, flavor: flavor(o.gift), name: '🎁 集章赠品', price: 0, quantity: 1, isFree: true });
    const units = lines.reduce((t, l) => t + l[2], 0);
    const mode = o.mode || 'pickup', ship = mode === 'postal' ? 6 : mode === 'delivery' && units < 5 ? 3 : 0;
    const total = Math.round((lines.reduce((t, [pid, , q]) => t + byId.get(pid).price * q, 0) + ship) * 100) / 100;
    orders.push({
      id: `demo-${seq}`, order_number: `D-${String(seq).padStart(4, '0')}`, customer_name: who.name,
      customer_phone: o.phoneText || show(who.digits), items, total, shipping_fee: ship,
      payment_method: o.old ? pick(['bizum', 'cash']) : 'whatsapp', payment_status: o.status || pick(['delivered', 'delivered', 'delivered', 'shipped', 'paid']),
      created_at: new Date(at).toISOString(), delivery_type: mode, agent_ref: o.agent || null, member_id: o.member || null,
      coupon: o.coupon || null, form: o.old ? null : { name: who.name, phone: who.digits, mode, ...(o.leak ? { ackLeak: true } : {}) }, user_id: null,
    });
  };
  const member = (who, created) => { members.push({ id: who.digits, name: who.name, phone: who.digits, email: null, stamps: {}, created }); return who.digits; };
  const favourite = () => pick([1, 1, 1, 1, 3, 3, 5, 5, 4, 6]);

  // regulars: buy their usual amount again when it runs out; some stopped at some point
  for (let k = 0; k < 58; k++) {
    const who = person(), guest = k >= 46;
    const pid = favourite(), puffs = { 1: 4000, 2: 12000, 3: 5000, 4: 40000, 5: 18000, 6: 1800 }[pid];
    const qty = pid === 4 ? int(1, 2) : int(2, 5), rate = int(150, 450);
    const stopAt = rnd() < 0.25 ? now - int(25, 90) * DAY : Infinity;
    let at = now - int(60, 175) * DAY;
    const id = guest ? null : member(who, at - DAY);
    let i = 0;
    while (at < now && at < stopAt) {
      const fl = rnd() < 0.7 ? [[pid, flavor(pid), qty]] : [[pid, flavor(pid), qty - 1 || 1], [pid, flavor(pid), 1]];
      const phoneText = guest && i % 2 ? who.digits.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ') : undefined;
      order(who, at, fl, { member: id, gift: id && i === 3 ? pid : 0, mode: rnd() < 0.15 ? 'delivery' : 'pickup', phoneText });
      if (id && i === 2 && rnd() < 0.3) order(who, at + 2 * DAY, [[pid, flavor(pid), 1]], { member: id, status: 'cancelled' });
      at += (qty * puffs / rate) * (0.8 + rnd() * 0.4) * DAY;
      i++;
    }
  }
  // registered after a guest first order: the guest order and the member orders are one customer
  for (let k = 0; k < 8; k++) {
    const who = person(), first = now - int(70, 120) * DAY;
    order(who, first, [[1, flavor(1), 3]]);
    const id = member(who, first + 20 * DAY);
    order(who, first + int(28, 40) * DAY, [[1, flavor(1), 3]], { member: id });
    if (k % 2) order(who, first + int(60, 70) * DAY, [[1, flavor(1), 3], [3, flavor(3), 1]], { member: id });
  }
  // one-time buyers, each with the kind of first order that tends to explain it
  const once = [
    [10, () => ({ at: now - int(70, 130) * DAY, lines: [[2, flavor(2), int(1, 2)]], o: { leak: true } })],
    [7, () => ({ at: now - int(40, 90) * DAY, lines: [[1, flavor(1), int(2, 3)]], o: { mode: pick(['delivery', 'postal']) } })],
    [6, () => ({ at: now - int(140, 220) * DAY, lines: [[pick([1, 3, 6]), null, int(1, 4)]], o: { old: true } })],
    [5, () => ({ at: now - int(40, 80) * DAY, lines: [[pick([1, 5]), null, int(2, 4)]], o: { agent: pick(['ana', 'leo']) } })],
    [5, () => ({ at: now - int(30, 70) * DAY, lines: [[pick([1, 3]), null, 1]], o: {} })],
    [4, () => ({ at: now - int(150, 210) * DAY, lines: [[4, null, 1]], o: { coupon: 'AMIGO5' } })],
    [5, () => ({ at: now - int(35, 60) * DAY, lines: [[1, 'Mineral Water', 2], [1, 'Lemon Tea', 1]], o: { member: true } })],
    [12, () => ({ at: now - int(2, 12) * DAY, lines: [[favourite(), null, int(2, 4)]], o: { member: rnd() < 0.5 } })],
    [5, () => ({ at: now - int(45, 100) * DAY, lines: [[favourite(), null, int(2, 3)]], o: { member: true, cancelledToo: true } })],
  ];
  soldOut.push('1-Mineral Water', '1-Lemon Tea');
  for (const [count, make] of once) for (let k = 0; k < count; k++) {
    const who = person(), m = make();
    const lines = m.lines.map(([pid, fl, q]) => [pid, fl || flavor(pid), q]);
    const id = m.o.member ? member(who, m.at - DAY) : null;
    if (m.o.cancelledToo) order(who, m.at - 3 * DAY, lines, { member: id, status: 'cancelled' });
    order(who, m.at, lines, { ...m.o, member: id });
  }
  // never paid: only cancelled orders, or one stuck in 待确认
  for (let k = 0; k < 6; k++) {
    const who = person();
    order(who, now - int(5, 60) * DAY, [[favourite(), null, 2]].map(([p, , q]) => [p, flavor(p), q]), { status: k % 2 ? 'pending' : 'cancelled' });
  }
  return { orders, members, soldOut };
}

if (typeof module !== 'undefined') module.exports = { rtDemo };
