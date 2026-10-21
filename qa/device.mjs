import { chromium } from './pw.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => m.type() === 'error' && errs.push(m.text()));
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto((process.env.QA_URL || 'http://localhost:8899/'));
await page.waitForTimeout(2500);
const c = await page.locator('#device').boundingBox();
const shoot = async name => page.screenshot({ path: `qa/dev-${name}.png`, clip: { x: c.x + c.width * 0.2, y: c.y, width: c.width * 0.6, height: c.height } });
await shoot('a');
// drag to rotate by roughly 90° steps
for (const name of ['b', 'c', 'd']) {
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 130, c.y + c.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shoot(name);
}
await page.locator('#heroChips .chip').nth(4).click();
await page.waitForTimeout(1200);
await shoot('flavor');
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
