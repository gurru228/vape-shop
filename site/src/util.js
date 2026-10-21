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
async function flavorColor(path) {
  if (colorCache.has(path)) return colorCache.get(path);
  let hex = '#C9D96A';
  try {
    const im = await loadImage(path);
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
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
