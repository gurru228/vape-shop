// Smoothness check: long tasks (>50 ms main-thread blocks) while the page opens, while it scrolls to the bottom,
// and frame times while scrolling. Software WebGL here is far slower than a phone's GPU, so compare runs
// against each other, not against real-device numbers. ONLY=d / m.
import { chromium } from './pw.mjs';
const url = process.env.QA_URL || 'http://localhost:8899/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const V = [['d', { viewport: { width: 1440, height: 900 } }], ['m', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]];
for (const [n, o] of V.filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
  const p = await b.newPage(o);
  await p.addInitScript(() => {
    window.__lt = []; window.__t0 = performance.now();
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
    const t = setInterval(() => { const x = document.querySelector('.promo.open .promo-x'); if (x) x.click(); }, 300); setTimeout(() => clearInterval(t), 30000);
  });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(6000);
  const open = await p.evaluate(() => window.__lt.splice(0));
  await p.waitForFunction(() => !document.querySelector('.promo'), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => window.__lt.splice(0));
  // scroll down in steps, recording frame gaps
  const frames = await p.evaluate(async () => {
    const gaps = []; let last = performance.now(), run = true;
    const f = now => { gaps.push(now - last); last = now; if (run) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 120) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 1500));
    run = false;
    return gaps;
  });
  const scroll = await p.evaluate(() => window.__lt.splice(0));
  const sum = a => a.reduce((s, [, d]) => s + d, 0);
  const g = frames.slice(2).sort((a, c) => a - c);
  console.log(n, `load ${loadMs}ms | opening: ${open.length} long tasks, ${sum(open)}ms blocked, worst ${Math.max(0, ...open.map(x => x[1]))}ms`);
  console.log(n, `scrolling: ${scroll.length} long tasks, ${sum(scroll)}ms blocked, worst ${Math.max(0, ...scroll.map(x => x[1]))}ms | frame median ${g[g.length >> 1]?.toFixed(0)}ms p90 ${g[Math.floor(g.length * 0.9)]?.toFixed(0)}ms`);
  console.log(n, 'webgl contexts:', await p.evaluate(() => document.querySelectorAll('canvas').length), '| bytes:', await p.evaluate(() => performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1e3 | 0) + 'KB');
  await p.close();
}
await b.close();
