// Telegram admin commands (查 / 盖 / 重置) against `qa/run.sh` (port 8899), then the customer side:
// the old login is dropped, the temporary password signs in and leads straight to choosing a new one, stamps survive.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const bot = async text => (await (await fetch(url + 'api/telegram', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'local-test-secret' },
  body: JSON.stringify({ message: { chat: { id: 999 }, text } }),
})).json()).text;
const txt = async (page, sel) => (await page.locator(sel).first().textContent()).replace(/\s+/g, ' ').trim();
const phone = `6${Date.now().toString().slice(-8)}`;
const errs = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 50); setTimeout(() => clearInterval(t), 30000); });
page.on('pageerror', e => errs.push(e.message));
await page.goto(url); await page.waitForTimeout(1500);

// customer registers on the site
await page.locator('#acctBtn').click();
await page.locator('#a-account').fill(phone); await page.locator('#a-name').fill('小周'); await page.locator('#a-password').fill('secret1');
await page.locator('.acct-check input').check(); await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1200);

// shop stamps in-store purchases from Telegram; the open page picks them up
console.log('盖:', (await bot(`盖 ${phone} 鸭嘴兽 4`)).replace(/\n/g, ' | '));
console.log('查:', (await bot(`/find ${phone}`)).split('\n').slice(3, 6).join(' | '));
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(2500);
console.log('page dash:', await txt(page, '#stampNum'));

// customer forgot the password → shop resets it
const pw = (await bot(`重置 ${phone}`)).match(/<code>(\w{8})<\/code>/)[1];
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(2000);
console.log('old session signed out:', !(await page.locator('#acctBtn.in').count()));
await page.locator('#acctBtn').click(); await page.locator('.acct [data-a=login]').click();
await page.locator('#a-account').fill(phone); await page.locator('#a-password').fill('secret1');
await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(800);
console.log('old pw:', await txt(page, '.acct-err'));
await page.locator('#a-password').fill(pw); await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1200);
console.log('temp pw lands on:', await txt(page, '#acctTitle'), '|', await txt(page, '.acct-sub'));
await page.screenshot({ path: 'qa/tg-password.png' });
await page.locator('.acct-form [type=submit]').click();
console.log('empty:', await txt(page, '.acct-err'));
await page.locator('#a-current').fill(pw); await page.locator('#a-next').fill('abc'); await page.locator('.acct-form [type=submit]').click();
console.log('short:', await txt(page, '.acct-err'));
await page.locator('#a-next').fill('newpass9'); await page.locator('.acct-form [type=submit]').click(); await page.waitForTimeout(1500);
console.log('after save:', await txt(page, '#acctTitle'), '|', await txt(page, '.acct-why'), '| dash:', (await txt(page, '.am-line')).slice(0, 20));
await page.screenshot({ path: 'qa/tg-saved.png' });
await page.reload(); await page.waitForTimeout(2000);
console.log('still signed in after reload:', await page.locator('#acctBtn.in').count());
// change it again from "我的" (normal path, not temporary)
await page.locator('#acctBtn').click(); await page.waitForTimeout(800);
console.log('temp nag gone:', !(await page.locator('.acct-why').count()));
await page.locator('[data-a=password]').click();
console.log('normal title:', await txt(page, '#acctTitle'), '| label:', await txt(page, '[data-f=current] label'));
await page.keyboard.press('Escape');
await browser.close();
console.log('errors:', errs.length ? errs : 'none');
