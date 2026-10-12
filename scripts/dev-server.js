/**
 * 本地静态站 + 报价 / 手动下单函数。
 * PORT=47400 npm run dev
 * 打开 http://localhost:47400
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load local server credentials before importing handlers. Never serve this file.
if (typeof process.loadEnvFile === 'function' && fs.existsSync(path.join(__dirname, '../.env.local'))) {
    process.loadEnvFile(path.join(__dirname, '../.env.local'));
}
const quote = require('../netlify/functions/quote');
const saveOrder = require('../netlify/functions/submit-order');

const PORT = Number(process.env.PORT) || 8888;
const ROOT = path.join(__dirname, '..');
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const functions = {
    '/.netlify/functions/quote': quote,
    '/.netlify/functions/submit-order': saveOrder,
    '/.netlify/functions/save-bizum-order': saveOrder,
    '/.netlify/functions/get-inventory': require('../netlify/functions/get-inventory'),
    '/.netlify/functions/track-click': {
        handler: async () => ({ statusCode: 204, body: '' })
    }
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const fn = functions[url.pathname];
    if (fn) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let result;
        try {
            result = await fn.handler({
                httpMethod: req.method,
                headers: req.headers,
                body: Buffer.concat(chunks).toString('utf8'),
                path: url.pathname,
            });
        } catch (error) {
            console.error('Local function failed:', url.pathname, error.message);
            result = { statusCode: 500, body: JSON.stringify({ error: 'server_error' }) };
        }
        res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
        res.end(result.body || '');
        return;
    }

    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT + path.sep) || rel.split('/').some(part => part.startsWith('.')) || !['.html', ...Object.keys(TYPES)].includes(path.extname(filePath))) {
        res.writeHead(403);
        res.end('forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${PORT}`);
});
