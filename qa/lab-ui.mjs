// admin-lab.html (read-only repeat-purchase test page) in a real browser, desktop and phone:
//   假数据 → every tab, customer drawer, manual reason, params, CSV download
//   导入   → an orders.json + members.json + an orders CSV like Supabase's Table Editor export
//   在线   → a stub of get-orders / members / stock (wrong password refused)
// Checks: no page errors, no sideways scroll, only GET requests to this site, outside requests only to Google.
// Screenshots: qa/lab-*.png. Needs no database:  node qa/lab-ui.mjs   (CHROME=/path/to/chrome if Playwright has none)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from './pw.mjs';
const require = createRequire(import.meta.url);
const { rtDemo } = require('../site/src/retention-demo.js');
const products = require('../site/src/products.json');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const live = rtDemo(products, Date.now(), 7);
const writes = [];
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method !== 'GET' && req.method !== 'HEAD') writes.push(`${req.method} ${u.pathname}`);
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  if (u.pathname === '/.netlify/functions/get-orders') return u.searchParams.get('password') === 'admin-test' ? send(200, live.orders) : send(401, { error: 'Unauthorized' });
  if (u.pathname === '/api/admin/members') return u.searchParams.get('password') === 'admin-test' ? send(200, { members: live.members }) : send(401, { error: 'Unauthorized' });
  if (u.pathname === '/api/stock') return send(200, { out: live.soldOut });
  const file = path.join(root, decodeURIComponent(u.pathname));
  if (!file.startsWith(root)) return send(403, 'no', 'text/plain');
  try { send(200, await readFile(file), file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); } catch (e) { send(404, 'not found', 'text/plain'); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/admin-lab.html`;

// import fixtures: JSON as get-orders / members return it, and a CSV shaped like Supabase's Table Editor export
const imp = rtDemo(products, Date.now(), 99);
const csvCell = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = Object.keys(imp.orders[0]);
const half = Math.floor(imp.orders.length / 2);
const csv = [cols.join(','), ...imp.orders.slice(half).map(o => cols.map(k => csvCell(o[k])).join(','))].join('\n');
const files = [
  { name: 'orders.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imp.orders.slice(0, half + 5))) },
  { name: 'orders.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
  { name: 'members.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ members: imp.members })) },
];

const errs = [], hosts = new Set();
const ALLOWED = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/;
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
for (const [n, o] of [['d', { viewport: { width: 1440, height: 900 }, acceptDownloads: true }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true }]]) {
  const p = await b.newPage(o);
  p.on('pageerror', e => errs.push(`${n}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(`${n} console: ${m.text()}`); });
  // 401 is the wrong-password check below; the browser asks for /favicon.ico by itself
  p.on('response', r => { const u = new URL(r.url()); if (r.status() >= 400 && r.status() !== 401 && u.pathname !== '/favicon.ico') errs.push(`${n}: HTTP ${r.status()} ${u.pathname}`); });
  p.on('request', r => { const h = new URL(r.url()).hostname; if (h !== '127.0.0.1') hosts.add(h); });
  const wide = async where => { const w = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (w > 0) errs.push(`${n} ${where}: ${w}px too wide`); };
  const quiet = () => p.evaluate(() => { document.getElementById('toast').hidden = true; });
  const tab = async (t, shot, full = n === 'd') => { await p.click(`#tabs [data-tab=${t}]`); await p.waitForTimeout(400); await wide(t); await quiet(); if (shot) await p.screenshot({ path: `qa/lab-${n}-${shot}.png`, fullPage: full }); };

  await p.goto(url); await p.waitForTimeout(600);
  await p.screenshot({ path: `qa/lab-${n}-pick.png`, fullPage: true });
  await wide('pick');

  // 假数据
  await p.click('#useDemo');
  await p.waitForFunction(() => ['chGap', 'chWin', 'chStatus', 'chSeg', 'chCohort'].every(id => document.getElementById(id)?.dataset.engine), null, { timeout: 15000 });
  await p.waitForTimeout(800);
  const engine = await p.getAttribute('#chGap', 'data-engine');
  console.log(n, 'charts:', engine, '| source:', await p.textContent('#srcText'));
  if (engine !== 'google') errs.push(`${n}: Google Charts did not load (fallback bars shown)`);
  await wide('overview');
  await p.screenshot({ path: `qa/lab-${n}-overview.png`, fullPage: n === 'd' });
  console.log(n, 'tiles:', (await p.locator('#overview .tile b').allTextContents()).join(' | '));

  await tab('customers', 'customers', false);
  const rows = await p.locator('#custTable tbody tr').count();
  await p.click('#custStatus [data-st=lost]'); await p.waitForTimeout(200);
  console.log(n, 'customers:', rows, '| lost filter:', await p.locator('#custTable tbody tr').count());
  await p.click('#custStatus [data-st=all]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#custCsv')]);
  const text = await readFile(await dl.path(), 'utf8');
  if (!text.startsWith('\uFEFF顾客,电话,WhatsApp')) errs.push(`${n}: customers CSV header wrong`);
  if (text.split('\r\n').length !== rows + 1) errs.push(`${n}: customers CSV has ${text.split('\r\n').length - 1} rows, table ${rows}`);
  if (/(^|,)'?\+34/m.test(text)) errs.push(`${n}: CSV phone starts with + (Sheets would read a formula)`);
  console.log(n, 'csv:', dl.suggestedFilename(), text.split('\r\n').length - 1, 'rows');
  await p.locator('#custTable tbody tr.click').first().click(); await p.waitForSelector('#drawer:not([hidden])');
  await p.waitForTimeout(200);
  await quiet(); await p.screenshot({ path: `qa/lab-${n}-customer.png` });
  await p.click('#drawer [data-close]');

  await tab('near', 'near', false);
  console.log(n, 'near:', await p.locator('#nearList .person').count(), '| wa link:', (await p.locator('#nearList a.wa').first().getAttribute('href')).slice(0, 30));

  await tab('once', 'once', false);
  const firstKey = await p.locator('#onceList .person').first().getAttribute('data-key');
  await p.locator('#onceList .person').first().locator('[data-reason]').selectOption('在别家买了');
  await p.locator('#onceList .person').first().locator('[data-note]').fill('WhatsApp 问过：朋友那里便宜');
  await p.locator('#onceList .person').first().locator('[data-note]').press('Tab');
  await p.waitForTimeout(200);
  for (const k of ['notDue', 'never']) { await p.click(`#onceTabs [data-once=${k}]`); await p.waitForTimeout(150); console.log(n, 'once', k, await p.locator('#onceList .person').count()); }
  await p.click('#onceTabs [data-once=due]'); await p.waitForTimeout(150);
  console.log(n, 'once due:', await p.locator('#onceList .person').count(), '| note kept:', await p.locator(`#onceList [data-key="${firstKey}"] [data-reason]`).inputValue());

  await tab('reasons');
  await p.waitForFunction(() => document.getElementById('chManual')?.dataset.engine, null, { timeout: 10000 });
  await p.waitForTimeout(600);
  await quiet(); await p.screenshot({ path: `qa/lab-${n}-reasons.png`, fullPage: n === 'd' });
  console.log(n, 'reason rows:', await p.locator('#reasons table').first().locator('tbody tr').count());

  await tab('params');
  const before = await p.textContent('#cOnce');
  await p.fill('[data-puffs="1"]', '8000'); await p.locator('[data-puffs="1"]').dispatchEvent('change');
  await p.waitForTimeout(200);
  await p.screenshot({ path: `qa/lab-${n}-params.png`, fullPage: n === 'd' });
  console.log(n, 'params: 未复购 badge', before, '→', await p.textContent('#cOnce'), '|', await p.textContent('#toast'));
  await p.click('#resetParams'); await p.waitForTimeout(150);

  // 导入
  await p.click('#switchSrc');
  await p.setInputFiles('#fileInput', files);
  await p.waitForSelector('#dash:not([hidden])');
  await p.click('#tabs [data-tab=overview]'); await p.waitForTimeout(800);
  const src = await p.textContent('#srcText');
  console.log(n, 'import:', src);
  if (!/orders\.json/.test(src) || !/orders\.csv/.test(src) || !/members\.json/.test(src)) errs.push(`${n}: import label ${src}`);
  const custImp = await p.evaluate(() => result.metrics.customers);
  const expect = await p.evaluate(([o, m, s]) => rtAnalyze(o, m, { soldOut: s }).metrics.customers, [imp.orders, imp.members, live.soldOut]);
  if (custImp !== expect) errs.push(`${n}: imported ${custImp} customers, expected ${expect}`);
  await p.screenshot({ path: `qa/lab-${n}-import.png` });
  // a broken file is refused with a message, the current view stays
  await p.click('#switchSrc');
  await p.setInputFiles('#fileInput', [{ name: 'oops.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":') }]);
  await p.waitForTimeout(300);
  console.log(n, 'bad file:', await p.textContent('#fileErr'));

  // 在线（只读）
  await p.fill('#livePw', 'wrong'); await p.click('#liveForm button'); await p.waitForTimeout(400);
  console.log(n, 'live wrong password:', await p.textContent('#liveErr'));
  await p.fill('#livePw', 'admin-test'); await p.click('#liveForm button');
  await p.waitForSelector('#dash:not([hidden])'); await p.waitForTimeout(600);
  console.log(n, 'live:', await p.textContent('#srcText'));
  await p.close();
}
// Google unreachable: plain bars instead of charts, no errors
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errs.push(`fallback: ${e.message}`));
  await p.route(/www\.gstatic\.com/, r => r.abort());
  await p.goto(url); await p.click('#useDemo');
  await p.waitForFunction(() => document.getElementById('chGap')?.dataset.engine, null, { timeout: 15000 });
  const e = await p.getAttribute('#chGap', 'data-engine');
  console.log('without Google Charts:', e);
  if (e !== 'fallback') errs.push('fallback bars not shown when Google Charts is blocked');
  await p.screenshot({ path: 'qa/lab-d-fallback.png' });
  await p.close();
}
// opened straight from disk (double-click): 假数据 and 导入 work, 在线 explains why it can't
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errs.push(`file: ${e.message}`));
  await p.goto('file://' + path.join(root, 'admin-lab.html')); await p.click('#useDemo');
  await p.waitForSelector('#dash:not([hidden])');
  await p.click('#switchSrc'); await p.setInputFiles('#fileInput', files.slice(0, 1)); await p.waitForSelector('#dash:not([hidden])');
  const n = await p.evaluate(() => result.metrics.customers);
  await p.click('#switchSrc'); await p.fill('#livePw', 'x'); await p.click('#liveForm button'); await p.waitForTimeout(600);
  console.log('file:// →', n, 'customers imported | live:', await p.textContent('#liveErr'));
  if (!n) errs.push('file:// import found no customers');
  await p.close();
}
await b.close();
server.close();
if (writes.length) errs.push('page sent non-GET requests: ' + writes.join(', '));
const bad = [...hosts].filter(h => !ALLOWED.test(h));
if (bad.length) errs.push('requests outside Google: ' + bad.join(', '));
console.log('outside hosts:', [...hosts].join(', ') || 'none');
console.log('errors:', errs.length ? errs : 'none');
process.exit(errs.length ? 1 : 0);
