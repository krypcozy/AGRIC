// src/models/mongoModels.js
// All MongoDB (NoSQL) schemas for unstructured / semi-structured farm data.
// Designed to be schema-flexible — extra fields are always allowed.

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── SOIL SENSOR LOG ─────────────────────────────────────────────────────────
// IoT / manual soil readings: pH, moisture, NPK, temperature, etc.
// Highly variable structure per sensor brand → MongoDB is ideal.

const SoilSensorLogSchema = new Schema({
  farm_id:       { type: String, required: true, index: true },
  farm_code:     String,
  season:        String,
  recorded_at:   { type: Date, default: Date.now, index: true },
  location: {
    lat: Number,
    lng: Number,
    field_name: String,
  },
  readings: {
    ph:               Number,
    moisture_pct:     Number,
    nitrogen_ppm:     Number,
    phosphorus_ppm:   Number,
    potassium_ppm:    Number,
    temperature_c:    Number,
    organic_matter_pct: Number,
  },
  sensor_model:  String,
  raw_data:      Schema.Types.Mixed,   // accepts any extra sensor fields
  notes:         String,
  uploaded_by:   String,
}, { timestamps: true, strict: false });

// ── WEATHER / CLIMATE DATA ──────────────────────────────────────────────────
// Daily or hourly weather per farm location. Variable fields per data source.

const WeatherDataSchema = new Schema({
  farm_id:      { type: String, required: true, index: true },
  enclave:      String,     // e.g. 'Edo State'
  date:         { type: Date, index: true },
  source:       String,     // 'NiMet', 'OpenWeather', 'manual'
  readings: {
    temp_max_c:       Number,
    temp_min_c:       Number,
    rainfall_mm:      Number,
    humidity_pct:     Number,
    wind_speed_kmh:   Number,
    solar_radiation:  Number,
    evapotranspiration_mm: Number,
  },
  raw_data:     Schema.Types.Mixed,
  uploaded_by:  String,
}, { timestamps: true, strict: false });

// ── SATELLITE / DRONE IMAGERY METADATA ─────────────────────────────────────
// Stores metadata + file references for aerial imagery. Files on disk/cloud.

const ImageryMetadataSchema = new Schema({
  farm_id:      { type: String, required: true, index: true },
  farm_code:    String,
  capture_date: Date,
  source:       String,    // 'Sentinel-2', 'DJI Phantom', 'PlanetScope', etc.
  type:         String,    // 'NDVI', 'RGB', 'thermal', 'multispectral'
  file_path:    String,    // local path or cloud URL
  file_name:    String,
  file_size_bytes: Number,
  resolution_m: Number,   // ground resolution in metres per pixel
  coverage_ha:  Number,
  ndvi_avg:     Number,   // average NDVI index if computed
  geobounds: {
    north: Number, south: Number, east: Number, west: Number,
  },
  tags:         [String],
  notes:        String,
  uploaded_by:  String,
}, { timestamps: true, strict: false });

// ── FARM ACTIVITY LOG ───────────────────────────────────────────────────────
// Free-form log of activities: planting, irrigation, pesticide, harvest.
// Schema-less by design — different farms log different fields.

const FarmActivityLogSchema = new Schema({
  farm_id:      { type: String, required: true, index: true },
  farm_code:    String,
  activity_type: {
    type: String,
    enum: ['planting','irrigation','fertilisation','pesticide','harvest',
           'land_prep','market_sale','inspection','other'],
  },
  date:         { type: Date, default: Date.now },
  crop:         String,
  field_name:   String,
  area_ha:      Number,
  inputs_used:  [{ item: String, quantity: Number, unit: String, cost_ngn: Number }],
  labour_days:  Number,
  notes:        String,
  attachments:  [{ file_name: String, file_path: String }],
  logged_by:    String,
}, { timestamps: true, strict: false });

// ── DATA UPLOAD (NoSQL uploads) ─────────────────────────────────────────────
// When users upload raw files (JSON, CSV) as unstructured blobs.

const RawUploadSchema = new Schema({
  farm_id:      { type: String, required: true, index: true },
  farm_code:    String,
  category:     String,    // 'soil_sensor', 'weather', 'imagery', 'activity', 'other'
  season:       String,
  file_name:    String,
  file_path:    String,
  file_size_bytes: Number,
  mime_type:    String,
  parsed_data:  Schema.Types.Mixed,   // extracted content if parseable
  status:       { type: String, default: 'stored', enum: ['stored','parsed','error'] },
  error_msg:    String,
  uploaded_by:  String,
}, { timestamps: true, strict: false });


module.exports = {
  SoilSensorLog:     mongoose.model('SoilSensorLog',     SoilSensorLogSchema),
  WeatherData:       mongoose.model('WeatherData',       WeatherDataSchema),
  ImageryMetadata:   mongoose.model('ImageryMetadata',   ImageryMetadataSchema),
  FarmActivityLog:   mongoose.model('FarmActivityLog',   FarmActivityLogSchema),
  RawUpload:         mongoose.model('RawUpload',         RawUploadSchema),
};
