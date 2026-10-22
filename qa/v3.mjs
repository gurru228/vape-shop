// v3 additions against qa/run.sh (port 8899): sold-out flavors on the storefront, the admin page on the shared
// orders table (old + new orders, status change stamps the member and moves stock, cancel takes the stamps back,
// members tab +/−), and an old-site Supabase Auth account signing in.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const errs = [];
const txt = async (page, sel) => ((await page.locator(sel).first().textContent()) || '').replace(/\s+/g, ' ').trim();
const api = async (path, body, token) => (await fetch(url + path, {
  method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body && JSON.stringify(body),
})).json();
const stockOf = async (pid, name) => (await (await fetch(url + '.netlify/functions/get-inventory')).json()).find(r => r.product_id === pid && r.flavor_name === name)?.stock;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const watch = (page, tag) => {
  page.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
  page.on('console', m => m.type() === 'error' && !/401|404/.test(m.text()) && errs.push(`[${tag}] ${m.text()}`));
};

// ---------- storefront: Mineral Water (Dash) is at stock 0 in qa/schema-base.sql ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page, 'shop');
  await page.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 50); setTimeout(() => clearInterval(t), 30000); });
  await page.goto(url); await page.waitForTimeout(2500);
  await page.locator('#heroChips .chip.more').click(); await page.waitForTimeout(800);
  const out = page.locator('#dFlavors .flv.out');
  console.log('drawer sold-out tiles:', await out.count(), '|', await txt(page, '#dFlavors .flv.out span'));
  await out.first().click(); await page.waitForTimeout(300);
  console.log('add button on sold-out:', await txt(page, '#dAdd'), '| disabled:', await page.locator('#dAdd').isDisabled());
  await page.locator('#dFlavors .flv:not(.out)').first().click(); await page.waitForTimeout(300);
  console.log('add button back:', await txt(page, '#dAdd'), '| disabled:', await page.locator('#dAdd').isDisabled());
  await page.locator('#dFlavors .flv.out').first().scrollIntoViewIfNeeded();
  await page.locator('#drawer').screenshot({ path: 'qa/v3-soldout.png' });
  // a stale cart (added before the flavor ran out) is caught at checkout
  await page.evaluate(() => localStorage.setItem('vs3d-cart', JSON.stringify([{ pid: 1, flavor: 'Mineral Water', qty: 1 }])));
  await page.reload(); await page.waitForTimeout(2500);
  await page.locator('#cartBtn').click(); await page.waitForTimeout(600);
  console.log('cart warns:', await txt(page, '.so-line'));
  await page.locator('[data-act=next]').click(); await page.waitForTimeout(300);
  await page.locator('#f-name').fill('Ana'); await page.locator('#f-phone').fill('+34 655 000 111');
  await page.locator('[data-act=submit]').click(); await page.waitForTimeout(600);
  console.log('submit blocked:', await txt(page, '#cpErr'));
  await page.close();
}
// server refuses it as well
console.log('server refuses sold-out:', (await api('api/order', { items: [{ pid: 1, flavor: 'Mineral Water', qty: 1 }], form: { name: 'A', phone: '655000111' } })).error);

// ---------- a member order, confirmed from the admin page ----------
const reg = await api('api/register', { account: '655000222', name: '小美', password: 'secret1', adult: true });
const ord = await api('api/order', { items: [{ pid: 1, flavor: 'Lemon Tea', qty: 2 }, { pid: 6, flavor: 'Mojito', qty: 1 }], form: { name: '小美', phone: '655000222', mode: 'delivery', street: 'Calle Alcalá 1', slot: '14:00–18:00' } }, reg.token).catch(e => ({ error: String(e) }));
console.log('delivery under 5 refused:', ord.error);
const ord2 = await api('api/order', { items: [{ pid: 1, flavor: 'Lemon Tea', qty: 2 }, { pid: 6, flavor: 'Mojito', qty: 1 }], form: { name: '小美', phone: '655000222', coupon: 'AMIGO5' } }, reg.token);
console.log('member order:', ord2.no, '| stock before: Lemon Tea', await stockOf(1, 'Lemon Tea'), 'Mojito', await stockOf(6, 'Mojito'));

// a customer-typed name with markup must show as text on the admin page
const evil = await api('api/order', { items: [{ pid: 3, flavor: 'Longan', qty: 1 }], form: { name: '<img src=x onerror=window.__x=1>Eve', phone: '655000333', coupon: '<b>X</b>' } });
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
watch(admin, 'admin');
admin.on('dialog', d => d.accept());
await admin.goto(url + 'admin.html');
await admin.locator('#admin-password-input').fill('admin-test');
await admin.locator('.login-btn').click(); await admin.waitForTimeout(1500);
await admin.locator('.date-tab[data-range=history]').click(); await admin.waitForTimeout(300);
console.log('history (old site orders):', await admin.locator('.order-card').count(), '|', await txt(admin, '.order-card .badge-card'));
await admin.locator('.date-tab[data-range=today]').click(); await admin.waitForTimeout(300);
const card = admin.locator('.order-card', { hasText: ord2.no });
console.log('new order on admin:', await card.count(), '| status:', await txt(admin, `.order-card:has-text("${ord2.no}") .badge`), '|', await txt(admin, `.order-card:has-text("${ord2.no}") .badge-member`));
console.log('coupon shown:', await txt(admin, `.order-card:has-text("${ord2.no}") .order-items-wrap + .order-info-row`));
console.log('markup escaped:', await txt(admin, `.order-card:has-text("${evil.no}") .order-customer-row strong`), '| injected:', await admin.evaluate(() => !!window.__x || !!document.querySelector('.order-card img')));
console.log('status chips:', (await admin.locator('.chip[data-group=status]').allTextContents()).map(s => s.trim()).join(' / '));
console.log('payment filter gone:', !(await admin.locator('.chip[data-group=payment]').count()));
await admin.screenshot({ path: 'qa/v3-admin-orders.png' });

await card.locator('.status-select').selectOption('paid'); await admin.waitForTimeout(1500);
let me = await api('api/me', null, reg.token);
console.log('after 已确认: stamps', JSON.stringify(me.user.stamps), '| my order:', me.orders[0].status, '| stock: Lemon Tea', await stockOf(1, 'Lemon Tea'), 'Mojito', await stockOf(6, 'Mojito'));
console.log('toast:', await txt(admin, '#admin-toast'));
console.log('badge now:', await txt(admin, `.order-card:has-text("${ord2.no}") .badge-member`));
await card.locator('.status-select').selectOption('shipped'); await admin.waitForTimeout(1200);
me = await api('api/me', null, reg.token);
console.log('after 已发货: stamps', JSON.stringify(me.user.stamps), '(no double stamp) | stock Lemon Tea', await stockOf(1, 'Lemon Tea'));
// Telegram ✅ on an order the admin already confirmed does nothing
const tg = await fetch(url + 'api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'local-test-secret' }, body: JSON.stringify({ callback_query: { id: '1', data: `ok:${ord2.no}`, message: { message_id: 1, chat: { id: 999 } } } }) });
me = await api('api/me', null, reg.token);
console.log('telegram ✅ after admin:', tg.status, '| stamps', JSON.stringify(me.user.stamps));
await card.locator('.status-select').selectOption('cancelled'); await admin.waitForTimeout(1500);
me = await api('api/me', null, reg.token);
console.log('after 已取消: stamps', JSON.stringify(me.user.stamps), '| my order:', me.orders[0].status, '| stock back: Lemon Tea', await stockOf(1, 'Lemon Tea'), 'Mojito', await stockOf(6, 'Mojito'));

// ---------- members tab ----------
await admin.locator('#tab-users').click(); await admin.waitForTimeout(1500);
console.log('members label:', await txt(admin, '#users-count-label'));
await admin.locator('#member-search').fill('655000222'); await admin.waitForTimeout(200);
const row = () => admin.locator('#users-container .mem').first().locator('.mem-line').first();
for (let i = 0; i < 3; i++) { await row().locator('.stamp-btn').nth(1).click(); await admin.waitForTimeout(500); }
await row().locator('.stamp-btn').nth(0).click(); await admin.waitForTimeout(600);
me = await api('api/me', null, reg.token);
console.log('admin +3 −1 on 鸭嘴兽:', JSON.stringify(me.user.stamps), '| row:', await txt(admin, '#users-container .mem .mem-line output'));
await admin.locator('#member-search').fill('');
await admin.locator('#legacy-users summary').click(); await admin.waitForTimeout(800);
await admin.screenshot({ path: 'qa/v3-admin-members.png', fullPage: true });

// ---------- inventory tab: product list from products.json, 0 shows on the site ----------
await admin.locator('#tab-inventory').click(); await admin.waitForTimeout(1500);
console.log('inventory products:', await admin.locator('.inv-product').count(), '| dash flavors:', await admin.locator('.inv-product').first().locator('.inv-row').count());
await admin.locator('.inv-stock-input[data-pid="3"][data-fname="Mango"]').fill('0');
await admin.locator('#invSave').click(); await admin.waitForTimeout(1200);
console.log('stock api now:', JSON.stringify((await (await fetch(url + 'api/stock')).json()).out));
await admin.screenshot({ path: 'qa/v3-admin-inventory.png' });
await admin.close();

// ---------- old-site account (Supabase Auth) ----------
const bad = await api('api/login', { account: 'old@example.com', password: 'nope' });
const old = await api('api/login', { account: 'Old@Example.com', password: 'oldpass1' });
const again = await api('api/login', { account: 'old@example.com', password: 'oldpass1' });
console.log('old account: wrong pw →', bad.error, '| first login moved:', !!old.moved, '| old orders:', old.orders?.map(o => o.no + ':' + o.status).join(','), '| second login local:', !!again.token && !again.moved);

await browser.close();
console.log('errors:', errs.length ? errs : 'none');
