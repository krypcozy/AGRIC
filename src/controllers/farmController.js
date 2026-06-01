// src/controllers/farmController.js
// Farm registration and management.
// Core to the abstract: multiple farm units under one SSO application.

const pool = require('../config/postgres');
const { v4: uuidv4 } = require('uuid');

// Generate sequential farm code like FRM-0041
const generateFarmCode = async () => {
  const result = await pool.query('SELECT COUNT(*) FROM farms');
  const n = parseInt(result.rows[0].count) + 1;
  return `FRM-${String(n).padStart(4, '0')}`;
};

// POST /api/farms  — Register a new farm
exports.registerFarm = async (req, res) => {
  const {
    name, enclave_id, lga, address,
    size_hectares, primary_crop,
  } = req.body;

  if (!name) return res.status(400).json({ success: false, message: 'Farm name is required.' });

  try {
    const farm_code = await generateFarmCode();
    const result = await pool.query(
      `INSERT INTO farms (id, farm_code, name, owner_id, enclave_id, lga, address, size_hectares, primary_crop)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [uuidv4(), farm_code, name, req.user.id, enclave_id || null,
       lga || null, address || null, size_hectares || null, primary_crop || null]
    );

    res.status(201).json({
      success: true,
      message: `Farm registered. Your Farm ID is ${farm_code}.`,
      farm: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/farms  — All farms (paginated, filterable by enclave/state)
exports.getAllFarms = async (req, res) => {
  const { enclave_id, primary_crop, is_active, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (enclave_id)   { params.push(enclave_id);   conditions.push(`f.enclave_id = $${params.length}`); }
  if (primary_crop) { params.push(`%${primary_crop}%`); conditions.push(`f.primary_crop ILIKE $${params.length}`); }
  if (is_active !== undefined) { params.push(is_active === 'true'); conditions.push(`f.is_active = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit, offset);

  try {
    const result = await pool.query(
      `SELECT f.*, g.name AS enclave_name, u.full_name AS owner_name
       FROM farms f
       LEFT JOIN geo_enclaves g ON g.id = f.enclave_id
       LEFT JOIN users u ON u.id = f.owner_id
       ${where}
       ORDER BY f.registered_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await pool.query(
      `SELECT COUNT(*) FROM farms f ${where}`,
      params.slice(0, -2)
    );
    res.json({
      success: true,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      farms: result.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/farms/:id  — Single farm detail + summary stats
exports.getFarm = async (req, res) => {
  try {
    const farm = await pool.query(
      `SELECT f.*, g.name AS enclave_name, u.full_name AS owner_name
       FROM farms f
       LEFT JOIN geo_enclaves g ON g.id = f.enclave_id
       LEFT JOIN users u ON u.id = f.owner_id
       WHERE f.id = $1 OR f.farm_code = $1`,
      [req.params.id]
    );
    if (!farm.rows.length) return res.status(404).json({ success: false, message: 'Farm not found.' });

    // Summary stats from PostgreSQL
    const yieldSummary = await pool.query(
      `SELECT COUNT(*) AS records, SUM(yield_kg) AS total_yield_kg,
              ROUND(AVG(yield_per_ha),2) AS avg_yield_per_ha
       FROM crop_yield_records WHERE farm_id = $1`,
      [farm.rows[0].id]
    );

    const uploadSummary = await pool.query(
      `SELECT db_tier, COUNT(*) AS uploads, SUM(file_size_bytes) AS total_bytes
       FROM upload_log WHERE farm_id = $1 GROUP BY db_tier`,
      [farm.rows[0].id]
    );

    res.json({
      success: true,
      farm: farm.rows[0],
      yield_summary: yieldSummary.rows[0],
      upload_summary: uploadSummary.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/farms/enclave/:enclaveId  — All farms in a geographical enclave
// Abstract: stakeholders need data about all farm units in a defined geographical enclave
exports.getFarmsByEnclave = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, u.full_name AS owner_name
       FROM farms f
       LEFT JOIN users u ON u.id = f.owner_id
       WHERE f.enclave_id = $1 AND f.is_active = TRUE
       ORDER BY f.name`,
      [req.params.enclaveId]
    );
    const enclave = await pool.query('SELECT * FROM geo_enclaves WHERE id = $1', [req.params.enclaveId]);

    // Log stakeholder access
    await pool.query(
      `INSERT INTO stakeholder_access (user_id, enclave_id, access_type, data_category)
       VALUES ($1, $2, 'read', 'farm_registry')`,
      [req.user.id, req.params.enclaveId]
    );

    res.json({
      success: true,
      enclave: enclave.rows[0],
      total: result.rows.length,
      farms: result.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/farms/:id — Update farm details
exports.updateFarm = async (req, res) => {
  const { name, lga, address, size_hectares, primary_crop, is_active } = req.body;
  try {
    const check = await pool.query('SELECT owner_id FROM farms WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ success: false, message: 'Farm not found.' });
    if (check.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only update your own farms.' });
    }

    const result = await pool.query(
      `UPDATE farms SET
         name = COALESCE($1, name),
         lga = COALESCE($2, lga),
         address = COALESCE($3, address),
         size_hectares = COALESCE($4, size_hectares),
         primary_crop = COALESCE($5, primary_crop),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, lga, address, size_hectares, primary_crop, is_active, req.params.id]
    );
    res.json({ success: true, farm: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
