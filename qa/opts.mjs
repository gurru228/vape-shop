import { chromium } from './pw.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [n, o] of [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const page = await browser.newPage(o);
  await page.goto((process.env.QA_URL || 'http://localhost:8899/'));
  await page.waitForTimeout(1200);
  await page.locator('#products').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -20));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `qa/opts-${n}.png` });
  await page.close();
}
await browser.close();
