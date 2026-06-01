// src/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { enclaveOverview, nationalOverview, farmAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.get('/national',           protect, nationalOverview);
router.get('/enclave/:enclaveId', protect, enclaveOverview);
router.get('/farm/:farmId',       protect, farmAnalytics);

module.exports = router;
