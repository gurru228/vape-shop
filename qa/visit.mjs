// Visit notice: one Telegram line per visit (again after 30 min), tagged 扫二维码 when opened from the QR code
// (?from=qr, then removed from the address bar); bots get nothing; the format can't carry visitor text.
// The local server has no bot token, so the message shows up in its log as "[tg skipped] sendMessage …".
import { chromium } from './pw.mjs';
import { readFileSync } from 'node:fs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const log = () => readFileSync('/tmp/vsqa-db/dev.log', 'utf8').split('\n').filter(l => l.includes('有人进网站'));
const errs = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// a normal phone browser (the test browser's own name says Headless, which the notice skips as a bot)
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
p.on('pageerror', e => errs.push(e.message));
await p.goto(url + '?from=qr'); await p.waitForTimeout(3500);
console.log('address bar cleaned:', p.url() === url, p.url());
let l = log(); console.log('after QR visit:', l.length, '|', (l.at(-1) || '').slice(0, 160));
await p.reload(); await p.waitForTimeout(3000);
console.log('reload within 30 min sends nothing:', log().length === l.length);
await p.evaluate(() => localStorage.setItem('vs3d-visit', Date.now() - 31 * 60e3)); await p.reload(); await p.waitForTimeout(3000);
console.log('back after 30 min sends one:', log().length === l.length + 1, '|', (log().at(-1) || '').includes('直接打开'));
const bot = await fetch(url + 'api/visit', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Googlebot/2.1' }, body: '{}' });
console.log('bot skipped:', JSON.stringify(await bot.json()));
const inj = await fetch(url + 'api/visit', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone)' }, body: JSON.stringify({ from: '<b>spam</b>', ref: 'https://<i>evil</i>.com/' }) });
await new Promise(r => setTimeout(r, 300));
console.log('visitor text not passed through:', !log().at(-1).includes('<b>spam') && !log().at(-1).includes('<i>'), (await inj.json()).ok);
await b.close();
console.log('errors:', errs.length ? errs : 'none');
