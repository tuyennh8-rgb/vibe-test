'use strict';

/* Server game Đập chuột (Node.js, chỉ cần thêm thư viện pg):
   - "/"        -> app/     (game)
   - "/design/" -> design/  (app/index.html gọi ../design/tokens.css)
   - "/admin/"  -> admin/   (trang quản trị, cần đăng nhập mới có dữ liệu)
   - "/api/..." -> API đăng ký người chơi và API admin
   - "/healthz" -> kiểm tra server và database còn sống */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const { validatePlayer, normalizeSearch } = require('./src/validation');
const { buildCsv, csvFileName } = require('./src/csv');

const ROOT = __dirname;

// Thứ tự quan trọng: tiền tố dài hơn phải đứng trước.
const MOUNTS = [
  { prefix: '/design/', dir: path.join(ROOT, 'design'), noStore: false },
  { prefix: '/admin/', dir: path.join(ROOT, 'admin'), noStore: true },
  { prefix: '/', dir: path.join(ROOT, 'app'), noStore: false }
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

// Font Inter Tight tải từ Google Fonts (design/tokens.css), còn lại chỉ cho phép cùng nguồn.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

/* ---------- Tiện ích trả lời ---------- */
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(JSON.stringify(data));
}

function apiError(res, status, code, message, fields, headers) {
  const error = { code, message };
  if (fields) error.fields = fields;
  sendJson(res, status, { error }, headers);
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') {
      reject(new HttpError(415, 'unsupported_media_type', 'Chỉ nhận dữ liệu JSON.'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new HttpError(413, 'payload_too_large', 'Dữ liệu gửi lên quá lớn.'));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new HttpError(400, 'invalid_json', 'Dữ liệu gửi lên không hợp lệ.'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'invalid_request', 'Yêu cầu không hợp lệ.')));
  });
}

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isSecure(req) {
  return config.cookieSecure || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return cookies;
}

/* CSRF (QT-25): yêu cầu thay đổi dữ liệu phải đến từ chính trang của server. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  try {
    return new URL(origin).host === req.headers.host;
  } catch (_) {
    return false;
  }
}

function methodNotAllowed(res, allow) {
  apiError(res, 405, 'method_not_allowed', 'Phương thức không được hỗ trợ.', null, { Allow: allow });
}

/* ---------- API ---------- */
async function handleApi(req, res, pathname, url) {
  const method = req.method;
  const ip = clientIp(req);

  // Đăng ký người chơi (công khai)
  if (pathname === '/api/players') {
    if (method !== 'POST') return methodNotAllowed(res, 'POST');
    if (!auth.allowRegister(ip)) {
      return apiError(res, 429, 'rate_limited', 'Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.', null, { 'Retry-After': '60' });
    }
    const result = validatePlayer(await readJson(req));
    if (!result.ok) return apiError(res, 400, 'validation_failed', 'Dữ liệu chưa hợp lệ.', result.errors);
    const { created } = await db.registerPlayer(result.value);
    return sendJson(res, created ? 201 : 200, { ok: true, created });
  }

  // Đăng nhập admin
  if (pathname === '/api/admin/login') {
    if (method !== 'POST') return methodNotAllowed(res, 'POST');
    if (!originAllowed(req)) return apiError(res, 403, 'forbidden_origin', 'Yêu cầu bị từ chối.');
    const lock = auth.loginLockRemaining(ip);
    if (lock > 0) {
      return apiError(res, 429, 'locked', 'Thử sai quá nhiều lần. Vui lòng đợi 15 phút.', null, { 'Retry-After': String(Math.ceil(lock / 1000)) });
    }
    const body = await readJson(req);
    if (!auth.checkCredentials(body && body.username, body && body.password)) {
      auth.recordLoginFailure(ip);
      return apiError(res, 401, 'invalid_credentials', 'Sai tên đăng nhập hoặc mật khẩu.');
    }
    auth.clearLoginFailures(ip);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(auth.createSession(), isSecure(req)) });
  }

  // Từ đây trở xuống: chỉ admin đã đăng nhập
  if (!pathname.startsWith('/api/admin/')) return apiError(res, 404, 'not_found', 'Không tìm thấy.');

  const token = parseCookies(req)[auth.COOKIE_NAME];

  if (pathname === '/api/admin/logout') {
    if (method !== 'POST') return methodNotAllowed(res, 'POST');
    if (!originAllowed(req)) return apiError(res, 403, 'forbidden_origin', 'Yêu cầu bị từ chối.');
    auth.destroySession(token);
    res.writeHead(204, { 'Set-Cookie': auth.clearCookie(isSecure(req)), 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    return res.end();
  }

  if (!auth.hasSession(token)) return apiError(res, 401, 'unauthorized', 'Chưa đăng nhập hoặc phiên đã hết hạn.');

  if (pathname === '/api/admin/players') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');
    const q = normalizeSearch(url.searchParams.get('q'));
    const page = Number.parseInt(url.searchParams.get('page'), 10) || 1;
    const data = await db.listPlayers({ q, page, pageSize: config.pageSize });
    return sendJson(res, 200, {
      players: data.rows.map((r) => ({
        id: String(r.id),
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })),
      total: data.total,
      page: data.page,
      pages: data.pages,
      pageSize: data.pageSize
    });
  }

  if (pathname === '/api/admin/players.csv') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');
    const rows = await db.exportPlayers(normalizeSearch(url.searchParams.get('q')));
    const body = buildCsv(rows);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName()}"`,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS
    });
    return res.end(body);
  }

  const match = pathname.match(/^\/api\/admin\/players\/([^/]+)$/);
  if (match) {
    if (method !== 'DELETE') return methodNotAllowed(res, 'DELETE');
    if (!originAllowed(req)) return apiError(res, 403, 'forbidden_origin', 'Yêu cầu bị từ chối.');
    if (!(await db.deletePlayer(match[1]))) return apiError(res, 404, 'not_found', 'Không tìm thấy người chơi.');
    res.writeHead(204, { 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    return res.end();
  }

  return apiError(res, 404, 'not_found', 'Không tìm thấy.');
}

/* ---------- File tĩnh ---------- */
function resolveFile(pathname) {
  const mount = MOUNTS.find((m) => pathname.startsWith(m.prefix));
  if (!mount) return null;
  let rel = pathname.slice(mount.prefix.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const target = path.resolve(mount.dir, rel);
  if (target !== mount.dir && !target.startsWith(mount.dir + path.sep)) return null;
  return { file: target, noStore: mount.noStore };
}

function serveStatic(req, res, pathname) {
  const resolved = resolveFile(pathname);
  if (!resolved) return send(res, 404, 'Not Found');
  fs.stat(resolved.file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');
    const type = TYPES[path.extname(resolved.file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': resolved.noStore ? 'no-store' : 'no-cache',
      ...SECURITY_HEADERS
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(resolved.file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

/* ---------- Bộ định tuyến ---------- */
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let pathname = '/';
  res.on('finish', () => {
    // QT-25: nhật ký chỉ ghi đường dẫn, không ghi chuỗi truy vấn (?q=...) vì có thể chứa dữ liệu cá nhân.
    console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });

  try {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch (_) {
      return send(res, 400, 'Bad Request');
    }
    if (pathname.includes('\0')) return send(res, 400, 'Bad Request');

    if (pathname === '/healthz') {
      try {
        await db.ping();
        return send(res, 200, 'ok', { 'Cache-Control': 'no-store' });
      } catch (_) {
        return send(res, 503, 'database unavailable', { 'Cache-Control': 'no-store' });
      }
    }

    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }
    if (pathname === '/design') return send(res, 301, '', { Location: '/design/' });
    if (pathname === '/admin') return send(res, 301, '', { Location: '/admin/' });
    return serveStatic(req, res, pathname);
  } catch (err) {
    if (err instanceof HttpError) return apiError(res, err.status, err.code, err.message);
    // Không ghi err.message: lỗi database có thể kèm giá trị người dùng đã nhập.
    console.error('Lỗi xử lý yêu cầu:', (err && (err.code || err.name)) || 'unknown');
    if (!res.headersSent) return apiError(res, 500, 'server_error', 'Không thể xử lý lúc này. Vui lòng thử lại.');
    res.destroy();
  }
});

/* ---------- Khởi động và dừng gọn ---------- */
async function main() {
  await db.init();
  server.listen(config.port, config.host, () => {
    console.log(`Đập chuột đang chạy tại http://${config.host}:${config.port} (game /, admin /admin/, database PostgreSQL)`);
  });
}

main().catch((err) => {
  console.error('Không khởi động được server:', (err && (err.code || err.name)) || 'unknown');
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`Nhận ${signal}, đang dừng server...`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
