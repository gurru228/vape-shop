// The 复购 tab of admin.html against the local database, desktop and phone:
//   about 250 made-up orders (site/src/retention-demo.js) are written straight into the local tables, then every
//   sub-tab, the customer panel, CSV export, and follow-ups (真实原因 / 备注 / 已联系) saved and read back.
// With SKIP_MIGRATION=followups (customer_followups not created, like production before the migration ran):
//   the analysis still shows, saving is switched off with a notice, the endpoints answer cleanly.
// Checks: no page errors, no sideways scroll, the only write is POST /api/admin/followup, outside requests only to Google.
//   sh qa/run.sh node qa/repeat.mjs
//   SKIP_MIGRATION=followups sh qa/run.sh node qa/repeat.mjs
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from './pw.mjs';
const require = createRequire(import.meta.url);
const { rtDemo } = require('../site/src/retention-demo.js');
const products = require('../site/src/products.json');

const url = process.env.QA_URL || 'http://localhost:8899/';
const missing = /followup/.test(process.env.SKIP_MIGRATION || '');
const tag = missing ? 'nofu' : 'fu';
const PW = 'admin-test';
const errs = [];
const check = (ok, msg) => { if (!ok) errs.push(msg); };

// ---------- seed ----------
const rest = (path, body) => fetch('http://127.0.0.1:54321/rest/v1/' + path, { method: 'POST', headers: { apikey: process.env.SERVICE_JWT, authorization: 'Bearer ' + process.env.SERVICE_JWT, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(body) });
const demo = rtDemo(products, Date.now());
let r = await rest('members', demo.members.map(m => ({ id: m.id, phone: m.phone, email: null, name: m.name, salt: 'x', hash: 'x', created_at: new Date(m.created).toISOString() })));
check(r.ok, 'seed members: ' + r.status + ' ' + (await r.text()));
r = await rest('orders', demo.orders.map(({ id, ...o }) => o));
check(r.ok, 'seed orders: ' + r.status + ' ' + (await r.text()));
console.log('seeded', demo.orders.length, 'orders,', demo.members.length, 'members');

// ---------- endpoints ----------
const get = async p => { const x = await fetch(url + p); return { status: x.status, body: await x.json().catch(() => null) }; };
const post = async (p, b) => { const x = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: x.status, body: await x.json().catch(() => null) }; };
let x = await get('api/admin/followups?password=wrong');
check(x.status === 401, 'followups without the password: ' + x.status);
x = await get(`api/admin/followups?password=${PW}`);
console.log('GET followups:', x.status, JSON.stringify(x.body).slice(0, 140));
check(x.status === 200 && x.body.ready === !missing, 'followups ready flag');
x = await post('api/admin/followup', { password: PW, key: 'bad key', reason: 'x' });
check(x.status === 400, 'bad key accepted: ' + x.status);
x = await post('api/admin/followup', { password: PW, key: 'p:34600000001', note: 'z'.repeat(501) });
check(x.status === (missing ? 400 : 400), 'over-long note accepted: ' + x.status);
x = await post('api/admin/followup', { password: PW, key: 'p:34600000001', reason: '价格贵' });
console.log('POST followup:', x.status, x.body?.error || JSON.stringify(x.body?.followup));
check(x.status === (missing ? 503 : 200), 'POST followup status ' + x.status);
if (!missing) {
  // fields left out stay as they were
  await post('api/admin/followup', { password: PW, key: 'p:34600000001', note: '先记一个备注' });
  x = await post('api/admin/followup', { password: PW, key: 'p:34600000001', contacted: 'now' });
  check(x.body.followup.reason === '价格贵' && x.body.followup.note === '先记一个备注' && x.body.followup.contactedAt, 'partial update lost a field: ' + JSON.stringify(x.body.followup));
  x = await post('api/admin/followup', { password: PW, key: 'p:34600000001', contacted: 'clear', reason: '' });
  check(!x.body.followup.contactedAt && !x.body.followup.reason && x.body.followup.note, 'clear: ' + JSON.stringify(x.body.followup));
}
// the anon key (what a browser could hold) can't read the table
const anon = await fetch('http://127.0.0.1:3001/customer_followups?select=*');
console.log('anon read:', anon.status, (await anon.text()).slice(0, 80));
check(anon.status >= 400, 'anon could read customer_followups');

// ---------- browser ----------
const hosts = new Set();
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [n, o] of [['d', { viewport: { width: 1440, height: 900 }, acceptDownloads: true }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true }]]) {
  const p = await b.newPage(o);
  const writes = [];
  p.on('pageerror', e => errs.push(`${n}: ${e.message}`));
  p.on('request', q => { const u = new URL(q.url()); if (u.hostname !== 'localhost') hosts.add(u.hostname); else if (q.method() !== 'GET') writes.push(`${q.method()} ${u.pathname}`); });
  p.on('response', q => { const u = new URL(q.url()); if (q.status() >= 400 && u.pathname !== '/favicon.ico' && !(missing && q.status() === 503)) errs.push(`${n}: HTTP ${q.status()} ${u.pathname}`); });
  p.on('dialog', d => d.accept());
  const wide = async where => { const w = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 0) errs.push(`${n} ${where}: ${w}px too wide`); };
  const quiet = () => p.evaluate(() => { const t = document.getElementById('admin-toast'); if (t) t.hidden = true; });
  const shot = async (name, full = n === 'd') => { await quiet(); await p.screenshot({ path: `qa/rp-${tag}-${n}-${name}.png`, fullPage: full }); };
  // admin.html's CSP has no 'unsafe-eval', so poll with evaluate instead of waitForFunction
  const until = async (fn, arg, ms = 15000) => { const t = Date.now() + ms; while (!(await p.evaluate(fn, arg))) { if (Date.now() > t) throw new Error('timed out: ' + fn); await p.waitForTimeout(150); } };
  const sub = async s => { await p.click(`#rpTabs [data-rp=${s}]`); await p.waitForTimeout(350); await wide(s); };

  await p.goto(url + 'admin.html');
  await p.fill('#admin-password-input', PW); await p.click('.login-btn');
  await p.waitForSelector('.order-card', { timeout: 10000 });
  await p.click('#tab-repeat');
  await until(() => ['rpChGap', 'rpChWin', 'rpChStatus', 'rpChSeg', 'rpChCohort'].every(id => document.getElementById(id)?.dataset.engine));
  await p.waitForTimeout(700);
  const engine = await p.getAttribute('#rpChGap', 'data-engine');
  check(engine === 'google', `${n}: charts are ${engine}`);
  const setup = await p.isVisible('#rpSetup');
  check(setup === missing, `${n}: setup notice ${setup ? 'shown' : 'hidden'}`);
  console.log(n, 'charts:', engine, '| notice:', setup ? await p.textContent('#rpSetup') : 'none');
  console.log(n, 'tiles:', (await p.locator('#rpOverview .tile b').allTextContents()).join(' | '));
  await wide('overview');
  await shot('overview');

  await sub('customers');
  const rows = await p.locator('#rpTable tbody tr').count();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#rpCustCsv')]);
  const text = await readFile(await dl.path(), 'utf8');
  check(text.startsWith('\uFEFF顾客,电话,WhatsApp') && text.split('\r\n').length === rows + 1, `${n}: customers CSV`);
  console.log(n, 'customers:', rows, '| csv rows:', text.split('\r\n').length - 1);
  await shot('customers', false);
  await p.locator('#rpTable tbody tr').first().click(); await p.waitForSelector('#rpDrawer:not([hidden])'); await p.waitForTimeout(200);
  await shot('customer', false);
  await p.click('#rpDrawer [data-close]');

  await sub('near');
  console.log(n, 'near:', await p.locator('#rpNear .rp-person').count());
  await shot('near', false);

  await sub('once');
  const card = p.locator('#rpOnce .rp-person').first(), key = await card.getAttribute('data-key');
  const disabled = await card.locator('[data-fu-reason]').isDisabled();
  check(disabled === missing, `${n}: reason select ${disabled ? 'disabled' : 'enabled'}`);
  if (!missing) {
    await card.locator('[data-fu-reason]').selectOption('在别家买了'); await p.waitForTimeout(500);
    await card.locator('[data-fu-note]').fill(`WhatsApp 问过（${n}）：朋友那里便宜`); await card.locator('[data-fu-note]').press('Tab'); await p.waitForTimeout(500);
    await p.locator(`#rpOnce [data-key="${key}"] [data-fu-contacted]`).click(); await p.waitForTimeout(700);
    console.log(n, 'saved:', await p.textContent('#admin-toast'), '|', await p.locator(`#rpOnce [data-key="${key}"] .rp-contacted`).textContent().catch(() => 'no contacted label'));
    const saved = (await get(`api/admin/followups?password=${PW}`)).body.followups.find(f => f.key === key);
    check(saved?.reason === '在别家买了' && saved?.note?.includes(n) && saved?.contactedAt, `${n}: follow-up not stored: ${JSON.stringify(saved)}`);
    // a background refresh while typing doesn't wipe the field
    await p.locator(`#rpOnce [data-key="${key}"] [data-fu-note]`).fill('正在打字');
    await p.evaluate(() => loadOrders());
    await p.waitForTimeout(600);
    check(await p.locator(`#rpOnce [data-key="${key}"] [data-fu-note]`).inputValue() === '正在打字', `${n}: typing was wiped by the refresh`);
    await p.locator(`#rpOnce [data-key="${key}"] [data-fu-note]`).fill(`WhatsApp 问过（${n}）：朋友那里便宜`);
    await p.locator(`#rpOnce [data-key="${key}"] [data-fu-note]`).press('Tab'); await p.waitForTimeout(400);
  }
  for (const k of ['notDue', 'never']) { await p.click(`#rpOnceTabs [data-once=${k}]`); await p.waitForTimeout(120); }
  await p.click('#rpOnceTabs [data-once=due]'); await p.waitForTimeout(150);
  await shot('once', false);

  await sub('reasons');
  await until(() => document.getElementById('rpChAll')?.dataset.engine);
  await p.waitForTimeout(700);
  await shot('reasons');

  await sub('params');
  const before = await p.textContent('#rpOnceN');
  await p.fill('[data-puffs="1"]', '8000'); await p.locator('[data-puffs="1"]').dispatchEvent('change'); await p.waitForTimeout(200);
  console.log(n, 'params: 未复购', before, '→', await p.textContent('#rpOnceN'));
  await shot('params');
  await p.click('#rpReset'); await p.waitForTimeout(150);

  // after a reload the saved follow-up is back
  if (!missing) {
    await p.reload(); await p.waitForSelector('.order-card', { timeout: 10000 });
    await p.click('#tab-repeat'); await p.waitForTimeout(800); await sub('once');
    const v = await p.locator(`#rpOnce [data-key="${key}"] [data-fu-reason]`).inputValue();
    check(v === '在别家买了', `${n}: reason after reload: ${v}`);
    console.log(n, 'after reload:', v);
  }
  // the rest of the back office still works
  for (const t of ['orders', 'inventory', 'users', 'stats']) { await p.click('#tab-' + t); await p.waitForTimeout(700); await wide(t); }
  check(await p.locator('.inv-row').count() > 0 && await p.locator('.mem').count() > 0, `${n}: inventory / members empty`);
  if (n === 'm') await shot('nav', false);
  const bad = writes.filter(w => w !== 'POST /api/admin/followup');
  check(!bad.length, `${n}: unexpected writes ${bad.join(', ')}`);
  console.log(n, 'writes:', writes.length ? [...new Set(writes)].join(', ') : 'none');
  await p.close();
}
await b.close();
const outside = [...hosts].filter(h => !/^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/.test(h));
check(!outside.length, 'requests outside Google: ' + outside.join(', '));
console.log('outside hosts:', [...hosts].join(', ') || 'none');
console.log('errors:', errs.length ? errs : 'none');
process.exit(errs.length ? 1 : 0);
