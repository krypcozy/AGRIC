// src/server.js
// SmartFarm Repository — Polyglot Persistence Backend
// Express server wiring together PostgreSQL (structured) + MongoDB (unstructured)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectMongo = require('./config/mongodb');
const pool = require('./config/postgres');   // validates PG connection on startup

const authRoutes      = require('./routes/authRoutes');
const farmRoutes      = require('./routes/farmRoutes');
const dataRoutes      = require('./routes/dataRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/farms',     farmRoutes);
app.use('/api/data',      dataRoutes);
app.use('/api/analytics', analyticsRoutes);

// ── System info route ───────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    system:  'SmartFarm Data Repository',
    model:   'Polyglot Persistence (PostgreSQL + MongoDB)',
    version: '1.0.0',
    endpoints: {
      auth:      '/api/auth  — register, login, /me',
      farms:     '/api/farms — CRUD + enclave queries',
      data:      '/api/data  — polyglot upload router + retrieval',
      analytics: '/api/analytics — enclave, national, farm-level stats',
    },
    persistence: {
      structured:   'PostgreSQL — crop yield, financials, farm registry, audit log',
      unstructured: 'MongoDB   — soil sensors, weather, imagery, activity logs',
    },
  });
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectMongo();
  // Test PG connection
  try {
    await pool.query('SELECT 1');
    console.log('[PostgreSQL] Connection verified');
  } catch (e) {
    console.error('[PostgreSQL] Cannot connect:', e && e.message ? e.message : e);
    if (e && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`\n🌱 SmartFarm API running on http://localhost:${PORT}/api`);
    console.log(`   Persistence: PostgreSQL (structured) + MongoDB (unstructured)\n`);
  });
};

start();
