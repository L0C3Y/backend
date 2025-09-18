// backend/routes/users.js
const express = require("express");
const router = express.Router();
const { authMiddleware } = require("./middleware");
const { supabase } = require("../supabase");

// 🔹 Get Profile
router.get("/me", authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("id", req.user.id)
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });

  res.json({ success: true, user: data });
});

module.exports = router;
