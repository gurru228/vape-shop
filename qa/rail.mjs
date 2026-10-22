// Poster wall: every poster opens its drawer when clicked, also after the mouse moved over the wall while the posters
// were still sliding in (the cloth's bounding sphere has to follow the cloth, or the raycast misses). M=1 adds a phone.
import { chromium } from './pw.mjs';
const bad = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [n, o] of [['d', { viewport: { width: 1440, height: 900 } }], ...(process.env.M ? [['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] : [])]) {
  const p = await b.newPage(o);
  await p.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 50); setTimeout(() => clearInterval(t), 30000); });
  await p.goto('http://localhost:8899/'); await p.waitForTimeout(2500);
  await p.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 20000 }).catch(() => {});
  await p.locator('#rail').scrollIntoViewIfNeeded();
  // the wall is built when it comes near and then sizes itself: measure it after that
  await p.waitForSelector('#railLoading.done', { timeout: 15000 }).catch(() => {});
  await p.locator('#rail').scrollIntoViewIfNeeded();
  let r = await p.locator('#rail').boundingBox();
  // hover while they drop in
  for (let i = 0; i < 12; i++) { await p.mouse.move(r.x + r.width * (0.1 + i * 0.07), r.y + r.height * 0.55); await p.waitForTimeout(60); }
  await p.waitForTimeout(3500);
  r = await p.locator('#rail').boundingBox();
  await p.screenshot({ path: `qa/rail-${n}.png` });
  const got = [];
  const xs = n === 'd' ? [0.10, 0.26, 0.42, 0.58, 0.74, 0.90] : [0.5];
  for (const fx of xs) {
    await p.mouse.click(r.x + r.width * fx, r.y + r.height * 0.6); await p.waitForTimeout(900);
    const open = await p.locator('#drawer.open').count();
    if (!open) bad.push(`${n} ${fx}`);
    got.push(`${fx}:${open ? (await p.locator('#dName').textContent()).trim().slice(0, 8) : '✗'}`);
    if (open) { await p.locator('#dClose').click(); await p.waitForTimeout(600); }
  }
  console.log(n, got.join(' | '));
  await p.close();
}
await b.close();
console.log('errors:', bad.length ? 'not clickable: ' + bad.join(', ') : 'none');
