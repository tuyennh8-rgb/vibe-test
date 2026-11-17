'use strict';

/* Đăng nhập admin (QT-19, QT-20): 1 tài khoản lấy từ biến môi trường, phiên lưu ở bộ nhớ máy chủ.
   Phiên mất khi khởi động lại server (admin phải đăng nhập lại). */

const crypto = require('node:crypto');
const config = require('./config');

const COOKIE_NAME = 'admin_session';
const sessions = new Map();          // sid -> thời điểm hết hạn (ms)
const loginAttempts = new Map();     // ip -> { fails, firstAt, lockedUntil }
const registerHits = new Map();      // ip -> [thời điểm yêu cầu (ms)]

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest();

/* So sánh thời gian hằng định: băm hai chuỗi về cùng độ dài rồi mới so. */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function checkCredentials(username, password) {
  const userOk = safeEqual(username ?? '', config.adminUser);
  const passOk = safeEqual(password ?? '', config.adminPassword);
  return userOk && passOk;   // luôn tính cả hai, không dừng sớm
}

const sign = (sid) => crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');

function createSession() {
  const sid = crypto.randomBytes(32).toString('base64url');
  sessions.set(sid, Date.now() + config.sessionTtlMs);
  return `${sid}.${sign(sid)}`;
}

function parseToken(token) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const sid = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  return safeEqual(mac, sign(sid)) ? sid : null;
}

function hasSession(token) {
  const sid = parseToken(token);
  if (!sid) return false;
  const expires = sessions.get(sid);
  if (!expires) return false;
  if (expires <= Date.now()) {
    sessions.delete(sid);
    return false;
  }
  return true;
}

function destroySession(token) {
  const sid = parseToken(token);
  if (sid) sessions.delete(sid);
}

function sessionCookie(token, secure) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${secure ? '; Secure' : ''}`;
}

function clearCookie(secure) {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

/* ----- Giới hạn đăng nhập sai (QT-20): quá số lần trong cửa sổ thời gian thì khoá ----- */
function loginLockRemaining(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) return entry.lockedUntil - now;
  if (now - entry.firstAt > config.loginWindowMs) loginAttempts.delete(ip);
  return 0;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAt > config.loginWindowMs) {
    entry = { fails: 0, firstAt: now, lockedUntil: 0 };
    loginAttempts.set(ip, entry);
  }
  entry.fails += 1;
  if (entry.fails >= config.loginMaxAttempts) entry.lockedUntil = now + config.loginWindowMs;
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

/* ----- Giới hạn đăng ký (chống gửi hàng loạt) ----- */
function allowRegister(ip) {
  const now = Date.now();
  const hits = (registerHits.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (hits.length >= config.registerMaxPerMinute) {
    registerHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  registerHits.set(ip, hits);
  return true;
}

// Dọn dữ liệu hết hạn để bộ nhớ không phình ra.
setInterval(() => {
  const now = Date.now();
  for (const [sid, expires] of sessions) if (expires <= now) sessions.delete(sid);
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAt > config.loginWindowMs && !(entry.lockedUntil > now)) loginAttempts.delete(ip);
  }
  for (const [ip, hits] of registerHits) {
    if (hits.every((t) => now - t >= 60 * 1000)) registerHits.delete(ip);
  }
}, 10 * 60 * 1000).unref();

module.exports = {
  COOKIE_NAME,
  checkCredentials,
  createSession,
  hasSession,
  destroySession,
  sessionCookie,
  clearCookie,
  loginLockRemaining,
  recordLoginFailure,
  clearLoginFailures,
  allowRegister
};
