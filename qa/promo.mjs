// Stamp-card poster, shown on every visit: auto-stamps 9, visitor presses the 10th, gift appears.
// Guests: "免费领卡" opens the sign-up inside the poster, the nickname is written onto the card, sign-up (by email) stamps it 已开卡;
// the next visit shows the member version. Also: "先逛逛" scrolls to the products, Escape closes.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const txt = async (page, sel) => (await page.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();
const skipClr = async page => { await page.waitForSelector('.promo.clr.open'); await page.locator('.promo.clr .promo-x').click(); await page.waitForSelector('.promo:not(.clr).open'); };
// ONLY=d / m / dk runs one variant (each takes about a minute with software WebGL)
const VARIANTS = [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['dk', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }]];
for (const [tag, opts] of VARIANTS.filter(([t]) => !process.env.ONLY || process.env.ONLY.split(',').includes(t))) {
  const page = await browser.newPage(opts);
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  await page.goto(url);
  await page.waitForSelector('.promo.clr.open'); await page.locator('.promo.clr .promo-x').click(); await page.waitForSelector('.promo:not(.clr).open');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/promo-${tag}-1.png` });
  await page.waitForSelector('.promo.ready', { timeout: 8000 });
  console.log(tag, 'stamped before press:', await page.locator('.ps.on').count(), '| always:', await txt(page, '.promo-always'));
  await page.locator('.promo-press').click();
  await page.waitForTimeout(1100);
  console.log(tag, 'after press:', await page.locator('.ps.on').count(), '| won:', await page.locator('.promo.won').count(), '|', await txt(page, '.promo-hint'));
  await page.screenshot({ path: `qa/promo-${tag}-2.png` });
  console.log(tag, 'guest cta:', await txt(page, '.promo-cta'));

  // skip: closes and scrolls to the products
  if (tag === 'd') {
    await page.locator('.promo:not(.clr) .promo-skip').click(); await page.waitForTimeout(3000);
    console.log(tag, 'skip closed:', await page.locator('.promo').count() === 0, '| products top:', Math.round(await page.evaluate(() => document.getElementById('products').getBoundingClientRect().top)));
    await page.reload(); await skipClr(page); await page.waitForSelector('.promo.ready', { timeout: 9000 });
  }

  // sign up inside the poster
  await page.locator('.promo-cta .promo-join-go').click(); await page.waitForTimeout(400);
  console.log(tag, 'form shown:', await page.locator('.promo-join:not([hidden])').count(), '| focused:', await page.evaluate(() => document.activeElement.id));
  await page.locator('.promo-join [type=submit]').click();
  console.log(tag, 'empty error:', await txt(page, '.promo-join .acct-err'));
  await page.locator('#p-account').fill('not-an-email@'); await page.locator('.promo-join [type=submit]').click();
  console.log(tag, 'bad email error:', await txt(page, '.promo-join .acct-err'));
  const email = `qa${Date.now()}${tag}@Example.com`;
  await page.locator('#p-account').fill(email);
  await page.locator('#p-name').type('阿明', { delay: 40 });
  console.log(tag, 'name on card:', await txt(page, '.pc-name'));
  await page.locator('#p-password').fill('secret1'); await page.locator('.promo-join .acct-check input').check();
  await page.screenshot({ path: `qa/promo-${tag}-3.png` });
  const fits = await page.evaluate(() => { const p = document.querySelector('.promo-poster'); return [p.scrollHeight, p.clientHeight]; });
  console.log(tag, 'poster scroll/client:', fits.join('/'));
  await page.locator('.promo-join [type=submit]').click(); await page.waitForSelector('.promo.owned', { timeout: 8000 }); await page.waitForTimeout(600);
  console.log(tag, 'owned:', await txt(page, '.pd-h'), '| stamps on card:', await page.locator('.ps.on').count(), '| header:', await page.locator('#acctBtn').getAttribute('aria-label'));
  await page.screenshot({ path: `qa/promo-${tag}-4.png` });
  await page.locator('.promo-done [data-stamps]').click(); await page.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500);
  console.log(tag, 'to stamps:', await page.locator('.promo').count() === 0, '| hello:', await txt(page, '#stampsHello'));

  // next visit: member version
  await page.reload(); await skipClr(page); await page.waitForSelector('.promo.ready', { timeout: 9000 });
  console.log(tag, 'member visit:', await txt(page, '.promo-cta'), '| holder:', await txt(page, '.pc-name'), '| join form:', await page.locator('.promo-join').count());
  await page.screenshot({ path: `qa/promo-${tag}-5.png` });
  // sign back in by email with different case works
  await page.locator('.promo:not(.clr) .promo-x').click(); await page.waitForTimeout(500);
  await page.locator('#acctBtn').click(); await page.waitForTimeout(800);
  console.log(tag, 'me shows email:', await txt(page, '.acct-sub'));
  await page.locator('[data-a=logout]').click(); await page.waitForTimeout(400);
  await page.locator('#acctBtn').click(); await page.locator('.acct [data-a=login]').click();
  await page.locator('#a-account').fill(email.toUpperCase()); await page.locator('#a-password').fill('secret1');
  await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1200);
  console.log(tag, 'login by EMAIL (upper case):', await page.locator('#acctBtn.in').count());
  await page.close();
}
// Escape closes it
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url); await page.waitForSelector('.promo.clr.open'); await page.keyboard.press('Escape'); await page.waitForSelector('.promo:not(.clr).open'); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
console.log('esc closed:', await page.locator('.promo').count() === 0);
await browser.close();
console.log('errors:', errors.length ? errors.join('\n') : 'none');
