// src/routes/farmRoutes.js
const express = require('express');
const router = express.Router();
const {
  registerFarm, getAllFarms, getFarm,
  getFarmsByEnclave, updateFarm,
} = require('../controllers/farmController');
const { protect } = require('../middleware/auth');

router.post('/',                protect, registerFarm);
router.get('/',                 protect, getAllFarms);
router.get('/enclave/:enclaveId', protect, getFarmsByEnclave);
router.get('/:id',              protect, getFarm);
router.patch('/:id',            protect, updateFarm);

module.exports = router;
