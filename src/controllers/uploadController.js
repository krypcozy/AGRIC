// src/controllers/uploadController.js
// THE CORE OF THE POLYGLOT PERSISTENCE MODEL.
//
// This controller is the "persistence router":
//   • Structured data (yield records, financials) → PostgreSQL
//   • Unstructured data (sensors, weather, imagery, activity) → MongoDB
//
// The abstract states: "The relational DBMS handles the structured data
// while the noSQL DBMS handles the unstructured data broadly speaking."

const pool = require('../config/postgres');
const {
  SoilSensorLog, WeatherData, ImageryMetadata,
  FarmActivityLog, RawUpload,
} = require('../models/mongoModels');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Data category → DB tier routing table
const ROUTING = {
  crop_yield:      'postgres',
  financial:       'postgres',
  soil_sensor:     'mongodb',
  weather:         'mongodb',
  satellite:       'mongodb',
  drone_imagery:   'mongodb',
  farm_activity:   'mongodb',
  raw_file:        'mongodb',
};

// ── POST /api/data/upload ───────────────────────────────────────────────────
// Accepts a file + JSON body. Routes to the correct DB tier automatically.
exports.uploadData = async (req, res) => {
  const { farm_id, data_category, season, notes, data } = req.body;
  const file = req.file;

  if (!farm_id || !data_category) {
    return res.status(400).json({ success: false, message: 'farm_id and data_category are required.' });
  }

  const tier = ROUTING[data_category];
  if (!tier) {
    return res.status(400).json({
      success: false,
      message: `Unknown data_category. Valid: ${Object.keys(ROUTING).join(', ')}`,
    });
  }

  // Verify farm exists
  const farmCheck = await pool.query('SELECT id, farm_code FROM farms WHERE id = $1', [farm_id]);
  if (!farmCheck.rows.length) return res.status(404).json({ success: false, message: 'Farm not found.' });
  const { farm_code } = farmCheck.rows[0];

  let mongoDocId = null;
  let parsedData = null;

  try {
    // ── ROUTE TO MONGODB (Unstructured) ──────────────────────────────────
    if (tier === 'mongodb') {
      const baseDoc = {
        farm_id, farm_code, season,
        uploaded_by: req.user.id,
        notes,
      };

      // Parse JSON body data if provided
      if (data) {
        try { parsedData = typeof data === 'string' ? JSON.parse(data) : data; }
        catch { /* keep null */ }
      }

      // Parse uploaded file if JSON/CSV
      if (file && file.mimetype === 'application/json') {
        try {
          const raw = fs.readFileSync(file.path, 'utf8');
          parsedData = JSON.parse(raw);
        } catch { /* store as raw */ }
      }

      let doc;
      switch (data_category) {
        case 'soil_sensor':
          doc = await SoilSensorLog.create({ ...baseDoc, ...(parsedData || {}), file_path: file?.path });
          break;
        case 'weather':
          doc = await WeatherData.create({ ...baseDoc, ...(parsedData || {}), file_path: file?.path });
          break;
        case 'satellite':
        case 'drone_imagery':
          doc = await ImageryMetadata.create({
            ...baseDoc,
            file_path: file?.path,
            file_name: file?.originalname,
            file_size_bytes: file?.size,
            ...(parsedData || {}),
          });
          break;
        case 'farm_activity':
          doc = await FarmActivityLog.create({ ...baseDoc, ...(parsedData || {}) });
          break;
        default:
          doc = await RawUpload.create({
            ...baseDoc,
            category: data_category,
            file_path: file?.path,
            file_name: file?.originalname,
            file_size_bytes: file?.size,
            mime_type: file?.mimetype,
            parsed_data: parsedData,
          });
      }
      mongoDocId = doc._id.toString();

    // ── ROUTE TO POSTGRESQL (Structured) ─────────────────────────────────
    } else {
      if (!parsedData && data) {
        try { parsedData = typeof data === 'string' ? JSON.parse(data) : data; }
        catch { /* fall through */ }
      }
      if (!parsedData && file) {
        // Read CSV/JSON file for structured insert
        const raw = fs.readFileSync(file.path, 'utf8');
        try { parsedData = JSON.parse(raw); } catch { /* CSV parsing skipped here */ }
      }

      if (data_category === 'crop_yield' && parsedData) {
        const records = Array.isArray(parsedData) ? parsedData : [parsedData];
        for (const r of records) {
          await pool.query(
            `INSERT INTO crop_yield_records
               (farm_id, crop_name, season, year, area_planted_ha, yield_kg, market_price_ngn)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [farm_id, r.crop_name, season || r.season, r.year,
             r.area_planted_ha, r.yield_kg, r.market_price_ngn || null]
          );
        }
      } else if (data_category === 'financial' && parsedData) {
        const records = Array.isArray(parsedData) ? parsedData : [parsedData];
        for (const r of records) {
          await pool.query(
            `INSERT INTO financial_records
               (farm_id, record_type, category, amount_ngn, description, transaction_date)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [farm_id, r.record_type, r.category, r.amount_ngn,
             r.description || null, r.transaction_date || null]
          );
        }
      }
    }

    // ── LOG THE UPLOAD (in PostgreSQL audit table) ────────────────────────
    await pool.query(
      `INSERT INTO upload_log
         (id, farm_id, uploaded_by, data_category, db_tier, file_name, file_size_bytes, mongo_doc_id, season, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processed')`,
      [uuidv4(), farm_id, req.user.id, data_category, tier,
       file?.originalname || null, file?.size || null, mongoDocId, season || null]
    );

    res.status(201).json({
      success: true,
      message: `Data uploaded to ${tier === 'postgres' ? 'PostgreSQL (structured)' : 'MongoDB (unstructured)'}`,
      db_tier: tier,
      data_category,
      mongo_doc_id: mongoDocId,
    });

  } catch (err) {
    // Mark log as failed
    await pool.query(
      `INSERT INTO upload_log
         (id, farm_id, uploaded_by, data_category, db_tier, file_name, season, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'failed')`,
      [uuidv4(), farm_id, req.user.id, data_category, tier,
       file?.originalname || null, season || null]
    ).catch(() => {});
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/data/:farmId  — All uploads for a farm (both DB tiers)
exports.getFarmData = async (req, res) => {
  const { farmId } = req.params;
  const { tier, category, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Structured data from PostgreSQL
    let pgYield = [], pgFinancial = [], logs = [];

    if (!tier || tier === 'postgres') {
      const y = await pool.query(
        `SELECT * FROM crop_yield_records WHERE farm_id = $1 ORDER BY recorded_at DESC LIMIT $2 OFFSET $3`,
        [farmId, limit, offset]
      );
      pgYield = y.rows;

      const f = await pool.query(
        `SELECT * FROM financial_records WHERE farm_id = $1 ORDER BY recorded_at DESC LIMIT $2 OFFSET $3`,
        [farmId, limit, offset]
      );
      pgFinancial = f.rows;
    }

    const logQ = await pool.query(
      `SELECT * FROM upload_log WHERE farm_id = $1 ORDER BY uploaded_at DESC LIMIT 10`,
      [farmId]
    );
    logs = logQ.rows;

    // Unstructured data from MongoDB
    let mongoData = {};
    if (!tier || tier === 'mongodb') {
      const [soil, weather, imagery, activity] = await Promise.all([
        SoilSensorLog.find({ farm_id: farmId }).sort({ recorded_at: -1 }).limit(10).lean(),
        WeatherData.find({ farm_id: farmId }).sort({ date: -1 }).limit(10).lean(),
        ImageryMetadata.find({ farm_id: farmId }).sort({ capture_date: -1 }).limit(5).lean(),
        FarmActivityLog.find({ farm_id: farmId }).sort({ date: -1 }).limit(10).lean(),
      ]);
      mongoData = { soil_sensor_logs: soil, weather_data: weather, imagery, farm_activities: activity };
    }

    res.json({
      success: true,
      farm_id: farmId,
      structured_data: { crop_yield: pgYield, financial: pgFinancial },
      unstructured_data: mongoData,
      upload_log: logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
