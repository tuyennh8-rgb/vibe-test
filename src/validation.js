'use strict';

/* Kiểm tra và chuẩn hoá dữ liệu đăng ký (docs/04: QT-14 đến QT-17) và chuỗi tìm kiếm (QT-22).
   Máy chủ luôn kiểm tra lại, không tin kiểm tra ở trình duyệt. */

const config = require('./config');

const MESSAGES = Object.freeze({
  fullName: 'Vui lòng nhập họ và tên (2 đến 100 ký tự).',
  email: 'Email không hợp lệ.',
  phone: 'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678.',
  consent: 'Bạn cần đồng ý để tiếp tục.'
});

const NAME_MIN = 2;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const PHONE_RE = /^0[35789]\d{8}$/;

function cleanName(value) {
  return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function validName(name) {
  const length = [...name].length;
  return length >= NAME_MIN && length <= NAME_MAX && /\p{L}/u.test(name) && !/[\u0000-\u001F\u007F]/.test(name);
}

function cleanEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function validEmail(email) {
  if (email.length === 0 || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return false;
  const local = email.slice(0, email.lastIndexOf('@'));
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
}

function cleanPhone(value) {
  let s = String(value ?? '').replace(/[\s.\-]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (s.startsWith('84')) s = `0${s.slice(2)}`;
  return s;
}

function validatePlayer(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {
    fullName: cleanName(input.fullName),
    email: cleanEmail(input.email),
    phone: cleanPhone(input.phone)
  };
  const errors = {};
  if (!validName(value.fullName)) errors.fullName = MESSAGES.fullName;
  if (!validEmail(value.email)) errors.email = MESSAGES.email;
  if (!PHONE_RE.test(value.phone)) errors.phone = MESSAGES.phone;
  if (input.consent !== true) errors.consent = MESSAGES.consent;
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}

function normalizeSearch(raw) {
  return String(raw ?? '').normalize('NFC').trim().slice(0, config.searchMaxLength);
}

module.exports = { validatePlayer, normalizeSearch, MESSAGES };
