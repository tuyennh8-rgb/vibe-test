'use strict';

/* Xuất CSV (docs/04, QT-24): UTF-8 có BOM, phân cách dấu phẩy, xuống dòng CRLF,
   chống chèn công thức, giữ số 0 đầu của số điện thoại khi mở bằng Excel. */

const HEADERS = ['ID', 'Họ và tên', 'Email', 'Số điện thoại', 'Ngày đăng ký', 'Cập nhật lần cuối'];
const VN_TZ = 'Asia/Ho_Chi_Minh';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VN_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function vnParts(date) {
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = value;
  return parts;
}

function formatDateTime(value) {
  const p = vnParts(new Date(value));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/* Ô văn bản bắt đầu bằng = + - @ hoặc tab/xuống dòng thì thêm dấu nháy đơn để Excel không chạy như công thức. */
function guardFormula(text) {
  return /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
}

function quote(text) {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function textCell(value) {
  return quote(guardFormula(String(value ?? '')));
}

/* Số điện thoại đã được kiểm tra chỉ gồm chữ số nên an toàn khi ghi dạng ="0912345678":
   Excel hiển thị như văn bản và giữ số 0 đầu. */
function phoneCell(phone) {
  return /^0\d{9}$/.test(phone) ? quote(`="${phone}"`) : textCell(phone);
}

function buildCsv(rows) {
  const lines = [HEADERS.map(quote).join(',')];
  for (const row of rows) {
    lines.push([
      String(row.id),
      textCell(row.full_name),
      textCell(row.email),
      phoneCell(row.phone),
      formatDateTime(row.created_at),
      formatDateTime(row.updated_at)
    ].join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function csvFileName(now = new Date()) {
  const p = vnParts(now);
  return `nguoi-choi-${p.year}${p.month}${p.day}-${p.hour}${p.minute}.csv`;
}

module.exports = { buildCsv, csvFileName };
