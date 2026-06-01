// src/controllers/authController.js
// Single Sign-On registration and login.
// One account can manage multiple farms (as described in the abstract).

const pool = require('../config/postgres');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, stakeholder_type_id: user.stakeholder_type_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// POST /api/auth/register
exports.register = async (req, res) => {
  const { full_name, email, password, phone, stakeholder_type_id } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ success: false, message: 'full_name, email and password are required.' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, stakeholder_type_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, stakeholder_type_id, created_at`,
      [full_name, email, hash, phone || null, stakeholder_type_id || null]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: 'Account created. You can now register and manage multiple farms.',
      token,
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, st.name AS stakeholder_type_name
       FROM users u
       LEFT JOIN stakeholder_types st ON st.id = u.stakeholder_type_id
       WHERE u.email = $1`,
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.is_verified, u.created_at,
              st.name AS stakeholder_type
       FROM users u
       LEFT JOIN stakeholder_types st ON st.id = u.stakeholder_type_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

    // Also return all farms owned by this user
    const farms = await pool.query(
      'SELECT id, farm_code, name, size_hectares, primary_crop, is_active FROM farms WHERE owner_id = $1',
      [req.user.id]
    );

    res.json({ success: true, user: result.rows[0], farms: farms.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
