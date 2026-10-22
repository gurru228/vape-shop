// A member with a full card can order just the free unit (cart empty, total €0.00); the server takes 10 stamps off.
// Sold-out flavors sit at the end of the drawer and the IceMax chips, and the hero shows only flavors in stock.
// Prices on the page come from products.json (IceMax €15.90, IceKing €30.00).
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const errs = [];
const post = async (path, body, token) => (await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const admin = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-test', ...body }) });

// sold out: Dash's 1st and 3rd flavors, IceMax's 1st
const P = JSON.parse((await (await fetch(url)).text()).match(/const PRODUCTS = (\[.*?\]);\n/s)[1]);
const dash = P.find(p => p.id === 1), ice = P.find(p => p.id === 2);
const gone = [[1, dash.flavors[0].name], [1, dash.flavors[2].name], [2, ice.flavors[0].name]];
await fetch(url + '.netlify/functions/set-inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-test', items: gone.map(([pid, f]) => ({ product_id: pid, product_name: 'x', flavor_name: f, stock: 0 })) }) });

// a member with a full Dash card
const reg = await post('api/register', { account: 'gift@example.com', name: '满卡', password: 'secret1', adult: true });
await admin('api/admin/stamp', { id: 'gift@example.com', pid: 1, n: 10 });
console.log('server: guest empty order refused:', (await post('api/order', { items: [], form: { name: 'A', phone: '612345678' }, gifts: { 1: dash.flavors[1].name } })).error);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(t => { localStorage.setItem('vs3d-session', JSON.stringify({ token: t, user: { id: 'gift@example.com', name: '满卡', email: 'gift@example.com' } }));
  const i = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 200); setTimeout(() => clearInterval(i), 30000); }, reg.token);
await p.goto(url); await p.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 25000 }); await p.waitForTimeout(1500);

// prices + stock order
console.log('ice block price:', await p.textContent('#icePrice'), '| was:', await p.textContent('#iceWas'), '| button:', await p.textContent('#iceAdd'));
const chips = await p.$$eval('#iceChips .chip', cs => cs.map(c => (c.classList.contains('out') ? 'OUT:' : '') + c.title));
console.log('ice chips, sold out last:', chips.at(-1).startsWith('OUT:') && !chips.slice(0, -1).some(c => c.startsWith('OUT:')), '|', chips.at(-1));
const hero = await p.$$eval('#heroChips .chip:not(.more)', cs => cs.map(c => c.dataset.name));
console.log('hero chips skip sold out:', !hero.includes(dash.flavors[0].name) && !hero.includes(dash.flavors[2].name), '| hero starts on:', await p.textContent('#heroFlavor'));
await p.evaluate(() => document.querySelector('#index button[data-id="1"]').click()); await p.waitForTimeout(900);
const flv = await p.$$eval('#dFlavors .flv', cs => cs.map(c => c.classList.contains('out')));
console.log('drawer: sold out at the end:', flv.indexOf(true) >= 0 && flv.slice(flv.indexOf(true)).every(Boolean), '| pattern', flv.map(x => x ? 'X' : '.').join(''), await p.$$eval('#dFlavors .flv.out', cs => cs.map(c => c.dataset.name).join(',')));
await p.click('#dClose'); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector('#index button[data-id="4"]').click()); await p.waitForTimeout(900);
console.log('IceKing drawer price:', await p.textContent('#dPrice'));
await p.click('#dClose'); await p.waitForTimeout(500);

// gift-only order
await p.click('#cartBtn'); await p.waitForTimeout(700);
console.log('cart with only the gift:', (await p.locator('.cp-body').innerText()).replace(/\s+/g, ' ').slice(0, 90), '| button:', await p.textContent('[data-act=next]'));
await p.screenshot({ path: 'qa/gift-only-cart.png' });
await p.locator('[data-act=next]').click(); await p.waitForTimeout(400);
if (!(await p.locator('#f-name').inputValue())) await p.locator('#f-name').fill('满卡');
await p.locator('#f-phone').fill('612000111');
await p.locator('[data-act=submit]').click(); await p.waitForSelector('.done-h', { timeout: 8000 });
console.log('gift-only done:', (await p.locator('.receipt').innerText()).replace(/\s+/g, ' '));
await p.screenshot({ path: 'qa/gift-only-done.png' });
const me = await (await fetch(url + 'api/me', { headers: { authorization: 'Bearer ' + reg.token } })).json();
console.log('stamps after:', JSON.stringify(me.user.stamps), '| order total:', me.orders[0]?.total);
await b.close();
console.log('errors:', errs.length ? errs : 'none');
