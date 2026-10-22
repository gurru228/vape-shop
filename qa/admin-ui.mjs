// Back-office screens on desktop and phone: login, orders (with a member order, a delivery, an IceMax order),
// inventory, members, stats. Screenshots in qa/adm-*.png; any page error is reported.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const api = async (path, body, token) => (await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const reg = await api('api/register', { account: '612000555', name: '小林', password: 'secret1', adult: true });
await fetch(url + 'api/admin/stamp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-test', id: '34612000555', pid: 1, n: 10 }) });
await api('api/order', { items: [{ pid: 1, flavor: 'Lemon Tea', qty: 2 }, { pid: 6, flavor: 'Mojito', qty: 1 }], form: { name: '小林', phone: '612000555' }, gifts: { 1: 'Lemon Tea' } }, reg.token);
await api('api/order', { items: [{ pid: 2, flavor: 'Fresh Lemon', qty: 3 }, { pid: 5, flavor: 'Peach Tea', qty: 2 }], form: { name: 'Marta', phone: '655111222', mode: 'delivery', street: 'Calle Alcalá 120, 3ºB', slot: '18:00–21:00', ackLeak: true } });
await api('api/order', { items: [{ pid: 4, flavor: 'Green Tea', qty: 1 }], form: { name: '阿强', phone: '+44 7700 900123', mode: 'postal', recipient: 'Qiang Li', street: 'Calle Mayor 5', cp: '28013', city: 'Madrid', province: 'Madrid', coupon: 'AMIGO5' } });
const errs = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [n, o] of [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const p = await b.newPage(o);
  p.on('pageerror', e => errs.push(`${n}: ${e.message}`));
  p.on('dialog', d => d.accept());
  await p.goto(url + 'admin.html'); await p.waitForTimeout(800);
  await p.screenshot({ path: `qa/adm-${n}-login.png` });
  await p.fill('#admin-password-input', 'wrong'); await p.click('.login-btn'); await p.waitForTimeout(1800);
  console.log(n, 'wrong password:', await p.textContent('#login-error'));
  await p.fill('#admin-password-input', 'admin-test'); await p.click('.login-btn'); await p.waitForSelector('.order-card', { timeout: 8000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `qa/adm-${n}-orders.png`, fullPage: n === 'd' });
  if (n === 'm') { await p.evaluate(() => scrollTo(0, 500)); await p.screenshot({ path: 'qa/adm-m-orders2.png' }); await p.evaluate(() => scrollTo(0, 0)); }
  console.log(n, 'cards:', await p.locator('.order-card').count(), '| pending tile:', await p.textContent('#stat-pending'), '| title:', await p.title());
  // one-tap confirm
  await p.locator('.order-card').first().locator('[data-act=next]').click(); await p.waitForTimeout(1500);
  console.log(n, 'after confirm toast:', await p.textContent('#admin-toast'));
  await p.click('#tab-inventory'); await p.waitForSelector('.inv-row'); await p.waitForTimeout(300);
  await p.locator('.inv-row [data-so]').nth(2).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `qa/adm-${n}-inventory.png` });
  console.log(n, 'savebar:', await p.textContent('#saveText'));
  await p.click('#invSave'); await p.waitForTimeout(1200);
  console.log(n, 'saved:', await p.textContent('#admin-toast'));
  await p.click('#tab-users'); await p.waitForSelector('.mem'); await p.waitForTimeout(300);
  await p.screenshot({ path: `qa/adm-${n}-members.png` });
  await p.click('#tab-stats'); await p.waitForTimeout(800);
  await p.screenshot({ path: `qa/adm-${n}-stats.png`, fullPage: true });
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 0) errs.push(`${n}: page ${wide}px too wide`);
  // reload keeps you signed in (this tab only)
  await p.reload(); await p.waitForSelector('.order-card', { timeout: 8000 }).catch(() => errs.push(n + ': not signed in after reload'));
  await p.close();
}
await b.close();
console.log('errors:', errs.length ? errs : 'none');
