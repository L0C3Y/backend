// backend/routes/payments.js
require("dotenv").config();
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const Razorpay = require("razorpay");

// ------------------
// Middleware
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
// Auth middleware
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
// Razorpay instance
// ------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ------------------
// 1️⃣ Get Razorpay key
// ------------------
router.get("/key", authMiddleware, asyncHandler(async (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
}));

// ------------------
// 2️⃣ Create Order
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  validate([body("amount").isNumeric({ min: 1 }), body("ebookId").notEmpty()]),
  asyncHandler(async (req, res) => {
    const { amount, ebookId, affiliateCode } = req.body;
    const userId = req.user.id;

    // Resolve affiliate_id
    let affiliateId = null;
    if (affiliateCode) {
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id")
        .eq("code", affiliateCode)
        .maybeSingle();
      affiliateId = affiliate?.id || null; // or a default system affiliate
    }

    if (!affiliateId) affiliateId = null; // fallback if no affiliate

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Insert transaction into Supabase
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([
        {
          affiliate_id: affiliateId,
          user_id: userId,
          amount,
          currency: "INR",
          status: "created",
          razorpay_order_id: razorpayOrder.id,
        },
      ])
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, razorpayOrder, order: txn });
  })
);

// ------------------
// 3️⃣ Verify payment
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

    // HMAC verification
    const crypto = require("crypto");
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction status to 'paid'
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", orderId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, transaction: txn });
  })
);

module.exports = router;
