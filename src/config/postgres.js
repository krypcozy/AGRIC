// src/config/postgres.js
// Handles the relational (structured) side of the polyglot persistence model.
// Stores: farms, users, stakeholders, crop yield records, financial records.

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const requiredEnv = ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error('[PostgreSQL] Missing environment variables:', missingEnv.join(', '));
  process.exit(1);
}

const host = process.env.PG_HOST || '127.0.0.1';
const pool = new Pool({
  host,
  port: Number(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

pool.on('connect', () => {
  console.log('[PostgreSQL] Connected — structured data layer ready');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error:', err && err.message ? err.message : err);
  if (err && err.stack) console.error(err.stack);
  if (err && err.code === 'ECONNREFUSED' && host === 'localhost') {
    console.error('[PostgreSQL] Hint: localhost may resolve to ::1 on Windows. Try setting PG_HOST=127.0.0.1 in .env.');
  }
  process.exit(-1);
});

module.exports = pool;
