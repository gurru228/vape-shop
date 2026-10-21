import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function run(name, opts, fn) {
  const page = await browser.newPage(opts);
  await page.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) { x.click(); clearInterval(t); } }, 50); });
  page.on('console', m => m.type() === 'error' && errs.push(`[${name}] ${m.text()}`));
  page.on('pageerror', e => errs.push(`[${name}] ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `qa/${name}-hero.png` });
  await page.locator('#rail').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `qa/${name}-rail.png` });
  if (fn) await fn(page);
  await page.close();
}
await run('desktop', { viewport: { width: 1440, height: 900 } }, async page => {
  const box = await page.locator('#rail').boundingBox();
  // brush across the wall
  await page.mouse.move(box.x + 80, box.y + box.height * 0.5);
  for (let i = 0; i <= 30; i++) await page.mouse.move(box.x + 80 + i * (box.width - 160) / 30, box.y + box.height * 0.5, { steps: 1 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'qa/desktop-brush.png' });
  // click the third poster
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.waitForTimeout(700);
  console.log('drawer open:', await page.locator('#drawer.open').count(), await page.locator('#dName').textContent());
  await page.screenshot({ path: 'qa/desktop-drawer.png' });
  await page.locator('#dFlavors .flv').nth(2).click();
  await page.locator('#qPlus').click();
  console.log('price:', await page.locator('#dPrice').textContent());
  await page.locator('#dAdd').click();
  await page.waitForTimeout(400);
  console.log('cart:', await page.locator('#cartCnt').textContent(), '| note:', await page.locator('#dNote').textContent());
  console.log('drawer still open after add:', await page.locator('#drawer.open').count());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa/desktop-added.png' });
  await page.locator('#dClose').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa/desktop-after.png' });
  // hero chip
  await page.evaluate(() => scrollTo(0, 0));
  const h0 = await page.locator('#heroFlavor').textContent();
  await page.waitForTimeout(3200);
  console.log('hero auto:', h0, '->', await page.locator('#heroFlavor').textContent());
  await page.locator('#heroChips .chip').nth(4).click();
  await page.waitForTimeout(1200);
  console.log('hero flavor:', await page.locator('#heroFlavor').textContent(), await page.evaluate(() => document.documentElement.style.getPropertyValue('--flavor')));
  await page.screenshot({ path: 'qa/desktop-hero2.png' });
  await page.screenshot({ path: 'qa/desktop-full.png', fullPage: true });
});
await run('dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async page => {
  await page.locator('#panR').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'qa/mobile-pan.png' });
  const box = await page.locator('#rail').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.waitForTimeout(700);
  console.log('mobile tap drawer:', await page.locator('#drawer.open').count(), await page.locator('#dName').textContent());
  await page.screenshot({ path: 'qa/mobile-drawer.png' });
  await page.locator('#dAdd').click();
  await page.waitForTimeout(500);
  console.log('mobile still open after add:', await page.locator('#drawer.open').count());
  await page.screenshot({ path: 'qa/mobile-added.png' });
  await page.locator('#dClose').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'qa/mobile-hero.png' });
  await page.screenshot({ path: 'qa/mobile-full.png', fullPage: true });
});
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
