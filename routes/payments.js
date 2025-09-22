// backend/routes/payments.js
const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
const jwt = require("jsonwebtoken");
const { body, param, validationResult } = require("express-validator");
const crypto = require("crypto");
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
// 1️⃣ Get Razorpay Key
// ------------------
router.get("/key", (req, res) => {
  const key = process.env.RAZORPAY_KEY_ID;
  if (!key) return res.status(500).json({ success: false, error: "Razorpay key not set" });
  res.json({ key });
});

// ------------------
// 2️⃣ Create Order
// ------------------
router.post(
  "/create-order",
  authMiddleware,
  validate([
    body("amount").isNumeric({ min: 1 }),
    body("ebookId").notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, ebookId, affiliateCode } = req.body;

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: amount * 100, // amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Save transaction in Supabase
    const { data: txn, error } = await supabase
      .from("transactions")
      .insert([{
        user_id: req.user.id,
        affiliate_id: affiliateCode || null,
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
// 3️⃣ Verify Payment
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Invalid signature" });

    // Update transaction as paid
    const { data: txn, error } = await supabase
      .from("transactions")
      .update({ status: "paid", razorpay_payment_id })
      .eq("razorpay_order_id", razorpay_order_id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Update affiliate stats if exists
    if (txn.affiliate_id) {
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

    res.json({ success: true, txn });
  })
);

module.exports = router;
