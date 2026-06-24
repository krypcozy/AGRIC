// src/config/mongodb.js
// Handles the unstructured/semi-structured side of the polyglot model.
// Stores: soil sensor logs, weather data, satellite imagery metadata,
//         farm activity notes, IoT streams — anything schema-flexible.

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const connectMongo = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[MongoDB]    Missing MONGO_URI environment variable. Create a .env file from .env.example and set MONGO_URI.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[MongoDB]    Connected — unstructured data layer ready');
  } catch (err) {
    console.error('[MongoDB]    Connection failed:', err.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB]    Disconnected');
});

module.exports = connectMongo;
