'use strict';

/* Server tĩnh nhỏ cho game Đập chuột. Chỉ dùng module có sẵn của Node, không cần cài gói.
   - "/"        -> thư mục app/    (index.html, style.css, game.js)
   - "/design/" -> thư mục design/ (app/index.html gọi ../design/tokens.css)
   - "/healthz" -> kiểm tra server còn sống */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

// Thứ tự quan trọng: tiền tố dài hơn phải đứng trước.
const MOUNTS = [
  { prefix: '/design/', dir: path.join(ROOT, 'design') },
  { prefix: '/', dir: path.join(ROOT, 'app') }
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

/* Đổi đường dẫn URL thành đường dẫn file an toàn nằm trong thư mục được phục vụ.
   Trả về null nếu không hợp lệ hoặc cố thoát ra ngoài (path traversal). */
function resolveFile(pathname) {
  const mount = MOUNTS.find((m) => pathname.startsWith(m.prefix));
  if (!mount) return null;
  let rel = pathname.slice(mount.prefix.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const target = path.resolve(mount.dir, rel);
  if (target !== mount.dir && !target.startsWith(mount.dir + path.sep)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    return send(res, 400, 'Bad Request');
  }
  if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Cache-Control': 'no-store' });
  if (pathname === '/design') return send(res, 301, '', { Location: '/design/' });

  const file = resolveFile(pathname);
  if (!file) return send(res, 404, 'Not Found');

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Đập chuột đang chạy tại http://${HOST}:${PORT} (app/ -> /, design/ -> /design/)`);
});

// Dừng gọn khi Docker gửi SIGTERM (docker stop / docker compose down).
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`Nhận ${signal}, đang dừng server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
