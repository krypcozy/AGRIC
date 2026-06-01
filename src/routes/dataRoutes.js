// src/routes/dataRoutes.js
const express = require('express');
const router = express.Router();
const { uploadData, getFarmData } = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/upload', protect, upload.single('file'), uploadData);
router.get('/:farmId', protect, getFarmData);

module.exports = router;


// src/routes/analyticsRoutes.js — inline for brevity, imported separately below
