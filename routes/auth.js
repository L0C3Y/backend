// backend/routes/auth.js
require("dotenv").config();
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { supabase } = require("../supabase"); // initialized Supabase client
const { asyncHandler, validate, body } = require("./middleware");
const jwt = require("jsonwebtoken");

// ------------------------
// Helper: Generate JWT
// ------------------------
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// ------------------------
// 1️⃣ LOGIN (Admin / Affiliate / User)
// ------------------------
router.post(
  "/login",
  validate([
    body("role").notEmpty().isIn(["admin", "affiliate", "user"]),
    body("identifier").notEmpty(), // username for admin, email for others
    body("password").optional(),    // only for admin / registered user
    body("name").optional(),        // only for affiliate login
  ]),
  asyncHandler(async (req, res) => {
    const { role, identifier, password, name } = req.body;

    // ---------- Admin Login ----------
    if (role === "admin") {
      const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "betterknown";

      if (identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const user = { id: "admin-id", name: ADMIN_USERNAME, role: "admin" };
        const token = generateToken(user);
        return res.json({ success: true, user, token });
      } else {
        return res.status(401).json({ success: false, error: "Invalid admin credentials" });
      }
    }

    // ---------- Affiliate Login ----------
    if (role === "affiliate") {
      if (!name)
        return res.status(400).json({ success: false, error: "Affiliate name required" });

      const { data: affiliate, error } = await supabase
        .from("affiliates")
        .select("*")
        .eq("email", identifier)
        .eq("name", name)
        .eq("deleted", false)
        .maybeSingle();

      if (error) return res.status(500).json({ success: false, error: error.message });
      if (!affiliate)
        return res.status(401).json({ success: false, error: "Affiliate not found" });

      const user = {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        role: "affiliate",
      };
      const token = generateToken(user);
      return res.json({ success: true, user, token });
    }

    // ---------- Registered User Login ----------
    if (role === "user") {
      if (!password)
        return res.status(400).json({ success: false, error: "Password required" });

      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("email", identifier)
        .maybeSingle();

      if (!user) return res.status(401).json({ success: false, error: "User not found" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ success: false, error: "Invalid credentials" });

      const token = generateToken({ id: user.id, name: user.name, email: user.email, role: "user" });
      return res.json({ success: true, user, token });
    }

    return res.status(400).json({ success: false, error: "Invalid role" });
  })
);

// ------------------------
// 2️⃣ REGISTER (Optional for Users)
// ------------------------
router.post(
  "/register",
  validate([
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser)
      return res.status(400).json({ success: false, error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    const user = { id: data.id, name: data.name, email: data.email, role: "user" };
    const token = generateToken(user);

    return res.json({ success: true, user, token });
  })
);

module.exports = router;
