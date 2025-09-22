// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const { body, validationResult } = require("express-validator");
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
// CREATE ORDER / TRANSACTION
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  validate([
    body("amount").isNumeric({ min: 1 }),
    body("currency").optional().isString(),
    body("ebookId").notEmpty(),
    body("affiliateCode").optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, currency = "INR", ebookId, affiliateCode } = req.body;
    const user_id = req.user.id;

    // 1️⃣ Resolve affiliateCode → affiliate_id
    let affiliate_id = null;
    if (affiliateCode) {
      const { data: aff, error: affErr } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .maybeSingle();

      if (affErr) return res.status(500).json({ success: false, error: affErr.message });
      if (!aff) return res.status(400).json({ success: false, error: "Invalid affiliate code" });

      affiliate_id = aff.id;
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Affiliate code required for this table schema" });
    }

    // 2️⃣ Create Razorpay order
    const Razorpay = require("razorpay");
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await instance.orders.create({
      amount: Math.round(amount * 100), // in paise
      currency,
      receipt: `ebook_${ebookId}_${Date.now()}`,
    });

    // 3️⃣ Insert transaction into DB
    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id,
          user_id,
          amount,
          currency,
          status: "created",
          razorpay_order_id: razorpayOrder.id,
        },
      ])
      .select()
      .single();

    if (txnErr) return res.status(500).json({ success: false, error: txnErr.message });

    res.json({ success: true, razorpayOrder, order: txn });
  })
);

module.exports = router;
