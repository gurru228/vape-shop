import { chromium } from './pw.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await p.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) { x.click(); clearInterval(t); } }, 50); });
await p.goto((process.env.QA_URL || 'http://localhost:8899/'));
// a signed-in visitor whose last-seen stamps are painted while the (offline) server can't answer
await p.evaluate(() => { localStorage.setItem('vs3d-session', JSON.stringify({ token: 'x', user: { name: '小林', phone: '34612345678' } })); localStorage.setItem('vs3d-stamps-seen', JSON.stringify({ phone: '34612345678', stamps: { 1: 4 } })); }); await p.reload();
await p.locator('#stamps').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
await p.locator('#stamps').screenshot({ path: 'qa/st-dark.png' }); console.log('dark num:', await p.locator('#stampNum').textContent(), '| hello:', await p.locator('#stampsHello').textContent()); await b.close();
