// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // not bcryptjs
const jwt = require("jsonwebtoken");
const { supabase } = require("../supabase");
const { asyncHandler, body, validate } = require("./middleware");

router.post(
  "/register",
  validate([
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // check if already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser)
      return res.status(400).json({ success: false, error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10); // works with bcryptjs

    const { data, error } = await supabase
      .from("users")
      .insert([{ name, email, password: hashedPassword }])
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });

    const token = jwt.sign(
      { id: data.id, name: data.name, email: data.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ success: true, user: data, token });
  })
);

module.exports = router;
