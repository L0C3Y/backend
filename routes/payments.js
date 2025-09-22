// backend/routes/payments.js
require("dotenv").config();
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const jwt = require("jsonwebtoken");
const { body, param, validationResult } = require("express-validator");
const Razorpay = require("razorpay");

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
// Razorpay client
// ------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------
// GET Razorpay key
// ------------------
router.get(
  "/key",
  asyncHandler(async (req, res) => {
    if (!process.env.RAZORPAY_KEY_ID)
      return res.status(500).json({ success: false, error: "Razorpay key missing" });
    res.json({ key: process.env.RAZORPAY_KEY_ID });
  })
);

// ------------------
// Create order
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  validate([
    body("amount").isNumeric({ min: 1 }),
    body("ebookId").notEmpty(),
    body("affiliateCode").optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, ebookId, affiliateCode } = req.body;
    let affiliate_id;

    // Resolve affiliate_id from code
    if (affiliateCode) {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .maybeSingle();

      if (!aff) return res.status(400).json({ success: false, error: "Invalid affiliate code" });
      affiliate_id = aff.id;
    } else {
      // Default system affiliate
      affiliate_id = "00000000-0000-0000-0000-000000000000";
    }

    const user_id = req.user.id;

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: `order_${Date.now()}`,
      payment_capture: 1,
    });

    // Insert transaction
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([{
        affiliate_id,
        user_id,
        amount,
        currency: "INR",
        status: "created",
        razorpay_order_id: razorpayOrder.id,
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, razorpayOrder, order: txn });
  })
);

// ------------------
// Verify payment
// ------------------
router.post(
  "/verify",
  authMiddleware,
  validate([
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    body("orderId").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Signature verification
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction status
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Update affiliate stats
    if (txn.affiliate_id && txn.affiliate_id !== "00000000-0000-0000-0000-000000000000") {
      const { data: aff } = await supabase
        .from("affiliates")
        .select("*")
        .eq("id", txn.affiliate_id)
        .maybeSingle();

      if (aff) {
        const commission = txn.amount * (aff.commission_rate || 0.2);
        await supabase
          .from("affiliates")
          .update({
            sales_count: (aff.sales_count || 0) + 1,
            total_revenue: (aff.total_revenue || 0) + txn.amount,
            total_commission: (aff.total_commission || 0) + commission,
          })
          .eq("id", txn.affiliate_id);
      }
    }

    res.json({ success: true, data: txn });
  })
);

module.exports = router;
