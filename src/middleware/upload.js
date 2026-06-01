// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Organise uploads by farm_id
    const dir = path.join(uploadDir, req.body.farm_id || 'general');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${ts}${ext}`);
  },
});

const allowedMimes = [
  'text/csv', 'application/json', 'application/xml', 'text/xml',
  'application/pdf', 'image/tiff', 'image/jpeg', 'image/png',
  'application/octet-stream',
];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const maxMB = parseInt(process.env.MAX_FILE_SIZE_MB || '5000');

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxMB * 1024 * 1024 },
});

module.exports = upload;
