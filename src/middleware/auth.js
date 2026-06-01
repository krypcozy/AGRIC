// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authenticated. Provide a Bearer token.' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id, email, stakeholder_type_id }
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalid or expired.' });
  }
};

// Optional: restrict to certain stakeholder types
const restrictTo = (...typeIds) => (req, res, next) => {
  if (!typeIds.includes(req.user.stakeholder_type_id)) {
    return res.status(403).json({ success: false, message: 'Access denied for your stakeholder type.' });
  }
  next();
};

module.exports = { protect, restrictTo };
