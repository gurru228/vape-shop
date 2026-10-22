// Local stand-in for `netlify dev` + Supabase, for the QA scripts (no real data, no real Telegram):
//   :8899  the site — static files, netlify/functions/*.mjs (v2, config.path) and *.js (v1, /.netlify/functions/<name>)
//   :54321 "Supabase" — /rest/v1/* proxied to a local PostgREST (:3001), /auth/v1/token is a fake Supabase Auth
//          that knows one old-site account: old@example.com / oldpass1
// Run: node qa/dev-server.mjs   (needs postgres + postgrest running, see qa/README.md)
import http from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const SB_PORT = 54321, SITE_PORT = +(process.env.PORT || 8899), PGRST = 'http://127.0.0.1:3001';

Object.assign(process.env, {
  SUPABASE_URL: `http://127.0.0.1:${SB_PORT}`,
  SUPABASE_SERVICE_KEY: process.env.SERVICE_JWT,
  ADMIN_PASSWORD: 'admin-test',
  TG_SECRET: 'local-test-secret',
  TG_CHAT_ID: '999',
  URL: `http://localhost:${SITE_PORT}`,
}, { TG_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '' });
delete process.env.TG_BOT_TOKEN; delete process.env.TELEGRAM_BOT_TOKEN;

const OLD_UID = '11111111-2222-3333-4444-555555555555';
const readBody = req => new Promise(ok => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });

// ---------- fake Supabase ----------
http.createServer(async (req, res) => {
  const body = await readBody(req);
  if (req.url.startsWith('/auth/v1/token')) {
    const b = JSON.parse(body.toString() || '{}');
    const ok = b.email === 'old@example.com' && b.password === 'oldpass1';
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(ok ? { access_token: 'x', user: { id: OLD_UID, email: b.email } } : { error: 'invalid_grant' }));
  }
  if (req.url.startsWith('/auth/v1/admin/users')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ users: [
      { id: OLD_UID, email: 'old@example.com', created_at: '2026-05-01T10:00:00Z' },
      { id: '22222222-2222-3333-4444-555555555555', email: 'maria@example.com', created_at: '2026-06-01T10:00:00Z' },
    ] }));
  }
  if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); return res.end(); }
  const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
  const r = await fetch(PGRST + req.url.slice('/rest/v1'.length), { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const out = Buffer.from(await r.arrayBuffer());
  res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
  res.end(out);
}).listen(SB_PORT);

// ---------- functions ----------
const v2 = [], v1 = new Map();
for (const f of await readdir(path.join(root, 'netlify/functions'))) {
  const file = path.join(root, 'netlify/functions', f);
  if (f.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(file));
    for (const p of [].concat(mod.config?.path || [])) v2.push([p, mod.default]);
  } else if (f.endsWith('.js')) {
    try { v1.set(f.slice(0, -3), require(file).handler); } catch (e) { console.log('[dev] skip', f, e.message); }
  }
}

// the /* block of _headers, like Netlify serves it
const SITE_HEADERS = (() => {
  const out = {}; let inAll = false;
  for (const l of readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
    if (/^\//.test(l)) inAll = l.trim() === '/*';
    else if (inAll && /^\s+[\w-]+:/.test(l)) { const i = l.indexOf(':'); out[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  }
  return out;
})();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${SITE_PORT}`);
  const t0 = Date.now();
  res.on('finish', () => { if (Date.now() - t0 > 1500) console.log(`[slow] ${req.method} ${url.pathname} ${Date.now() - t0}ms`); });
  const body = await readBody(req);
  try {
    const hit = v2.find(([p]) => p === url.pathname);
    if (hit) {
      const r = await hit[1](new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), {});
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const m = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
    if (m && v1.has(m[1])) {
      const r = await v1.get(m[1])({ httpMethod: req.method, headers: req.headers, body: body.toString(), queryStringParameters: Object.fromEntries(url.searchParams), path: url.pathname });
      res.writeHead(r.statusCode || 200, r.headers || {});
      return res.end(r.body || '');
    }
    // same hidden paths as _redirects
    if (/^\/(site|qa|supabase|netlify|images_original)\//.test(url.pathname) || /^\/(build\.sh|HANDOFF\.md|README\.md|package(-lock)?\.json|netlify\.toml|workflow\.html)$/.test(url.pathname) || /\.bak$/.test(url.pathname)) { res.writeHead(404); return res.end('not found'); }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { ...SITE_HEADERS, 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[dev]', url.pathname, e);
    res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end(e.code === 'ENOENT' ? 'not found' : String(e));
  }
}).listen(SITE_PORT, () => console.log(`[dev] site http://localhost:${SITE_PORT}  (${v2.length} v2 routes, ${v1.size} v1 functions)`));
