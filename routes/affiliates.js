const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const { asyncHandler, authMiddleware, validate, body, param } = require("./middleware");
const { nanoid } = require("nanoid");

// Middleware: only admins
const adminMiddleware = (req, res, next) => {
  if (!req.user?.role || req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Admin access only" });
  }
  next();
};

// 🔹 Create affiliate (admin only)
router.post(
  "/create",
  authMiddleware,
  adminMiddleware,
  validate([body("name").notEmpty(), body("email").isEmail(), body("commissionRate").optional()]),
  asyncHandler(async (req, res) => {
    const { name, email, commissionRate = 0.2 } = req.body;
    const code = nanoid(8);

    const { data, error } = await supabase
      .from("affiliates")
      .insert([{ name, email, commission_rate: commissionRate, code, deleted: false }])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  })
);

// 🔹 Edit affiliate (admin only)
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate([param("id").notEmpty(), body("name").optional(), body("email").optional(), body("commissionRate").optional()]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.commissionRate) updates.commission_rate = req.body.commissionRate;

    const { data, error } = await supabase
      .from("affiliates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  })
);

// 🔹 Soft delete affiliate (admin only)
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate([param("id").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("affiliates")
      .update({ deleted: true })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  })
);

// 🔹 Get affiliate (admins or the affiliate themselves)
router.get("/:id", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: affiliate, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !affiliate) return res.status(404).json({ success: false, error: "Affiliate not found" });

  // Only admin or the affiliate owner can see
  if (req.user.role !== "admin" && req.user.id !== affiliate.user_id) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  const { data: sales } = await supabase
    .from("transactions")
    .select("*")
    .eq("affiliate_id", id)
    .order("created_at", { ascending: false });

  res.json({ success: true, data: { ...affiliate, sales } });
}));

// 🔹 Detect affiliate from URL
router.get("/detect/:code", asyncHandler(async (req, res) => {
  const { code } = req.params;

  const { data: affiliate, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !affiliate) return res.status(404).json({ success: false, error: "Affiliate not found" });

  res.json({ success: true, data: affiliate });
}));

module.exports = router;
