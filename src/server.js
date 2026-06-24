// src/server.js
// SmartFarm Repository — Polyglot Persistence Backend
// Express server wiring together PostgreSQL (structured) + MongoDB (unstructured)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
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

// Serve static website files from the project root
app.use(express.static(path.join(__dirname, '..')));

// ── Middleware ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
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
const DEFAULT_PORT = Number(process.env.PORT || 5000);

const startServer = (port, attempt = 1) => {
  const server = app.listen(port, () => {
    console.log(`\n🌱 SmartFarm API running on http://localhost:${port}/api`);
    console.log(`   Persistence: PostgreSQL (structured) + MongoDB (unstructured)\n`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attempt < 5) {
      const nextPort = port + 1;
      console.warn(`[Server] Port ${port} is already in use. Trying ${nextPort} instead.`);
      server.close(() => startServer(nextPort, attempt + 1));
    } else {
      console.error('[Server] Failed to start:', err && err.message ? err.message : err);
      process.exit(1);
    }
  });
};

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

  startServer(DEFAULT_PORT);
};

start();
