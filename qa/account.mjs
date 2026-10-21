// Members flow against `qa/run.sh` (port 8899): guest sees the sign-up prompt and the cart hint, registers from the cart,
// orders, the shop confirms in "Telegram" (webhook called directly), stamps land on the open page; gift order; logout.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const SECRET = 'local-test-secret', CHAT = 999;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const confirm = async (no, act = 'ok') => {
  const r = await fetch(url + 'api/telegram', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ callback_query: { id: '1', data: `${act}:${no}`, message: { message_id: 1, chat: { id: CHAT } } } }),
  });
  return r.status;
};
const txt = async (page, sel) => (await page.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();
const order = async page => {
  await page.locator('#cartBtn').click(); await page.waitForTimeout(600);
  await page.locator('[data-act=next]').click(); await page.waitForTimeout(300);
  if (!(await page.locator('#f-name').inputValue())) { await page.locator('#f-name').fill('Lin'); await page.locator('#f-phone').fill('+34 612 345 678'); }
  await page.locator('[data-act=submit]').click(); await page.waitForSelector('.done-h', { timeout: 8000 });
  return (await page.locator('.done-h b.num').count()) ? (await page.locator('.done-h b.num').textContent()).trim() : null;
};
const closePromo = page => page.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) { x.click(); clearInterval(t); } }, 50); });

for (const [name, opts] of [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const phone = `6${Date.now().toString().slice(-8)}`;
  const page = await browser.newPage(opts);
  await closePromo(page);
  page.on('pageerror', e => errs.push(`[${name}] ${e.message}`));
  page.on('response', r => r.status() === 404 && console.log('404', r.url().slice(0, 100)));
  page.on('console', m => m.type() === 'error' && !/401/.test(m.text()) && errs.push(`[${name}] ${m.text()}`));
  await page.goto(url); await page.waitForTimeout(1500);
  console.log(name, 'header:', await txt(page, '#acctBtn') || '(icon)', '| join shown:', await page.locator('#stampsJoin:not([hidden])').count(), '| sample tag:', await page.locator('.stamps.guest').count());
  await page.locator('#stamps').scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
  await page.locator('#stamps').screenshot({ path: `qa/ac-${name}-guest.png` });

  // guest cart → hint → register from the cart
  for (let i = 0; i < 3; i++) await page.locator('#heroAdd').click();
  await page.locator('#cartBtn').click(); await page.waitForTimeout(600);
  console.log(name, 'guest cart bar:', await txt(page, '.stampbar'));
  await page.screenshot({ path: `qa/ac-${name}-cart-guest.png` });
  await page.locator('[data-act=join]').click(); await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/ac-${name}-register.png` });
  await page.locator('.acct-form [type=submit]').click();
  console.log(name, 'empty submit error:', await txt(page, '.acct-err'));
  await page.locator('#a-account').fill(phone); await page.locator('#a-name').fill('小林'); await page.locator('#a-password').fill('secret1');
  await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(300);
  console.log(name, 'no-18 error:', await txt(page, '.acct-err'));
  await page.locator('.acct-check input').check();
  await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1500);
  console.log(name, 'dialog closed:', !(await page.locator('.acct.open').count()), '| header:', await page.locator('#acctBtn').getAttribute('aria-label'), '| cart bar:', await txt(page, '.stampbar'));
  await page.screenshot({ path: `qa/ac-${name}-cart-member.png` });
  await page.locator('#cpClose').click(); await page.waitForTimeout(300);

  // order → pending → shop confirms → stamps arrive on the open page
  await page.locator('#index button').nth(5).click(); await page.waitForTimeout(600);
  await page.locator('#dAdd').click(); await page.locator('#dClose').click(); await page.waitForTimeout(300);
  const no = await order(page);
  console.log(name, 'order', no, '| prefilled name:', '| done:', await txt(page, '.done-h p'), '|', await txt(page, '.stampbar'));
  await page.screenshot({ path: `qa/ac-${name}-done.png` });
  await page.locator('[data-act=stamps]').click(); await page.waitForTimeout(800);
  console.log(name, 'before confirm:', await txt(page, '#stampTabs'));
  console.log(name, 'webhook:', await confirm(no));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(4500);
  console.log(name, 'after confirm:', await txt(page, '#stampTabs'), '|', await txt(page, '#stampLeft'));
  await page.locator('#stamps').screenshot({ path: `qa/ac-${name}-stamped.png` });

  // 7 more Dash → full card → gift in the next cart
  for (let i = 0; i < 7; i++) await page.locator('#heroAdd').click();
  const no2 = await order(page); await confirm(no2);
  await page.locator('#cpClose').click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(3000);
  console.log(name, 'dash now:', await txt(page, '#stampNum'), await txt(page, '#stampLeft'));
  await page.locator('#heroAdd').click();
  await page.locator('#cartBtn').click(); await page.waitForTimeout(600);
  console.log(name, 'gift lines:', await page.locator('.line.gift').count(), '|', await txt(page, '.stampbar'));
  await page.locator('#cpClose').click();
  const no3 = await order(page);
  console.log(name, 'gift order receipt:', await txt(page, '.receipt'));
  await page.locator('[data-act=close]').click(); await page.waitForTimeout(2000);
  console.log(name, 'dash after gift (pending):', await txt(page, '#stampNum'));
  await confirm(no3, 'no!');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(2000);
  console.log(name, 'dash after shop cancels (refund):', await txt(page, '#stampNum'));

  // my account dialog, reload keeps session, logout
  await page.locator('#acctBtn').click(); await page.waitForTimeout(1200);
  console.log(name, 'account:', (await txt(page, '.am-orders')).slice(0, 140));
  await page.screenshot({ path: `qa/ac-${name}-me.png` });
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForTimeout(2000);
  console.log(name, 'after reload signed in:', await page.locator('#acctBtn.in').count(), '| dash:', await txt(page, '#stampNum'));
  await page.locator('#acctBtn').click(); await page.waitForTimeout(800);
  await page.locator('[data-a=logout]').click(); await page.waitForTimeout(500);
  console.log(name, 'after logout: join shown', await page.locator('#stampsJoin:not([hidden])').count(), '| tabs', await page.locator('#stampTabs button').count(), '| num', await page.locator('#stampNum').textContent());

  // wrong password, then login
  await page.locator('#acctBtn').click(); await page.locator('.acct [data-a=login]').click();
  await page.locator('#a-account').fill(phone); await page.locator('#a-password').fill('wrong12');
  await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(800);
  console.log(name, 'wrong pw:', await txt(page, '.acct-err'));
  await page.locator('#a-password').fill('secret1');
  await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1200);
  console.log(name, 'login back:', await page.locator('#acctBtn.in').count(), '| dash:', await txt(page, '#stampNum'));
  await page.close();
}

// server down → guest order falls back to WhatsApp
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await closePromo(page);
  await page.route('**/api/**', r => r.abort());
  await page.goto(url); await page.waitForTimeout(1200);
  await page.locator('#heroAdd').click();
  await order(page);
  console.log('offline:', await txt(page, '.done-h'), '| wa button:', await page.locator('.btn-wa').count());
  await page.screenshot({ path: 'qa/ac-offline.png' });
  await page.close();
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
