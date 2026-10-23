// Playwright for the QA scripts, with the CDN files (Three.js, Google Fonts) cached on disk so a slow
// network doesn't time tests out. Only the test browser uses this; the site itself loads them from the CDN.
import { chromium as real } from '/tmp/vsprev/node_modules/playwright-core/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const DIR = '/tmp/vsqa-cdn';
await mkdir(DIR, { recursive: true });
async function cached(route) {
  const url = route.request().url();
  const f = `${DIR}/${createHash('sha1').update(url).digest('hex')}`;
  try {
    const meta = JSON.parse(await readFile(f + '.json', 'utf8'));
    return route.fulfill({ status: 200, headers: { 'content-type': meta.type, 'access-control-allow-origin': '*' }, body: await readFile(f) });
  } catch (e) { /* not cached yet */ }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = Buffer.from(await r.arrayBuffer());
    if (r.ok) { await writeFile(f, body); await writeFile(f + '.json', JSON.stringify({ type: r.headers.get('content-type') })); }
    return route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || '', 'access-control-allow-origin': '*' }, body });
  } catch (e) { return route.abort(); }
}
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
export const chromium = {
  async launch(opts) {
    const browser = await real.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), ...opts });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async o => { const c = await newContext(o); await c.route(CDN, cached); return c; };
    browser.newPage = async o => { const c = await browser.newContext(o); const p = await c.newPage();
      if (process.env.QA_DEBUG) { const pend = new Map(); p.on('request', r => pend.set(r, Date.now())); p.on('requestfinished', r => pend.delete(r)); p.on('requestfailed', r => pend.delete(r)); setInterval(() => { const old = [...pend].filter(([, t]) => Date.now() - t > 8000); if (old.length) console.log('[slow]', old.map(([r]) => r.method() + ' ' + r.url().slice(0, 90)).join(' | ')); }, 5000).unref(); }
      p.on('close', () => c.close().catch(() => {})); return p; };
    return browser;
  },
};
