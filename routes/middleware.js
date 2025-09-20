const jwt = require("jsonwebtoken");
const { body, param, validationResult } = require("express-validator");

// Async wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// JWT auth
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // includes role and id
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// Admin-only middleware
const adminMiddleware = (req, res, next) => {
  if (!req.user?.role || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access only" });
  }
  next();
};

// Validation helper
const validate = validations => async (req, res, next) => {
  await Promise.all(validations.map(validation => validation.run(req)));
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

module.exports = { asyncHandler, authMiddleware, adminMiddleware, validate, body, param };
