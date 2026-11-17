'use strict';

/* PostgreSQL: bảng players (docs/04). Mọi câu lệnh dùng tham số hoá, không ghép chuỗi từ dữ liệu người dùng. */

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('Lỗi kết nối database:', err.code || err.name);
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS players (
    id          BIGSERIAL PRIMARY KEY,
    full_name   TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
    email       TEXT        NOT NULL,
    phone       TEXT        NOT NULL CHECK (phone ~ '^0[35789][0-9]{8}$'),
    consent_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS players_email_key ON players (email);
  CREATE INDEX IF NOT EXISTS players_created_at_idx ON players (created_at DESC, id DESC);
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Chờ database sẵn sàng (docker compose có thể khởi động app trước khi db nhận kết nối), rồi tạo bảng. */
async function init({ attempts = 30, delayMs = 1000 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Chờ database sẵn sàng (${i}/${attempts})...`);
      await sleep(delayMs);
    }
  }
  await pool.query(SCHEMA);
}

async function ping() {
  await pool.query('SELECT 1');
}

/* Đăng ký: email chưa có thì tạo mới; đã có thì dùng lại hồ sơ cũ và KHÔNG ghi đè họ tên, số điện thoại
   (quyết định phỏng vấn: dùng lại, giữ thông tin cũ). Trả về { created }. */
async function registerPlayer({ fullName, email, phone }) {
  const result = await pool.query(
    `INSERT INTO players (full_name, email, phone, consent_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [fullName, email, phone]
  );
  return { created: result.rowCount === 1 };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/* Tìm kiếm (QT-22): chứa chuỗi, không phân biệt hoa thường, ký tự % và _ coi như ký tự thường.
   Số điện thoại tìm được cả khi gõ có dấu cách, chấm, gạch. */
function buildWhere(q) {
  if (!q) return { where: '', params: [] };
  const text = `%${escapeLike(q)}%`;
  const digits = `%${escapeLike(q.replace(/[\s.\-]/g, ''))}%`;
  return {
    where: `WHERE (full_name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' OR phone LIKE $2 ESCAPE '\\')`,
    params: [text, digits]
  };
}

async function listPlayers({ q, page, pageSize }) {
  const { where, params } = buildWhere(q);
  const totalResult = await pool.query(`SELECT count(*) AS n FROM players ${where}`, params);
  const total = Number(totalResult.rows[0].n);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await pool.query(
    `SELECT id, full_name, email, phone, created_at, updated_at
       FROM players ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (current - 1) * pageSize]
  );
  return { rows: rows.rows, total, page: current, pages, pageSize };
}

async function exportPlayers(q) {
  const { where, params } = buildWhere(q);
  const result = await pool.query(
    `SELECT id, full_name, email, phone, created_at, updated_at
       FROM players ${where}
      ORDER BY created_at DESC, id DESC`,
    params
  );
  return result.rows;
}

async function deletePlayer(id) {
  if (!/^\d{1,18}$/.test(String(id))) return false;
  const result = await pool.query('DELETE FROM players WHERE id = $1', [id]);
  return result.rowCount === 1;
}

async function close() {
  await pool.end();
}

module.exports = { init, ping, registerPlayer, listPlayers, exportPlayers, deletePlayer, close };
