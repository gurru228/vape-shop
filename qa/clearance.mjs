// IceMax clearance: the stamp poster comes first, the clearance poster follows when it closes and says nothing about leaks;
// the page block, drawer, cart and checkout all show the leak notice; checkout needs the tick (client and server);
// the price comes from products.json and the stamps still count; the poster wall shows the clearance price.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const errs = [];
const txt = async (page, sel) => ((await page.locator(sel).first().textContent()) || '').replace(/\s+/g, ' ').trim();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ONLY=d / m runs one variant; ONLY=srv runs the server checks only
const ON = t => !process.env.ONLY || process.env.ONLY.split(',').includes(t);
for (const [tag, opts] of [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]].filter(([t]) => ON(t))) {
  const page = await browser.newPage(opts);
  page.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
  page.on('console', m => m.type() === 'error' && !/401|404/.test(m.text()) && errs.push(`[${tag}] ${m.text()}`));
  await page.goto(url);
  await page.waitForSelector('.promo:not(.clr).open');
  console.log(tag, 'first poster is the stamp/register one:', await page.locator('.promo.clr').count() === 0, '|', (await txt(page, '.promo-cta')).slice(0, 60));
  await page.locator('.promo:not(.clr) .promo-x').click();
  await page.waitForSelector('.promo.clr.open', { timeout: 20000 });
  await page.waitForTimeout(900);
  const poster = await txt(page, '.clr-poster');
  console.log(tag, 'poster text:', poster);
  console.log(tag, 'poster mentions leak:', /漏|渗|leak|fuga/i.test(poster), '| stamp poster gone:', await page.locator('.promo:not(.clr)').count() === 0);
  await page.screenshot({ path: `qa/clr-${tag}-poster.png` });
  await page.locator('.clr-go').click();
  await page.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 8000 }).catch(() => {});
  console.log(tag, 'after 去挑口味: no more posters:', await page.locator('.promo').count() === 0);

  // page block
  await page.locator('#clearance').scrollIntoViewIfNeeded(); await page.waitForTimeout(3500);
  console.log(tag, 'block:', (await txt(page, '#clearance')).slice(0, 220));
  console.log(tag, 'block leak notice visible:', await page.locator('#clearance .leak').isVisible());
  await page.screenshot({ path: `qa/clr-${tag}-block.png` });
  console.log(tag, 'chips:', await page.locator('#iceChips .chip').count(), '| add button:', await txt(page, '#iceAdd'));
  await page.locator('#iceChips .chip').nth(3).click(); await page.waitForTimeout(1500);
  console.log(tag, 'picked:', await txt(page, '#iceFlavor'));
  await page.screenshot({ path: `qa/clr-${tag}-block2.png` });

  // drawer
  await page.locator('#iceAll').click(); await page.waitForTimeout(900);
  console.log(tag, 'drawer: price', await txt(page, '#dPrice'), '| was', await txt(page, '#dWas'), '| tag', await txt(page, '.tagnow'), '| leak shown:', await page.locator('#dLeak').isVisible());
  await page.screenshot({ path: `qa/clr-${tag}-drawer.png` });
  await page.locator('#qPlus').click();
  console.log(tag, 'drawer ×2:', await txt(page, '#dPrice'), await txt(page, '#dWas'));
  await page.locator('#dAdd').click(); await page.waitForTimeout(500);
  await page.locator('#dClose').click(); await page.waitForTimeout(700);

  // other products must not show the notice
  await page.evaluate(() => document.querySelector('#index button[data-id="1"]').click()); await page.waitForTimeout(900);
  console.log(tag, 'Dash drawer leak shown:', await page.locator('#dLeak').isVisible(), '| was:', await page.locator('#dWas').isVisible());
  await page.locator('#dClose').click(); await page.waitForTimeout(500);

  // cart + checkout
  await page.locator('#cartBtn').click(); await page.waitForTimeout(700);
  console.log(tag, 'cart notice:', await page.locator('.cp .leak').count(), '| line:', await txt(page, '.leak-line'), '| total:', await txt(page, '.cp-foot .total'));
  await page.screenshot({ path: `qa/clr-${tag}-cart.png` });
  await page.locator('[data-act=next]').click(); await page.waitForTimeout(400);
  await page.locator('#f-name').fill('QA'); await page.locator('#f-phone').fill('+34 655 111 222');
  console.log(tag, 'tick box present:', await page.locator('#ackLeak').count());
  await page.locator('[data-act=submit]').click(); await page.waitForTimeout(500);
  console.log(tag, 'submit without tick:', await txt(page, '#cpErr'));
  await page.screenshot({ path: `qa/clr-${tag}-ack.png` });
  await page.locator('#ackLeak').check();
  await page.locator('[data-act=submit]').click(); await page.locator('[data-act=ga-skip]').click(); await page.waitForSelector('.done-h', { timeout: 8000 });
  console.log(tag, 'done:', await txt(page, '.done-h'), '| receipt:', (await txt(page, '.receipt')).slice(0, 120));
  await page.close();
}

// server side: no tick → refused; tick → accepted at the clearance price × 2; the shop's message carries the warning; stamps still count
if (ON('srv')) {
const post = async (path, body, token) => (await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const reg = await post('api/register', { account: '655000777', name: 'Clr', password: 'secret1', adult: true });
const items = [{ pid: 2, flavor: 'Fresh Lemon', qty: 2 }];
const noTick = await post('api/order', { items, form: { name: 'A', phone: '655000777' } }, reg.token);
console.log('server no tick:', noTick.error);
const ok = await post('api/order', { items, form: { name: 'A', phone: '655000777', ackLeak: true } }, reg.token);
console.log('server with tick:', ok.no, ok.total, JSON.stringify(ok.earn));
const dash = await post('api/order', { items: [{ pid: 1, flavor: 'Lemon Tea', qty: 1 }], form: { name: 'A', phone: '655000777' } }, reg.token);
console.log('other product needs no tick:', dash.no ? 'ok' : dash.error);
const found = await post('api/telegram', { message: { chat: { id: 999 }, text: `查 ${ok.no}` } }).catch(() => null);
const tg = await (await fetch(url + 'api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'local-test-secret' }, body: JSON.stringify({ message: { chat: { id: 999 }, text: `查 ${ok.no}` } }) })).json();
console.log('shop message has warning:', /漏油/.test(tg.text), '| price line:', (tg.text.match(/冰爆.*€[\d.]+/) || [''])[0]);
}
await browser.close();
console.log('errors:', errs.length ? errs : 'none');
