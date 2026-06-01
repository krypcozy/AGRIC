// src/controllers/analyticsController.js
// Stakeholder-facing analytics: aggregated data across all farm units
// in a geographical enclave — core value proposition of the abstract.

const pool = require('../config/postgres');
const { SoilSensorLog, WeatherData, FarmActivityLog } = require('../models/mongoModels');

// GET /api/analytics/enclave/:enclaveId
// Aggregated crop, yield, and financial data for an entire state/enclave.
// Used by: government agencies, financial institutions, marketers.
exports.enclaveOverview = async (req, res) => {
  const { enclaveId } = req.params;

  try {
    // Farm count and area
    const farmStats = await pool.query(
      `SELECT COUNT(*) AS total_farms,
              SUM(size_hectares) AS total_ha,
              COUNT(DISTINCT primary_crop) AS crop_diversity
       FROM farms WHERE enclave_id = $1 AND is_active = TRUE`,
      [enclaveId]
    );

    // Top crops by total yield
    const topCrops = await pool.query(
      `SELECT cr.crop_name,
              COUNT(DISTINCT cr.farm_id) AS farms_growing,
              ROUND(SUM(cr.yield_kg)::numeric, 2) AS total_yield_kg,
              ROUND(AVG(cr.yield_per_ha)::numeric, 2) AS avg_yield_per_ha,
              ROUND(SUM(cr.total_revenue_ngn)::numeric, 2) AS total_revenue_ngn
       FROM crop_yield_records cr
       JOIN farms f ON f.id = cr.farm_id
       WHERE f.enclave_id = $1
       GROUP BY cr.crop_name
       ORDER BY total_yield_kg DESC
       LIMIT 10`,
      [enclaveId]
    );

    // Financial summary
    const financials = await pool.query(
      `SELECT fr.record_type, fr.category,
              ROUND(SUM(fr.amount_ngn)::numeric, 2) AS total_ngn,
              COUNT(*) AS transactions
       FROM financial_records fr
       JOIN farms f ON f.id = fr.farm_id
       WHERE f.enclave_id = $1
       GROUP BY fr.record_type, fr.category
       ORDER BY total_ngn DESC`,
      [enclaveId]
    );

    // Upload activity by tier (shows polyglot split)
    const uploadTiers = await pool.query(
      `SELECT ul.db_tier, ul.data_category, COUNT(*) AS uploads,
              SUM(ul.file_size_bytes) AS total_bytes
       FROM upload_log ul
       JOIN farms f ON f.id = ul.farm_id
       WHERE f.enclave_id = $1
       GROUP BY ul.db_tier, ul.data_category`,
      [enclaveId]
    );

    const enclave = await pool.query('SELECT * FROM geo_enclaves WHERE id = $1', [enclaveId]);

    // Log access for governance
    await pool.query(
      `INSERT INTO stakeholder_access (user_id, enclave_id, access_type, data_category)
       VALUES ($1, $2, 'read', 'analytics')`,
      [req.user.id, enclaveId]
    );

    res.json({
      success: true,
      enclave: enclave.rows[0],
      farm_statistics: farmStats.rows[0],
      top_crops: topCrops.rows,
      financials: financials.rows,
      data_tiers: uploadTiers.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/analytics/national
// National overview — all enclaves. For federal government / policy makers.
exports.nationalOverview = async (req, res) => {
  try {
    const enclaveBreakdown = await pool.query(
      `SELECT g.id, g.name AS enclave,
              COUNT(f.id) AS farms,
              ROUND(SUM(f.size_hectares)::numeric, 2) AS total_ha,
              STRING_AGG(DISTINCT f.primary_crop, ', ' ORDER BY f.primary_crop) AS crops
       FROM geo_enclaves g
       LEFT JOIN farms f ON f.enclave_id = g.id AND f.is_active = TRUE
       GROUP BY g.id, g.name
       ORDER BY farms DESC`
    );

    const yieldNational = await pool.query(
      `SELECT cr.crop_name,
              ROUND(SUM(cr.yield_kg)::numeric / 1000, 2) AS total_yield_tonnes,
              ROUND(SUM(cr.total_revenue_ngn)::numeric / 1000000, 2) AS total_revenue_million_ngn,
              COUNT(DISTINCT cr.farm_id) AS farm_count
       FROM crop_yield_records cr
       GROUP BY cr.crop_name
       ORDER BY total_yield_tonnes DESC`
    );

    const polyglotStats = await pool.query(
      `SELECT db_tier,
              COUNT(*) AS uploads,
              SUM(file_size_bytes) AS total_bytes,
              COUNT(DISTINCT farm_id) AS farms_contributed
       FROM upload_log
       GROUP BY db_tier`
    );

    res.json({
      success: true,
      scope: 'national',
      enclaves: enclaveBreakdown.rows,
      national_yield: yieldNational.rows,
      polyglot_storage: polyglotStats.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/analytics/farm/:farmId
// Individual farm analytics: yield trends, financial health, soil history.
exports.farmAnalytics = async (req, res) => {
  const { farmId } = req.params;

  try {
    const yieldTrend = await pool.query(
      `SELECT year, season, crop_name,
              ROUND(SUM(yield_kg)::numeric, 2) AS yield_kg,
              ROUND(AVG(yield_per_ha)::numeric, 2) AS yield_per_ha,
              ROUND(SUM(total_revenue_ngn)::numeric, 2) AS revenue_ngn
       FROM crop_yield_records
       WHERE farm_id = $1
       GROUP BY year, season, crop_name
       ORDER BY year DESC, season`,
      [farmId]
    );

    const financialHealth = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN record_type='revenue' THEN amount_ngn END), 0) AS total_revenue,
         COALESCE(SUM(CASE WHEN record_type='expense' THEN amount_ngn END), 0) AS total_expense,
         COALESCE(SUM(CASE WHEN record_type='loan' THEN amount_ngn END), 0) AS total_loans
       FROM financial_records WHERE farm_id = $1`,
      [farmId]
    );

    // Latest soil readings from MongoDB
    const soilHistory = await SoilSensorLog.find({ farm_id: farmId })
      .sort({ recorded_at: -1 })
      .limit(5)
      .select('readings recorded_at location season')
      .lean();

    // Latest weather from MongoDB
    const weatherSummary = await WeatherData.find({ farm_id: farmId })
      .sort({ date: -1 })
      .limit(7)
      .select('readings date source')
      .lean();

    const health = financialHealth.rows[0];
    const profit = parseFloat(health.total_revenue) - parseFloat(health.total_expense);

    res.json({
      success: true,
      farm_id: farmId,
      yield_trend: yieldTrend.rows,
      financial_health: {
        ...health,
        net_profit_ngn: profit.toFixed(2),
        profit_margin_pct: health.total_revenue > 0
          ? ((profit / health.total_revenue) * 100).toFixed(1)
          : '0.0',
      },
      soil_history: soilHistory,
      weather_summary: weatherSummary,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
