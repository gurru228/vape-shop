// Full-card notice: a member with 10 stamps on a card gets a small "集满 10 个章了" notice after the opening posters, and its button opens the cart with the gift.
import { chromium } from './pw.mjs';
const url = 'http://localhost:8899/';
const post = async (path, body, token) => (await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const reg = await post('api/register', { account: 'full@example.com', name: '小满', password: 'secret1', adult: true });
await fetch(url + 'api/admin/stamp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-test', id: 'full@example.com', pid: 1, n: 10 }) });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const o of [{ viewport: { width: 1440, height: 900 } }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const p = await b.newPage(o); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(t => { localStorage.setItem('vs3d-session', JSON.stringify({ token: t, user: { id: 'full@example.com', name: '小满', email: 'full@example.com' } }));
    const i = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 300); setTimeout(() => clearInterval(i), 30000); }, reg.token);
  await p.goto(url);
  console.log('note while poster up:', await p.locator('.full-note').count());
  await p.waitForSelector('.full-note.show', { timeout: 20000 }); await p.waitForTimeout(600);
  console.log('note:', (await p.locator('.full-note').innerText()).replace(/\s+/g, ' '));
  await p.screenshot({ path: `qa/full-note-${o.isMobile ? 'm' : 'd'}.png` });
  await p.click('.fn-go'); await p.waitForTimeout(800);
  console.log('cart opened with the offer:', await p.locator('#cp.open .gift-offer').count(), '| not added yet:', await p.locator('#cp.open .line.gift').count() === 0);
  await p.close();
}
await b.close(); console.log('errors:', errs.length ? errs : 'none');
