// Shared backend helpers: Supabase storage (members / sessions / orders / inventory), passwords,
// server-side pricing, order status changes (stamps + stock), Telegram.
// Everything goes through Supabase's REST API with the service key, so RLS keeps the browser out.
import { scrypt, randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import products from '../../site/src/products.json' with { type: 'json' };

export const STAMPS_PER_REWARD = 10;
const DAY = 864e5;
export const byId = new Map(products.map(p => [p.id, p]));
export const shortName = p => p.name.replace(/\s*\(.*\)\s*/, '');
export const unit = p => (p.id === 6 ? '盒' : '支');
export const euro = n => '€' + (+n).toFixed(2);

export const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
export const fail = (error, status = 400) => json({ error }, status);
// the admin password, compared in constant time; a wrong one is answered after a pause, so guessing it is slow
export function adminOk(pw) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || typeof pw !== 'string') return false;
  const a = createHash('sha256').update(pw).digest(), b = createHash('sha256').update(want).digest();
  return timingSafeEqual(a, b);
}
export const slowNo = () => new Promise(ok => setTimeout(() => ok(fail('Unauthorized', 401)), 1200));
export async function body(req) {
  try { return await req.json(); } catch (e) { return null; }
}

// ---------- Supabase REST ----------
const SB = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  return { url, key };
};
export async function db(path, { method = 'GET', body: payload, prefer } = {}) {
  const { url, key } = SB();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.message || `supabase ${res.status}`), { status: res.status, code: data?.code });
  return data;
}
const eq = v => 'eq.' + encodeURIComponent(v);
const ms = t => (t ? Date.parse(t) : 0);
const iso = n => (n ? new Date(n).toISOString() : null);

// ---------- members ----------
// row <-> the object the functions work with (times in ms, camelCase)
const toMember = r => r && ({
  id: r.id, phone: r.phone, email: r.email, name: r.name, salt: r.salt, hash: r.hash,
  stamps: r.stamps || {}, stampLog: r.stamp_log || [], tempPw: r.temp_pw, fails: r.fails,
  lockUntil: ms(r.lock_until), sessionsAfter: ms(r.sessions_after), created: ms(r.created_at), authUid: r.auth_uid,
});
const fromMember = u => {
  const r = {};
  const map = { id: 'id', phone: 'phone', email: 'email', name: 'name', salt: 'salt', hash: 'hash', stamps: 'stamps', stampLog: 'stamp_log', tempPw: 'temp_pw', fails: 'fails', authUid: 'auth_uid' };
  for (const [k, c] of Object.entries(map)) if (k in u) r[c] = u[k];
  if ('lockUntil' in u) r.lock_until = iso(u.lockUntil);
  if ('sessionsAfter' in u) r.sessions_after = iso(u.sessionsAfter);
  return r;
};
export async function getMember(id) {
  const rows = await db(`members?id=${eq(id)}&select=*`);
  return toMember(rows[0]);
}
// false when the id is taken
export async function createMember(u) {
  try {
    await db('members', { method: 'POST', body: fromMember(u), prefer: 'return=minimal' });
    return true;
  } catch (e) {
    if (e.code === '23505') return false;
    throw e;
  }
}
export async function patchMember(id, fields) {
  const rows = await db(`members?id=${eq(id)}`, { method: 'PATCH', body: fromMember(fields), prefer: 'return=representation' });
  return toMember(rows[0]);
}
export const deleteMember = id => db(`members?id=${eq(id)}`, { method: 'DELETE' });
// add / take stamps atomically ({pid: n}); strict refuses the whole change if any card would go below 0 → null
export async function addStamps(id, delta, { strict = false, log = null } = {}) {
  return db('rpc/member_add_stamps', { method: 'POST', body: { p_id: id, p_delta: delta, p_strict: strict, p_log: log } });
}
export async function searchMembers(q, limit = 10) {
  const like = encodeURIComponent(`*${q.replace(/[*,()"\\]/g, '')}*`);
  const digits = q.replace(/\D/g, '');
  const or = [`name.ilike.${like}`, `email.ilike.${like}`, ...(digits.length >= 4 ? [`phone.like.*${digits}*`] : [])].join(',');
  return (await db(`members?or=(${or})&select=*&order=created_at.desc&limit=${limit}`)).map(toMember);
}
export async function listMembers() {
  return (await db('members?select=id,phone,email,name,stamps,temp_pw,created_at&order=created_at.desc&limit=2000')).map(toMember);
}

// Spanish mobiles may be typed without +34; everything else needs the country code
export function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && /^[6789]/.test(d)) d = '34' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
export const showPhone = d => (d.startsWith('34') && d.length === 11 ? `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : '+' + d);
export const normEmail = s => {
  const e = String(s || '').trim().toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
};
// an account is a phone number or an email; whichever it is doubles as the member id (digits vs. "@" never collide)
export function normAccount(s) {
  if (String(s || '').includes('@')) { const email = normEmail(s); return email && { id: email, email }; }
  const phone = normPhone(s);
  return phone && { id: phone, phone };
}
export const uid = u => u.id;

const scryptP = (pw, salt) => new Promise((ok, no) => scrypt(pw, salt, 32, (e, k) => (e ? no(e) : ok(k))));
export async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await scryptP(pw, salt)).toString('hex') };
}
export async function checkPassword(pw, u) {
  return timingSafeEqual(await scryptP(pw, u.salt), Buffer.from(u.hash, 'hex'));
}
// a temporary password the shop hands out by WhatsApp: no look-alike characters
export const tempPassword = () => Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('');

// Old-site accounts lived in Supabase Auth (email + password). On their first sign-in here we check the
// password against Supabase Auth once and move them into members; their card starts empty.
export async function legacyLogin(email, password) {
  const { url, key } = SB();
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id ? { authUid: data.user.id, name: data.user.user_metadata?.name } : null;
  } catch (e) { return null; }
}

// ---------- sessions (only a hash of the token is stored) ----------
const tokenHash = t => createHash('sha256').update(t).digest('hex');
export async function newSession(id) {
  const token = randomBytes(32).toString('hex');
  await db('member_sessions', { method: 'POST', prefer: 'return=minimal', body: { token_hash: tokenHash(token), member_id: id, created_at: iso(Date.now()), expires_at: iso(Date.now() + 90 * DAY) } });
  return token;
}
export const dropSession = token => db(`member_sessions?token_hash=${eq(tokenHash(token))}`, { method: 'DELETE' });
export const bearer = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
export async function currentUser(req) {
  const token = bearer(req);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const rows = await db(`member_sessions?token_hash=${eq(tokenHash(token))}&select=created_at,expires_at,member:members(*)`);
  const s = rows[0];
  if (!s || ms(s.expires_at) < Date.now() || !s.member) return null;
  const user = toMember(s.member);
  // a password reset or change signs out every older session
  if (ms(s.created_at) < (user.sessionsAfter || 0)) return null;
  return { user, token };
}
export const publicUser = u => ({ id: u.id, phone: u.phone || null, email: u.email || null, name: u.name, stamps: u.stamps || {}, tempPw: !!u.tempPw });

// ---------- inventory ----------
// a flavor is sold out when the admin set its stock to 0; no row = not tracked = available
export async function soldOut() {
  try {
    const rows = await db('inventory?select=product_id,flavor_name&stock=lte.0');
    return new Set(rows.map(r => `${r.product_id}-${r.flavor_name}`));
  } catch (e) { console.error('[inventory]', e.message); return new Set(); }
}
async function moveStock(rpc, lines) {
  for (const l of lines) {
    try { await db(`rpc/${rpc}`, { method: 'POST', body: { p_product_id: l.pid, p_flavor_name: l.flavor, p_qty: l.qty } }); }
    catch (e) { console.error(`[${rpc}]`, l.pid, l.flavor, e.message); }
  }
}

// ---------- orders: the server re-prices everything; the browser's numbers are never trusted ----------
const MODES = { pickup: '自取', delivery: '外送', postal: '邮寄' };
const SLOTS = ['10:00–14:00', '14:00–18:00', '18:00–21:00'];
const str = (v, n = 120) => String(v ?? '').trim().slice(0, n);

export function priceOrder(items, rawForm, out = new Set()) {
  if (!Array.isArray(items) || !items.length) throw new Error('购物车是空的');
  if (items.length > 40) throw new Error('商品太多了，请分几单下');
  const lines = items.map(it => {
    const p = byId.get(+it.pid);
    const f = p?.flavors.find(x => x.name === it.flavor);
    const qty = Math.floor(+it.qty);
    if (!p || !f || !(qty >= 1 && qty <= 20)) throw new Error('有商品已下架或数量不对，请刷新页面再试');
    if (out.has(`${p.id}-${f.name}`)) throw new Error(`${shortName(p)} · ${f.nameCn} 刚刚卖完了，请从购物车删掉再提交`);
    return { pid: p.id, name: shortName(p), flavor: f.name, flavorCn: f.nameCn, qty, price: p.price, amount: Math.round(p.price * qty * 100) / 100 };
  });
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const form = {
    name: str(rawForm?.name, 60), phone: str(rawForm?.phone, 30),
    mode: MODES[rawForm?.mode] ? rawForm.mode : 'pickup',
    slot: SLOTS.includes(rawForm?.slot) ? rawForm.slot : SLOTS[0],
    recipient: str(rawForm?.recipient, 80), street: str(rawForm?.street, 160), floor: str(rawForm?.floor, 60),
    cp: str(rawForm?.cp, 12), city: str(rawForm?.city, 60), province: str(rawForm?.province, 60),
    country: rawForm?.country === 'EU' ? 'EU' : 'ES', coupon: str(rawForm?.coupon, 40),
  };
  if (!form.name) throw new Error('请填写姓名');
  if (!normPhone(form.phone)) throw new Error('手机号看起来不完整');
  if (form.mode === 'delivery' && count < 5) throw new Error('外送需要满 5 件');
  if (form.mode === 'delivery' && !form.street) throw new Error('请填写送货地址');
  if (form.mode === 'postal') {
    for (const [k, m] of [['recipient', '收件人'], ['street', '地址'], ['cp', '邮编'], ['city', '城市'], ['province', '省份']]) if (!form[k]) throw new Error(`请填写${m}`);
    if (form.country === 'ES' && !/^\d{5}$/.test(form.cp)) throw new Error('西班牙邮编是 5 位数字');
  }
  const sub = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const ship = form.mode === 'postal' && !(form.country === 'ES' && sub >= 150) ? 9.99 : 0;
  const earn = {};
  lines.forEach(l => { earn[l.pid] = (earn[l.pid] || 0) + l.qty; });
  // a clearance line (IceMax, sold cheap because of small leaks) needs the buyer's tick at checkout
  const leak = lines.some(l => byId.get(l.pid).clearance);
  return { lines, form, count, sub, ship, total: Math.round((sub + ship) * 100) / 100, earn, leak };
}

export function orderNo() {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  return `VS${t}${randomBytes(2).toString('hex').toUpperCase()}`;
}

// payment_status in the orders table (shared with the admin page):
//   pending 待确认 · paid 已确认 · shipped 已发货 · delivered 已完成 · cancelled 已取消
export const STATUS_CN = { pending: '⏳ 待确认', paid: '✅ 已确认', shipped: '🚚 已发货', delivered: '🎉 已完成', cancelled: '❌ 已取消' };
export const CONSUMING = new Set(['paid', 'shipped', 'delivered']);
// what the customer's "my orders" shows
export const customerStatus = s => (CONSUMING.has(s) ? 'confirmed' : s === 'cancelled' ? 'cancelled' : 'pending');

const addressText = f => (f.mode === 'delivery' ? f.street
  : f.mode === 'postal' ? [f.recipient, `${f.street} ${f.floor}`.trim(), `${f.cp} ${f.city}`, f.province, f.country === 'EU' ? '欧盟（运费待确认）' : 'España'].join('\n')
  : '');
// items in the same shape the old site stored them, so the admin page and its stock functions read them unchanged
const itemRows = o => [
  ...o.lines.map(l => ({ id: `${l.pid}-${l.flavor}`, productId: l.pid, flavor: l.flavor, name: `${byId.get(l.pid).name} - ${l.flavorCn} / ${l.flavor}`, price: l.price, quantity: l.qty })),
  ...o.gifts.map(g => ({ id: `FREE-${g.pid}-${g.flavor}-${o.created}`, productId: g.pid, flavor: g.flavor, name: `🎁 集章赠品 ${byId.get(g.pid).name} - ${g.flavorCn} / ${g.flavor}`, price: 0, quantity: 1, isFree: true })),
];
const toRow = o => ({
  order_number: o.no, created_at: iso(o.created), customer_name: o.form.name, customer_phone: showPhone(normPhone(o.form.phone)),
  items: itemRows(o), total: o.total, shipping_fee: o.ship, payment_method: 'whatsapp', payment_status: o.status,
  delivery_type: o.form.mode, address: addressText(o.form), delivery_time: o.form.mode === 'delivery' ? o.form.slot : '',
  member_id: o.member, earn: o.earn, gifts: o.gifts, gift_held: !!(o.member && o.gifts.length), form: { ...o.form, ...(o.leak ? { ackLeak: true } : {}) }, coupon: o.form.coupon || null,
  tg_text: o.tgText,
});
// a row back to the order object; works for old-site rows too (no form / earn → rebuilt from items)
export function fromRow(r) {
  if (!r) return null;
  const items = Array.isArray(r.items) ? r.items : [];
  const lines = items.filter(i => !i.isFree).map(i => {
    const pid = +(i.productId ?? String(i.id).split('-')[0]);
    const flavor = i.flavor ?? String(i.id).split('-').slice(1).join('-');
    const f = byId.get(pid)?.flavors.find(x => x.name === flavor);
    return { pid, flavor, flavorCn: f?.nameCn || flavor, name: byId.get(pid) ? shortName(byId.get(pid)) : i.name, qty: +i.quantity || 1, price: +i.price || 0, amount: (+i.price || 0) * (+i.quantity || 1) };
  });
  // stock moves for every item row, free ones included, exactly like the old site's update-order did
  const stock = items.map(i => ({
    pid: +(i.productId ?? (i.isFree ? String(i.id).split('-')[1] : String(i.id).split('-')[0])),
    flavor: (i.flavor ?? (i.isFree ? String(i.id).split('-').slice(2, -1).join('-') : String(i.id).split('-').slice(1).join('-'))) || 'default',
    qty: +i.quantity || 1,
  })).filter(x => Number.isInteger(x.pid));
  const form = r.form || { name: r.customer_name, phone: r.customer_phone, mode: r.delivery_type || 'pickup', slot: r.delivery_time, street: r.address || '', country: 'ES' };
  return {
    id: r.id, no: r.order_number, created: ms(r.created_at), status: r.payment_status, member: r.member_id || null,
    lines, stock, gifts: r.gifts || [], earn: r.earn || {}, form, total: +r.total, ship: +r.shipping_fee || 0,
    stamped: !!r.stamped, giftHeld: !!r.gift_held, tgText: r.tg_text || null, tgMessage: r.tg_message || null, decided: ms(r.decided_at),
  };
}
export async function insertOrder(o) { await db('orders', { method: 'POST', body: toRow(o), prefer: 'return=minimal' }); }
export async function getOrder(no) {
  return fromRow((await db(`orders?order_number=${eq(no)}&select=*`))[0]);
}
export async function getOrderById(id) {
  return fromRow((await db(`orders?id=${eq(id)}&select=*`))[0]);
}
export async function memberOrders(id, limit = 5) {
  return (await db(`orders?member_id=${eq(id)}&select=*&order=created_at.desc&limit=${limit}`)).map(fromRow);
}
export const setOrderFields = (no, fields) => db(`orders?order_number=${eq(no)}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
// flip a flag only if it still has the old value; true when this call won
async function claim(no, field, from, to) {
  const rows = await db(`orders?order_number=${eq(no)}&${field}=${eq(from)}`, { method: 'PATCH', body: { [field]: to }, prefer: 'return=representation' });
  return rows.length > 0;
}

// Move an order to another status, from Telegram or the admin page. The status flip is conditional on the
// old value, so a double tap or two people at once can't run the side effects twice. Then:
//   into paid/shipped/delivered → stamps go on the member's cards (once) and stock comes off;
//   back out of those           → stock goes back;
//   cancelled                   → earned stamps come off again, a gift's 10 stamps go back on the card.
// Returns { order, changed, user } or { changed: false } when someone else got there first.
export async function setStatus(o, next) {
  const prev = o.status;
  if (prev === next) return { order: o, changed: false };
  if (!(await claim(o.no, 'payment_status', prev, next))) return { changed: false };
  await setOrderFields(o.no, { decided_at: iso(Date.now()) });
  o.status = next;
  let user = null;
  if (CONSUMING.has(next) && !CONSUMING.has(prev)) await moveStock('decrement_stock', o.stock);
  if (!CONSUMING.has(next) && CONSUMING.has(prev)) await moveStock('increment_stock', o.stock);
  if (o.member) {
    const earn = Object.fromEntries(Object.entries(o.earn).filter(([, n]) => n > 0));
    if (CONSUMING.has(next) && Object.keys(earn).length && await claim(o.no, 'stamped', false, true)) {
      o.stamped = true;
      await addStamps(o.member, earn);
    }
    // un-cancelled from the admin page: the gift is back on, so its stamps come off the card again
    if (prev === 'cancelled' && o.gifts.length && await claim(o.no, 'gift_held', false, true)) {
      o.giftHeld = true;
      await addStamps(o.member, Object.fromEntries(o.gifts.map(g => [g.pid, -STAMPS_PER_REWARD])));
    }
    if (next === 'cancelled') {
      if (await claim(o.no, 'stamped', true, false)) {
        o.stamped = false;
        await addStamps(o.member, Object.fromEntries(Object.entries(earn).map(([k, n]) => [k, -n])));
      }
      if (o.gifts.length && await claim(o.no, 'gift_held', true, false)) {
        o.giftHeld = false;
        await addStamps(o.member, Object.fromEntries(o.gifts.map(g => [g.pid, STAMPS_PER_REWARD])));
      }
    }
    user = await getMember(o.member);
  }
  return { order: o, changed: true, user, prev };
}

// ---------- Telegram (the old site's TELEGRAM_* variables work too) ----------
export const tgToken = () => process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
export const tgChat = () => process.env.TG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
export let tgLastError = null;
export async function tg(method, payload) {
  const token = tgToken();
  if (!token) { console.log('[tg skipped]', method, JSON.stringify(payload).slice(0, 300)); tgLastError = 'no bot token in this deploy'; return null; }
  tgLastError = null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) { console.error('[tg]', method, data.description); tgLastError = `${method}: ${data.description || res.status}`; }
  return data.result ?? (data.ok ? true : null);
}
export const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function orderText(o) {
  const f = o.form;
  const where = f.mode === 'pickup' ? '自取 · Metro El Capricho'
    : f.mode === 'delivery' ? `外送 · ${f.slot}\n📍 ${f.street}`
    : `邮寄${f.country === 'EU' ? '（欧盟，运费待确认）' : ''}\n📍 ${f.recipient}, ${f.street} ${f.floor}, ${f.cp} ${f.city}, ${f.province}`;
  const stampLine = o.member
    ? `集章（确认后盖）：${Object.entries(o.earn).map(([pid, n]) => `${shortName(byId.get(+pid))} +${n}`).join(' · ')}`
    : '游客下单，不集章';
  const phone = normPhone(f.phone);
  return [
    `🧾 <b>新订单 ${o.no}</b>`,
    `👤 ${esc(f.name)} · ${phone ? showPhone(phone) : esc(f.phone)}${o.member ? ' · 会员' : ''}`,
    `📦 ${esc(where)}`,
    '',
    ...o.lines.map(l => `${esc(l.name)} · ${esc(l.flavorCn)} × ${l.qty}   ${euro(l.amount)}`),
    ...o.gifts.map(g => `🎁 赠品 ${esc(g.name)} · ${esc(g.flavorCn)} × 1   €0.00（集章）`),
    o.ship ? `运费 ${euro(o.ship)}` : '',
    `<b>应付 ${euro(o.total)}</b>`,
    f.coupon ? `优惠码：${esc(f.coupon)}` : '',
    o.leak ? '⚠️ 含 IceMax 清仓款：顾客已勾选确认知晓「少量漏油」' : '',
    '',
    stampLine,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
export const waButton = o => ({ text: '💬 WhatsApp 联系顾客', url: `https://wa.me/${normPhone(o.form.phone) || ''}` });
export const pendingKeyboard = o => ({ inline_keyboard: [
  [{ text: o.member ? '✅ 确认订单（盖章）' : '✅ 确认订单', callback_data: `ok:${o.no}` }, { text: '❌ 取消', callback_data: `no?:${o.no}` }],
  [waButton(o)],
] });
const madridNow = () => new Date().toLocaleString('zh-CN', { timeZone: 'Europe/Madrid', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// the line under an order's Telegram message after its status changed
export function statusLine(o, user, by = '') {
  const when = `${madridNow()}${by ? ' · ' + by : ''}`;
  if (CONSUMING.has(o.status)) {
    const head = `${STATUS_CN[o.status]} · ${when}`;
    if (!o.member) return head;
    if (!user) return `${head}\n（会员账户已删除，没有盖章）`;
    const parts = Object.keys(o.earn).map(pid => {
      const n = user.stamps[pid] || 0;
      return `${shortName(byId.get(+pid))} +${o.earn[pid]}（现在 ${Math.min(n, STAMPS_PER_REWARD)}/10${n >= STAMPS_PER_REWARD ? '，下单可领赠品' : ''}）`;
    });
    return `${head}\n已盖章：${parts.join(' · ')}`;
  }
  if (o.status === 'cancelled') return `${STATUS_CN.cancelled} · ${when}${o.member && user ? '\n这单的章已撤回' + (o.gifts.length ? '，赠品用掉的章已退回会员卡' : '') : ''}`;
  return `${STATUS_CN.pending} · ${when}`;
}
// keep the order's Telegram message in step when the status changes somewhere else (admin page)
export async function syncTelegram(o, user, by) {
  if (!o.tgMessage || !o.tgText || !tgChat()) return;
  await tg('editMessageText', {
    chat_id: tgChat(), message_id: o.tgMessage, parse_mode: 'HTML',
    text: o.status === 'pending' ? o.tgText : `${o.tgText}\n\n${statusLine(o, user, by)}`,
    reply_markup: o.status === 'pending' ? pendingKeyboard(o) : { inline_keyboard: [[waButton(o)]] },
  });
}
