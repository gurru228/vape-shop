// Repeat-purchase analysis for admin-lab.html (the read-only test page). Pure functions only: order rows and
// members in, customers / metrics / lists out. build.sh inlines this file into admin-lab.html; qa/retention.mjs
// loads it in node. Order rows are the `orders` table as get-orders returns it (old-site rows included).
const RT_DAY = 864e5;
const RT_PAID = new Set(['paid', 'shipped', 'delivered']);
const RT_DEFAULTS = {
  puffs: { 1: 4000, 2: 12000, 3: 5000, 4: 40000, 5: 18000, 6: 1800 }, // per unit; RELX is a 3-pod pack
  rate: 250,       // puffs a day, used until there are enough repeat customers to measure the shop's own rate
  minRepeaters: 3, // repeat customers needed before the measured rate replaces `rate`
  nearDays: 3,     // "about to run out" = due within this many days
  lostDays: 60,    // overdue and silent this long = probably lost
  mergeHours: 24,  // orders this close together count as one purchase (a forgotten flavor, a second cart)
  highPrice: 25,   // average € per unit at or above this = a pricey first order
};
const RT_STATUS = { ok: '正常', near: '快抽完', overdue: '逾期未回', lost: '疑似流失', never: '没成交过' };
// weight = how strongly the sign explains a missing repeat order; the heaviest one is shown as the main reason
const RT_REASONS = {
  notDue:   { w: 100, t: '还没到复购时间', hint: '按他买的量估计还没抽完，先不用联系' },
  bad:      { w: 90, t: '有过取消 / 卡住的订单', hint: '先问清楚上次哪里不顺，再邀请下单' },
  leak:     { w: 80, t: '首单是清仓 IceMax（可能漏油不满意）', hint: '问一下用得怎么样，推荐其他款' },
  soldOut:  { w: 75, t: '买过的口味现在缺货', hint: '到货后 WhatsApp 通知他' },
  oldSite:  { w: 70, t: '老网站客户，改版后没回来', hint: '发新网站链接和二维码，说明现在用 WhatsApp 付款' },
  agent:    { w: 60, t: '代理带来的客户', hint: '跟代理确认是不是在代理那里复购了' },
  delivery: { w: 55, t: '外送 / 邮寄（运费或起送门槛）', hint: '推荐自取，或提醒凑够件数免运费' },
  deal:     { w: 50, t: '冲着优惠 / 清仓价来的', hint: '下次有活动再通知他' },
  guest:    { w: 45, t: '游客下单，没有集章动力', hint: '邀请注册会员，以后每单都能集章' },
  trial:    { w: 35, t: '只买了 1 支（试用）', hint: '问问口味喜好，推荐同款其他口味' },
  price:    { w: 30, t: '首单单价高', hint: '推荐性价比更高的款式' },
  unknown:  { w: 1, t: '数据看不出原因', hint: '直接 WhatsApp 问一下' },
};
const RT_MANUAL = ['在别家买了', '价格贵', '想要的口味缺货', '对产品不满意', '配送 / 取货不方便', '不抽了 / 抽得少了', '离开本地了', '还有存货', '其他'];

function rtPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && /^[6789]/.test(d)) d = '34' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}
function rtMedian(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const rtMs = v => (typeof v === 'number' ? v : Date.parse(v));

// one item row → { pid, flavor, qty, price, free }; same parsing as fromRow() in netlify/lib/shop.mjs
function rtLine(i) {
  const id = String(i.id ?? '');
  const free = !!i.isFree || id.startsWith('FREE-');
  const parts = id.split('-');
  const pid = +(i.productId ?? (free ? parts[1] : parts[0]));
  const flavor = i.flavor ?? (free ? parts.slice(2, -1).join('-') : parts.slice(1).join('-'));
  return { pid: Number.isFinite(pid) ? pid : 0, flavor: flavor || '', qty: +i.quantity || 1, price: +i.price || 0, free };
}

function rtOrder(o, P) {
  let items = o.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  let form = o.form;
  if (typeof form === 'string') { try { form = JSON.parse(form); } catch (e) { form = null; } }
  const lines = (Array.isArray(items) ? items : []).map(rtLine);
  const paidLines = lines.filter(l => !l.free);
  const units = paidLines.reduce((s, l) => s + l.qty, 0);
  const valid = RT_PAID.has(o.payment_status);
  return {
    id: String(o.id ?? o.order_number ?? ''), no: o.order_number || '', at: rtMs(o.created_at), status: o.payment_status || '',
    valid, giftOnly: valid && units === 0, buy: valid && units > 0,
    lines, units, gifts: lines.filter(l => l.free).length,
    puffs: paidLines.reduce((s, l) => s + l.qty * (P.puffs[l.pid] || P.puffs[1] || 4000), 0),
    amount: +o.total || 0, ship: +o.shipping_fee || 0,
    mode: o.delivery_type || 'pickup', coupon: o.coupon || form?.coupon || null, agent: o.agent_ref || null,
    leak: !!form?.ackLeak || paidLines.some(l => l.pid === 2),
    old: !form && !o.member_id && o.payment_method !== 'whatsapp',
    member: o.member_id || null, phone: rtPhone(o.customer_phone), phoneText: o.customer_phone || '', name: o.customer_name || '',
    user: o.user_id || null,
  };
}

// customers = connected groups of member id / phone / old-site account id (one person may have ordered as a
// guest before registering, or with differently written phone numbers)
function rtGroups(infos, members) {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = x => { if (!parent.has(x)) parent.set(x, x); return x; };
  const join = keys => { const k = keys.filter(Boolean).map(add); for (let i = 1; i < k.length; i++) parent.set(find(k[i]), find(k[0])); return k[0]; };
  for (const m of members) {
    const ph = rtPhone(m.phone) || (/^\d+$/.test(m.id) ? rtPhone(m.id) : null);
    join(['m:' + m.id, ph && 'p:' + ph, (m.authUid || m.auth_uid) && 'u:' + (m.authUid || m.auth_uid)]);
  }
  const of = new Map();
  for (const o of infos) of.set(o, join([o.member && 'm:' + o.member, o.phone && 'p:' + o.phone, o.user && 'u:' + o.user, !o.member && !o.phone && !o.user && 'o:' + o.id]));
  const groups = new Map();
  for (const o of infos) { const r = find(of.get(o)); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(o); }
  const memberOf = new Map();
  for (const m of members) memberOf.set(find('m:' + m.id), m);
  return [...groups].map(([root, orders]) => ({ root, orders, memberRow: memberOf.get(root) || null }));
}

function rtReasons(c, soldOut, P) {
  const first = c.occ[0];
  const tags = [];
  if (c.status === 'ok' || c.status === 'near') tags.push('notDue');
  if (c.cancelled || c.stuck) tags.push('bad');
  if (first) {
    if (first.leak) tags.push('leak');
    const fl = first.lines.filter(l => !l.free);
    const out = fl.filter(l => soldOut.has(`${l.pid}-${l.flavor}`)).length;
    if (out) tags.push('soldOut');
    if (first.old && !c.occ.some(o => !o.old)) tags.push('oldSite');
    if (first.agent) tags.push('agent');
    if (first.mode === 'delivery' || first.mode === 'postal') tags.push('delivery');
    if (first.coupon || (fl.length && fl.every(l => l.pid === 2))) tags.push('deal');
    if (!c.member) tags.push('guest');
    if (first.units === 1) tags.push('trial');
    if (first.units && first.paid / first.units >= P.highPrice) tags.push('price');
  }
  if (!tags.length) tags.push('unknown');
  return tags.sort((a, b) => RT_REASONS[b].w - RT_REASONS[a].w);
}

// orders: rows of the orders table; members: [{ id, name, phone, email, created }]; opts: { now, params, soldOut }
function rtAnalyze(orders, members = [], opts = {}) {
  const P = { ...RT_DEFAULTS, ...(opts.params || {}), puffs: { ...RT_DEFAULTS.puffs, ...(opts.params?.puffs || {}) } };
  const now = opts.now ?? Date.now();
  const soldOut = new Set(opts.soldOut || []);
  const infos = (orders || []).filter(o => o && o.payment_status !== 'stripe_pending').map(o => rtOrder(o, P)).filter(o => Number.isFinite(o.at));
  const customers = rtGroups(infos, (members || []).filter(m => m && m.id)).map(({ root, orders: list, memberRow }) => {
    list.sort((a, b) => a.at - b.at);
    const buys = list.filter(o => o.buy);
    // purchase occasions: orders within mergeHours of the previous one are folded into it
    const occ = [];
    for (const o of buys) {
      const last = occ[occ.length - 1];
      if (last && o.at - last.lastAt <= P.mergeHours * 36e5) {
        last.orders.push(o); last.lastAt = o.at; last.units += o.units; last.puffs += o.puffs; last.paid += o.amount - o.ship;
        last.lines.push(...o.lines); last.leak ||= o.leak; last.coupon ||= o.coupon; last.agent ||= o.agent;
        if (o.mode !== 'pickup') last.mode = o.mode;
      } else occ.push({ at: o.at, lastAt: o.at, orders: [o], units: o.units, puffs: o.puffs, paid: o.amount - o.ship, lines: [...o.lines], leak: o.leak, coupon: o.coupon, agent: o.agent, mode: o.mode, old: o.old });
    }
    const latest = list[list.length - 1];
    const memberId = memberRow?.id || [...list].reverse().find(o => o.member)?.member || null;
    const byLine = {}, byFlavor = {};
    buys.forEach(o => o.lines.forEach(l => { if (l.free) return; byLine[l.pid] = (byLine[l.pid] || 0) + l.qty; const k = `${l.pid}-${l.flavor}`; byFlavor[k] = (byFlavor[k] || 0) + l.qty; }));
    const gaps = occ.slice(1).map((o, i) => (o.at - occ[i].at) / RT_DAY);
    const rates = occ.slice(0, -1).map((o, i) => o.puffs / Math.max(gaps[i], 1)).filter(r => r > 0);
    const phone = [...list].reverse().find(o => o.phone)?.phone || rtPhone(memberRow?.phone);
    return {
      // stable across loads (the group root depends on row order), so notes typed in the page stay attached
      key: memberId ? 'm:' + memberId : phone ? 'p:' + phone : root, name: memberRow?.name || latest.name, phone,
      phoneText: latest.phoneText, member: !!memberId, memberId,
      orders: list, occ, nBuys: occ.length, nOrders: buys.length,
      units: buys.reduce((s, o) => s + o.units, 0), puffs: buys.reduce((s, o) => s + o.puffs, 0),
      spent: buys.reduce((s, o) => s + o.amount, 0), giftOrders: list.filter(o => o.giftOnly).length,
      gifts: list.filter(o => o.valid).reduce((s, o) => s + o.gifts, 0),
      cancelled: list.filter(o => o.status === 'cancelled').length,
      stuck: list.filter(o => o.status === 'pending' && now - o.at > 2 * RT_DAY).length,
      firstAt: occ[0]?.at ?? null, lastAt: occ[occ.length - 1]?.at ?? null,
      byLine, byFlavor, gaps, medianGap: rtMedian(gaps), personalRate: rtMedian(rates),
      oldOnly: !!occ.length && occ.every(o => o.old),
    };
  });

  const repeaters = customers.filter(c => c.nBuys >= 2);
  const measured = rtMedian(repeaters.map(c => c.personalRate).filter(Boolean));
  const shopRate = repeaters.length >= P.minRepeaters && measured ? measured : P.rate;
  for (const c of customers) {
    if (!c.nBuys) { c.status = 'never'; c.reasons = rtReasons(c, soldOut, P); continue; }
    const last = c.occ[c.occ.length - 1];
    c.rate = c.personalRate || shopRate;
    c.rateFrom = c.personalRate ? 'own' : 'shop';
    c.expectDays = last.puffs ? last.puffs / c.rate : (c.medianGap || 30);
    c.runOutAt = c.lastAt + c.expectDays * RT_DAY;
    c.since = (now - c.lastAt) / RT_DAY;
    c.dueIn = (c.runOutAt - now) / RT_DAY;
    const r = c.since / c.expectDays;
    c.status = r > 2 || (r > 1 && c.since > P.lostDays) ? 'lost' : r > 1 ? 'overdue' : c.dueIn <= P.nearDays ? 'near' : 'ok';
    if (c.nBuys === 1) c.reasons = rtReasons(c, soldOut, P);
  }
  customers.sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));

  const buyers = customers.filter(c => c.nBuys >= 1);
  const rate = list => (list.length ? list.filter(c => c.nBuys >= 2).length / list.length : null);
  // customers who had a fair chance to come back: repeaters, plus one-time buyers who should have run out by now
  const settled = buyers.filter(c => c.nBuys >= 2 || c.status === 'overdue' || c.status === 'lost');
  const windows = [30, 60, 90].map(w => {
    const el = buyers.filter(c => c.firstAt <= now - w * RT_DAY);
    const hit = el.filter(c => c.occ[1] && c.occ[1].at - c.firstAt <= w * RT_DAY).length;
    return { days: w, eligible: el.length, repeated: hit, rate: el.length ? hit / el.length : null };
  });
  const BUCKETS = [[0, 7, '1 周内'], [7, 14, '1–2 周'], [14, 21, '2–3 周'], [21, 30, '3 周–1 月'], [30, 45, '1–1.5 月'], [45, 60, '1.5–2 月'], [60, 90, '2–3 月'], [90, Infinity, '3 个月以上']];
  const firstGaps = repeaters.map(c => c.gaps[0]);
  const gapBuckets = BUCKETS.map(([a, b, t]) => ({ label: t, n: firstGaps.filter(g => g >= a && g < b).length }));
  const months = new Map();
  for (const c of buyers) {
    const d = new Date(c.firstAt), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = months.get(k) || { month: k, n: 0, repeated: 0 };
    m.n++; if (c.nBuys >= 2) m.repeated++;
    months.set(k, m);
  }
  const cohorts = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, rate: m.repeated / m.n }));
  const lineGaps = {};
  for (const c of repeaters) c.occ.slice(0, -1).forEach((o, i) => new Set(o.lines.filter(l => !l.free).map(l => l.pid)).forEach(pid => (lineGaps[pid] ||= []).push(c.gaps[i])));
  const lines = Object.entries(lineGaps).map(([pid, g]) => ({ pid: +pid, pairs: g.length, median: rtMedian(g) })).sort((a, b) => a.median - b.median);
  const firstTraits = {
    member: c => c.member, guest: c => !c.member, leak: c => c.occ[0].leak, delivery: c => c.occ[0].mode !== 'pickup',
    deal: c => !!c.occ[0].coupon || c.occ[0].lines.every(l => l.free || l.pid === 2), trial: c => c.occ[0].units === 1,
    agent: c => !!c.occ[0].agent, oldSite: c => c.occ[0].old,
  };
  const traits = Object.entries(firstTraits).map(([k, f]) => {
    const yes = settled.filter(f), no = settled.filter(c => !f(c));
    return { key: k, n: yes.length, rate: rate(yes), others: no.length, othersRate: rate(no) };
  }).filter(t => t.n > 0);

  const once = buyers.filter(c => c.nBuys === 1);
  const notDue = once.filter(c => c.status === 'ok' || c.status === 'near');
  const due = once.filter(c => c.status === 'overdue' || c.status === 'lost');
  const never = customers.filter(c => !c.nBuys);
  const reasonCount = {}, primaryCount = {};
  for (const c of due) {
    primaryCount[c.reasons[0]] = primaryCount[c.reasons[0]] || { n: 0, spent: 0 };
    primaryCount[c.reasons[0]].n++; primaryCount[c.reasons[0]].spent += c.spent;
    for (const t of c.reasons) { reasonCount[t] = reasonCount[t] || { n: 0, spent: 0 }; reasonCount[t].n++; reasonCount[t].spent += c.spent; }
  }
  const segment = list => ({ n: list.length, repeated: list.filter(c => c.nBuys >= 2).length, rate: rate(list) });
  return {
    now, params: P, shopRate, shopRateFrom: shopRate === P.rate ? 'default' : 'measured', customers,
    metrics: {
      customers: customers.length, buyers: buyers.length, repeaters: repeaters.length, repeatRate: rate(buyers),
      settledRate: rate(settled), settled: settled.length,
      medianGap: rtMedian(repeaters.flatMap(c => c.gaps)), medianFirstGap: rtMedian(firstGaps),
      unitsPerBuyer: buyers.length ? buyers.reduce((s, c) => s + c.units, 0) / buyers.length : 0,
      spentPerBuyer: buyers.length ? buyers.reduce((s, c) => s + c.spent, 0) / buyers.length : 0,
      segments: { member: segment(buyers.filter(c => c.member)), guest: segment(buyers.filter(c => !c.member)), oldSite: segment(buyers.filter(c => c.oldOnly)), newSite: segment(buyers.filter(c => !c.oldOnly)) },
      windows, gapBuckets, cohorts, lines, traits,
      status: Object.fromEntries(Object.keys(RT_STATUS).map(k => [k, customers.filter(c => c.status === k).length])),
    },
    lists: {
      near: buyers.filter(c => c.status === 'near' || c.status === 'overdue').sort((a, b) => a.runOutAt - b.runOutAt),
      notDue: notDue.sort((a, b) => a.runOutAt - b.runOutAt), due: due.sort((a, b) => b.spent - a.spent), never,
    },
    reasons: { primary: primaryCount, all: reasonCount },
  };
}

if (typeof module !== 'undefined') module.exports = { rtAnalyze, rtPhone, rtMedian, rtLine, RT_DEFAULTS, RT_REASONS, RT_STATUS, RT_MANUAL, RT_DAY };
