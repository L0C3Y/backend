// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase"); // your initialized Supabase client
const { body, param, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");

// ------------------
// Middleware helpers
// ------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((v) => v.run(req)));
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({ success: false, errors: errors.array() });
};

// ------------------
// JWT Auth middleware
// ------------------
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, error: "No token provided" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
};

// ------------------
// Create payment / transaction
// ------------------
router.post(
  "/",
  authMiddleware,
  validate([
    body("user_id").notEmpty(),
    body("amount").isNumeric({ min: 1 }),
    body("currency").optional().isString(),
    body("status").optional().isIn(["created", "paid", "failed", "refunded"]),
  ]),
  asyncHandler(async (req, res) => {
    const { affiliate_id, user_id, amount, currency = "INR", status = "created", razorpay_order_id, razorpay_payment_id } = req.body;

    // Insert transaction
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([{ affiliate_id, user_id, amount, currency, status, razorpay_order_id, razorpay_payment_id }])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Update affiliate stats if paid
    if (affiliate_id && (status === "paid" || status === "completed")) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = amount * (aff.commission_rate || 0.2);
        await supabase.from("affiliates").update({
          sales_count: (aff.sales_count || 0) + 1,
          total_revenue: (aff.total_revenue || 0) + amount,
          total_commission: (aff.total_commission || 0) + commission,
        }).eq("id", affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

// ------------------
// Update payment status
// ------------------
router.put(
  "/:id",
  authMiddleware,
  validate([
    param("id").notEmpty(),
    body("status").isIn(["created", "paid", "failed", "refunded"]),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Update affiliate stats if paid
    if (txn.affiliate_id && (status === "paid" || status === "completed")) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = txn.amount * (aff.commission_rate || 0.2);
        await supabase.from("affiliates").update({
          sales_count: (aff.sales_count || 0) + 1,
          total_revenue: (aff.total_revenue || 0) + txn.amount,
          total_commission: (aff.total_commission || 0) + commission,
        }).eq("id", txn.affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

module.exports = router;
