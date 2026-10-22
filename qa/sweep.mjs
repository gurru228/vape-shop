// Bug sweep: walk through every part of the page on desktop and phone (header panel, account dialog, hero,
// clearance block, wall, drawer, cart, checkout, stamp section, Escape on each overlay) and report console
// errors, anything wider than the screen, overlays that stay open, and a page that stays scroll-locked. ONLY=d / m.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const V = [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];
const issues = [];
for (const [n, o] of V.filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
  const p = await b.newPage(o);
  const say = m => issues.push(`[${n}] ${m}`);
  p.on('pageerror', e => say('page error: ' + e.message));
  p.on('console', m => m.type() === 'error' && !/401|404|Failed to load resource/.test(m.text()) && say('console: ' + m.text().slice(0, 160)));
  await p.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 200); setTimeout(() => clearInterval(t), 30000); });
  await p.goto(url); await p.waitForTimeout(2000);
  await p.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 25000 }).catch(() => say('posters did not close'));
  const wide = async where => {
    const w = await p.evaluate(() => { const W = document.documentElement.clientWidth; const out = [];
      document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width && r.right > W + 1 && cs.position !== 'fixed' && !el.closest('.index,.rail,.cp:not(.open),.drawer:not(.open),.clr-band,.mobile-pan') && cs.visibility !== 'hidden') out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}#${el.id} right=${Math.round(r.right)}`); });
      return [document.documentElement.scrollWidth > W ? `page scrollWidth ${document.documentElement.scrollWidth} > ${W}` : null, ...out.slice(0, 5)].filter(Boolean); });
    w.forEach(x => say(`${where}: too wide: ${x}`));
  };
  const locked = () => p.evaluate(() => document.documentElement.classList.contains('locked'));
  await wide('page');
  // header panel
  await p.click('#cardBtn'); await p.waitForTimeout(300);
  if (await p.locator('#cardPop').isHidden()) say('card panel did not open');
  const pr = await p.locator('#cardPop').boundingBox(); if (pr && (pr.x < 0 || pr.x + pr.width > o.viewport.width + 1)) say(`card panel off screen ${JSON.stringify(pr)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  if (await p.locator('#cardPop').isVisible()) say('card panel did not close on Escape');
  // account dialog: open, Escape
  await p.click('#acctBtn'); await p.waitForTimeout(500);
  if (!(await locked())) say('account dialog open but page not locked');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  if (await p.locator('.acct.open').count()) say('account dialog stayed open after Escape');
  if (await locked()) say('page still locked after account dialog closed');
  // hero add → toast → cart
  await p.click('#heroAdd'); await p.waitForTimeout(400);
  if ((await p.textContent('#cartCnt')).trim() !== '1') say('hero add did not count');
  // clearance block
  await p.locator('#clearance').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
  await wide('clearance');
  await p.locator('#iceChips .chip').nth(2).click(); await p.waitForTimeout(300);
  await p.click('#iceAdd'); await p.waitForTimeout(300);
  // wall + drawer via the index buttons
  await p.locator('#index').scrollIntoViewIfNeeded(); await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) {
    await p.evaluate(i => document.querySelectorAll('#index button')[i].click(), i); await p.waitForTimeout(700);
    if (!(await p.locator('#drawer.open').count())) { say(`drawer ${i} did not open`); continue; }
    if (!(await locked())) say(`drawer ${i} open but page not locked`);
    await wide(`drawer ${i}`);
    if (i === 3) { await p.keyboard.press('Escape'); } else await p.click('#dClose');
    await p.waitForTimeout(600);
    if (await p.locator('#drawer.open').count()) say(`drawer ${i} did not close`);
  }
  if (await locked()) say('page locked after drawers');
  // the wall itself
  await p.locator('#rail').scrollIntoViewIfNeeded(); await p.waitForTimeout(3500);
  const r = await p.locator('#rail').boundingBox();
  await p.mouse.click(r.x + r.width * (n === 'd' ? 0.42 : 0.5), r.y + r.height * 0.6); await p.waitForTimeout(900);
  if (!(await p.locator('#drawer.open').count())) say('wall poster click did not open the drawer'); else { await p.click('#dClose'); await p.waitForTimeout(600); }
  // stamp section
  await p.locator('#stamps').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
  await wide('stamps');
  if (await p.locator('.stamps-stage').isHidden()) say('3D stamp card did not build');
  // cart + checkout
  await p.click('#cartBtn'); await p.waitForTimeout(700);
  if (!(await locked())) say('cart open but page not locked');
  await wide('cart');
  const lines = await p.locator('.cp .line').count(); if (lines !== 2) say(`cart has ${lines} lines, expected 2`);
  await p.locator('[data-act=next]').click(); await p.waitForTimeout(400);
  await p.locator('[data-mode=delivery]').click(); await p.waitForTimeout(300);
  await p.locator('#f-name').fill('QA'); await p.locator('#f-phone').fill('612345678');
  await p.locator('#ackLeak').check();
  await p.locator('[data-act=submit]').click(); await p.waitForTimeout(500);
  const err = (await p.textContent('#cpErr')).trim(); if (!/满 5 件/.test(err)) say(`delivery with 2 items: message "${err}"`);
  await p.locator('[data-mode=postal]').click(); await p.waitForTimeout(300);
  await wide('checkout postal');
  await p.locator('[data-mode=pickup]').click(); await p.waitForTimeout(300);
  await p.locator('[data-act=submit]').click(); await p.waitForSelector('.done-h', { timeout: 8000 }).catch(() => say('order did not go through'));
  await wide('done');
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  if (await p.locator('#cp.open').count()) say('cart stayed open after Escape');
  if (await locked()) say('page locked after the cart closed');
  // next order with IceMax asks for the tick again
  await p.locator('#clearance').scrollIntoViewIfNeeded(); await p.click('#iceAdd'); await p.waitForTimeout(300);
  await p.click('#cartBtn'); await p.waitForTimeout(500); await p.locator('[data-act=next]').click(); await p.waitForTimeout(300);
  if (await p.locator('#ackLeak').isChecked()) say('IceMax tick carried over to the next order');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  console.log(n, 'done');
  await p.close();
}
await b.close();
console.log(issues.length ? issues.join('\n') : 'no issues');
console.log('errors:', issues.length ? issues.length : 'none');
