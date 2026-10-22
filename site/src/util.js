// web fonts: added from here instead of a <link> in <head>, so the page paints before they arrive
(() => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@400..800&family=Nunito:wght@400..900&display=swap';
  document.head.appendChild(l);
})();

// Shared helpers: image lookup (inlined data URIs at build time) and flavor colour sampling.
const IMG = window.__IMG || {};
const imgSrc = path => IMG[path] || path;

const colorCache = new Map();
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = imgSrc(path);
  });
}

// Picks the most saturated mid-tone region of a product photo; the packaging colour, not the background.
// build.sh works these out ahead of time (FLAVOR_COLORS); the in-browser version is only for a photo it didn't know
async function flavorColor(path) {
  if (typeof FLAVOR_COLORS !== 'undefined' && FLAVOR_COLORS[path]) return FLAVOR_COLORS[path];
  if (colorCache.has(path)) return colorCache.get(path);
  let hex = '#C9D96A';
  try {
    const im = await loadImage(path);
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let r = 0, gg = 0, b = 0, wsum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const l = (mx + mn) / 2;
      const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
      const w = s * s * (1 - Math.abs(l - 0.55) * 1.6);
      if (w <= 0) continue;
      r += R * w; gg += G * w; b += B * w; wsum += w;
    }
    if (wsum > 0.5) {
      const h = v => Math.round(v / wsum * 255).toString(16).padStart(2, '0');
      hex = `#${h(r)}${h(gg)}${h(b)}`;
    }
  } catch (e) { /* keep fallback colour */ }
  colorCache.set(path, hex);
  return hex;
}

// popups and side panels hold the page still: nothing scrolls behind them. One entry per owner, so opening
// the same panel twice or two overlays at once can't leave the page stuck.
const scrollLocks = new Set();
function lockScroll(owner, on) {
  if (on) scrollLocks.add(owner); else scrollLocks.delete(owner);
  document.documentElement.classList.toggle('locked', scrollLocks.size > 0);
}

// build a 3D scene only when its section is about to scroll into view, one per idle moment, so opening the
// page doesn't compile every shader at once (that's what made phones stutter on load)
function whenNear(el, build, margin = '300px') {
  const go = () => (window.requestIdleCallback ? requestIdleCallback(build, { timeout: 600 }) : setTimeout(build, 30));
  if (!('IntersectionObserver' in window)) return go();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: margin });
  io.observe(el);
}

const euro = n => `€${n.toFixed(2)}`;
const shortName = p => p.name.replace(/\s*\(.*\)\s*/, '');

// Sold-out flavors, as the shop marks them in the admin page (stock 0). Unknown = available.
const stock = (() => {
  const out = new Set(), subs = [];
  const key = (pid, name) => `${pid}-${name}`;
  fetch('/api/stock').then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d?.out) return;
    d.out.forEach(k => out.add(k));
    subs.forEach(f => f());
  }).catch(() => { /* offline or static preview: everything shows as available */ });
  return {
    out: (pid, name) => out.has(key(pid, name)),
    on: f => subs.push(f),
  };
})();

// IceMax clearance: the line the shop wants every buyer to see before ordering.
const LEAK_TITLE = '这款 IceMax 存在少量漏油';
const LEAK_BODY = '最后一批低价清仓，个别机身可能有渗油。请看清再拍，介意慎拍。';
