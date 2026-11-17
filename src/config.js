'use strict';

/* Đọc cấu hình từ biến môi trường (.env). Thiếu hoặc yếu thì dừng ngay (QT-27),
   chỉ in tên biến và lý do, không bao giờ in giá trị. */

const env = process.env;
const problems = [];

function required(name) {
  const value = (env[name] || '').trim();
  if (!value) problems.push(`Thiếu biến môi trường ${name}`);
  return value;
}

function integer(name, fallback) {
  const raw = (env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    problems.push(`${name} phải là số nguyên dương`);
    return fallback;
  }
  return n;
}

const config = {
  port: integer('PORT', 3000),
  host: (env.HOST || '0.0.0.0').trim(),

  db: {
    host: (env.DB_HOST || 'db').trim(),
    port: integer('DB_PORT', 5432),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    database: required('POSTGRES_DB')
  },

  adminUser: required('ADMIN_USER'),
  adminPassword: required('ADMIN_PASSWORD'),
  sessionSecret: required('SESSION_SECRET'),

  sessionTtlMs: integer('SESSION_TTL_HOURS', 8) * 60 * 60 * 1000,
  loginMaxAttempts: integer('LOGIN_MAX_ATTEMPTS', 5),
  loginWindowMs: 15 * 60 * 1000,
  registerMaxPerMinute: integer('REGISTER_MAX_PER_MINUTE', 20),
  pageSize: integer('PAGE_SIZE', 20),
  searchMaxLength: integer('SEARCH_MAX_LENGTH', 100),

  // Chỉ bật khi chạy sau một proxy tin cậy (nginx, ngrok...) để đọc IP và giao thức thật.
  trustProxy: (env.TRUST_PROXY || '').trim().toLowerCase() === 'true',
  cookieSecure: (env.COOKIE_SECURE || '').trim().toLowerCase() === 'true'
};

if (config.adminPassword && config.adminPassword.length < 10) {
  problems.push('ADMIN_PASSWORD quá ngắn (cần từ 10 ký tự)');
}
if (config.sessionSecret && config.sessionSecret.length < 32) {
  problems.push('SESSION_SECRET quá ngắn (cần từ 32 ký tự)');
}

if (problems.length > 0) {
  console.error('Cấu hình không hợp lệ, server không khởi động:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Hãy tạo file .env từ .env.example rồi điền giá trị thật.');
  process.exit(1);
}

module.exports = Object.freeze(config);
