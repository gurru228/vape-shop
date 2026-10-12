/**
 * 本地静态站 + 报价 / 手动下单函数。
 * node scripts/dev-server.js
 * 打开 http://127.0.0.1:8888
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const quote = require('../netlify/functions/quote');
const saveOrder = require('../netlify/functions/save-bizum-order');

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
    '/.netlify/functions/save-bizum-order': saveOrder,
    '/.netlify/functions/get-inventory': {
        handler: async () => ({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' })
    },
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
        const result = await fn.handler({
            httpMethod: req.method,
            headers: req.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            path: url.pathname,
        });
        res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
        res.end(result.body || '');
        return;
    }

    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) {
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
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${PORT}`);
});
